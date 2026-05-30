#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
// Entry point: CLI orchestration + the public surface tests import. All real
// work lives in ./lib/ — this file only wires modules to the command line.
const { existsSync, writeFileSync } = require('fs');
const { basename, resolve, join } = require('path');

// Where the --json report lands. Co-located with the script so the path is
// stable regardless of what the caller's CWD is when they invoke node.
const JSON_REPORT_PATH = join(__dirname, 'xpath-to-class-chain.report.json');

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

  if (!existsSync(targetDir)) {
    console.error(`Error: directory not found: ${fullPath}`);
    console.error(`  - Edit DEFAULT_TARGET_DIR at the top of this file, OR`);
    console.error(`  - Pass a folder:   node ${basename(__filename)} ./src`);
    process.exit(1);
  }

  if (!opts.quiet) {
    console.log(`\n=== iOS Locator Migration ===`);
    console.log(`Scanning: ${fullPath}`);
    console.log(`Mode: ${opts.dryRun ? 'DRY RUN (no files written)' : 'WRITE'}\n`);
  }

  const stats = makeStats();
  const records = [];
  walkDir(targetDir, filePath => {
    try {
      processFile(filePath, opts, records, stats);
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

function parseFlags(argv) {
  const flags = new Set(argv.filter(a => a.startsWith('--')));
  const json = flags.has('--json');
  return {
    positionals: argv.filter(a => !a.startsWith('--')),
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
  main(opts.positionals[0], opts);
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
