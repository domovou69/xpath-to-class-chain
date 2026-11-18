// Device check of the optimizer suggestions mini-WDA cannot judge or that change the element at run time.
// Runs the case's XPath and the optimizer's own selector (`~x` as accessibility id, predicate string, class chain,
// exactly as the service would send them) on every LocatorLab screen under the real Appium + WDA of audit/device,
// then classifies them as compare.mjs does and compares the class with the mini-WDA one in results.json.
//
//   node device.mjs                    → device.json (saved after every screen)
//   node device.mjs --resume           continue: screens already in device.json are skipped
//   node device.mjs --report           only reclassify and print from device.json
//
// Cases: every suggestion with `== 'true'` or a raw newline (mini-WDA cannot run them), every `replaced` and
// every `extra matches`. Needs Appium on APPIUM_URL with the simulator of audit/device/env.json booted.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const OUT = path.join(HERE, 'device.json');
const args = process.argv.slice(2);
const { cases: all, screens: SCREENS } = JSON.parse(fs.readFileSync(path.join(HERE, 'results.json'), 'utf8'));

const why = c => [
  /== 'true'/.test(c.optimizer || '') && 'true',
  /\n/.test(c.optimizer || '') && 'newline',
  c.runtime === 'replaced' && 'replaced',
  c.runtime === 'extra matches' && 'extra matches',
].filter(Boolean);
const cases = all.filter(c => why(c).length);

// the service's own strategies
function strategy(sel) {
  if (sel.startsWith('~')) return ['accessibility id', sel.slice(1)];
  for (const p of ['-ios predicate string', '-ios class chain']) if (sel.startsWith(p + ':')) return [p, sel.slice(p.length + 1)];
  throw new Error('unknown selector ' + sel);
}

const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
const hits = args.includes('--resume') || args.includes('--report') ? (prev?.hits ?? {}) : {};
let env = args.includes('--resume') || args.includes('--report') ? prev?.env : undefined;

if (!args.includes('--report')) {
  const { Session, versions } = require(path.join(ROOT, 'audit/device/run.js'));
  const done = new Set(Object.keys(hits).map(k => k.split('|')[2]));
  for (const screen of SCREENS.filter(s => !done.has(s))) {
    const s = await Session.open(screen);
    // run.js asks WDA directly why a lookup found nothing; WDA names the strategies without the `-ios ` prefix
    const wdaError = s.wdaError.bind(s);
    s.wdaError = (using, value) => wdaError(using.replace(/^-ios /, ''), value);
    try {
      await s.settle();
      if (!env) { env = await versions(s); delete env.udid; }
      const t0 = Date.now();
      for (const c of cases) {
        hits[`${c.key}|xpath|${screen}`] = await s.lookup('xpath', c.xpath);
        hits[`${c.key}|opt|${screen}`] = await s.lookup(...strategy(c.optimizer));
      }
      console.log(`${screen}: ${cases.length} cases in ${Math.round((Date.now() - t0) / 1000)} s`);
    } finally { await s.close(); }
    fs.writeFileSync(OUT, JSON.stringify({ env, date: new Date().toISOString().slice(0, 10), screens: SCREENS, hits }, null, 1) + '\n');
  }
}

// ---- classify as compare.mjs does: same set and same first element; an error is an empty result
const fps = h => h && h.fps ? h.fps : [];
const same = (a, b) => { a = fps(a); b = fps(b); return a.length === b.length && a[0] === b[0] && [...a].sort().join('\n') === [...b].sort().join('\n'); };
const rows = [];
for (const c of cases) {
  const h = (side, s) => hits[`${c.key}|${side}|${s}`];
  const own = { x: h('xpath', c.screen), o: h('opt', c.screen) };
  const elsewhere = SCREENS.filter(s => s !== c.screen && !same(h('xpath', s), h('opt', s)))
    .map(s => ({ screen: s, kind: !fps(h('xpath', s)).length ? 'extra' : !fps(h('opt', s)).length ? 'missing' : 'other' }));
  const ownSame = same(own.x, own.o), ownFirst = fps(own.x)[0] === fps(own.o)[0];
  let cls = c.optClass === 'MULTI' ? 'MULTI' : !ownSame ? 'DIFFERS_HERE' : elsewhere.length ? 'SAME_HERE_DIFFERS_ELSEWHERE' : 'SAME_EVERYWHERE';
  const runtime = cls === 'DIFFERS_HERE' ? (!fps(own.o).length ? 'falls back to XPath' : ownFirst ? 'extra matches' : 'replaced') : undefined;
  const multiOwn = cls === 'MULTI' ? (ownSame ? 'same' : ownFirst ? 'same first' : 'different first') : undefined;
  const emu = [c.optClass, c.runtime || c.multiOwn].filter(Boolean).join(' / ');
  const dev = [cls, runtime || multiOwn].filter(Boolean).join(' / ');
  rows.push({
    key: c.key, category: c.category, screen: c.screen, why: why(c), optimizer: c.optimizer, emu, device: dev, agrees: emu === dev,
    xpathHere: fps(own.x).length, optHere: fps(own.o).length, optError: own.o?.error,
    xpathFirst: fps(own.x)[0], optFirst: fps(own.o)[0], elsewhere: elsewhere.length ? elsewhere : undefined,
  });
}
for (const r of rows) console.log(`${r.agrees ? 'agree ' : 'CHANGE'} ${r.key.padEnd(34)} ${r.why.join('+').padEnd(16)} mini-WDA ${r.emu.padEnd(36)} device ${r.device}${r.optError ? '  [' + r.optError.slice(0, 80) + ']' : ''}`);
const n = f => rows.filter(f).length;
console.log(`\n${rows.length} cases; device agrees with mini-WDA in ${n(r => r.agrees)}`);
for (const w of ['true', 'newline', 'replaced', 'extra matches']) console.log(`  ${w}: ${n(r => r.why.includes(w))} cases, ${n(r => r.why.includes(w) && r.agrees)} agree`);
const date = (args.includes('--report') && prev?.date) || new Date().toISOString().slice(0, 10);
if (Object.keys(hits).length) fs.writeFileSync(OUT, JSON.stringify({ env, date, screens: SCREENS, rows, hits }, null, 1) + '\n');
