#!/usr/bin/env node
// Phase 2 on-device verification: runs each case's XPath and its converted class chain
// against the same LocatorLab screen under a real Appium + WDA, and compares what they find
// and how long the lookup takes.
// Node >= 20, zero dependencies, raw W3C WebDriver over fetch.
//
//   node run.js                     all cases in cases.json → results.json
//   node run.js --out other.json    same, written to another file (e.g. a second run to diff)
//   node run.js --out f.json --resume   continue an interrupted run: f.json is saved after every
//                                   screen (with "partial": true); screens already in it are skipped
//   node run.js --only A07,L013     a subset (printed only, unless --out is given)
//   node run.js --screen lists      one screen (printed only)
//   node run.js --smoke             one session on the smoke screen: versions, two lookups, page source
//   node run.js --source lists      page source of one screen
//   node run.js --merge base.json fix.json... --out f.json   replace base cases with the same id from
//                                   later partial runs (e.g. --only re-runs after a device drop)
//   node run.js --diff a.json b.json     compare two runs' outcomes and hits (timings ignored)
//   node run.js --compare a.json b.json  compare two runs' timings (e.g. another iOS or device)
//   node run.js --verdicts results.json [coverage-cases.json]   device outcome vs verdict, per case
//
// Environment: APPIUM_URL (default http://127.0.0.1:4723), UDID (default: env.json's udid),
// APP (default: the Debug-iphonesimulator build in DerivedData, or Debug-iphoneos for a real device),
// REPS (extra timed lookups per side; default 0 = time the single lookup each side makes anyway,
// as a real test does), XCODE_ORG_ID (real device only: the team that signs WDA; kept out of the repo).
//
// A UDID listed under env.json's `devices` is a real device (Phase 2b): WDA is signed with
// XCODE_ORG_ID and the device's `wdaBundleId`, and built into DerivedData/WDA-device; LocatorLab
// must already be installed as `appBundleId` (see README).
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const HERE = __dirname, ROOT = path.resolve(HERE, '../..');
const { convertXpathToClassChain } = require(ROOT);
const { scannerEscape, toRuntime } = require(path.join(ROOT, 'audit/harness/runtime'));

const ENV = JSON.parse(fs.readFileSync(path.join(HERE, 'env.json'), 'utf8'));
const APPIUM = (process.env.APPIUM_URL || 'http://127.0.0.1:4723').replace(/\/$/, '');
const UDID = process.env.UDID || ENV.udid;
const DEVICE = (ENV.devices || {})[UDID] || null;
// the simulator's WDA keeps 8100, so a real device forwards WDA to 8101
const WDA_FALLBACK_URL = `http://127.0.0.1:${DEVICE ? 8101 : 8100}`;
const APP = process.env.APP || path.join(HERE, `DerivedData/Build/Products/Debug-${DEVICE ? 'iphoneos' : 'iphonesimulator'}/LocatorLab.app`);
const REPS = Number(process.env.REPS || 0);
const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));

// ---------- W3C WebDriver over fetch
async function wd(method, url, body) {
  const res = await fetch(APPIUM + url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json().catch(() => ({ value: { error: 'bad json', message: `HTTP ${res.status}` } }));
  if (!res.ok || (json.value && json.value.error)) throw new Error(`${json.value && json.value.error}: ${json.value && json.value.message}`);
  return json.value;
}
const ELEMENT = 'element-6066-11e4-a52e-4f735466cecf';

class Session {
  static async open(screen) {
    const caps = {
      platformName: 'iOS',
      'appium:automationName': 'XCUITest',
      'appium:udid': UDID,
      // a real device runs the build installed once with devicectl: reinstalling it for every
      // session races FrontBoard ("unknown to FrontBoard")
      ...(DEVICE ? { 'appium:bundleId': DEVICE.appBundleId } : { 'appium:app': APP }),
      'appium:processArguments': { args: ['-screen', screen] },
      'appium:newCommandTimeout': 600,
      'appium:wdaLaunchTimeout': 600000,
      'appium:derivedDataPath': path.join(HERE, DEVICE ? 'DerivedData/WDA-device' : 'DerivedData/WDA'),
    };
    if (DEVICE) {
      if (!process.env.XCODE_ORG_ID) throw new Error('a real device needs XCODE_ORG_ID (the team that signs WDA)');
      Object.assign(caps, {
        'appium:xcodeOrgId': process.env.XCODE_ORG_ID,
        'appium:xcodeSigningId': 'Apple Development',
        'appium:updatedWDABundleId': DEVICE.wdaBundleId,
        'appium:allowProvisioningUpdates': true,
        'appium:wdaLocalPort': 8101,
      });
    }
    // On a real device the app is sometimes launched before FrontBoard has registered the fresh
    // install ("unknown to FrontBoard"); a new session a few seconds later succeeds.
    let v;
    for (let attempt = 1; ; attempt++) {
      try { v = await wd('POST', '/session', { capabilities: { alwaysMatch: caps, firstMatch: [{}] } }); break; } catch (e) {
        if (attempt >= 3) throw e;
        console.warn(`session for ${screen} failed (attempt ${attempt}), retrying: ${String(e.message).slice(0, 160)}`);
        await new Promise(r => setTimeout(r, 5000));
      }
    }
    const s = new Session(); s.id = v.sessionId; s.caps = v.capabilities;
    s.wdaUrl = (v.capabilities.webDriverAgentUrl || WDA_FALLBACK_URL).replace(/\/$/, '');
    s.wdaSession = (await (await fetch(s.wdaUrl + '/status')).json()).sessionId;
    return s;
  }
  // appium-xcuitest-driver 12.16.0 swallows every WDA error in findElements (doNativeFind:
  // `catch { els = [] }`), so an invalid selector looks like "nothing found". When Appium returns
  // nothing, the same request goes straight to WDA to tell the two apart.
  async wdaError(using, value) {
    const r = await (await fetch(`${this.wdaUrl}/session/${this.wdaSession}/elements`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ using: using === '-ios class chain' ? 'class chain' : using, value }) })).json();
    return r.value && r.value.error ? `${r.value.error}: ${String(r.value.message).split('\n')[0]}` : null;
  }
  url(p) { return `/session/${this.id}${p}`; }
  async find(using, value) { return (await wd('POST', this.url('/elements'), { using, value })).map(e => e[ELEMENT]); }
  async source() { return wd('GET', this.url('/source')); }
  // wait until two consecutive page sources are identical (launch layout has settled)
  async settle(timeoutMs = 20000) {
    const t0 = Date.now(); let prev = null;
    for (;;) {
      const cur = (await this.source()).replace(/ processId="\d+"/, '');
      if (cur === prev) return Date.now() - t0;
      if (Date.now() - t0 > timeoutMs) throw new Error('page source did not settle');
      prev = cur; await new Promise(r => setTimeout(r, 500));
    }
  }
  async close() { await wd('DELETE', this.url('')).catch(() => {}); }
  // type + name + label + value + rect, in lookup order
  async fingerprint(id) {
    const attr = a => wd('GET', this.url(`/element/${id}/attribute/${a}`)).catch(() => '?');
    const [type, name, label, value, r] = await Promise.all([attr('type'), attr('name'), attr('label'), attr('value'), wd('GET', this.url(`/element/${id}/rect`)).catch(() => ({}))]);
    return `${type}|${name}|${label}|${value}|${r.x},${r.y},${r.width},${r.height}`;
  }
  async lookup(using, value) {
    try {
      const t0 = process.hrtime.bigint();
      const ids = await this.find(using, value);
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      if (!ids.length) { const error = await this.wdaError(using, value); if (error) return { error: error.slice(0, 400) }; }
      const fps = [];
      for (const id of ids) fps.push(await this.fingerprint(id));
      return { fps, ms };
    } catch (e) { return { error: e.message.split('\n')[0].slice(0, 400) }; }
  }
  // wall time of findElements only (Appium → WDA → back), no attribute reads
  async time(using, value) {
    const t0 = process.hrtime.bigint();
    try { await this.find(using, value); } catch { return null; }
    return Number(process.hrtime.bigint() - t0) / 1e6;
  }
}

// ---------- statistics
const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const p95 = a => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)]; };
const geomean = a => Math.exp(a.reduce((t, x) => t + Math.log(x), 0) / a.length);
const r1 = x => Math.round(x * 10) / 10, r2 = x => Math.round(x * 100) / 100;

// REPS > 0 only: 1 untimed warm-up per side, then REPS timed lookups per side in alternating order
async function timeCase(s, xpath, chain) {
  await s.time('xpath', xpath); await s.time('-ios class chain', chain);
  const tx = [], tc = [];
  for (let i = 0; i < REPS; i++) {
    const pair = [['xpath', xpath, tx], ['-ios class chain', chain, tc]];
    for (const [using, value, acc] of i % 2 ? pair.reverse() : pair) { const t = await s.time(using, value); if (t != null) acc.push(t); }
  }
  if (!tx.length || !tc.length) return null;
  const xpathMs = median(tx), chainMs = median(tc);
  return { xpathMs: r1(xpathMs), chainMs: r1(chainMs), speedup: r2(xpathMs / chainMs), samples: { xpath: tx.map(r1), chain: tc.map(r1) } };
}

// summary over cases where both sides ran: median and p95 of the per-case medians, and the
// geometric mean of the per-case speedups (XPath time / class chain time; > 1 = class chain faster)
function perfSummary(results) {
  const t = results.map(r => r.timing).filter(Boolean);
  if (!t.length) return null;
  const x = t.map(v => v.xpathMs), c = t.map(v => v.chainMs), sp = t.map(v => v.xpathMs / v.chainMs);
  return { cases: t.length, method: REPS > 0 ? `median of ${REPS} after a warm-up` : 'single cold lookup per side, order alternating',
    xpathMs: { median: r1(median(x)), p95: r1(p95(x)) }, chainMs: { median: r1(median(c)), p95: r1(p95(c)) },
    speedup: { geomean: r2(geomean(sp)), median: r2(median(sp)), min: r2(Math.min(...sp)), max: r2(Math.max(...sp)) },
    chainFaster: sp.filter(v => v > 1).length };
}

// ---------- outcomes
function outcome(x, c, converted, dead) {
  if (!converted) return x.error ? 'XPATH_ERROR' : x.fps.length ? 'XPATH_ONLY' : dead ? 'DEAD' : 'NONE';
  if (c.error) return 'CC_ERROR';
  if (x.error) return 'XPATH_ERROR';
  if (!x.fps.length && !c.fps.length) return dead ? 'DEAD' : 'NONE';
  if (JSON.stringify([...x.fps].sort()) !== JSON.stringify([...c.fps].sort())) return 'SET_DIFFERS';
  return x.fps[0] === c.fps[0] ? 'EQUAL' : 'FIRST_DIFFERS';
}

// A case is raw locator text: with a corpus `quote` (and `subst` for ${…}) it is converted the way the
// scanner converts source text, and both sides are then turned into the runtime strings the driver
// receives. Without a quote it is the API input as is.
function prepare(k) {
  const conv = convertXpathToClassChain(k.xpath, { optimize: true });
  const rt = s => k.quote ? toRuntime(s, k.quote, new Map(Object.entries(k.subst || {}))) : s;
  const converted = conv.status === 'success';
  const chain = converted ? rt(scannerEscape(conv.locator, k.quote)).replace(/^-ios class chain:/, '') : null;
  const expected = k.expectedChain ? rt(scannerEscape(k.expectedChain, k.quote)) : null;
  return { conv, converted, xpath: rt(k.xpath), chain, expected: expected && expected !== chain ? expected : null };
}

// The two lookups that are compared are also the ones timed (one cold call per side, as in a real
// test). Which side goes first alternates from case to case, so neither profits from the other's cache.
async function runCase(s, k, n = 0) {
  const p = prepare(k);
  let x, c = null;
  if (p.converted && n % 2) { c = await s.lookup('-ios class chain', p.chain); x = await s.lookup('xpath', p.xpath); }
  else { x = await s.lookup('xpath', p.xpath); if (p.converted) c = await s.lookup('-ios class chain', p.chain); }
  const out = outcome(x, c || {}, p.converted, k.dead);
  const timed = p.converted && !x.error && !c.error && !['NONE', 'DEAD'].includes(out);
  const timing = !timed ? null : REPS > 0 ? await timeCase(s, p.xpath, p.chain)
    : { xpathMs: r1(x.ms), chainMs: r1(c.ms), speedup: r2(x.ms / c.ms), first: n % 2 ? 'chain' : 'xpath' };
  let expected;
  if (p.expected) {
    const e = await s.lookup('-ios class chain', p.expected);
    expected = { chain: p.expected, outcome: outcome(x, e, true, k.dead), hits: e.error ? { error: e.error } : e.fps };
  }
  return { id: k.id, variant: k.variant, screen: k.screen, verdict: k.verdict, xpath: p.xpath, chain: p.chain, status: p.conv.status,
    reason: p.converted ? undefined : p.conv.reason, outcome: out,
    xpathHits: x.error ? { error: x.error } : x.fps, chainHits: c ? (c.error ? { error: c.error } : c.fps) : null, expected, timing };
}

// versions as reported by the running components themselves
async function versions(s) {
  const w = (await (await fetch((s.caps.webDriverAgentUrl || WDA_FALLBACK_URL).replace(/\/$/, '') + '/status')).json()).value;
  const pkg = p => readJson(path.join(HERE, '.appium/node_modules', p, 'package.json')).version;
  const common = {
    xcode: execFileSync('xcodebuild', ['-version'], { encoding: 'utf8' }).trim().replace(/\n/g, ' '),
    appium: (await wd('GET', '/status')).build.version, xcuitestDriver: pkg('appium-xcuitest-driver'),
    wda: w.build.version, iosVersion: w.os.version, node: process.version,
  };
  let v, expected;
  if (DEVICE) {
    const out = path.join(HERE, 'out/devicectl-info.json');
    execFileSync('xcrun', ['devicectl', 'device', 'info', 'details', '--device', UDID, '--json-output', out], { stdio: 'ignore' });
    const { deviceProperties: dp, hardwareProperties: hp } = readJson(out).result;
    v = { ...common, device: dp.name, model: hp.marketingName, productType: hp.productType, osBuild: dp.osBuildUpdate, udid: UDID };
    expected = { ...ENV, ...DEVICE, udid: UDID };
  } else {
    const sim = JSON.parse(execFileSync('xcrun', ['simctl', 'list', '-j', 'devices', 'runtimes'], { encoding: 'utf8' }));
    const [rt, d] = Object.entries(sim.devices).flatMap(([rt, ds]) => ds.map(d => [rt, d])).find(([, d]) => d.udid === UDID);
    v = {
      ...common, runtime: rt, runtimeBuild: (sim.runtimes.find(r => r.identifier === rt) || {}).buildversion,
      simulator: d.name, deviceType: d.deviceTypeIdentifier, udid: UDID,
    };
    expected = ENV;
  }
  const diff = Object.keys(v).filter(k => k in expected && k !== 'node' && expected[k] !== v[k]);
  if (diff.length) console.warn(`WARNING: environment differs from env.json: ${diff.map(k => `${k} ${expected[k]} → ${v[k]}`).join(', ')}`);
  return v;
}

async function smoke() {
  const s = await Session.open('smoke');
  try {
    console.log(JSON.stringify(await versions(s), null, 1));
    for (const xpath of ['//XCUIElementTypeButton[@name="btnSecond"]', '//XCUIElementTypeButton']) console.log(JSON.stringify(await runCase(s, { id: 'smoke', screen: 'smoke', xpath }), null, 1));
    console.log(await s.source());
  } finally { await s.close(); }
}

// --merge: the base run with some cases taken from later re-runs; counts and perf are recomputed
function mergeRuns([base, ...fixes], out) {
  if (!base || !fixes.length || !out) throw new Error('usage: --merge base.json fix.json... --out merged.json');
  const id = r => r.id + (r.variant ? '~' + r.variant : '');
  const B = readJson(base), byId = new Map(B.cases.map(r => [id(r), r])), replaced = [];
  for (const f of fixes) for (const r of readJson(f).cases) {
    if (!byId.has(id(r))) throw new Error(`${f}: ${id(r)} is not in ${base}`);
    byId.set(id(r), r); replaced.push(`${id(r)} (${f})`);
  }
  const cases = B.cases.map(r => byId.get(id(r)));
  const counts = cases.reduce((a, r) => (a[r.outcome] = (a[r.outcome] || 0) + 1, a), {});
  fs.writeFileSync(path.resolve(out), JSON.stringify({ ...B, counts, perf: perfSummary(cases), merged: { base, replaced }, cases }, null, 1) + '\n');
  console.log(`${out}: ${cases.length} cases, ${replaced.length} replaced: ${replaced.join(', ')}\n${JSON.stringify(counts)}`);
}

// --diff: same cases, same outcomes, same hits? (timings are ignored)
function diffRuns(a, b) {
  const id = r => r.id + (r.variant ? '~' + r.variant : '');
  const A = readJson(a), BB = Object.fromEntries(readJson(b).cases.map(r => [id(r), r]));
  const key = r => JSON.stringify([r.chain, r.outcome, r.xpathHits, r.chainHits, r.expected]);
  const d = A.cases.filter(r => !BB[id(r)] || key(r) !== key(BB[id(r)])).map(r => `${id(r)}: ${r.outcome} vs ${BB[id(r)] ? BB[id(r)].outcome : 'missing'}`);
  console.log(d.length ? `${d.length} differences:\n  ` + d.join('\n  ') : `identical: ${A.cases.length} cases, same outcomes and hits`);
  if (d.length) process.exitCode = 1;
}

// --compare: timings of two runs, e.g. another iOS version or device
function compareRuns(a, b) {
  const A = readJson(a), B = readJson(b);
  const env = r => `${r.env.simulator || r.env.model} iOS ${r.env.iosVersion}, WDA ${r.env.wda}`;
  const row = (label, f) => console.log(`${label.padEnd(26)} ${String(f(A.perf)).padStart(12)} ${String(f(B.perf)).padStart(12)}`);
  console.log(`A: ${a} (${env(A)})\nB: ${b} (${env(B)})\n${''.padEnd(26)} ${'A'.padStart(12)} ${'B'.padStart(12)}`);
  row('cases timed', p => p.cases);
  row('XPath ms median / p95', p => `${p.xpathMs.median} / ${p.xpathMs.p95}`);
  row('chain ms median / p95', p => `${p.chainMs.median} / ${p.chainMs.p95}`);
  row('speedup geomean', p => `×${p.speedup.geomean}`);
  const BB = Object.fromEntries(B.cases.filter(r => r.timing).map(r => [r.id, r.timing]));
  const both = A.cases.filter(r => r.timing && BB[r.id]);
  if (both.length) console.log(`same ${both.length} cases, B/A time ratio (geomean): XPath ×${r2(geomean(both.map(r => BB[r.id].xpathMs / r.timing.xpathMs)))}, chain ×${r2(geomean(both.map(r => BB[r.id].chainMs / r.timing.chainMs)))}`);
}

// --verdicts: does each device outcome agree with the case's verdict?
//   CORRECT       → EQUAL
//   DRIFT, WRONG  → SET_DIFFERS / FIRST_DIFFERS / CC_ERROR (EQUAL = the screen did not exercise the difference)
//   GAP           → XPATH_ONLY, and the hand-written chain EQUAL
//   CORRECT-SKIP  → skipped (XPATH_ONLY, DEAD, XPATH_ERROR), and no hand-written chain proven EQUAL
function agrees(r, verdict) {
  const diff = ['SET_DIFFERS', 'FIRST_DIFFERS', 'CC_ERROR'].includes(r.outcome), skipped = r.status !== 'success';
  const exp = r.expected && r.expected.outcome;
  switch (verdict) {
    case 'CORRECT': return r.outcome === 'EQUAL' ? 'agrees' : 'DISAGREES';
    case 'DRIFT': case 'WRONG': return diff ? 'agrees' : r.outcome === 'EQUAL' ? 'not exercised' : 'DISAGREES';
    case 'GAP': return skipped && (!exp || exp === 'EQUAL') ? 'agrees' : 'DISAGREES';
    case 'CORRECT-SKIP': return skipped && exp !== 'EQUAL' ? 'agrees' : 'DISAGREES';
  }
  return 'unknown verdict';
}
function verdicts(file, covFile) {
  const R = readJson(file).cases;
  const cov = Object.fromEntries(readJson(covFile || path.join(ROOT, 'audit/coverage-cases.json')).map(c => [c.id, c]));
  const tally = {};
  for (const r of R) {
    const v = cov[r.id] ? cov[r.id].verdict : r.verdict, a = agrees(r, v);
    tally[a] = (tally[a] || 0) + 1;
    if (a !== 'agrees') console.log(`${a.padEnd(13)} ${(r.id + (r.variant ? '~' + r.variant : '')).padEnd(16)} ${v.padEnd(12)} ${r.outcome}${r.expected ? ' (expected chain ' + r.expected.outcome + ')' : ''}  ${r.xpath}`);
  }
  console.log(JSON.stringify(tally));
}

async function main() {
  if (args.includes('--verdicts')) return verdicts(opt('--verdicts'), args[args.indexOf('--verdicts') + 2]);
  if (args.includes('--smoke')) return smoke();
  if (args.includes('--merge')) return mergeRuns(args.slice(args.indexOf('--merge') + 1).filter(a => !a.startsWith('--') && a !== opt('--out')), opt('--out'));
  if (args.includes('--diff')) return diffRuns(opt('--diff'), args[args.indexOf('--diff') + 2]);
  if (args.includes('--compare')) return compareRuns(opt('--compare'), args[args.indexOf('--compare') + 2]);
  if (opt('--source')) {
    const s = await Session.open(opt('--source'));
    try { console.log(await s.source()); } finally { await s.close(); }
    return;
  }
  const all = readJson(path.join(HERE, 'cases.json'));
  const only = opt('--only') ? new Set(opt('--only').split(',')) : null, scr = opt('--screen');
  const cases = all.filter(k => (!only || only.has(k.id)) && (!scr || k.screen === scr));
  if (!cases.length) throw new Error('no cases selected');
  const outFile = path.resolve(HERE, opt('--out') || 'results.json');
  const save = (doc) => fs.writeFileSync(outFile, JSON.stringify(doc, null, 1) + '\n');
  const writes = (!only && !scr) || opt('--out');
  const prev = args.includes('--resume') && fs.existsSync(outFile) ? readJson(outFile) : null;
  if (prev && !prev.partial) throw new Error(`${outFile} is a finished run; nothing to resume`);
  const t0 = Date.now(), results = prev ? prev.cases : [];
  const done = new Set(results.map(r => r.screen));
  let env = prev ? prev.env : null;
  if (prev) console.log(`resuming: ${results.length} cases from ${[...done].join(', ')}`);
  for (const screen of [...new Set(cases.map(k => k.screen))].filter(sc => !done.has(sc))) {
    const s = await Session.open(screen);
    try {
      await s.settle();
      env = env || await versions(s);
      for (const k of cases.filter(k => k.screen === screen)) {
        const r = await runCase(s, k, results.length);
        results.push(r);
        const t = r.timing ? `  [${r.timing.xpathMs} / ${r.timing.chainMs} ms ×${r.timing.speedup}]` : '';
        const e = r.expected ? `  [expected chain: ${r.expected.outcome}]` : '';
        if (args.includes('--verbose') && r.outcome !== 'EQUAL') console.log(JSON.stringify({ xpath: r.xpathHits, chain: r.chainHits, expected: r.expected && r.expected.hits }, null, 1));
        console.log(`${r.outcome.padEnd(13)} ${(r.id + (r.variant ? '~' + r.variant : '')).padEnd(16)} ${r.verdict.padEnd(12)} ${JSON.stringify(r.xpath)}${r.chain ? '  →  ' + r.chain : ''}${e}${t}`);
      }
    } finally { await s.close(); }
    if (writes) save({ partial: true, env, seconds: (prev ? prev.seconds : 0) + Math.round((Date.now() - t0) / 1000), cases: results });
  }
  const counts = results.reduce((a, r) => (a[r.outcome] = (a[r.outcome] || 0) + 1, a), {});
  const perf = perfSummary(results), seconds = (prev ? prev.seconds : 0) + Math.round((Date.now() - t0) / 1000);
  console.log(`\n${results.length} cases in ${seconds} s:`, JSON.stringify(counts));
  if (perf) console.log(`timing (${perf.cases} cases, ${perf.method}): XPath median ${perf.xpathMs.median} ms, p95 ${perf.xpathMs.p95} ms; class chain median ${perf.chainMs.median} ms, p95 ${perf.chainMs.p95} ms; speedup ×${perf.speedup.geomean} (geomean), class chain faster in ${perf.chainFaster}/${perf.cases}`);
  if (writes) save({ env, date: new Date().toISOString().slice(0, 10), seconds, counts, perf, cases: results });
}
main().catch(e => { console.error(e); process.exit(1); });
