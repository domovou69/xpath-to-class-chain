const cases = require(process.argv[2] || require('./paths').out('coverage-cases.json')).filter(c => c.category === 'corpus');
const span = require('./codespan');
const esc = s => String(s).replace(/\|/g, '\\|').replace(/\n/g, '\\n');
const groups = new Map();
for (const c of cases) { const k = c.shape + '||' + c.verdict; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); }
const order = { WRONG: 0, DRIFT: 1, GAP: 2, 'CORRECT-SKIP': 4, CORRECT: 3 };
const rows = [...groups.entries()].sort((a, b) => (order[a[1][0].verdict] - order[b[1][0].verdict]) || b[1].length - a[1].length);
const trunc = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
let md = '| # | Shape (values → `s`, `${}` → `$`) | n | Verdict | Rep. | Representative output | Other ids |\n|---|---|---|---|---|---|---|\n';
let i = 0;
const restCorrect = [], skips = {};
for (const [k, cs] of rows) {
  const [shape, verdict] = k.split('||'); const rep = cs[0];
  if (verdict === 'CORRECT' && cs.length < 3) { restCorrect.push([shape.split(' ')[0], cs.length]); continue; }
  if (verdict === 'CORRECT-SKIP') { const r = rep.expected.replace(/^INEXPRESSIBLE: /, ''); for (const c of cs) { const rr = c.expected.startsWith('INEXPRESSIBLE') ? c.expected.replace(/^INEXPRESSIBLE: /, '') : c.expected.split(':')[0].replace('UNDETERMINED', 'undetermined suffix').replace('INVALID XPATH on WDA (libxml2', 'invalid XPath (mixed syntax)'); (skips[rr] ??= []).push(c.id); } continue; }
  const sid = shape.split(' ')[0]; const sh = shape.slice(sid.length + 1);
  const out = rep.actual ? rep.actual.replace('-ios class chain:', '') : (rep.verdict === 'GAP' ? 'skipped → expected ' + rep.expected.replace('-ios class chain:', '') : rep.status);
  md += `| ${sid} | ${span(esc(trunc(sh, 90)))} | ${cs.length} | ${verdict}${rep.note.includes('not documented') ? ' (undoc.)' : rep.note.includes('documented') && verdict === 'DRIFT' ? ' (doc.)' : ''}${verdict === 'WRONG' ? ' ' + (rep.note.match(/root cause (\S+)/) || [])[1] : ''} | ${rep.id} | ${span(esc(trunc(out, 90)))} | ${trunc(cs.slice(1).map(c => c.id).join(', '), 70) || '—'} |\n`;
  i++;
}
md += `| … | ${restCorrect.length} further CORRECT shapes with 1–2 entries each (${restCorrect.reduce((a, r) => a + r[1], 0)} entries): ${restCorrect.map(r => r[0]).join(', ')} | | CORRECT | | see coverage-cases.json | |\n`;
md += '\n**CORRECT-SKIP (inexpressible or excluded), by reason:**\n\n| Reason | n | Ids |\n|---|---|---|\n';
for (const [r, ids] of Object.entries(skips).sort((a, b) => b[1].length - a[1].length)) md += `| ${r} | ${ids.length} | ${ids.join(', ')} |\n`;
console.log(md); console.error('rows', i);
