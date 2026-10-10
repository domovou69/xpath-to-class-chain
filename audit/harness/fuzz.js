// Differential fuzz: WDA XPath (libxml2 + extensions) vs WDA class chain on random page sources.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { ROOT, EMU, out } = require('./paths');
const m = require(path.join(ROOT, 'xpath-to-class-chain'));
const { interpolations, scannerEscape, toRuntime } = require('./runtime');
const TRIALS = +(process.env.TRIALS || 150);

let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = a => a[Math.floor(rnd() * a.length)];
const xmlEsc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '&#10;');

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
function literals(x) { return [...x.matchAll(/"([^"]*)"|'([^']*)'/g)].map(mm => mm[1] ?? mm[2]); }
function genTree(lits, types, pairs) {
  const strPool = [];
  for (const l of lits) { if (/^XCUIElementType/.test(l)) continue; strPool.push(l, l, l + ' z', 'y ' + l, l.slice(0, Math.ceil(l.length / 2)), l.toUpperCase()); }
  strPool.push('other', 'Vq1', 'Vq2', 'true', 'false');
  let k = 0;
  const node = (depth, type) => {
    const attrs = [`k="n${k++}"`];
    if (depth === 0) attrs.push('name="AppRoot" label="AppRoot" enabled="true" visible="true" accessible="false"'); // realistic app identity (assumption A1)
    else {
      const set = {};
      for (const a of ['name', 'label', 'value']) if (rnd() < 0.55) set[a] = pick(strPool);
      for (const a of ['enabled', 'visible', 'accessible']) set[a] = rnd() < 0.6 ? 'true' : 'false';
      // directed mode: plant the locator's own attr/literal pairs so conjunctions actually match
      if (pairs && pairs.length && rnd() < 0.6) for (const [a, l] of pairs) if (rnd() < 0.85) set[a] = rnd() < 0.7 ? l : pick([l + ' z', 'y ' + l, l.slice(1), 'other']);
      if (pairs && rnd() < 0.4) { const by = {}; for (const [a, l] of pairs) (by[a] ??= []).push(l); for (const [a, ls] of Object.entries(by)) if (ls.length > 1) set[a] = ls.join(' '); }
      for (const [a, v] of Object.entries(set)) attrs.push(`${a}="${xmlEsc(v)}"`);
    }
    let kids = '';
    const n = depth >= 4 ? 0 : Math.floor(rnd() * (depth === 0 ? 3 : 4));
    for (let i = 0; i < n && k < 18; i++) kids += node(depth + 1, pick(types));
    return `<${type} ${attrs.join(' ')}>${kids}</${type}>`;
  };
  return node(0, 'XCUIElementTypeApplication');
}

function pairsOf(xp) {
  const out = [];
  for (const mm of xp.matchAll(/@(name|label|value|enabled|visible|accessible)\s*(?:=|,)\s*(?:"([^"]*)"|'([^']*)')/g)) out.push([mm[1], mm[2] ?? mm[3]]);
  for (const mm of xp.matchAll(/(?:contains|starts-with)\s*\(\s*@(name|label|value|enabled)\s*,\s*(?:"([^"]*)"|'([^']*)')/g)) out.push([mm[1], mm[2] ?? mm[3]]);
  return out;
}
function main() {
  const corpus = require(path.join(ROOT, 'audit/corpus/ios-locators.json'));
  const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
  const cases = [], meta = {};
  for (const x of corpus) {
    if (!['xpath', 'xpath-dynamic', 'xpath-mixed-classchain'].includes(x.kind)) continue;
    if (only && !only.has(x.id)) continue;
    const r = process.env.GAPS ? (require('./gapexpected')[x.id] ? { status: 'success', locator: require('./gapexpected')[x.id] } : { status: 'skip' }) : m.convertXpathToClassChain(x.source, { optimize: true });
    if (r.status !== 'success') continue;
    const variants = [substFor(x.source)];
    if ([...variants[0].values()].includes('true')) variants.push(new Map([...variants[0]].map(([a, b]) => [a, b === 'true' ? 'false' : b])));
    if ([...variants[0].values()].includes('2')) variants.push(new Map([...variants[0]].map(([a, b]) => [a, b === '2' ? '1' : b])));
    variants.forEach((subst, vi) => {
      const xp = toRuntime(x.source, x.quote, subst);
      const chainRaw = scannerEscape(r.locator, x.quote);
      const chain = toRuntime(chainRaw, x.quote, subst).replace(/^-ios class chain:/, '');
      const lits = literals(xp);
      const types = [...new Set([...(xp.match(/XCUIElementType[A-Za-z]+/g) || []), 'XCUIElementTypeOther', 'XCUIElementTypeStaticText', 'XCUIElementTypeButton', 'XCUIElementTypeWindow'])].filter(t => t !== 'XCUIElementTypeApplication');
      const key = `${x.id}~${vi}`;
      meta[key] = { id: x.id, xpath: xp, chain, out: r.locator };
      for (let t = 0; t < TRIALS; t++) cases.push({ id: `${key}~${t}`, xml: genTree(lits, types, process.env.DIRECTED ? pairsOf(xp) : null), xpath: xp, chain });
    });
  }
  fs.writeFileSync(out('fuzzcases.json'), JSON.stringify(cases));
  const res = JSON.parse(execFileSync(EMU, [out('fuzzcases.json')], { maxBuffer: 1e9 }));
  const byKey = {};
  const xmlOf = Object.fromEntries(cases.map(c => [c.id, c.xml]));
  for (const r of res) {
    const key = r.id.split('~').slice(0, 2).join('~');
    const b = byKey[key] ??= { ...meta[key], trials: 0, equal: 0, firstDiffers: 0, setDiffers: 0, ccError: null, xpError: null, hits: 0, example: null };
    b.trials++;
    if (!Array.isArray(r.chain)) { b.ccError = r.chain.error; continue; }
    if (!Array.isArray(r.xpath)) { b.xpError = r.xpath.error; continue; }
    if (r.xpath.length) b.hits++;
    const same = JSON.stringify([...r.xpath].sort()) === JSON.stringify([...r.chain].sort());
    if (same && r.xpath[0] === r.chain[0]) b.equal++;
    else {
      if (same) b.firstDiffers++; else b.setDiffers++;
      const xml = xmlOf[r.id];
      if (!b.example || xml.length < b.example.xml.length) b.example = { xml, xpathHits: r.xpath, chainHits: r.chain };
    }
  }
  fs.writeFileSync(out(process.env.RESULT || 'fuzzresults.json'), JSON.stringify(byKey, null, 1));
  const summary = {};
  for (const b of Object.values(byKey)) {
    const v = b.ccError ? 'CC_ERROR' : b.xpError ? 'XPATH_ERROR' : b.setDiffers ? 'SET_DIFFERS' : b.firstDiffers ? 'FIRST_DIFFERS' : 'EQUAL';
    b.outcome = v; summary[v] = (summary[v] || 0) + 1;
  }
  fs.writeFileSync(out(process.env.RESULT || 'fuzzresults.json'), JSON.stringify(byKey, null, 1));
  console.log(summary, 'variants:', Object.keys(byKey).length, 'cases:', cases.length);
}
main();
