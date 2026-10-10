// Runs the spec matrix: converter output + harness comparison of XPath vs actual and vs expected.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { ROOT, EMU, out } = require('./paths');
const m = require(path.join(ROOT, 'xpath-to-class-chain'));
const { substitute } = require('./runtime');
const TRIALS = +(process.env.TRIALS || 300);
const cases = require('./speccases');
let seed = 777; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = a => a[Math.floor(rnd() * a.length)];
const xmlEsc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '&#10;');
function genTree(xp) {
  const lits = [...xp.matchAll(/"([^"]*)"|'([^']*)'/g)].map(mm => mm[1] ?? mm[2]).filter(l => !/^XCUIElementType/.test(l));
  const pool = ['other', 'a', 'b', 'c', 'ab', 'AB', 'x', ' a  b ', 'a b', 'A b', 'zabz', 'true', 'false'];
  for (const l of lits) pool.push(l, l, l + 'z', 'y' + l, l.toUpperCase(), l.slice(0, -1));
  const types = [...new Set([...(xp.match(/XCUIElementType[A-Za-z]+/g) || []), 'XCUIElementTypeOther', 'XCUIElementTypeButton', 'XCUIElementTypeStaticText', 'XCUIElementTypeCell', 'XCUIElementTypeTextField'])]
    .filter(t => !['XCUIElementTypeApplication', 'XCUIElementTypeAny', 'XCUIElementTypeLabel', 'XCUIElementTypeText'].includes(t));
  let k = 0;
  const node = (depth, type) => {
    const at = { k: 'n' + k++ };
    if (depth === 0) Object.assign(at, { name: 'AppRoot', label: 'AppRoot', enabled: 'true', visible: 'true', accessible: 'false' });
    else {
      for (const a of ['name', 'label', 'value', 'placeholderValue']) if (rnd() < 0.5) at[a] = pick(pool);
      for (const a of ['enabled', 'visible', 'accessible', 'hittable', 'selected']) at[a] = rnd() < 0.6 ? 'true' : 'false';
      for (const a of ['x', 'width']) at[a] = pick(['0', '50', '60', '100']);
      if (rnd() < 0.4) at.value = pick(['1', '5', '7', '10.5', 'abc']);
    }
    let kids = '';
    const n = depth >= 4 ? 0 : Math.floor(rnd() * (depth === 0 ? 3 : 4));
    for (let i = 0; i < n && k < 20; i++) kids += node(depth + 1, pick(types));
    return `<${type} ${Object.entries(at).map(([a, v]) => `${a}="${xmlEsc(v)}"`).join(' ')}>${kids}</${type}>`;
  };
  return node(0, 'XCUIElementTypeApplication');
}
const runCases = [], rows = [];
for (const c of cases) {
  const subst = new Map(Object.entries(c.tmpl || {}));
  const r = m.convertXpathToClassChain(c.xpath, { optimize: true });
  const row = { ...c, status: r.status, actual: r.status === 'success' ? r.locator.replace(/^-ios class chain:/, '') : null };
  const xp = substitute(c.xpath, subst);
  const exp = typeof c.expected === 'string' ? substitute(c.expected, subst) : null;
  const act = row.actual ? substitute(row.actual, subst) : null;
  for (let t = 0; t < TRIALS; t++) {
    const xml = genTree(xp);
    if (exp) runCases.push({ id: `${c.id}~E~${t}`, xml, xpath: xp, chain: exp });
    if (act) runCases.push({ id: `${c.id}~A~${t}`, xml, xpath: xp, chain: act });
    if (!exp && !act) { runCases.push({ id: `${c.id}~X~${t}`, xml, xpath: xp }); }
  }
  if (c.fixture) {
    if (exp) runCases.push({ id: `${c.id}~FE~0`, xml: c.fixture, xpath: xp, chain: exp });
    if (act) runCases.push({ id: `${c.id}~FA~0`, xml: c.fixture, xpath: xp, chain: act });
    if (!exp && !act) runCases.push({ id: `${c.id}~FX~0`, xml: c.fixture, xpath: xp });
  }
  rows.push(row);
}
fs.writeFileSync(out('speccases.json'), JSON.stringify(runCases));
const res = JSON.parse(execFileSync(EMU, [out('speccases.json')], { maxBuffer: 1e9 }));
const xmlOf = Object.fromEntries(runCases.map(c => [c.id, c.xml]));
const agg = {};
const fixtureRes = {};
for (const r of res) {
  const [id, which] = r.id.split('~'); const key = id + '~' + which;
  if (which[0] === 'F') { (fixtureRes[id] ??= {})[which] = { xpath: r.xpath, chain: r.chain }; continue; }
  const a = agg[key] ??= { trials: 0, equal: 0, first: 0, set: 0, hits: 0, ccErr: null, xpErr: null, ex: null };
  a.trials++;
  if (r.xpath && !Array.isArray(r.xpath)) { a.xpErr = r.xpath.error; continue; }
  if (which === 'X') { if (r.xpath.length) a.hits++; continue; }
  if (!Array.isArray(r.chain)) { a.ccErr = r.chain.error; continue; }
  if (r.xpath.length) a.hits++;
  const same = JSON.stringify([...r.xpath].sort()) === JSON.stringify([...r.chain].sort());
  if (same && r.xpath[0] === r.chain[0]) a.equal++; else { same ? a.first++ : a.set++; if (!a.ex || xmlOf[r.id].length < a.ex.xml.length) a.ex = { xml: xmlOf[r.id], xpathHits: r.xpath, chainHits: r.chain }; }
}
const outcome = a => !a ? null : a.xpErr ? 'XPATH_ERROR' : a.ccErr ? 'CC_ERROR' : a.set ? 'SET_DIFFERS' : a.first ? 'FIRST_DIFFERS' : 'EQUAL';
for (const row of rows) { row.runExpected = agg[row.id + '~E'] ? { outcome: outcome(agg[row.id + '~E']), ...agg[row.id + '~E'] } : null; row.runActual = agg[row.id + '~A'] ? { outcome: outcome(agg[row.id + '~A']), ...agg[row.id + '~A'] } : null; row.runXpathOnly = agg[row.id + '~X'] || null; row.fixtureRun = fixtureRes[row.id] || null; }
fs.writeFileSync(out('specresults.json'), JSON.stringify(rows, null, 1));
for (const r of rows) {
  const e = r.runExpected, a = r.runActual;
  console.log(`${r.id} ${r.status.padEnd(26)} exp:${e ? e.outcome + '(' + e.hits + ')' : JSON.stringify(r.expected).slice(0, 40)} act:${a ? a.outcome + '(' + a.hits + ')' : '-'}${a && a.ccErr ? ' ERR=' + a.ccErr.slice(0, 70).replace(/\n/g, ' ') : ''}${e && e.ccErr ? ' EXPERR=' + e.ccErr.slice(0, 70) : ''}${(e && e.xpErr) || (a && a.xpErr) ? ' XPERR=' + ((e || a).xpErr || '').slice(0, 60) : ''}${r.runXpathOnly ? ' xpathOnly hits=' + r.runXpathOnly.hits + (r.runXpathOnly.xpErr ? ' XPERR ' + r.runXpathOnly.xpErr.slice(0, 50) : '') : ''}`);
  if (r.fixtureRun) console.log('     FIXTURE', JSON.stringify(r.fixtureRun));
  console.log(`     X: ${r.xpath.replace(/\n/g, '\\n')}\n     A: ${(r.actual || '').replace(/\n/g, '\\n')}`);
}
