/* eslint-disable @typescript-eslint/no-require-imports */
const { readdirSync, statSync, readFileSync, writeFileSync } = require('fs');
const { join, extname, basename } = require('path');
const STATUS = require('./status');
const { convertXpathToClassChain } = require('./converter');
const { validateAndFixClassChain } = require('./validator');
const { optimizeClassChain } = require('./optimizer');

const FILE_EXTENSIONS = [
  // JS / TS ecosystem (WebdriverIO, Appium JS/TS clients)
  '.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.jsx', '.tsx',
  // JVM (Java / Kotlin / Groovy Appium & Selenium clients)
  '.java', '.kt', '.kts', '.groovy',
  // Python (Appium-Python-Client, pytest-bdd)
  '.py',
  // Ruby (appium_lib)
  '.rb',
  // .NET (Appium dotnet driver)
  '.cs',
  // PHP
  '.php',
  // Swift / Objective-C (XCUITest-style sources)
  '.swift', '.m',
  // Data / config / BDD files that often hold page-object locators
  '.json', '.yaml', '.yml', '.xml', '.feature', '.properties', '.txt',
];

// Directories we never want to descend into — scanning them is slow and, worse,
// would rewrite locator-looking strings inside third-party/build artifacts.
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.cache']);

// Constructed per-run rather than module-global so a second main() call
// (in tests, watch-mode, etc.) doesn't carry counts over from the first.
function makeStats() {
  return {
    filesScanned: 0,
    locatorsFound: 0,
    locatorsUpdated: 0,
    skipped: {
      android: 0,
      validationFailed: 0,
      unsupportedLogic: 0,
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
  // `//xpath`. lastIndexOf(')') finds the group-close even when a quoted
  // attribute value contains a ')' character (e.g. [@name="a)b"]).
  let core = str;
  if (str.startsWith('(//')) {
    const closeIdx = str.lastIndexOf(')');
    if (closeIdx > 0) core = str.slice(1, closeIdx);
  }

  if (!core.startsWith('//')) return false;

  // Must carry at least one iOS / XPath signal, not just two leading slashes.
  const hasIosSignal =
    /XCUIElementType[A-Za-z]+/.test(core) || // native element type
    /@(?:name|label|value|type|text|enabled|visible|accessible|selected|focused|hittable)\b/.test(core) || // known attrs
    /\b(?:contains|starts-with|ends-with)\s*\(/i.test(core) || // string functions
    /\[[^\]]*\]/.test(core); // any predicate at all (e.g. //Type[1])
  if (!hasIosSignal) return false;

  // Bracket balance check on the core only (outer [n] index excluded).
  // Anything malformed is still caught by the validator downstream.
  const open = (core.match(/\[/g) || []).length;
  const close = (core.match(/\]/g) || []).length;
  return open === close;
}

function walkDir(dir, callback) {
  readdirSync(dir).forEach(entry => {
    const entryPath = join(dir, entry);
    const stat = statSync(entryPath);
    if (stat.isDirectory()) {
      if (IGNORE_DIRS.has(entry)) return;
      walkDir(entryPath, callback);
    } else {
      callback(entryPath);
    }
  });
}

function processFile(filePath, opts, records, stats) {
  if (!FILE_EXTENSIONS.includes(extname(filePath).toLowerCase())) return;

  stats.filesScanned++;
  const content = readFileSync(filePath, 'utf8');
  const file = basename(filePath);

  // Any quoted string whose content starts like a locator: `//` (XPath),
  // `(//` (grouped XPath), or `-ios class chain:` (existing). The leading
  // `ios:`/`android:` key (if any) sits OUTSIDE the match and is left
  // untouched, so this works whether or not consumers tag their locators with
  // a platform prefix. isLikelyIosLocator() is what keeps us from rewriting
  // URLs/comments.
  const strictRegex = /(['"`])((?:\(\/\/|\/\/|-ios class chain:)(?:\\.|(?!\1).)*)\1/gs;

  let modified = false;

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
    while ((pm = platformKeyRe.exec(linePrefix)) !== null) lastPlatformKey = pm[1];
    const locatorStructure = locator.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '""');
    const isAndroidKey = lastPlatformKey === 'android' || locatorStructure.includes('android.');
    if (isAndroidKey) {
      stats.skipped.android++;
      return match;
    }

    let newLocator = locator;
    let status = STATUS.SKIPPED_NO_CHANGE;
    let reason = null;

    if (locator.startsWith('//') || locator.startsWith('(//')) {
      const result = convertXpathToClassChain(locator, { optimize: opts.optimize });
      newLocator = result.locator;
      status = result.status;
      reason = result.reason;
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
      if (status === STATUS.SKIPPED_UNSUPPORTED_LOGIC) stats.skipped.unsupportedLogic++;
      else if (status === STATUS.SKIPPED_VALIDATION_FAILED) stats.skipped.validationFailed++;
      else stats.skipped.noChangeNeeded++;

      records.push({ file, changed: false, old: locator, status, reason: reason || null });
      // Surface anything genuinely skipped (validation / unsupported logic) so
      // the user sees WHY a locator was untouched. NOT_XPATH and NO_CHANGE are
      // the common "nothing to do" cases — those would just be noise.
      if (!opts.quiet && status !== STATUS.SKIPPED_NOT_XPATH && status !== STATUS.SKIPPED_NO_CHANGE) {
        console.log(`[skip] ${reason || status}: ${locator}`);
      }
      return match;
    }

    if (newLocator !== locator) {
      if (quote === '`') newLocator = newLocator.replace(/(?<!\\)`/g, '\\`');
      else if (quote === "'") newLocator = newLocator.replace(/(?<!\\)'/g, "\\'");

      records.push({ file, changed: true, old: locator, new: newLocator, status: STATUS.SUCCESS, reason: null });
      if (!opts.quiet) {
        console.log(`\nMatch in ${file}:`);
        console.log(`  - ${locator}`);
        console.log(`  + ${newLocator}`);
      }

      stats.locatorsUpdated++;
      modified = true;
      return `${quote}${newLocator}${quote}`;
    }

    stats.skipped.noChangeNeeded++;
    records.push({ file, changed: false, old: locator, status: STATUS.SKIPPED_NO_CHANGE, reason: null });
    return match;
  });

  if (modified && !opts.dryRun) {
    writeFileSync(filePath, updatedContent, 'utf8');
    if (!opts.quiet) console.log(`Saved: ${filePath}`);
  }
}

module.exports = {
  FILE_EXTENSIONS,
  IGNORE_DIRS,
  makeStats,
  isLikelyIosLocator,
  walkDir,
  processFile,
};
