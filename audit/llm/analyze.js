// Mechanical part of the Phase 4 error analysis, from scores/*.json only.
// Writes analysis/errors.json (the input for the text analysis) and prints the cross tables as Markdown.
//   errors.json: { cells, cases: { <orig id>: { xpath, converter: {verdict, chain}, cells: { <cell>: {verdict, chain|reason, note|example} } } } }
//   only cases where at least one cell or the converter is not CORRECT / CORRECT-SKIP in agreement are kept.
const fs = require('fs'), path = require('path');
const SC = path.join(__dirname, 'scores');
const MODELS = ['haiku', 'sonnet', 'opus'], EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const load = n => JSON.parse(fs.readFileSync(path.join(SC, n + '.json'), 'utf8'));
const conv = load('converter').cases;
// complete runs only (an interrupted run has MISSING cases and is not compared)
const cells = MODELS.flatMap(m => EFFORTS.map(e => `${m}-${e}-1`)).filter(n => fs.existsSync(path.join(SC, n + '.json')))
  .filter(n => !Object.values(load(n).cases).some(c => c.verdict === 'MISSING'));
const S = Object.fromEntries(cells.map(n => [n, load(n).cases]));
const short = n => n.replace(/-1$/, '').replace('-', '/');
const GOOD = new Set(['CORRECT', 'CORRECT-SKIP']);
const strip = s => s && s.replace(/^\s*-ios class chain:\s*/, '');
const ex = e => e && `page ${e.xml.replace(/ (enabled|visible|accessible|hittable|selected)="[a-z]+"/g, '').replace(/ (x|width|placeholderValue)="[^"]*"/g, '')} → XPath ${JSON.stringify(e.xpathHits)} vs chain ${JSON.stringify(e.chainHits)}`;

const out = { cells: cells.map(short), cases: {} };
for (const [id, c] of Object.entries(conv)) {
  if (c.verdict === 'EXCLUDED') continue; // not an XPath (L157)
  const per = {};
  for (const n of cells) {
    const r = S[n][id];
    if (r.verdict === 'CORRECT' || r.verdict === 'CORRECT-SKIP') { per[short(n)] = r.verdict; continue; } // keep the file small
    per[short(n)] = { verdict: r.verdict, ...(r.chain ? { chain: strip(r.chain) } : { reason: String(r.reason ?? "").slice(0, 160) }), ...(r.verdict === 'WRONG' && r.example ? { counterExample: ex(r.example).slice(0, 400) } : {}), ...(r.verdict === 'INVALID' ? { wda: r.note } : {}) };
  }
  const all = [c.verdict, ...Object.values(per).map(p => p.verdict || p)];
  if (all.every(v => GOOD.has(v)) && new Set(all).size === 1) continue; // everyone agrees and is right
  out.cases[c.orig] = { group: c.group, cat: c.cat, xpath: c.xpath, converter: { verdict: c.verdict, ...(c.chain ? { chain: strip(c.chain) } : {}) }, cells: per };
}
fs.mkdirSync(path.join(__dirname, 'analysis'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'analysis/errors.json'), JSON.stringify(out, null, 1) + '\n');

// ---------- Markdown
const code = s => '`' + String(s).replace(/`/g, 'ˋ').replace(/\|/g, '\\|').replace(/\n/g, '\\n') + '`';
const md = [];
const scored = Object.entries(conv).filter(([, c]) => c.verdict !== 'EXCLUDED');
const beats = scored.map(([id, c]) => [id, c, cells.filter(n => S[n][id].verdict === 'CORRECT' && c.verdict !== 'CORRECT')]).filter(([, , w]) => w.length).sort((a, b) => b[2].length - a[2].length);
md.push(`### Where a model is right and the converter is not (${beats.length} cases, ${cells.length} cells)`, '', '| Case | XPath | Converter | Cells right | Example chain from a model |', '|---|---|---|---|---|');
for (const [id, c, w] of beats) md.push(`| ${c.orig} | ${code(c.xpath)} | ${c.verdict} | ${w.length}/${cells.length} | ${code(strip(S[w[0]][id].chain))} |`);
const loses = scored.map(([id, c]) => [id, c, cells.filter(n => ['WRONG', 'INVALID', 'GAP'].includes(S[n][id].verdict) && ['CORRECT', 'DRIFT'].includes(c.verdict))]).filter(([, , w]) => w.length).sort((a, b) => b[2].length - a[2].length);
md.push('', `### Where the converter is right and a model is not (${loses.length} cases)`, '', '| Case | XPath | Converter | Cells wrong / invalid / gap | Cells |', '|---|---|---|---|---|');
for (const [id, c, w] of loses) md.push(`| ${c.orig} | ${code(c.xpath)} | ${c.verdict} | ${w.filter(n => S[n][id].verdict === 'WRONG').length} / ${w.filter(n => S[n][id].verdict === 'INVALID').length} / ${w.filter(n => S[n][id].verdict === 'GAP').length} | ${w.map(short).join(', ')} |`);
const bad = id => cells.filter(n => ['WRONG', 'INVALID'].includes(S[n][id].verdict));
const noConv = scored.filter(([id, c]) => !['CORRECT', 'DRIFT'].includes(c.verdict) && bad(id).length);
md.push('', `### Wrong or invalid chains where the converter also has no right chain (${noConv.length} cases)`, '', '| Case | XPath | Converter | Cells wrong / invalid |', '|---|---|---|---|');
for (const [id, c] of noConv) md.push(`| ${c.orig} | ${code(c.xpath)} | ${c.verdict} | ${bad(id).map(n => `${short(n)} ${S[n][id].verdict}`).join(', ')} |`);
console.log(md.join('\n'));
console.error(`errors.json: ${Object.keys(out.cases).length} cases with any disagreement or error, ${cells.length} complete cells`);
