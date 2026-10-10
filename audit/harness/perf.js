// CRASH probe: exceptions, hangs, super-linear growth (n vs 2n vs 4n).
const m = require(require('path').join(require('./paths').ROOT, 'xpath-to-class-chain'));
const gens = {
  brackets: n => '//*' + '['.repeat(n),
  closeBrackets: n => '//*' + ']'.repeat(n),
  backticks: n => '//*[@name="' + '`'.repeat(n),
  quotes: n => '//*[@name=' + '"'.repeat(n),
  singleQuotes: n => "//*[@name=" + "'".repeat(n),
  parens: n => '('.repeat(n) + '//*',
  slashes: n => '/'.repeat(n) + 'XCUIElementTypeButton',
  steps: n => '//XCUIElementTypeOther'.repeat(n) + '//XCUIElementTypeButton',
  andChain: n => '//*[' + Array.from({ length: n }, (_, i) => `contains(@name,"v${i}")`).join(' and ') + ']',
  orChain: n => '//*[' + Array.from({ length: n }, (_, i) => `@name="v${i}"`).join(' or ') + ']',
  manyPreds: n => '//*' + '[@name="a"]'.repeat(n),
  longValue: n => '//*[@name="' + 'a'.repeat(n * 20) + '"]',
  backslashes: n => '//*[@name="' + '\\'.repeat(n) + '"]',
  dollar: n => '//*[' + '${'.repeat(n) + ']',
  ccBackticks: n => '-ios class chain:**/*[`' + '\\`'.repeat(n),
  nestedPreds: n => '//*' + '[.//*'.repeat(n) + ']'.repeat(n),
};
const rows = [];
for (const [name, g] of Object.entries(gens)) {
  const t = [];
  for (const n of [250, 500, 1000, 2000]) {
    const s = g(n); const t0 = process.hrtime.bigint(); let err = null;
    try { s.startsWith('-ios') ? m.optimizeClassChain(s) : m.convertXpathToClassChain(s, { optimize: true }); } catch (e) { err = e.message.slice(0, 60); }
    t.push(Number(process.hrtime.bigint() - t0) / 1e6); if (err) rows.push(`${name} n=${n} EXCEPTION ${err}`);
  }
  rows.push(`${name.padEnd(14)} ms@250..2000: ${t.map(x => x.toFixed(1)).join(' / ')}  ratio(2000/1000)=${(t[3] / Math.max(t[2], 0.01)).toFixed(1)}`);
}
console.log(rows.join('\n'));
