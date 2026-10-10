// Group corpus entries by structural shape and print one representative per shape.
const path = require('path');
const { ROOT } = require('./paths');
const m = require(path.join(ROOT, 'xpath-to-class-chain'));
const corpus = require(path.join(ROOT, 'audit/corpus/ios-locators.json'));
const KEEP_TYPES = new Set(['XCUIElementTypeOther', 'XCUIElementTypeWindow', 'XCUIElementTypeApplication', 'XCUIElementTypeAny']);

function stripInterp(s) { // ${...} with nested braces -> $
  let out = '', i = 0;
  while (i < s.length) {
    if (s[i] === '$' && s[i + 1] === '{') { let d = 0, j = i + 1; for (; j < s.length; j++) { if (s[j] === '{') d++; else if (s[j] === '}' && --d === 0) break; } out += '$'; i = j + 1; }
    else out += s[i++];
  }
  return out;
}
function litClass(v, q) {
  if (/^(true|false)$/.test(v)) return v;
  const f = [];
  if (v.includes('$')) f.push('$');
  if (/[*?]/.test(v)) f.push('*');
  if (v.includes('\\')) f.push('\\');
  if (v.includes(q === '"' ? "'" : '"')) f.push('q');
  if (/[\/|()\[\]]/.test(v)) f.push('/');
  if (/[^\x00-\x7f]/.test(v)) f.push('u');
  return process.env.COARSE ? (f.includes('$') ? 's$' : (f.includes('*') ? 's*' : 's')) : 's' + f.join('');
}
function shapeOf(src) {
  let s = stripInterp(src), out = '';
  for (let i = 0; i < s.length;) {
    const c = s[i];
    if (c === '"' || c === "'") {
      let j = i + 1; while (j < s.length && s[j] !== c) j++;
      out += c + litClass(s.slice(i + 1, j), c) + c; i = j + 1;
    } else out += s[i++];
  }
  return out
    .replace(/XCUIElementType[A-Za-z]+/g, t => KEEP_TYPES.has(t) ? t.replace('XCUIElementType', '') : 'T')
    .replace(/\[\d+\]/g, '[N]')
    .replace(/\s+/g, ' ');
}
const scored = new Set(['xpath', 'xpath-dynamic', 'xpath-mixed-classchain']);
const groups = new Map();
for (const x of corpus) {
  let r; const t0 = process.hrtime.bigint();
  try { r = m.convertXpathToClassChain(x.source, { optimize: true }); } catch (e) { r = { status: 'CRASH', locator: String(e) }; }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const key = (scored.has(x.kind) ? '' : '[OOS ' + x.kind + '] ') + shapeOf(x.source) + '  =>  ' + r.status;
  if (!groups.has(key)) groups.set(key, { key, kind: x.kind, status: r.status, ids: [], rep: x, out: r.locator, maxMs: 0 });
  const g = groups.get(key); g.ids.push(x.id); g.maxMs = Math.max(g.maxMs, ms);
}
const arr = [...groups.values()].sort((a, b) => b.ids.length - a.ids.length);
if (process.argv[2] === '--json') { console.log(JSON.stringify(arr.map(g => ({ ...g, rep: g.rep })), null, 1)); return; }
console.log('shapes:', arr.length);
arr.forEach((g, i) => {
  console.log(`\n#${i + 1} n=${g.ids.length} [${g.kind}] ${g.status} maxMs=${g.maxMs.toFixed(1)}`);
  console.log('  SHAPE ', g.key.split('  =>  ')[0]);
  console.log('  REP   ', g.rep.id, g.rep.source);
  console.log('  OUT   ', g.out);
  console.log('  IDS   ', g.ids.join(','));
});
