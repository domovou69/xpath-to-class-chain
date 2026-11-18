// Offline comparison: the WebdriverIO selector optimizer's suggestion vs the converter's chain,
// both run against the original XPath in mini-WDA on every saved LocatorLab screen.
// Usage: node extract.js && node compare.mjs [--out results.json]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const DEV = path.join(ROOT, 'audit/device');
const EMU = process.env.EMU || path.join(ROOT, 'audit/harness/out/wdaemu');
const OUT = path.join(HERE, 'out');
const RESULT = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : path.join(HERE, 'results.json');
const { convertXPathToOptimizedSelector } = await import(path.join(OUT, 'optimizer.mjs'));
const { convertXpathToClassChain } = require(path.join(ROOT, 'xpath-to-class-chain'));
const { scannerEscape, toRuntime } = require(path.join(ROOT, 'audit/harness/runtime'));

// case file → the device run with its recorded runtime XPath, chain and outcome
const SETS = [
  ['cases.json', 'results-recheck-2026-11.json'],
  ['cases-c1.json', 'results-c1.json'],
  ['cases-d0.json', 'results-d0.json'],
  ['cases-p7.json', 'results-p7.json'],
];
const SCREENS = fs.readdirSync(path.join(DEV, 'out')).filter(f => /^src-.+\.xml$/.test(f)).map(f => f.slice(4, -4)).sort();
const XML = Object.fromEntries(SCREENS.map(s => [s, fs.readFileSync(path.join(DEV, `out/src-${s}.xml`), 'utf8')]));
// The optimizer gets the page source as Appium returns it. mini-WDA gets the tree WDA itself queries:
// the Application element as the root, without Appium's <AppiumAUT> wrapper.
const unwrap = x => x.replace(/<\/?AppiumAUT>/g, '');
const TREE = Object.fromEntries(SCREENS.map(s => [s, unwrap(XML[s])]));

// the converter's current chain, the way audit/device/run.js prepares it (runtime string, no `-ios class chain:`)
function converterChain(k) {
  const conv = convertXpathToClassChain(k.xpath, { optimize: true });
  if (conv.status !== 'success') return null;
  const rt = s => k.quote ? toRuntime(s, k.quote, new Map(Object.entries(k.subst || {}))) : s;
  return rt(scannerEscape(conv.locator, k.quote)).replace(/^-ios class chain:/, '');
}

// An optimizer selector as a class chain body mini-WDA can run.
// `~x` (accessibility id) is WDA's `name == x` (wdName: identifier, else label); `alt` also tries label,
// as the optimizer's own uniqueness check does. A predicate string P is `**/*[`P`]`: the same
// descendant query; it only differs on the Application root, which no suggestion here targets.
const lit = v => '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
const wrap = p => '**/*[`' + p.replace(/`/g, '``') + '`]';
function toChain(sel, alt = false) {
  if (sel.startsWith('~')) { const v = sel.slice(1); return wrap(alt ? `name == ${lit(v)} OR label == ${lit(v)}` : `name == ${lit(v)}`); }
  if (sel.startsWith('-ios predicate string:')) return wrap(sel.slice('-ios predicate string:'.length));
  if (sel.startsWith('-ios class chain:')) return sel.slice('-ios class chain:'.length);
  throw new Error('unknown selector ' + sel);
}

// The converter's current verdicts. Its known differences are documented: positions and last() (RC-D1, DRIFT in
// coverage-cases.json), text normalization (RC-D4, every D0 probe) and the Application root (assumption A1).
const COV = Object.fromEntries(require(path.join(ROOT, 'audit/coverage-cases.json')).map(c => [c.id, c.verdict]));
const documented = c => COV[c.id] === 'DRIFT' || c.set === 'cases-d0' || /app-root/.test(c.key);

// ---- collect cases ----
const cases = [];
for (const [cf, rf] of SETS) {
  const src = Object.fromEntries(require(path.join(DEV, cf)).map(k => [k.id + '~' + (k.variant || ''), k]));
  for (const r of require(path.join(DEV, rf)).cases) {
    const k = src[r.id + '~' + (r.variant || '')];
    if (!k || !XML[r.screen]) continue;
    const chain = converterChain(k);
    cases.push({
      key: `${cf.replace(/\.json$/, '')}:${r.id}${r.variant ? '~' + r.variant : ''}`, set: cf.replace(/\.json$/, ''),
      id: r.id, category: k.category, verdict: r.verdict, screen: r.screen, xpath: r.xpath, chain,
      // the device outcome is reused only when it was measured on the chain the converter makes today
      device: r.chain === chain ? r.outcome : chain === null && r.chain === null ? r.outcome : 'stale',
    });
  }
}

// ---- the optimizer, on the case's own screen ----
for (const c of cases) {
  const res = await convertXPathToOptimizedSelector(c.xpath, { browser: { getPageSource: async () => XML[c.screen] } });
  c.opt = { selector: res?.selector ?? null, suggestion: res?.suggestion, warning: res?.warning };
  const s = c.opt.selector || c.opt.suggestion;
  if (s) { c.optChain = toChain(s); if (s.startsWith('~')) c.altChain = toChain(s, true); }
}

// ---- mini-WDA: XPath, optimizer chain, converter chain on every screen ----
const hits = {}; // `${key}|${side}|${screen}` → ids or {error}
fs.mkdirSync(OUT, { recursive: true });
for (const screen of SCREENS) {
  const batch = [];
  for (const c of cases) {
    batch.push({ id: `${c.key}|xo|${screen}`, xml: TREE[screen], xpath: c.xpath, ...(c.optChain ? { chain: c.optChain } : {}) });
    if (c.altChain) batch.push({ id: `${c.key}|alt|${screen}`, xml: TREE[screen], chain: c.altChain });
    if (c.chain) batch.push({ id: `${c.key}|conv|${screen}`, xml: TREE[screen], chain: c.chain });
  }
  const file = path.join(OUT, `emu-${screen}.json`);
  fs.writeFileSync(file, JSON.stringify(batch));
  for (const r of JSON.parse(execFileSync(EMU, [file], { maxBuffer: 1e9 }))) {
    const [key, side, scr] = r.id.split('|');
    if (side === 'xo') { hits[`${key}|xpath|${scr}`] = r.xpath; if (r.chain) hits[`${key}|opt|${scr}`] = r.chain; }
    else hits[`${key}|${side}|${scr}`] = r.chain;
  }
}

// same set and same first element (what findElement returns); a WDA error is an empty result,
// because appium-xcuitest-driver swallows lookup errors (audit/device/README.md)
const ids = h => Array.isArray(h) ? h : [];
const same = (a, b) => { a = ids(a); b = ids(b); return a.length === b.length && a[0] === b[0] && [...a].sort().join() === [...b].sort().join(); };
function compare(c, side) {
  const own = { xpath: hits[`${c.key}|xpath|${c.screen}`], got: hits[`${c.key}|${side}|${c.screen}`] };
  const elsewhere = [];
  for (const s of SCREENS) {
    if (s === c.screen) continue;
    const x = hits[`${c.key}|xpath|${s}`], g = hits[`${c.key}|${side}|${s}`];
    if (!same(x, g)) elsewhere.push({ screen: s, kind: !ids(x).length ? 'extra' : !ids(g).length ? 'missing' : 'other', xpath: ids(x).length, got: ids(g).length });
  }
  return { ownSame: same(own.xpath, own.got), ownFirst: ids(own.xpath)[0] === ids(own.got)[0], ownGot: ids(own.got).length, ownError: !Array.isArray(own.got), elsewhere };
}
const klass = cmp => !cmp.ownSame ? 'DIFFERS_HERE' : cmp.elsewhere.length ? 'SAME_HERE_DIFFERS_ELSEWHERE' : 'SAME_EVERYWHERE';

for (const c of cases) {
  c.xpathHere = ids(hits[`${c.key}|xpath|${c.screen}`]).length;
  if (!Array.isArray(hits[`${c.key}|xpath|${c.screen}`])) c.xpathError = hits[`${c.key}|xpath|${c.screen}`].error;
  if (c.optChain) {
    c.optCmp = compare(c, 'opt');
    if (c.altChain) c.altClass = klass(compare(c, 'alt'));
  }
  c.optClass = !c.opt.selector ? (c.opt.suggestion ? 'MULTI' : 'NULL') : klass(c.optCmp);
  // at run time the service checks only that the suggestion finds something, then returns ITS element
  // `replaced`: a different first element, so `$` and `$$` both change; `extra`: same first element, `$$` gets more
  if (c.optClass === 'DIFFERS_HERE') c.runtime = !c.optCmp.ownGot ? 'falls back to XPath' : c.optCmp.ownFirst ? 'extra matches' : 'replaced';
  if (c.chain) { c.convCmp = compare(c, 'conv'); c.convClass = klass(c.convCmp); } else c.convClass = 'SKIP';
  // scoring v2 credit: CORRECT 1, documented DRIFT 0.5, skip 0, WRONG −1
  c.convCredit = c.convClass === 'SKIP' ? 0 : c.convClass === 'SAME_EVERYWHERE' ? 1 : documented(c) ? 0.5 : -1;
  c.optCredit = c.optClass === 'SAME_EVERYWHERE' ? 1 : ['NULL', 'MULTI'].includes(c.optClass) || c.runtime === 'falls back to XPath' ? 0 : -1;
  if (c.optClass === 'MULTI') c.multiOwn = c.optCmp.ownSame ? 'same' : c.optCmp.ownFirst ? 'same first' : 'different first';
}

// ---- report ----
const CLASSES = ['SAME_EVERYWHERE', 'SAME_HERE_DIFFERS_ELSEWHERE', 'DIFFERS_HERE', 'MULTI', 'NULL'];
const count = (list, f) => list.reduce((m, c) => (m[f(c)] = (m[f(c)] || 0) + 1, m), {});
const sets = [...new Set(cases.map(c => c.set))];
const actionable = cases.filter(c => c.xpathHere > 0);
console.log(`${cases.length} cases on ${SCREENS.length} screens (${SCREENS.join(', ')}); XPath finds something on its own screen in ${actionable.length}`);
console.log('\noptimizer class        ' + sets.join('  ') + '  all  (XPath finds ≥1 on its screen)');
for (const k of CLASSES) console.log(k.padEnd(28), sets.map(s => String(cases.filter(c => c.set === s && c.optClass === k).length).padStart(s.length)).join('  '),
  String(cases.filter(c => c.optClass === k).length).padStart(4), String(actionable.filter(c => c.optClass === k).length).padStart(5));
console.log('\nselector kinds (selector or MULTI suggestion):', JSON.stringify(count(cases.filter(c => c.optChain), c => (c.opt.selector || c.opt.suggestion).match(/^(~|-ios predicate string|-ios class chain)/)[1])));
console.log('DIFFERS_HERE at run time:', JSON.stringify(count(cases.filter(c => c.runtime), c => c.runtime)));
console.log('MULTI suggestion on its own screen:', JSON.stringify(count(cases.filter(c => c.multiOwn), c => c.multiOwn)));
console.log('elsewhere kinds (cases):', JSON.stringify(count(cases.filter(c => c.optClass === 'SAME_HERE_DIFFERS_ELSEWHERE').flatMap(c => [...new Set(c.optCmp.elsewhere.map(e => e.kind))]), k => k)));
console.log('~x as name OR label changes the class in:', cases.filter(c => c.altClass && c.altClass !== klass(c.optCmp)).map(c => `${c.key} ${klass(c.optCmp)} → ${c.altClass}`).join('; ') || 'none');
const nod0 = actionable.filter(c => c.set !== 'cases-d0');
console.log('without the D0 probes (actionable):', JSON.stringify(count(nod0, c => c.optClass)), 'replaced', nod0.filter(c => c.runtime === 'replaced').length, 'extra matches', nod0.filter(c => c.runtime === 'extra matches').length, 'of', nod0.length);
console.log('\nconverter class (current chain, mini-WDA, all screens):', JSON.stringify(count(cases, c => c.convClass)));
console.log('  undocumented converter differences:', cases.filter(c => c.convCredit === -1).map(c => c.key).join(', ') || 'none');
console.log('  on actionable cases:', JSON.stringify(count(actionable, c => c.convClass)));
const agree = cases.filter(c => c.chain && c.device !== 'stale' && !['DEAD', 'NONE', 'XPATH_ERROR'].includes(c.device));
console.log(`mini-WDA vs device on own screen (${agree.length} with a current device outcome): agree ${agree.filter(c => (c.device === 'EQUAL') === c.convCmp.ownSame).length}`);
console.log('device outcome reused:', JSON.stringify(count(cases, c => c.device)));
const mean = (l, f) => l.length ? 100 * l.reduce((s, c) => s + f(c), 0) / l.length : 0;
const corpus = actionable.filter(c => c.category === 'corpus'), spec = actionable.filter(c => c.category !== 'corpus');
const R = [mean(corpus, c => c.optCredit), mean(corpus, c => c.convCredit)], S = [mean(spec, c => c.optCredit), mean(spec, c => c.convCredit)];
console.log(`\nv2 credit, actionable cases: corpus (${corpus.length}) optimizer ${R[0].toFixed(1)} / converter ${R[1].toFixed(1)}; spec+probes (${spec.length}) optimizer ${S[0].toFixed(1)} / converter ${S[1].toFixed(1)}`);
console.log(`Q-analog (0.4·R/Rc + 0.6·S/Sc) = ${(100 * (0.4 * R[0] / R[1] + 0.6 * S[0] / S[1])).toFixed(1)} % of the converter`);

const slim = cases.map(c => ({
  key: c.key, category: c.category, screen: c.screen, xpath: c.xpath, xpathHere: c.xpathHere, xpathError: c.xpathError,
  optimizer: c.opt.selector || c.opt.suggestion || null, warning: c.opt.warning, optClass: c.optClass, runtime: c.runtime, multiOwn: c.multiOwn,
  optElsewhere: c.optCmp?.elsewhere.length ? c.optCmp.elsewhere : undefined, altClass: c.altClass,
  converter: c.chain, convClass: c.convClass, convElsewhere: c.convCmp?.elsewhere.length ? c.convCmp.elsewhere : undefined,
  verdict: c.verdict, device: c.device, optCredit: c.optCredit, convCredit: c.convCredit,
}));
fs.writeFileSync(RESULT, JSON.stringify({ optimizer: '@wdio/appium-service@10.2.0', screens: SCREENS, cases: slim }, null, 1) + '\n');
console.log('\nwrote', path.relative(process.cwd(), RESULT));
