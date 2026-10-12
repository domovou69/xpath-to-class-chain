// Scores Phase 4 outputs with the coverage harness oracle (mini-WDA, WDA 16.14.1).
// Usage: node score.js out/<model>-<effort>-<run>.json …   |   node score.js --converter
// Each chain runs against the same page sources as the XPath; the trees depend only on the case,
// so every model and the converter are judged on identical inputs.
// Writes scores/<name>.json (per-case verdicts + summary) and prints one summary line per file.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '../..');
const EMU = process.env.EMU || path.join(ROOT, 'audit/harness/out/wdaemu');
const m = require(path.join(ROOT, 'xpath-to-class-chain'));
const key = require('./key.json');
const input = require('./input.json');
const specById = Object.fromEntries(require('../harness/speccases').map(c => [c.id, c]));
const SCORES = path.join(__dirname, 'scores'); fs.mkdirSync(SCORES, { recursive: true });
const TRIALS = { corpus: +(process.env.TRIALS_CORPUS || 200), spec: +(process.env.TRIALS_SPEC || 300) };
const PREFIX = /^\s*-ios class chain:\s*/;

// ---------- page sources (generators copied from harness fuzz.js / spec.js, seeded per case)
const xmlEsc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '&#10;');
function rng(str) { let seed = 0; for (const ch of str) seed = (seed * 31 + ch.codePointAt(0)) % 2147483648; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648; return { rnd, pick: a => a[Math.floor(rnd() * a.length)] }; }
function pairsOf(xp) {
  const out = [];
  for (const mm of xp.matchAll(/@(name|label|value|enabled|visible|accessible)\s*(?:=|,)\s*(?:"([^"]*)"|'([^']*)')/g)) out.push([mm[1], mm[2] ?? mm[3]]);
  for (const mm of xp.matchAll(/(?:contains|starts-with)\s*\(\s*@(name|label|value|enabled)\s*,\s*(?:"([^"]*)"|'([^']*)')/g)) out.push([mm[1], mm[2] ?? mm[3]]);
  return out;
}
function corpusTree(xp, { rnd, pick }) { // fuzz.js genTree, DIRECTED=1
  const lits = [...xp.matchAll(/"([^"]*)"|'([^']*)'/g)].map(mm => mm[1] ?? mm[2]);
  const types = [...new Set([...(xp.match(/XCUIElementType[A-Za-z]+/g) || []), 'XCUIElementTypeOther', 'XCUIElementTypeStaticText', 'XCUIElementTypeButton', 'XCUIElementTypeWindow'])].filter(t => t !== 'XCUIElementTypeApplication');
  const pairs = pairsOf(xp), strPool = [];
  for (const l of lits) { if (/^XCUIElementType/.test(l)) continue; strPool.push(l, l, l + ' z', 'y ' + l, l.slice(0, Math.ceil(l.length / 2)), l.toUpperCase()); }
  strPool.push('other', 'Vq1', 'Vq2', 'true', 'false');
  let k = 0;
  const node = (depth, type) => {
    const attrs = [`k="n${k++}"`];
    if (depth === 0) attrs.push('name="AppRoot" label="AppRoot" enabled="true" visible="true" accessible="false"');
    else {
      const set = {};
      for (const a of ['name', 'label', 'value']) if (rnd() < 0.55) set[a] = pick(strPool);
      for (const a of ['enabled', 'visible', 'accessible']) set[a] = rnd() < 0.6 ? 'true' : 'false';
      if (pairs.length && rnd() < 0.6) for (const [a, l] of pairs) if (rnd() < 0.85) set[a] = rnd() < 0.7 ? l : pick([l + ' z', 'y ' + l, l.slice(1), 'other']);
      if (rnd() < 0.4) { const by = {}; for (const [a, l] of pairs) (by[a] ??= []).push(l); for (const [a, ls] of Object.entries(by)) if (ls.length > 1) set[a] = ls.join(' '); }
      for (const [a, v] of Object.entries(set)) attrs.push(`${a}="${xmlEsc(v)}"`);
    }
    let kids = '';
    const n = depth >= 4 ? 0 : Math.floor(rnd() * (depth === 0 ? 3 : 4));
    for (let i = 0; i < n && k < 18; i++) kids += node(depth + 1, pick(types));
    return `<${type} ${attrs.join(' ')}>${kids}</${type}>`;
  };
  return node(0, 'XCUIElementTypeApplication');
}
function specTree(xp, { rnd, pick }) { // spec.js genTree
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
const FIXTURE_FROM = { E10: 'E09' }; // E10's runtime string is E09's locator
const TREES = {};
for (const [id, k] of Object.entries(key)) {
  const r = rng(k.orig);
  TREES[id] = Array.from({ length: TRIALS[k.group] }, () => (k.group === 'corpus' ? corpusTree : specTree)(k.xpath, r));
  const fx = k.group === 'spec' && (specById[k.orig].fixture || (FIXTURE_FROM[k.orig] && specById[FIXTURE_FROM[k.orig]].fixture));
  if (fx) TREES[id].push(fx);
}

// ---------- oracle: chain vs XPath on every tree of the case
function evaluate(chains) { // chains: { id: chainBody } → { id: { outcome, trials, hits, err, example } }
  const res = {};
  const ids = Object.keys(chains);
  for (let s = 0; s < ids.length; s += 100) { // batches keep the emulator's JSON small
    const batch = [];
    for (const id of ids.slice(s, s + 100)) TREES[id].forEach((xml, t) => batch.push({ id: `${id}~${t}`, xml, xpath: key[id].xpath, chain: chains[id] }));
    const tmp = path.join(SCORES, `.emu-${process.pid}.json`);
    fs.writeFileSync(tmp, JSON.stringify(batch));
    const out = JSON.parse(execFileSync(EMU, [tmp], { maxBuffer: 2e9, stdio: ['ignore', 'pipe', 'ignore'] }));
    fs.rmSync(tmp);
    const xmlOf = Object.fromEntries(batch.map(b => [b.id, b.xml]));
    for (const r of out) {
      const [id, t] = r.id.split('~');
      const a = res[id] ??= { trials: 0, equal: 0, hits: 0, setDiffers: 0, firstDiffers: 0, xpErr: null, ccErr: null, example: null };
      a.trials++;
      if (!Array.isArray(r.xpath)) { a.xpErr = r.xpath.error; continue; }
      if (!Array.isArray(r.chain)) { a.ccErr = r.chain.error; continue; }
      if (r.xpath.length) a.hits++;
      const fixture = +t === TRIALS[key[id].group]; // fixtures compare the exact result list, as spec.js does
      const same = JSON.stringify([...r.xpath].sort()) === JSON.stringify([...r.chain].sort());
      const ok = fixture ? JSON.stringify(r.xpath) === JSON.stringify(r.chain) : same && r.xpath[0] === r.chain[0];
      if (ok) a.equal++;
      else { same ? a.firstDiffers++ : a.setDiffers++; if (!a.example || xmlOf[r.id].length < a.example.xml.length) a.example = { xml: xmlOf[r.id], xpathHits: r.xpath, chainHits: r.chain }; }
    }
  }
  for (const a of Object.values(res)) a.outcome = a.xpErr ? 'XPATH_ERROR' : a.ccErr ? 'CC_ERROR' : a.setDiffers ? 'SET_DIFFERS' : a.firstDiffers ? 'FIRST_DIFFERS' : 'EQUAL';
  return res;
}

// ---------- case classes (from the harness baseline, adjusted to the runtime string the models see)
// spec cases without an exact class chain, or whose XPath matches nothing on WDA (build.js NOT_EXPRESSIBLE)
const SPEC_NOT_EXPRESSIBLE = new Set(['E11', 'E05', 'E06', 'E07', 'F03', 'A13', 'B08', 'B13', 'C03', 'C04', 'C05', 'H10', 'E04', 'E08', 'E10', 'E12', 'F02', 'F05', 'F06', 'H07', 'H08', 'H09', 'R02', 'R03', 'R04', 'X01', 'X02', 'X03', 'X06']);
// the runtime string differs in kind from the source the baseline judged:
//   L476 `[${condition}]` → a plain contains(); E10 `)${suffix}` with suffix [2] → the same locator as E09
const RUNTIME_OVERRIDE = { L476: { expressible: true, drift: false }, E10: { expressible: true, drift: true, documented: true } };
const conv = {};
for (const [id, k] of Object.entries(key)) {
  const r = m.convertXpathToClassChain(k.xpath, { optimize: true });
  conv[id] = r.status === 'success' ? { chain: r.locator.replace(PREFIX, '') } : { skip: true, reason: r.status };
}
// DRIFT documented in the README earns half credit, as in build.js
const DOC = Object.fromEntries(require(path.join(ROOT, 'audit/coverage-cases.json')).filter(c => c.verdict === 'DRIFT').map(c => [c.id, /DRIFT documented in README/.test(c.note)]));
const CLASS = {};
for (const [id, k] of Object.entries(key)) {
  const b = k.baseline, ov = RUNTIME_OVERRIDE[k.orig] || {};
  const expressible = ov.expressible ?? (k.group === 'corpus' ? b.verdict !== 'CORRECT-SKIP' : !SPEC_NOT_EXPRESSIBLE.has(k.orig));
  const drift = ov.drift ?? b.verdict === 'DRIFT';
  const documented = drift ? ov.documented ?? DOC[k.orig] ?? false : null;
  // no exact chain: corpus DRIFT ("no exact class chain"), spec cases with an `approx` note or an `inexpressible` expectation (E13), E10 (= E09).
  // A converter DRIFT with a proven exact chain (A07, A14–A16, B16) is the converter's own imprecision: a skip there is a GAP.
  const sc = specById[k.orig];
  const noExact = drift && (k.group === 'corpus' || !!(sc && (sc.approx || (sc.expected && sc.expected.inexpressible))) || k.orig === 'E10');
  CLASS[id] = { expressible, drift, documented, noExact };
}

// ---------- verdicts and scores
const W = { A: 15, B: 15, C: 15, D: 12, E: 12, F: 10, G: 10, H: 6, R: 5 };
function score(name, entries) {
  // entries: [{ id, chain } | { id, skip, reason }]; duplicates keep the first, unknown ids are counted
  const byId = {}, stats = { entries: entries.length, duplicates: 0, unknownIds: 0, noPrefix: 0, malformed: 0 };
  for (const e of entries) {
    if (!e || typeof e !== 'object' || !key[e.id]) { stats.unknownIds++; continue; }
    if (byId[e.id]) { stats.duplicates++; continue; }
    byId[e.id] = e;
  }
  const chains = {}, rows = {};
  for (const id of Object.keys(key)) {
    const e = byId[id];
    if (!e) rows[id] = { verdict: 'MISSING' };
    else if (typeof e.chain === 'string' && e.chain.trim() && !e.skip) {
      if (!PREFIX.test(e.chain)) stats.noPrefix++;
      chains[id] = e.chain.replace(PREFIX, '').trim();
      rows[id] = { chain: e.chain };
    } else if (e.skip) rows[id] = { skip: true, reason: e.reason ?? null };
    else { stats.malformed++; rows[id] = { verdict: 'MISSING', malformed: e }; }
  }
  const run = evaluate(chains);
  // drift-class cases (no exact chain): a chain that behaves like the converter's documented approximation is DRIFT,
  // even when the random trees do not expose the difference (build.js judges some of these by shape, e.g. L397)
  const driftIds = Object.keys(chains).filter(id => CLASS[id].drift && run[id].outcome !== 'CC_ERROR' && run[id].outcome !== 'XPATH_ERROR' && conv[id].chain);
  const vsConv = driftIds.length ? evaluateAgainst(Object.fromEntries(driftIds.map(id => [id, [chains[id], conv[id].chain]]))) : {};
  for (const [id, row] of Object.entries(rows)) {
    const c = CLASS[id];
    if (row.verdict) continue;
    if (row.skip) { row.verdict = c.expressible && !c.noExact ? 'GAP' : 'CORRECT-SKIP'; continue; }
    const r = run[id]; row.outcome = r.outcome; row.hits = r.hits; row.trials = r.trials;
    if (r.outcome === 'XPATH_ERROR') { row.verdict = 'N/A'; row.note = 'XPath is rejected by WDA; excluded'; }
    else if (r.outcome === 'CC_ERROR') { row.verdict = 'INVALID'; row.note = r.ccErr.split('\n')[0].slice(0, 200); }
    else if (c.drift && vsConv[id]) { row.verdict = 'DRIFT'; row.documented = c.documented; }
    else if (r.outcome === 'EQUAL') row.verdict = 'CORRECT';
    else { row.verdict = 'WRONG'; row.example = r.example; }
  }
  // R: corpus, S: spec categories; expressible cases only, minus no-exact-chain cases the run skipped (they leave the denominator,
// as in the report's "skip grouped positions with a reason" variant)
  const inDen = id => CLASS[id].expressible && !(CLASS[id].noExact && rows[id].verdict === 'CORRECT-SKIP') && rows[id].verdict !== 'N/A';
  const credit = id => rows[id].verdict === 'CORRECT' ? 1 : rows[id].verdict === 'DRIFT' && rows[id].documented ? 0.5 : 0;
  const ids = g => Object.keys(key).filter(id => key[id].group === g);
  const corpDen = ids('corpus').filter(inDen);
  const R = 100 * corpDen.reduce((a, id) => a + credit(id), 0) / corpDen.length;
  let S = 0; const Scat = {};
  for (const [cat, w] of Object.entries(W)) {
    const den = ids('spec').filter(id => key[id].cat === cat && inDen(id));
    Scat[cat] = den.length ? w * den.reduce((a, id) => a + credit(id), 0) / den.length : w; S += Scat[cat];
  }
  const count = (g, v) => ids(g).filter(id => rows[id].verdict === v).length;
  const V = ['CORRECT', 'CORRECT-SKIP', 'GAP', 'DRIFT', 'WRONG', 'INVALID', 'MISSING', 'N/A'];
  const summary = { name, R: +R.toFixed(1), S: +S.toFixed(1), Scat, corpusDen: corpDen.length, corpus: Object.fromEntries(V.map(v => [v, count('corpus', v)])), spec: Object.fromEntries(V.map(v => [v, count('spec', v)])), ...stats };
  const cases = Object.fromEntries(Object.entries(rows).map(([id, r]) => [id, { orig: key[id].orig, group: key[id].group, cat: key[id].cat, xpath: key[id].xpath, ...r, inDen: inDen(id) }]));
  fs.writeFileSync(path.join(SCORES, name + '.json'), JSON.stringify({ summary, cases }, null, 1) + '\n');
  return summary;
}
// two chains against each other on the case's trees (used to recognise the converter's documented approximation)
function evaluateAgainst(pairs) {
  const batch = [];
  for (const [id, [a, b]] of Object.entries(pairs)) TREES[id].forEach((xml, t) => batch.push({ id: `${id}~${t}~a`, xml, chain: a }, { id: `${id}~${t}~b`, xml, chain: b }));
  const tmp = path.join(SCORES, `.emu-${process.pid}.json`);
  fs.writeFileSync(tmp, JSON.stringify(batch));
  const out = JSON.parse(execFileSync(EMU, [tmp], { maxBuffer: 2e9, stdio: ['ignore', 'pipe', 'ignore'] })); fs.rmSync(tmp);
  const got = {}; for (const r of out) got[r.id] = r.chain;
  const res = {};
  for (const id of Object.keys(pairs)) res[id] = TREES[id].every((_, t) => JSON.stringify(got[`${id}~${t}~a`]) === JSON.stringify(got[`${id}~${t}~b`]));
  return res;
}

const fmt = s => `${s.name.padEnd(22)} R=${String(s.R).padStart(5)} S=${String(s.S).padStart(5)} | corpus ${JSON.stringify(s.corpus)} | spec ${JSON.stringify(s.spec)} | noPrefix=${s.noPrefix} dup=${s.duplicates} unknown=${s.unknownIds}`;
const args = process.argv.slice(2);
if (args.includes('--converter')) {
  const entries = Object.entries(conv).map(([id, c]) => c.chain ? { id, chain: '-ios class chain:' + c.chain } : { id, skip: true, reason: c.reason });
  console.log(fmt(score('converter', entries)));
}
for (const f of args.filter(a => a !== '--converter')) {
  const rec = JSON.parse(fs.readFileSync(f, 'utf8'));
  const name = path.basename(f, '.json');
  if (!rec.output) { const s = score(name, []); s.failed = rec.error; fs.writeFileSync(path.join(SCORES, name + '.summary.json'), JSON.stringify(s)); console.log(fmt(s) + ` FAILED RUN: ${rec.error}`); continue; }
  console.log(fmt(score(name, rec.output)));
}
