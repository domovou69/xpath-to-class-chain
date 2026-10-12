// D3: Phase 4 prompt (-1 runs) vs prompt v2 (-2 runs) from scores/, same score.js. Usage: node compare-v2.js
// Rescore the Phase 4 cells first if score.js changed: node score.js out/<cell>-1.json
const fs = require('fs'), path = require('path');
const S = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'scores', n + '.json'), 'utf8'));
const O = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'out', n + '.json'), 'utf8'));
const pct = (a, b) => (100 * a / b).toFixed(1);
const rows = ['| Cell | Prompt | R | S | Converted | Precision | CORRECT | DRIFT | WRONG | INVALID | GAP | Time, min | Cost, $ | Output tokens |', '|' + '---|'.repeat(14)];
for (const cell of ['converter', 'haiku-medium', 'sonnet-low', 'opus-low']) for (const [tag, suf] of cell === 'converter' ? [['—', '']] : [['Phase 4', '-1'], ['v2', '-2']]) {
  const n = cell + suf, { summary: s, cases } = S(n), v = Object.values(cases).map(c => c.verdict).filter(x => x !== 'EXCLUDED'), N = v.length, c = x => v.filter(y => y === x).length;
  const chains = c('CORRECT') + c('DRIFT') + c('WRONG') + c('INVALID') + c('N/A'), run = cell === 'converter' ? null : O(n);
  rows.push(`| ${cell === 'converter' ? '**converter**' : cell.replace('-', ' / ')} | ${tag} | ${s.R.toFixed(1)} | ${s.S.toFixed(1)} | ${pct(chains, N)} % | ${pct(c('CORRECT') + c('DRIFT'), chains)} % | ${c('CORRECT')} | ${c('DRIFT')} | ${c('WRONG')} | ${c('INVALID')} | ${c('GAP')} | ${run ? (run.wallMs / 6e4).toFixed(1) : '—'} | ${run ? run.cli.total_cost_usd.toFixed(2) : '—'} | ${run ? Math.round(run.cli.usage.output_tokens / 1000) + 'k' : '—'} |`);
}
console.log(rows.join('\n'));
