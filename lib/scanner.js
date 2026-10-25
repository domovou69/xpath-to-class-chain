const { readdirSync, lstatSync, readFileSync, writeFileSync, statSync, renameSync, rmSync } = require('fs');
const { join, extname, basename, relative } = require('path');
const STATUS = require('./status');
const { makeStats, isLikelyIosLocator, scanText } = require('./scantext');

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

// Walks `dir` depth-first, invoking `callback` for every regular file.
//
// Symlinks (and Windows directory junctions, which lstat also reports as links)
// are never followed. Following them lets a link inside the target tree point
// anywhere on disk, and --write would then rewrite files the user never asked
// us to touch — plus a link cycle would recurse until ELOOP. A skipped
// directory link is announced, since it may hide files the user expected to see.
//
// A directory we cannot read is reported and stepped over rather than aborting:
// one permission-denied folder should not throw away the whole scan.
function walkDir(dir, callback) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch (e) {
    console.error(`[skip] cannot read directory ${dir}: ${e.code || e.message}`);
    return;
  }

  entries.forEach(entry => {
    const entryPath = join(dir, entry);
    let stat;
    try {
      stat = lstatSync(entryPath);
    } catch (e) {
      console.error(`[skip] cannot stat ${entryPath}: ${e.code || e.message}`);
      return;
    }

    if (stat.isSymbolicLink()) {
      if (!IGNORE_DIRS.has(entry)) console.error(`[skip] symlink not followed: ${entryPath}`);
      return;
    }
    if (stat.isDirectory()) {
      if (IGNORE_DIRS.has(entry)) return;
      walkDir(entryPath, callback);
    } else if (stat.isFile()) {
      callback(entryPath);
    }
  });
}

// Prints what a scan found, as the CLI shows it: a diff per converted locator, and a line for
// every skip that says why (NOT_XPATH and NO_CHANGE are the common "nothing to do" cases, so
// they would just be noise).
function printRecords(file, records) {
  for (const r of records) {
    if (r.changed) {
      console.log(`\nMatch in ${file}:`);
      console.log(`  - ${r.old}`);
      console.log(`  + ${r.new}`);
      if (r.warning) console.log(`  ! ${r.warning}`);
    } else if (r.status !== STATUS.SKIPPED_NOT_XPATH && r.status !== STATUS.SKIPPED_NO_CHANGE) {
      console.log(`[skip] ${r.reason || r.status}: ${r.old}`);
    }
  }
}

// Saves through a temporary file in the same folder and a rename, so an interrupted run
// never leaves a half-written source file; the file keeps its mode.
function writeFileAtomic(filePath, text) {
  const tmp = `${filePath}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, text, { encoding: 'utf8', mode: statSync(filePath).mode });
    renameSync(tmp, filePath);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
}

function processFile(filePath, opts, records, stats) {
  const ext = extname(filePath).toLowerCase();
  if (!FILE_EXTENSIONS.includes(ext)) return;

  let buf;
  try {
    buf = readFileSync(filePath);
  } catch (e) {
    console.error(`[skip] cannot read ${filePath}: ${e.code || e.message}`);
    return;
  }

  // Read as bytes and confirm the content survives a utf8 round-trip before
  // going near it. Decoding a latin-1 / UTF-16 file as utf8 replaces every
  // undecodable byte with U+FFFD across the WHOLE file, so writing it back
  // destroys the entire file rather than editing one locator. .properties,
  // .xml, .json and .txt are all scanned and are exactly where legacy
  // encodings show up.
  const content = buf.toString('utf8');
  if (!Buffer.from(content, 'utf8').equals(buf)) {
    console.error(`[skip] not valid UTF-8, left untouched: ${filePath}`);
    return;
  }

  stats.filesScanned++;
  // Report paths relative to the scan root so files are identifiable: a repo
  // with ten index.ts files would otherwise produce ten identical rows.
  // Separators are normalised so Windows and POSIX reports match.
  const file = opts.rootDir
    ? relative(opts.rootDir, filePath).replace(/\\/g, '/')
    : basename(filePath);

  const scanned = scanText(content, ext, opts, stats);
  const found = scanned.records.map(r => ({ file, ...r }));
  records.push(...found);
  if (!opts.quiet) printRecords(file, found);

  if (found.some(r => r.changed) && !opts.dryRun) {
    writeFileAtomic(filePath, scanned.content);
    if (!opts.quiet) console.log(`Saved: ${filePath}`);
  }
}

module.exports = {
  FILE_EXTENSIONS,
  IGNORE_DIRS,
  makeStats,
  isLikelyIosLocator,
  scanText,
  walkDir,
  processFile,
};
