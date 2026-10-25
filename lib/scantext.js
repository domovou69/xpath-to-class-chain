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

// Rewrites the locator literals in `content`, a source file of extension `ext` ('.java', '.js', …;
// it picks the XPath-strategy markers). `opts.optimize` runs the optimizer. `stats` (a makeStats()
// by default) is updated in place. Returns { content, records, stats }: `content` is the text with the
// converted locators, `records` has one entry per locator found, in file order:
// { changed, old, new?, status, reason, warning? }. Android locators count in `stats` only.
function scanText(content, ext, opts = {}, stats = makeStats()) {
  const records = [];

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

    // Skip Android locators: either the value is under an `android:` key in a
    // dual-platform object (e.g. CodeceptJS `{ ios: '...', android: '...' }`)
    // or the xpath itself references android.* classes.
    // We find the last platform key (android:/ios:) on the same line before this
    // string — this correctly handles ternaries like `android: cond ? a : 'xpath'`
    // without regressing single-line objects like `{ android: 'val', ios: '//x' }`.
    // Scan back to the nearest property boundary (comma / semicolon / closing
    // brace or bracket) so multi-line patterns like `android:\n  \`locator\``
    // are detected even when the key is on the preceding line.
    const lineStart = content.lastIndexOf('\n', offset - 1) + 1;
    let contextStart = lineStart > 0 ? lineStart - 1 : 0;
    while (contextStart > 0 && !/[,;}\]]/.test(content[contextStart])) contextStart--;
    if (contextStart > 0) contextStart++; // skip past the boundary char itself
    const linePrefix = content.slice(contextStart, offset);
    const platformKeyRe = /(?<![a-zA-Z_$0-9])['"]?(android|ios)['"]?\s*:/g;
    let lastPlatformKey = null;
    let pm;
    // String values are blanked first: `"android:id/message"` (an
    // @AndroidFindBy id on the line above) is not a key. A quoted key
    // (`'android':`) is followed by a colon and is kept.
    const keyPrefix = linePrefix.replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1(?!\s*:)/g, '""');
    while ((pm = platformKeyRe.exec(keyPrefix)) !== null) lastPlatformKey = pm[1];
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
