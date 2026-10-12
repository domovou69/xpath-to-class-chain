// Phase 4 results table (Markdown) from scores/*.json and out/*.json.
// R, S: as scored by score.js, over one fixed denominator for every row (a skip inside it earns 0).
const fs = require('fs'), path = require('path');
const S = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'scores', n + '.json'), 'utf8'));
const MODELS = ['haiku', 'sonnet', 'opus'], EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const names = ['converter', ...MODELS.flatMap(m => EFFORTS.map(e => `${m}-${e}-1`))].filter(n => fs.existsSync(path.join(__dirname, 'scores', n + '.json')));
const pct = (a, b) => `${(100 * a / b).toFixed(1)} %`;
const incomplete = [];
const lines = ['| Cell | R | S | Converted | Skipped | of which GAP | Precision | WRONG | INVALID | MISSING | Time, min | Cost, $ | Output tokens |', '|' + '---|'.repeat(13)];
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
  const run = n === 'converter' ? null : JSON.parse(fs.readFileSync(path.join(__dirname, 'out', n + '.json'), 'utf8'));
  const label = (n === 'converter' ? '**converter**' : n.replace(/-1$/, '').replace('-', ' / ')) + (v.includes('MISSING') ? ' †' : '');
  lines.push(`| ${label} | ${s.R.toFixed(1)} | ${s.S.toFixed(1)} | ${pct(chains, N)} | ${pct(skipped, N)} | ${gap} | ${pct(ok, chains)} | ${v.filter(x => x === 'WRONG').length} | ${v.filter(x => x === 'INVALID').length} | ${v.filter(x => x === 'MISSING').length} | ${run ? (run.wallMs / 6e4).toFixed(1) : '—'} | ${run ? run.cli.total_cost_usd.toFixed(2) : '—'} | ${run ? Math.round(run.cli.usage.output_tokens / 1000) + 'k' : '—'} |`);
}
console.log(lines.join('\n') + (incomplete.length ? '\n\nExcluded:\n' + incomplete.join('\n') : ''));
