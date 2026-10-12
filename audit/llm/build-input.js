// Builds the Phase 4 model input and its scoring key from audit/coverage-cases.json.
//   input.json: [{ id, xpath }]  shuffled, neutral ids, runtime XPath strings, no group
//   key.json:   { id: { orig, group, cat, source, xpath, baseline } }  never shown to a model
// Runtime strings use the same substitutions as the harness (fuzz.js variant 0, speccases tmpl).
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const { toRuntime, substitute, interpolations } = require('../harness/runtime');
const cases = require(path.join(ROOT, 'audit/coverage-cases.json'));
const corpus = Object.fromEntries(require(path.join(ROOT, 'audit/corpus/ios-locators.json')).map(x => [x.id, x]));
const spec = Object.fromEntries(require('../harness/speccases').map(c => [c.id, c]));

// same rule as fuzz.js substFor(), first variant only
function substFor(src) {
  const subst = new Map(); let k = 0;
  for (const p of interpolations(src)) {
    if (subst.has(p.expr)) continue;
    const before = src.slice(0, p.start);
    if (/@(enabled|visible|accessible|selected)\s*=\s*["']$/.test(before)) subst.set(p.expr, 'true');
    else if (/\[$/.test(before) && src[p.end] === ']' && !/["']$/.test(before)) subst.set(p.expr, /condition/.test(p.expr) ? 'contains(@label, "Vq1")' : '2');
    else subst.set(p.expr, 'Vq' + (++k));
  }
  return subst;
}

const rows = [];
for (const c of cases) {
  if (c.category === 'context') continue;
  let xpath;
  if (c.category === 'corpus') { const x = corpus[c.id]; xpath = toRuntime(x.source, x.quote, substFor(x.source)); }
  else { const s = spec[c.id]; xpath = substitute(s.xpath, new Map(Object.entries(s.tmpl || {}))); }
  rows.push({ orig: c.id, group: c.category === 'corpus' ? 'corpus' : 'spec', cat: c.category, source: c.xpath, xpath, baseline: { verdict: c.verdict, expected: c.expected, actual: c.actual } });
}
if (rows.length !== 678) throw new Error(`expected 678 cases, got ${rows.length}`);

let seed = 20261011; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
for (let i = rows.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [rows[i], rows[j]] = [rows[j], rows[i]]; }

const input = [], key = {};
rows.forEach((r, i) => { const id = 'x' + String(i + 1).padStart(3, '0'); input.push({ id, xpath: r.xpath }); key[id] = r; });
fs.writeFileSync(path.join(__dirname, 'input.json'), JSON.stringify(input, null, 1) + '\n');
fs.writeFileSync(path.join(__dirname, 'key.json'), JSON.stringify(key, null, 1) + '\n');
console.log(`input.json: ${input.length} cases (${rows.filter(r => r.group === 'corpus').length} corpus, ${rows.filter(r => r.group === 'spec').length} spec)`);
