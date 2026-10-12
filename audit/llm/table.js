// Phase 4 results table (Markdown) from scores/*.json and out/*.json.
// R, S: as scored (a skipped no-exact-chain case leaves that run's denominator).
// R=, S=: common denominator — the converter's expressible cases for every row, so skipping more cannot raise the score.
const fs = require('fs'), path = require('path');
const S = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'scores', n + '.json'), 'utf8'));
const W = { A: 15, B: 15, C: 15, D: 12, E: 12, F: 10, G: 10, H: 6, R: 5 };
const conv = S('converter');
// the converter's denominator: its expressible cases minus the no-exact-chain cases it skips (E07, E11); EXCLUDED (L157) is never in it
const den = Object.entries(conv.cases).filter(([, c]) => c.inDen).map(([id]) => id);
const docDrift = Object.fromEntries(Object.entries(conv.cases).filter(([, c]) => c.verdict === 'DRIFT').map(([id, c]) => [id, c.documented]));
const credit = (c, id) => c.verdict === 'CORRECT' ? 1 : c.verdict === 'DRIFT' && (c.documented ?? docDrift[id]) ? 0.5 : 0;
function fixed(cases) {
  const corp = den.filter(id => cases[id].group === 'corpus');
  const R = 100 * corp.reduce((a, id) => a + credit(cases[id], id), 0) / corp.length;
  let Sx = 0;
  for (const [cat, w] of Object.entries(W)) { const ids = den.filter(id => cases[id].group === 'spec' && cases[id].cat === cat); Sx += ids.length ? w * ids.reduce((a, id) => a + credit(cases[id], id), 0) / ids.length : w; }
  return { R, S: Sx };
}
const MODELS = ['haiku', 'sonnet', 'opus'], EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const names = ['converter', ...MODELS.flatMap(m => EFFORTS.map(e => `${m}-${e}-1`))].filter(n => fs.existsSync(path.join(__dirname, 'scores', n + '.json')));
const pct = (a, b) => `${(100 * a / b).toFixed(1)} %`;
const incomplete = [];
const lines = ['| Cell | R | S | R= | S= | Converted | Skipped | of which GAP | Precision | WRONG | INVALID | MISSING | Time, min | Cost, $ | Output tokens |', '|' + '---|'.repeat(15)];
for (const n of names) {
  const { summary: s, cases } = S(n), v = Object.values(cases).map(c => c.verdict).filter(x => x !== 'EXCLUDED'), N = v.length; // EXCLUDED: not an XPath (L157)
  const chains = v.filter(x => ['CORRECT', 'DRIFT', 'WRONG', 'INVALID', 'N/A'].includes(x)).length;
  const ok = v.filter(x => x === 'CORRECT' || x === 'DRIFT').length;
  const skipped = v.filter(x => x === 'CORRECT-SKIP' || x === 'GAP').length, gap = v.filter(x => x === 'GAP').length;
  if (v.includes('MISSING')) { // interrupted run: reported in a note, not compared
    const run = JSON.parse(fs.readFileSync(path.join(__dirname, 'out', n + '.json'), 'utf8'));
    incomplete.push(`- **${n.replace(/-1$/, '').replace('-', ' / ')}**: not compared. The run was cut off by the account's 5-hour session limit (HTTP 429) after ${(run.wallMs / 6e4).toFixed(1)} min, $${run.cli.total_cost_usd.toFixed(2)} (API equivalent) and ${Math.round(run.cli.usage.output_tokens / 1000)}k output tokens (${Math.round(run.cli.usage.output_tokens_details.thinking_tokens / 1000)}k of them thinking). It had written ${Object.values(cases).filter(c => c.verdict !== 'MISSING').length} of ${Object.keys(cases).length} answers. It ran in parallel with sonnet / max, so the limit was shared; how much of it each run used is not measured.`);
    continue;
  }
  const f = fixed(cases);
  const run = n === 'converter' ? null : JSON.parse(fs.readFileSync(path.join(__dirname, 'out', n + '.json'), 'utf8'));
  const label = (n === 'converter' ? '**converter**' : n.replace(/-1$/, '').replace('-', ' / ')) + (v.includes('MISSING') ? ' †' : '');
  lines.push(`| ${label} | ${s.R.toFixed(1)} | ${s.S.toFixed(1)} | ${f.R.toFixed(1)} | ${f.S.toFixed(1)} | ${pct(chains, N)} | ${pct(skipped, N)} | ${gap} | ${pct(ok, chains)} | ${v.filter(x => x === 'WRONG').length} | ${v.filter(x => x === 'INVALID').length} | ${v.filter(x => x === 'MISSING').length} | ${run ? (run.wallMs / 6e4).toFixed(1) : '—'} | ${run ? run.cli.total_cost_usd.toFixed(2) : '—'} | ${run ? Math.round(run.cli.usage.output_tokens / 1000) + 'k' : '—'} |`);
}
console.log(lines.join('\n') + (incomplete.length ? '\n\nExcluded:\n' + incomplete.join('\n') : ''));
