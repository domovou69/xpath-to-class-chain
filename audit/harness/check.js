// One-off check: convert an XPath with the project's converter, then run the XPath and the
// resulting chain in mini-WDA against page sources (e.g. saved from Appium Inspector).
// Usage: node check.js '<xpath>' page.xml [page2.xml …]   (or --chain '<class chain body>' to test a chain you wrote)
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { ROOT, EMU, out } = require('./paths');
const m = require(path.join(ROOT, 'xpath-to-class-chain'));

const args = process.argv.slice(2);
const ci = args.indexOf('--chain'); const manual = ci >= 0 ? args.splice(ci, 2)[1] : null;
const [xpath, ...pages] = args;
if (!xpath || !pages.length) { console.error("usage: node check.js '<xpath>' page.xml [...] [--chain '<chain>']"); process.exit(2); }

const r = m.convertXpathToClassChain(xpath, { optimize: true });
console.log('converter:', r.status, r.locator || r.reason || '');
const chain = manual || (r.status === 'success' ? r.locator.replace(/^-ios class chain:/, '') : null);
const cases = pages.map(p => ({ id: p, xml: fs.readFileSync(p, 'utf8'), xpath, ...(chain ? { chain } : {}) }));
fs.writeFileSync(out('check.json'), JSON.stringify(cases));
let diff = 0;
for (const res of JSON.parse(execFileSync(EMU, [out('check.json')], { maxBuffer: 1e9 }))) {
  // elements are identified by their `k` attribute when present, else by child-index path
  // same rule as the fuzzers: equal result set and equal first element (what findElement returns)
  const sorted = a => Array.isArray(a) ? JSON.stringify([...a].sort()) : JSON.stringify(a);
  const same = sorted(res.xpath) === sorted(res.chain) && Array.isArray(res.chain) && res.xpath[0] === res.chain[0];
  if (chain && !same) diff++;
  console.log(`\n${res.id}${res.error ? ' ' + res.error : ''}\n  xpath: ${JSON.stringify(res.xpath)}${chain ? `\n  chain: ${JSON.stringify(res.chain)}\n  ${same ? 'EQUAL' : 'DIFFERENT'}` : ''}`);
}
process.exitCode = diff ? 1 : 0;
