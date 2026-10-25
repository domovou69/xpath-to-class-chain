// The scanner's core, with no file system and no console: locator literals in a piece of
// source text in, rewritten text and one record per locator out. The file walk, the
// reading and writing, and the printing are in scanner.js and xpath-to-class-chain.js.
const STATUS = require('./status');
const { convertXpathToClassChain } = require('./converter');
const { validateAndFixClassChain } = require('./validator');
const { optimizeClassChain } = require('./optimizer');
const { findXpathStrategy } = require('./strategy');
const { walk } = require('./lexer');

// Constructed per-run rather than module-global so a second main() call
// (in tests, watch-mode, etc.) doesn't carry counts over from the first.
function makeStats() {
  return {
    filesScanned: 0,
    locatorsFound: 0,
    locatorsUpdated: 0,
    // updated locators that carry a warning (grouped positions, RC-D1)
    warnings: 0,
    skipped: {
      android: 0,
      xpathStrategy: 0,
      validationFailed: 0,
      unsupportedLogic: 0,
      notXpath: 0,
      noChangeNeeded: 0,
    },
  };
}

// Heuristic gate for the file scanner. A bare string can start with `//` for
// reasons that have nothing to do with iOS — protocol-relative URLs
// ("//cdn.example.com"), comments lifted into strings, etc. Since consumers may
// NOT prefix their locators with `ios:`, we no longer rely on that key; instead
// we confirm the string carries an actual iOS/XPath signal before touching it.
// This is only a pre-filter — deep correctness is still enforced later by
// convertXpathToClassChain / validateAndFixClassChain.
function isLikelyIosLocator(str) {
  if (typeof str !== 'string') return false;
  // Already a Class Chain — unambiguously ours (handled by the lint path).
  if (str.startsWith('-ios class chain:')) return true;

  // Strip outer grouping parens so `(//xpath)[n]` is treated the same as
  // `//xpath`. The group-close is the paren that balances the opening one,
  // skipping quoted values (e.g. [@name="a)b"]): lastIndexOf(')') would land
  // inside an outer `[last()]` and leave the brackets unbalanced.
  let core = str;
  if (str.startsWith('(//')) {
    const closeIdx = groupCloseIndex(str);
    if (closeIdx > 0) core = str.slice(1, closeIdx);
  }

  // An absolute path from the page source root (/XCUIElementTypeApplication/…)
  // converts too (Phase 7: dotnet/maui, Ruby page objects).
  if (str.startsWith('(/XCUIElementTypeApplication')) {
    const closeIdx = groupCloseIndex(str);
    if (closeIdx > 0) core = str.slice(1, closeIdx);
  }
  if (/^\/XCUIElementTypeApplication\b/.test(core)) core = '/' + core;

  if (!core.startsWith('//')) return false;

  // Must carry at least one iOS / XPath signal, not just two leading slashes.
  const hasIosSignal =
    /XCUIElementType[A-Za-z]+/.test(core) || // native element type
    /@(?:name|label|value|type|text|enabled|visible|accessible|selected|focused|hittable)\b/.test(core) || // known attrs
    /\b(?:contains|starts-with|ends-with)\s*\(/i.test(core) || // string functions
    /\[[^\]]*\]/.test(core); // any predicate at all (e.g. //Type[1])
  if (!hasIosSignal) return false;

  // Bracket balance check on the core only (outer [n] index excluded). Either count
  // may balance: without the brackets inside quoted values ([@name="a[b"]), or all of
  // them, for text whose quotes do not pair ('Goto's New'). What passes here and is
  // malformed is reported by the converter, not dropped without a record.
  const open = (core.match(/\[/g) || []).length;
  const close = (core.match(/\]/g) || []).length;
  return open === close || walk(core, () => false) === 0;
}

// Index of the `)` that closes the `(` at index 0, or -1. Quoted values are
// skipped whole, so parens inside them do not count.
function groupCloseIndex(str) {
  let depth = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '"' || ch === "'") {
      const end = str.indexOf(ch, i + 1);
      if (end < 0) return -1;
      i = end;
    } else if (ch === '(') depth++;
    else if (ch === ')' && --depth === 0) return i;
  }
  return -1;
}

// A lookup from a locator value's offset in `content` to its platform key (`android` / `ios`),
// or null. It is built once per file on the first call, so a lookup does not rescan the text
// above the locator. Comments are not keys: `// android: see other file` above a locator does
// not count, and an apostrophe in a comment does not pair with a quote below it.
// YAML: the key on the locator's line, else the nearest parent key by indentation, so an
// `android:` block higher up the file does not cover a later sibling. Other files: the last
// key on the same line before the string — this handles ternaries like
// `android: cond ? a : 'xpath'` and single-line objects like `{ android: 'val', ios: '//x' }`
// — scanning back to the nearest property boundary (comma / semicolon / closing brace or
// bracket) so `android:\n  \`locator\`` is found with the key on the preceding line.
function platformKeys(content, ext) {
  let lookup = null;
  return (offset) => {
    if (!lookup) {
      const code = maskComments(content, HASH_COMMENTS.has(ext));
      lookup = ext === '.yml' || ext === '.yaml' ? yamlPlatformKeys(code) : codePlatformKeys(code);
    }
    return lookup(offset);
  };
}

const HASH_COMMENTS = new Set(['.py', '.rb', '.yml', '.yaml', '.properties', '.feature']);

function codePlatformKeys(code) {
  return (offset) => {
    const lineStart = code.lastIndexOf('\n', offset - 1) + 1;
    let contextStart = lineStart > 0 ? lineStart - 1 : 0;
    while (contextStart > 0 && !/[,;}\]]/.test(code[contextStart])) contextStart--;
    if (contextStart > 0) contextStart++; // skip past the boundary char itself
    return lastKey(code.slice(contextStart, offset));
  };
}

// A key line, `key:` or `- key:`, the key optionally quoted.
const YAML_KEY = /^([ \t]*)(-[ \t]+)?(['"]?)([\w.-]+)\3[ \t]*:(?:\s|$)/;

// One pass over the lines with a stack of the open keys. A key opened at column c has rank 2c
// and a `- ` item at column c has rank 2c + 1, so a line's parents are the keys of a lower rank:
// a `- ` line at its key's indentation (a compact sequence, `android:\n- '//x'`) is the key's
// child, the next `- ` at that indentation is the item's sibling.
function yamlPlatformKeys(code) {
  const lineStarts = [];
  const parentKeys = []; // per line: the platform key of its nearest platform parent, or null
  const open = []; // { rank, platform }: platform is the key itself or inherited
  for (let start = 0; start <= code.length; ) {
    let end = code.indexOf('\n', start);
    if (end < 0) end = code.length;
    const line = code.slice(start, end);
    const indent = line.match(/^[ \t]*/)[0].length;
    const rank = 2 * indent + (/^-(?:[ \t]|$)/.test(line.slice(indent)) ? 1 : 0);
    let depth = open.length;
    while (depth > 0 && open[depth - 1].rank >= rank) depth--;
    const parent = depth > 0 ? open[depth - 1].platform : null;
    lineStarts.push(start);
    parentKeys.push(parent);
    const m = line.match(YAML_KEY);
    if (m) {
      open.length = depth;
      if (m[2]) open.push({ rank, platform: parent });
      const key = m[4];
      const platform = key === 'android' || key === 'ios' ? key : parent;
      open.push({ rank: 2 * (m[1].length + (m[2] || '').length), platform });
    }
    start = end + 1;
  }
  return (offset) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lastKey(code.slice(lineStarts[lo], offset)) || parentKeys[lo];
  };
}

// `content` with its comments blanked to spaces, line breaks kept so offsets still match:
// `#…` when `hash`, else `//…` and `/* … */`. Quoted strings are skipped whole, so `//` in
// 'http://x' is not a comment. A ' or " with no closing quote on its line is plain text
// (`title: Don't tap` in YAML).
function maskComments(content, hash) {
  let masked = '';
  let copied = 0;
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (c === '"' || c === "'" || c === '`') {
      const close = closingQuote(content, i);
      if (close > 0) i = close;
      continue;
    }
    const next = content[i + 1];
    if (hash ? c !== '#' : c !== '/' || (next !== '/' && next !== '*')) continue;
    let end = !hash && next === '*' ? content.indexOf('*/', i + 2) + 2 : content.indexOf('\n', i);
    if (end < 2) end = content.length; // no '*/' (-1 + 2) or no line break (-1)
    masked += content.slice(copied, i) + content.slice(i, end).replace(/[^\n]/g, ' ');
    copied = end;
    i = end - 1;
  }
  return masked + content.slice(copied);
}

// Index of the quote that closes the one at `open`, or -1. A backslash escapes the next
// character; only a backtick string spans lines.
function closingQuote(text, open) {
  const quote = text[open];
  for (let i = open + 1; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') i++;
    else if (c === quote) return i;
    else if (c === '\n' && quote !== '`') return -1;
  }
  return -1;
}

// The last `android:` / `ios:` key in `text` (comments already blanked). String values are
// blanked first: `"android:id/message"` (an @AndroidFindBy id on the line above) is not a key.
// A quoted key (`'android':`) is followed by a colon and is kept.
function lastKey(text) {
  const bare = text.replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1(?!\s*:)/g, '""');
  const platformKeyRe = /(?<![a-zA-Z_$0-9])['"]?(android|ios)['"]?\s*:/g;
  let key = null;
  let pm;
  while ((pm = platformKeyRe.exec(bare)) !== null) key = pm[1];
  return key;
}

// Rewrites the locator literals in `content`, a source file of extension `ext` ('.java', '.js', …;
// it picks the XPath-strategy markers). `opts.optimize` runs the optimizer. `stats` (a makeStats()
// by default) is updated in place. Returns { content, records, stats }: `content` is the text with the
// converted locators, `records` has one entry per locator found, in file order:
// { changed, old, new?, status, reason, warning? }. Android locators count in `stats` only.
function scanText(content, ext, opts = {}, stats = makeStats()) {
  const records = [];
  const platformAt = platformKeys(content, ext);

  // Any quoted string whose content starts like a locator: `//` (XPath),
  // `(//` (grouped XPath), `/XCUIElementTypeApplication` (absolute XPath), or
  // `-ios class chain:` (existing). The leading
  // `ios:`/`android:` key (if any) sits OUTSIDE the match and is left
  // untouched, so this works whether or not consumers tag their locators with
  // a platform prefix. isLikelyIosLocator() is what keeps us from rewriting
  // URLs/comments.
  //
  // `[^\\]` in the tail is load-bearing: with a bare `.`, both `\\.` and
  // `(?!\1).` match a backslash, so a run of backslashes in an unterminated
  // string backtracks exponentially and the scan hangs (~23s at 42 chars). The
  // `s` flag means it would scan to EOF looking for a close quote. Windows
  // paths in a .json/.properties file are enough to trigger it.
  const strictRegex = /(['"`])((?:\(\/\/|\/\/|\(?\/XCUIElementTypeApplication\b|-ios class chain:)(?:\\.|(?!\1)[^\\])*)\1/gs;

  const updatedContent = content.replace(strictRegex, (match, quote, locator, offset) => {
    // Looks like a locator but fails the signal check (e.g. "//cdn.example.com")
    // — leave it completely alone and don't pollute the stats.
    if (!isLikelyIosLocator(locator)) return match;

    stats.locatorsFound++;

    // Skip Android locators: either the value is under an `android:` key
    // (platformAt) or the xpath itself references android.* classes.
    const lastPlatformKey = platformAt(offset);
    const locatorStructure = locator.replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, '""');
    const isAndroidKey = lastPlatformKey === 'android' || locatorStructure.includes('android.');
    if (isAndroidKey) {
      stats.skipped.android++;
      return match;
    }

    // Passed to an explicit XPath strategy (`AppiumBy.xpath("…")`,
    // `(By.XPATH, '…')`, `@iOSXCUITFindBy(xpath = "…")`): rewriting only the
    // string would leave the strategy at XPath and break the locator, so it is
    // left alone and reported. An existing class chain here is reported too —
    // it is already broken, possibly by an earlier run of this tool.
    const strategy = findXpathStrategy(content, offset, ext);
    if (strategy) {
      const reason = `xpath strategy: ${strategy}`;
      stats.skipped.xpathStrategy++;
      records.push({ changed: false, old: locator, status: STATUS.SKIPPED_XPATH_STRATEGY, reason });
      return match;
    }

    let newLocator = locator;
    let status = STATUS.SKIPPED_NO_CHANGE;
    let reason = null;
    let warning = null;

    if (locator.startsWith('//') || locator.startsWith('(//') || /^\(?\/XCUIElementTypeApplication\b/.test(locator)) {
      const result = convertXpathToClassChain(locator, { optimize: opts.optimize });
      newLocator = result.locator;
      status = result.status;
      reason = result.reason;
      warning = result.warning || null;
    } else if (locator.startsWith('-ios class chain:')) {
      const validation = opts.optimize
        ? optimizeClassChain(locator)
        : validateAndFixClassChain(locator);
      if (!validation.valid) {
        status = STATUS.SKIPPED_VALIDATION_FAILED;
        reason = validation.reason;
      } else if (validation.fixedLocator !== locator) {
        newLocator = validation.fixedLocator;
        status = STATUS.SUCCESS; // We fixed an existing issue
      }
    }

    if (status !== STATUS.SUCCESS) {
      // NOT_XPATH gets its own counter: it is reported as a real skip in the
      // JSON `skipped[]` array, so folding it into "no change" made the printed
      // summary and the JSON report disagree about the same run.
      if (status === STATUS.SKIPPED_UNSUPPORTED_LOGIC) stats.skipped.unsupportedLogic++;
      else if (status === STATUS.SKIPPED_VALIDATION_FAILED) stats.skipped.validationFailed++;
      else if (status === STATUS.SKIPPED_NOT_XPATH) stats.skipped.notXpath++;
      else stats.skipped.noChangeNeeded++;

      records.push({ changed: false, old: locator, status, reason: reason || null });
      return match;
    }

    if (newLocator !== locator) {
      if (quote === '`') newLocator = newLocator.replace(/(?<!\\)`/g, '\\`');
      else if (quote === "'") newLocator = newLocator.replace(/(?<!\\)'/g, "\\'");

      records.push({ changed: true, old: locator, new: newLocator, status: STATUS.SUCCESS, reason: null, warning });

      stats.locatorsUpdated++;
      if (warning) stats.warnings++;
      return `${quote}${newLocator}${quote}`;
    }

    stats.skipped.noChangeNeeded++;
    records.push({ changed: false, old: locator, status: STATUS.SKIPPED_NO_CHANGE, reason: null });
    return match;
  });

  return { content: updatedContent, records, stats };
}

module.exports = { makeStats, isLikelyIosLocator, scanText };
