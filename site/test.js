// The playground must give what convertXpathToClassChain gives: run the built bundle and
// playground.js in a vm and compare on every reference case (audit/coverage-cases.json:
// the spec matrix, the edge cases and the GitHub corpus), with and without the optimizer.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { build, OUT } = require('./build');
const { convertXpathToClassChain, STATUS } = require('../xpath-to-class-chain');

build();
const ctx = vm.createContext({});
for (const f of ['converter.js', 'playground.js']) vm.runInContext(fs.readFileSync(path.join(OUT, f), 'utf8'), ctx, { filename: f });
const { convertXpathToClassChain: browser, STATUS: bStatus } = ctx.XpathToClassChain;
const { convertLines } = ctx.Playground;
const plain = v => JSON.parse(JSON.stringify(v));

// the context cases are file fragments, not XPath strings
const CASES = require('../audit/coverage-cases.json').filter(c => typeof c.xpath === 'string');
assert(CASES.length >= 1500, `only ${CASES.length} reference cases`);
assert.deepStrictEqual(plain(bStatus), plain(STATUS));
let skipped = 0;
let optimizable = 0;
for (const c of CASES) {
  const plainWant = convertXpathToClassChain(c.xpath);
  const optWant = convertXpathToClassChain(c.xpath, { optimize: true });
  assert.deepStrictEqual(plain(browser(c.xpath)), plain(plainWant), `${c.id}: bundle differs`);
  assert.deepStrictEqual(plain(browser(c.xpath, { optimize: true })), plain(optWant), `${c.id}: bundle differs with the optimizer`);
  if (/[\r\n]/.test(c.xpath)) { skipped++; continue; } // the page takes one XPath per line, so it cannot hold a line break
  for (const optimize of [false, true]) {
    const want = optimize ? optWant : plainWant;
    const [row] = plain(convertLines(c.xpath, browser, bStatus, optimize));
    const kind = want.status !== STATUS.SUCCESS ? 'skip' : want.warning ? 'close' : 'exact';
    const tag = `${c.id} (optimize ${optimize})`;
    assert.strictEqual(row.kind, kind, `${tag}: kind`);
    assert.strictEqual(row.locator, want.status === STATUS.SUCCESS ? want.locator : null, `${tag}: locator`);
    assert.strictEqual(row.reason, want.status === STATUS.SUCCESS ? null : want.reason || want.status, `${tag}: reason`);
    assert.strictEqual(row.warning, want.warning || null, `${tag}: warning`);
    assert.strictEqual(row.optimizable, optWant.status === STATUS.SUCCESS && optWant.locator !== plainWant.locator, `${tag}: optimizable`);
  }
  if (optWant.status === STATUS.SUCCESS && optWant.locator !== plainWant.locator) optimizable++;
}
// several lines: one entry each, blank lines dropped
const rows = convertLines('\n//XCUIElementTypeButton\r\n\n  //XCUIElementTypeCell  \n', browser, bStatus, false);
assert.deepStrictEqual(plain(rows.map(r => r.xpath)), ['//XCUIElementTypeButton', '//XCUIElementTypeCell']);
// the page's examples show the kind on their label, and one of them shows the optimizer
for (const e of ctx.Playground.EXAMPLES) {
  for (const r of convertLines(e.text, browser, bStatus, false)) assert.strictEqual(r.kind, e.label, `example ${e.label}: ${r.xpath}`);
}
assert(ctx.Playground.EXAMPLES.some(e => convertLines(e.text, browser, bStatus, false).some(r => r.optimizable)), 'no example shows the optimizer');
// the bundle carries the whole core and nothing of Node
const src = fs.readFileSync(path.join(OUT, 'converter.js'), 'utf8');
assert(!/require\(['"](?:fs|path|os|child_process)['"]\)/.test(src));
assert(!/\b(?:process|Buffer)\b/.test(src.replace(/\/\/.*$/gm, '')), 'bundle mentions process or Buffer');
fs.rmSync(OUT, { recursive: true, force: true });
console.log(`playground: ${CASES.length} reference cases match convertXpathToClassChain, with and without the optimizer (${optimizable} changed by the optimizer, ${skipped} with a line break checked on the bundle only)`);
