#!/usr/bin/env node
// Entry point: CLI orchestration + the public surface tests import. All real
// work lives in ./lib/ — this file only wires modules to the command line.
const { existsSync, statSync, writeFileSync } = require('fs');
const { resolve, join } = require('path');

// Where the --json report lands: the caller's working directory. Using cwd (not
// __dirname) matters once the tool is installed as a dependency — __dirname then
// points inside node_modules/, which is the wrong place to write a report (it's
// invisible to the user and may be read-only).
const JSON_REPORT_PATH = join(process.cwd(), 'xpath-to-class-chain.report.json');

const STATUS = require('./lib/status');
const { tokenizeXpath, convertXpathToClassChain } = require('./lib/converter');
const { validateAndFixClassChain } = require('./lib/validator');
const { optimizeClassChain } = require('./lib/optimizer');
const { isLikelyIosLocator, walkDir, processFile, makeStats } = require('./lib/scanner');

// ⚠️ REQUIRED: point this at your source folder, or pass one on the command line:
//      node xpath-to-class-chain.js ./src
const DEFAULT_TARGET_DIR = './tests';
// Safety-first default — previewing only; --write overrides.
const DRY_RUN = true;

function main(targetDir = DEFAULT_TARGET_DIR, opts) {
  const fullPath = resolve(targetDir);

  if (!existsSync(fullPath)) {
    console.error(`Error: directory not found: ${fullPath}`);
    console.error(`Pass the folder holding your locators, e.g.  xpath-to-class-chain ./src`);
    process.exit(1);
  }

  // A file target would otherwise reach readdirSync and die with a raw ENOTDIR
  // stack trace.
  if (!statSync(fullPath).isDirectory()) {
    console.error(`Error: not a directory: ${fullPath}`);
    console.error(`This tool scans a folder tree. Pass the containing folder instead.`);
    process.exit(1);
  }

  if (!opts.quiet) {
    console.log(`\n=== iOS Locator Migration ===`);
    console.log(`Scanning: ${fullPath}`);
    console.log(`Mode: ${opts.dryRun ? 'DRY RUN (no files written)' : 'WRITE'}\n`);
  }

  const stats = makeStats();
  const records = [];
  // rootDir lets the scanner report paths relative to the scan root rather than
  // as bare filenames.
  const scanOpts = { ...opts, rootDir: fullPath };
  walkDir(fullPath, filePath => {
    try {
      processFile(filePath, scanOpts, records, stats);
    } catch (e) {
      console.error(`❌ Error in ${filePath}:`, e);
    }
  });

  // --json: emit the full machine-readable result (converted + skipped) to a
  // file next to this script. `reason` is omitted when null so downstream
  // consumers don't have to special-case a key that's mostly absent.
  if (opts.json) {
    const updated = records
      .filter(r => r.changed)
      .map(({ file, old, new: newLocator }) => ({ file, old, new: newLocator }));
    const skipped = records
      .filter(r => !r.changed && r.status !== STATUS.SKIPPED_NO_CHANGE)
      .map(({ file, old, status, reason }) => {
        const entry = { file, locator: old, status };
        if (reason) entry.reason = reason;
        return entry;
      });
    const payload = { mode: opts.dryRun ? 'dry-run' : 'write', directory: fullPath, stats, updated, skipped };
    writeFileSync(JSON_REPORT_PATH, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`Report written to ${JSON_REPORT_PATH}`);
    return { stats, records };
  }

  // Summary always prints (even under --quiet); --quiet only drops the per-match noise.
  const bar = '='.repeat(40);
  console.log(`\n${bar}`);
  console.log(`Migration complete${opts.dryRun ? ' (DRY RUN - no files written)' : ''}`);
  console.log(bar);
  console.log(`Files scanned:    ${stats.filesScanned}`);
  console.log(`Locators found:   ${stats.locatorsFound}`);
  console.log(`Locators updated: ${stats.locatorsUpdated}`);
  console.log(`Total skipped:    ${stats.locatorsFound - stats.locatorsUpdated}`);
  console.log(`  android:        ${stats.skipped.android}`);
  console.log(`  validation:     ${stats.skipped.validationFailed}`);
  console.log(`  unsupported:    ${stats.skipped.unsupportedLogic}`);
  console.log(`  not xpath:      ${stats.skipped.notXpath}`);
  console.log(`  no change:      ${stats.skipped.noChangeNeeded}`);
  console.log(bar);
  return { stats, records };
}

// --dry-run   preview only, never write (overrides the DRY_RUN default)
// --write     force writing       (overrides the DRY_RUN default)
// --json      emit machine-readable JSON (implies --quiet so stdout stays pure JSON)
// --quiet     drop per-match diffs and banners; keep the final summary
// --optimize  run the optimizer pass: idempotent re-validation + `== "abc*"`
//             rewritten as `LIKE "abc*"` (recovers wildcard-equality cases
//             that would otherwise fail validation)
// --dry-run wins if both --dry-run and --write are passed.

function resolveBool(flags, onFlag, offFlag, fallback) {
  if (flags.has(onFlag)) return true;
  if (flags.has(offFlag)) return false;
  return fallback;
}

// Every flag the CLI understands. An unrecognised flag is rejected rather than
// ignored: silently dropping a typo'd `--optimise` runs the UNOPTIMISED path
// while the user believes the optimizer ran, and `--wirte` would preview
// instead of writing.
const KNOWN_FLAGS = new Set([
  '--dry-run', '--write', '--optimize', '--json', '--quiet', '--help', '-h', '--version', '-V',
]);

const USAGE = `xpath-to-class-chain — convert iOS XPath locators to Class Chain selectors

Usage:
  xpath-to-class-chain <folder> [flags]

Flags:
  --dry-run    Preview only, never write. ON by default; wins over --write.
  --write      Rewrite the files in place.
  --optimize   Run the optimizer pass (LIKE recovery, chain simplification).
  --json       Write xpath-to-class-chain.report.json in the current directory. Implies --quiet.
  --quiet      Drop per-match diffs and banner; keep the final summary.
  -h, --help   Show this help.
  -V, --version  Show the version.

Examples:
  xpath-to-class-chain ./src --dry-run --optimize   # preview, safe
  xpath-to-class-chain ./src --write --optimize     # apply the migration`;

function parseFlags(argv) {
  const flags = new Set(argv.filter(a => a.startsWith('-')));
  const json = flags.has('--json');
  return {
    positionals: argv.filter(a => !a.startsWith('-')),
    unknown: [...flags].filter(f => !KNOWN_FLAGS.has(f)),
    help: flags.has('--help') || flags.has('-h'),
    version: flags.has('--version') || flags.has('-V'),
    json,
    quiet: json || flags.has('--quiet'),
    dryRun: resolveBool(flags, '--dry-run', '--write', DRY_RUN),
    optimize: flags.has('--optimize'),
  };
}

// Entry point. When required from a test, the pure functions are exported instead.
//   node xpath-to-class-chain.js                          → scan DEFAULT_TARGET_DIR
//   node xpath-to-class-chain.js ./src [--dry-run|--json] → scan a folder
if (require.main === module) {
  const opts = parseFlags(process.argv.slice(2));
  if (opts.help) {
    console.log(USAGE);
  } else if (opts.version) {
    console.log(require('./package.json').version);
  } else if (opts.unknown.length) {
    console.error(`Error: unknown flag${opts.unknown.length > 1 ? 's' : ''}: ${opts.unknown.join(', ')}`);
    console.error(`Run with --help to see the supported flags.`);
    process.exit(1);
  } else {
    main(opts.positionals[0], opts);
  }
}

module.exports = {
  // Pure functions — re-exported so tests can keep their existing import path.
  convertXpathToClassChain,
  validateAndFixClassChain,
  optimizeClassChain,
  tokenizeXpath,
  isLikelyIosLocator,
  parseFlags,
  main,
  STATUS,
};
