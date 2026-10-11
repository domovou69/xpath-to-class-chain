#!/usr/bin/env node
// Phase 3: lookup time of XPath vs class chain as the screen grows (scale-cases.json, made by
// make-scale.js). Uses run.js's session, environment and device handling (UDID, XCODE_ORG_ID, …).
//
//   node scale.js                         all loads → results-scale.json (simulator)
//   node scale.js --out f.json            another file (e.g. results-scale-device.json); saved after every load
//   node scale.js --out f.json --resume   skip the loads already in f.json
//   node scale.js --loads 100,500         some loads only
//   node scale.js --count [100,2000]      element count, max depth and page-source time per load (no lookups)
//   node scale.js --deep                  the depth check on `scale-deep` → printed, and saved with --out
//   node scale.js --variants [100,2000]   class chain as converted vs. with an explicit [1] vs. with the
//                                         useFirstMatch setting (XPath for reference) → results-scale-variants.json
//
// Per load: one session, wait for the layout to settle, check that XPath and class chain find the
// same single element for every case (a case that fails is reported and not timed), then PASSES
// passes over all cases. Every lookup is one cold findElement, as in a real test: no warm-up, the
// XPath/chain order alternates per case and per pass. The result per case and side is the median
// of the passes. The page-source time (without `visible`) is recorded once per pass as the cost of
// serializing the tree.
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { Session, wd, prepare, versions, median, geomean, r1, r2, ELEMENT } = require('./run.js');
const HERE = __dirname;
const LOADS = [100, 500, 1000, 2000];
const PASSES = Number(process.env.PASSES || 3);
const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const CHAIN = '-ios class chain';
const ms = t0 => Number(process.hrtime.bigint() - t0) / 1e6;

// The Mac's power state, recorded per load: on battery with Low Power Mode the CPU is throttled, which
// slows the simulator (and Appium on the host) and so every absolute time; ratios are less affected.
function host() {
  const sh = (c, a) => { try { return execFileSync(c, a, { encoding: 'utf8' }).trim(); } catch { return null; } };
  const batt = sh('pmset', ['-g', 'batt']) || '', lpm = (sh('pmset', ['-g']) || '').match(/lowpowermode\s+(\d)/);
  return { cpu: sh('sysctl', ['-n', 'machdep.cpu.brand_string']), memoryGB: Math.round(Number(sh('sysctl', ['-n', 'hw.memsize'])) / 2 ** 30),
    macOS: sh('sw_vers', ['-productVersion']), power: /AC Power/.test(batt) ? 'AC' : /Battery Power/.test(batt) ? 'battery' : null,
    lowPowerMode: lpm ? lpm[1] === '1' : null };
}

// element count, max depth, and the depth of a few named elements (Application = depth 1)
function shape(src, names = []) {
  let depth = 0, max = 0, count = 0; const at = {};
  for (const m of src.matchAll(/<(\/?)(XCUIElementType\w+)([^>]*?)(\/?)>/g)) {
    if (m[1]) { depth--; continue; }
    depth++; count++; max = Math.max(max, depth);
    const name = (m[3].match(/ name="([^"]*)"/) || [])[1];
    if (name && names.includes(name) && !(name in at)) at[name] = depth;
    if (m[4]) depth--;
  }
  return { elements: count, maxDepth: max, depthOf: at };
}

async function findOne(s, using, value) {
  const t0 = process.hrtime.bigint();
  try { const e = await wd('POST', s.url('/element'), { using, value }); return { ms: ms(t0), id: e[ELEMENT] }; } catch (e) { return { ms: ms(t0), error: e.message.split('\n')[0].slice(0, 200) }; }
}
// Page source without `visible`: computing it is what makes the default source slow on big trees
// (53 s instead of 1.4 s at 1000 elements on the simulator). The setting only shapes the page source;
// it is switched on around source calls and off again, so lookups always run with default settings.
const setExcluded = (s, v) => wd('POST', s.url('/appium/settings'), { settings: { pageSourceExcludedAttributes: v } });
async function source(s) { await setExcluded(s, 'visible'); try { return await s.source(); } finally { await setExcluded(s, ''); } }
async function sourceTimed(s) { await setExcluded(s, 'visible'); try { const t0 = process.hrtime.bigint(); const src = await s.source(); return { src, ms: ms(t0) }; } finally { await setExcluded(s, ''); } }
// wait until two consecutive page sources are identical (launch layout has settled)
async function settle(s, timeoutMs = 60000) {
  const t0 = Date.now(); let prev = null;
  for (;;) {
    const cur = (await source(s)).replace(/ processId="\d+"/, '');
    if (cur === prev) return;
    if (Date.now() - t0 > timeoutMs) throw new Error('page source did not settle');
    prev = cur; await new Promise(r => setTimeout(r, 500));
  }
}

// XPath must find exactly one element (or n copies for a grouped position), and the chain the same one
async function validate(s, k, p) {
  const all = await s.find('xpath', k.xpath.replace(/^\((.*)\)\[\d+\]$/, '$1')).catch(e => ({ error: e.message }));
  const x = await findOne(s, 'xpath', p.xpath), c = await findOne(s, CHAIN, p.chain);
  if (x.error || c.error) return { ok: false, why: x.error || c.error };
  const [fx, fc] = [await s.fingerprint(x.id), await s.fingerprint(c.id)];
  const want = k.shape === 8 ? 3 : 1;
  if (all.length !== want) return { ok: false, why: `XPath without the position finds ${all.length}, expected ${want}`, hit: fx };
  return fx === fc ? { ok: true, hit: fx } : { ok: false, why: 'different elements', hit: fx, chainHit: fc };
}

async function runLoad(load, cases) {
  const hostAtStart = host();
  const s = await Session.open('scale', ['-load', String(load)]);
  try {
    await settle(s);
    const env = await versions(s);
    const first = await sourceTimed(s);
    const tree = shape(first.src, ['nav.help', 'review.helpful', 'checkout.placeOrder']);
    console.log(`load ${load}: ${tree.elements} elements, max depth ${tree.maxDepth}, target depths ${JSON.stringify(tree.depthOf)}, host ${JSON.stringify(hostAtStart)}`);
    const rows = [];
    for (const k of cases) {
      const p = prepare(k);
      const v = p.converted ? await validate(s, k, p) : { ok: false, why: `not converted: ${p.conv.reason || p.conv.status}` };
      if (!v.ok) console.log(`  INVALID ${k.id}: ${v.why}`);
      rows.push({ id: k.id, shape: k.shape, position: k.position, xpath: p.xpath, chain: p.chain, warning: p.conv.warning, valid: v.ok, why: v.ok ? undefined : v.why, hit: v.hit, xpathMs: [], chainMs: [] });
    }
    console.log(`  validation done: ${rows.filter(r => r.valid).length}/${rows.length} cases valid`);
    const sourceMs = [];
    for (let pass = 0; pass < PASSES; pass++) {
      sourceMs.push(r1((await sourceTimed(s)).ms));
      rows.filter(r => r.valid).forEach((r, i) => r._order = (i + pass) % 2);
      for (const r of rows.filter(r => r.valid)) {
        const sides = [['xpath', r.xpath, r.xpathMs], [CHAIN, r.chain, r.chainMs]];
        for (const [using, value, acc] of r._order ? sides.reverse() : sides) {
          const f = await findOne(s, using, value);
          acc.push(f.error ? null : r1(f.ms));
          if (f.error) console.log(`  pass ${pass + 1} ${r.id} ${using}: ${f.error}`);
        }
      }
      console.log(`  pass ${pass + 1}/${PASSES} done`);
    }
    for (const r of rows) {
      delete r._order;
      const ok = a => a.filter(v => v != null);
      if (r.valid && ok(r.xpathMs).length && ok(r.chainMs).length) {
        r.xpath_median = r1(median(ok(r.xpathMs))); r.chain_median = r1(median(ok(r.chainMs)));
        r.speedup = r2(r.xpath_median / r.chain_median);
      }
    }
    const t = rows.filter(r => r.speedup);
    const summary = t.length ? {
      timed: t.length, xpathTotalMs: r1(t.reduce((a, r) => a + r.xpath_median, 0)), chainTotalMs: r1(t.reduce((a, r) => a + r.chain_median, 0)),
      xpathMedianMs: r1(median(t.map(r => r.xpath_median))), chainMedianMs: r1(median(t.map(r => r.chain_median))),
      speedupGeomean: r2(geomean(t.map(r => r.speedup))), chainFaster: t.filter(r => r.speedup > 1).length,
      byPosition: Object.fromEntries(['top', 'deep', 'end'].map(pos => { const q = t.filter(r => r.position === pos); return [pos, q.length ? r2(geomean(q.map(r => r.speedup))) : null]; })),
    } : null;
    if (summary) console.log(`  XPath total ${summary.xpathTotalMs} ms, chain total ${summary.chainTotalMs} ms, speedup ×${summary.speedupGeomean} (geomean), chain faster ${summary.chainFaster}/${summary.timed}, by position ${JSON.stringify(summary.byPosition)}, source ${median(sourceMs)} ms`);
    return { env, result: { load, host: hostAtStart, ...tree, sourceMs, sourceMedianMs: r1(median(sourceMs)), summary, cases: rows } };
  } finally { await s.close(); }
}

// Does a single class chain lookup stop at the first match? In WDA 16.14.1 a findElement without a
// position and one with [1] both go through fb_firstMatch, which by default collects all matches and
// takes the first (useFirstMatch = NO, FBXCodeCompatibility.m). Only the useFirstMatch setting switches
// to XCTest's firstMatch. Measured the same way as the main run; a variant that finds another element
// than XPath is reported and not timed.
const withFirst = c => /\]\[\d+\]$|^\*\*\/\w+\[\d+\]$/.test(c) ? null : c + '[1]';
async function variants(loads) {
  const { cases } = readJson(path.join(HERE, 'scale-cases.json'));
  const outFile = path.resolve(HERE, opt('--out') || 'results-scale-variants.json');
  const doc = { method: `${PASSES} passes, median; one cold findElement per lookup, variant order rotating`, loads: [] };
  const setFirst = (s, v) => wd('POST', s.url('/appium/settings'), { settings: { useFirstMatch: v } });
  for (const load of loads) {
    const s = await Session.open('scale', ['-load', String(load)]);
    try {
      await settle(s);
      doc.env = doc.env || await versions(s);
      const rows = [];
      for (const k of cases) {
        const p = prepare(k), first = withFirst(p.chain);
        const x = await findOne(s, 'xpath', p.xpath), fx = x.error ? null : await s.fingerprint(x.id);
        const r = { id: k.id, shape: k.shape, position: k.position, xpath: p.xpath, chain: p.chain, chainFirst: first, ms: { xpath: [], chain: [], chainFirst: [], useFirstMatch: [] }, invalid: {} };
        const same = async (using, value, firstMatch) => {
          if (firstMatch) await setFirst(s, true);
          try { const f = await findOne(s, using, value); return !f.error && await s.fingerprint(f.id) === fx; } finally { if (firstMatch) await setFirst(s, false); }
        };
        if (!first) r.invalid.chainFirst = 'already has a position';
        else if (!await same(CHAIN, first)) r.invalid.chainFirst = 'different element';
        if (!await same(CHAIN, p.chain, true)) r.invalid.useFirstMatch = 'different element';
        rows.push(r);
        for (const [v, why] of Object.entries(r.invalid)) console.log(`  ${load} ${k.id} ${v}: ${why}`);
      }
      for (let pass = 0; pass < PASSES; pass++) {
        for (const [i, r] of rows.entries()) {
          const sides = [['xpath', 'xpath', r.xpath], ['chain', CHAIN, r.chain], ['chainFirst', CHAIN, r.chainFirst], ['useFirstMatch', CHAIN, r.chain]]
            .filter(([v]) => !r.invalid[v]);
          const rot = (i + pass) % sides.length;
          for (const [v, using, value] of [...sides.slice(rot), ...sides.slice(0, rot)]) {
            if (v === 'useFirstMatch') await setFirst(s, true);
            try { const f = await findOne(s, using, value); r.ms[v].push(f.error ? null : r1(f.ms)); } finally { if (v === 'useFirstMatch') await setFirst(s, false); }
          }
        }
        console.log(`  load ${load} pass ${pass + 1}/${PASSES} done`);
      }
      for (const r of rows) r.median = Object.fromEntries(Object.entries(r.ms).filter(([, a]) => a.some(v => v != null)).map(([v, a]) => [v, r1(median(a.filter(x => x != null)))]));
      const vs = v => { const q = rows.filter(r => r.median[v] && r.median.chain); return q.length ? { cases: q.length, totalMs: r1(q.reduce((a, r) => a + r.median[v], 0)), chainTotalMs: r1(q.reduce((a, r) => a + r.median.chain, 0)), vsChain: r2(geomean(q.map(r => r.median.chain / r.median[v]))) } : null; };
      const summary = { xpath: vs('xpath'), chainFirst: vs('chainFirst'), useFirstMatch: vs('useFirstMatch'),
        useFirstMatchByPosition: Object.fromEntries(['top', 'deep', 'end'].map(pos => { const q = rows.filter(r => r.position === pos && r.median.useFirstMatch); return [pos, q.length ? r2(geomean(q.map(r => r.median.chain / r.median.useFirstMatch))) : null]; })) };
      console.log(`load ${load}: ${JSON.stringify(summary)}`);
      doc.loads.push({ load, host: host(), summary, cases: rows });
      fs.writeFileSync(outFile, JSON.stringify({ ...doc, date: new Date().toISOString().slice(0, 10) }, null, 1) + '\n');
    } finally { await s.close(); }
  }
}

async function count(loads) {
  for (const load of loads) {
    const s = await Session.open('scale', ['-load', String(load)]);
    try {
      await settle(s);
      const t = []; let src;
      for (let i = 0; i < 3; i++) { const r = await sourceTimed(s); t.push(r1(r.ms)); src = r.src; }
      const tree = shape(src, ['nav.help', 'review.helpful', 'checkout.placeOrder']);
      console.log(`load ${load}: ${tree.elements} elements, max depth ${tree.maxDepth}, target depths ${JSON.stringify(tree.depthOf)}, page source ${t.join(' / ')} ms`);
      if (args.includes('--save-source')) { fs.mkdirSync(path.join(HERE, 'out'), { recursive: true }); fs.writeFileSync(path.join(HERE, `out/scale-${load}.xml`), src); }
    } finally { await s.close(); }
  }
}

// the depth check: what each side returns for markers below WDA's snapshotMaxDepth (default 50)
async function deep() {
  const { deep: cases } = readJson(path.join(HERE, 'scale-cases.json'));
  const s = await Session.open('scale-deep');
  try {
    await settle(s);
    const env = await versions(s);
    const src = await source(s);
    const markers = cases.map(k => `depth.marker.${k.marker}`), tree = shape(src, markers);
    console.log(`scale-deep: ${tree.elements} elements, max depth in page source ${tree.maxDepth}`);
    const rows = [];
    for (const k of cases) {
      const p = prepare(k);
      const x = await findOne(s, 'xpath', p.xpath), c = await findOne(s, CHAIN, p.chain);
      const fp = async f => f.error ? { error: f.error } : { hit: await s.fingerprint(f.id) };
      const row = { id: k.id, marker: k.marker, depthInSource: tree.depthOf[`depth.marker.${k.marker}`] || null, xpath: p.xpath, chain: p.chain,
        xpathResult: await fp(x), chainResult: await fp(c), xpathMs: r1(x.ms), chainMs: r1(c.ms) };
      rows.push(row);
      const show = r => r.error ? 'ERROR ' + r.error.slice(0, 80) : 'found';
      console.log(`  marker ${String(k.marker).padStart(2)} (source depth ${row.depthInSource ?? '—'}): XPath ${show(row.xpathResult)} [${row.xpathMs} ms], chain ${show(row.chainResult)} [${row.chainMs} ms]`);
    }
    if (opt('--out')) fs.writeFileSync(path.resolve(HERE, opt('--out')), JSON.stringify({ env, host: host(), date: new Date().toISOString().slice(0, 10), elements: tree.elements, maxDepth: tree.maxDepth, cases: rows }, null, 1) + '\n');
  } finally { await s.close(); }
}

async function main() {
  // A sleeping display or Mac drops the USB tunnel to a real device ("Device with UDID … not found");
  // caffeinate keeps both awake for as long as this process runs.
  if (process.platform === 'darwin') require('child_process').spawn('caffeinate', ['-dimsu', '-w', String(process.pid)], { stdio: 'ignore', detached: true }).unref();
  const loads = (opt('--loads') || opt('--count') || '').split(',').filter(Boolean).map(Number);
  if (args.includes('--count')) return count(loads.length ? loads : LOADS);
  if (args.includes('--deep')) return deep();
  if (args.includes('--variants')) return variants((opt('--variants') || '100,2000').split(',').map(Number));
  const { cases } = readJson(path.join(HERE, 'scale-cases.json'));
  const outFile = path.resolve(HERE, opt('--out') || 'results-scale.json');
  const prev = args.includes('--resume') && fs.existsSync(outFile) ? readJson(outFile) : null;
  const doc = prev || { env: null, method: `${PASSES} passes, median; one cold findElement per lookup, XPath/chain order alternating`, loads: [] };
  const t0 = Date.now();
  for (const load of (loads.length ? loads : LOADS).filter(l => !doc.loads.some(r => r.load === l))) {
    const { env, result } = await runLoad(load, cases);
    doc.env = doc.env || env; doc.loads.push(result); doc.loads.sort((a, b) => a.load - b.load);
    doc.date = new Date().toISOString().slice(0, 10); doc.seconds = (doc.seconds || 0) + Math.round((Date.now() - t0) / 1000);
    fs.writeFileSync(outFile, JSON.stringify(doc, null, 1) + '\n');
  }
  console.log('\nload   elements  source ms   XPath total  chain total  speedup  chain faster');
  for (const r of doc.loads) console.log(`${String(r.load).padEnd(6)} ${String(r.elements).padStart(8)} ${String(r.sourceMedianMs).padStart(10)} ${String(r.summary?.xpathTotalMs).padStart(12)} ${String(r.summary?.chainTotalMs).padStart(12)}  ×${r.summary?.speedupGeomean}   ${r.summary?.chainFaster}/${r.summary?.timed}`);
}
main().catch(e => { console.error(e); process.exit(1); });
