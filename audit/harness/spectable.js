const cases = require(process.argv[2] || require('./paths').out('coverage-cases.json')).filter(c => /^[A-HRX]\d\d$/.test(c.id));
const esc = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, '\\n');
const t = (s, n) => (s = esc(s)).length > n ? s.slice(0, n - 1) + '…' : s;
const cs = require('./codespan'); const code = s => s ? cs(s) : '—';
const NAMES = { A: 'Steps/axes/absolute', B: 'Attributes', C: 'String fns', D: 'Logic', E: 'Positional', F: 'Nested', G: 'Literals', H: 'WDA ext.', R: 'Reverse axes' };
let md = '| Id | Cat | XPath | Correct class chain (or why not) | Actual output | Verdict |\n|---|---|---|---|---|---|\n';
for (const c of cases) {
  const exp = c.expected.startsWith('INEXPRESSIBLE') || c.expected.startsWith('SKIP') ? '*' + t(c.expected, 70) + '*' : code(t(c.expected, 80));
  const act = c.actual ? code(t(c.actual.replace('-ios class chain:', ''), 80)) : c.status;
  const rc = (c.note.match(/root cause (\S+)/) || [])[1];
  const v = c.verdict + (rc ? ' ' + rc : '') + (c.note.includes('DRIFT documented') ? ' (doc.)' : c.note.includes('not documented') ? ' (undoc.)' : '') + (c.note.includes('excluded from denominator') ? ' †' : '');
  md += `| ${c.id} | ${c.category} | ${code(t(c.xpath, 70))} | ${exp} | ${act} | ${v} |\n`;
}
console.log(md);
