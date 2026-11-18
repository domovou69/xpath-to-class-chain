// Fetches @wdio/appium-service and cuts the optimizer's XPath conversion code out of its bundle,
// unchanged, into out/optimizer.mjs. The package does not export convertXPathToOptimizedSelector.
// Only the logger imports are replaced by a silent stub; every other line is copied as is.
// Usage: node extract.js   (idempotent; re-downloads only when out/pkg is missing)
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { execFileSync } = require('child_process');

const PKG = '@wdio/appium-service', VERSION = '10.2.0';
// npm registry dist.integrity of the tarball
const INTEGRITY = 'sha512-8tJ5CrLyPEPJPBKV3kEMa53qhGqRAtFZiJ8YlHq4nydjMKtpNpr8WsFCMuMGnqaEyIWGTYPMN+EGtsYpZSkcLg==';
const FIRST = '// src/mobileSelectorPerformanceOptimizer/utils/xpath-constants.ts';
const HEAD = '// src/mobileSelectorPerformanceOptimizer/utils/xpath-converter.ts';
const AFTER = '// src/mobileSelectorPerformanceOptimizer/utils/optimization.ts';

const OUT = path.join(__dirname, 'out'), DIR = path.join(OUT, 'pkg');
const tgz = path.join(DIR, `wdio-appium-service-${VERSION}.tgz`);
fs.mkdirSync(DIR, { recursive: true });
if (!fs.existsSync(tgz)) execFileSync('npm', ['pack', `${PKG}@${VERSION}`, '--pack-destination', DIR], { stdio: 'inherit' });
const sri = 'sha512-' + crypto.createHash('sha512').update(fs.readFileSync(tgz)).digest('base64');
if (sri !== INTEGRITY) throw new Error(`tarball integrity ${sri} != ${INTEGRITY}`);
execFileSync('tar', ['xzf', tgz, '-C', DIR]);

const lines = fs.readFileSync(path.join(DIR, 'package/build/index.js'), 'utf8').split('\n');
// esbuild hoists each file's imports, so the converter's own header and logger import sit above FIRST
const from = lines.indexOf(HEAD), to = lines.lastIndexOf(AFTER);
if (from < 0 || lines[from + 3] !== FIRST || to < from) throw new Error('markers not found: the bundle layout changed');
const block = lines.slice(from, to)
  .map(l => l.replace(/^import (logger\d+) from "@wdio\/logger";$/, 'const $1 = () => ({ debug() {}, info() {}, warn() {} });'));
const head = `// Extracted by extract.js from ${PKG}@${VERSION} build/index.js, lines ${from + 1}–${to}. Logic unchanged.\n`;
fs.writeFileSync(path.join(OUT, 'optimizer.mjs'), head + block.join('\n') + '\nexport { convertXPathToOptimizedSelector };\n');
console.log(`out/optimizer.mjs: ${block.length} lines from ${PKG}@${VERSION} (${sri.slice(0, 20)}…)`);
