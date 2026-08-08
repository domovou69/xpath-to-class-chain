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
// Preview by default; --write opts in to modifying files. The tool rewrites
// source in place with no built-in undo, so the cost of the two defaults is not
// symmetric: defaulting to preview wastes one command, defaulting to write can
// damage a tree the user never named. The optimizer runs in BOTH modes, so the
// preview is byte-for-byte what --write would save.
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

// --dry-run   preview only, never write (the default; the flag is explicit opt-in)
// --write     save changes in place    (overrides the DRY_RUN default)
// --json      emit machine-readable JSON (implies --quiet so stdout stays pure JSON)
// --quiet     drop per-match diffs and banners; keep the final summary
// --optimize  accepted as a no-op — the optimizer always runs
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

The bare command PREVIEWS ONLY and writes nothing. Add --write once the diff
looks right; it rewrites the files in place, so run it on a clean working tree
and let \`git diff\` be your undo.

The optimizer always runs, in preview and write alike, so the preview is exactly
what --write would save.

Flags:
  --dry-run    Preview only, write nothing. The default. Wins if combined with --write.
  --write      Save the changes in place. Requires an explicit target folder.
  --json       Write xpath-to-class-chain.report.json in the current directory. Implies --quiet.
  --quiet      Drop per-match diffs and banner; keep the final summary.
  --optimize   Accepted for compatibility; the optimizer is on by default.
  -h, --help   Show this help.
  -V, --version  Show the version.

Examples:
  xpath-to-class-chain ./src            # preview: converts and optimizes, writes nothing
  xpath-to-class-chain ./src --write    # same result, saved in place`;

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
    // The optimizer always runs. It is what makes the output worth adopting, so
    // requiring a flag for it just meant most users got the worse result.
    //
    // Critically it must be on in BOTH modes: --dry-run is documented as the
    // safe preview of --write, so if the two disagreed about optimization the
    // preview would no longer predict what gets written.
    //
    // `--optimize` is still accepted as a no-op — it is all over existing docs
    // and shell history, and rejecting it as unknown would be a pointless break.
    optimize: true,
  };
}

// Entry point. When required from a test, the pure functions are exported instead.
//   node xpath-to-class-chain.js                       → preview DEFAULT_TARGET_DIR
//   node xpath-to-class-chain.js ./src [--write|--json] → scan a folder
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
  } else if (!opts.dryRun && !opts.positionals.length) {
    // Never modify a folder the user did not name. DEFAULT_TARGET_DIR is a
    // convenience for previewing, and quietly promoting it to a write target
    // would rewrite ./tests on a bare `--write` — the one directory a test repo
    // can least afford to have silently edited.
    console.error(`Error: --write needs an explicit target folder.`);
    console.error(`Refusing to rewrite the default (${DEFAULT_TARGET_DIR}) when you did not name it.`);
    console.error(`  xpath-to-class-chain ./src --write`);
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
