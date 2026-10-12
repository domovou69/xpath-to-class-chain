// D3: the converter and the prompt-test cells (out/<cell>-<RUN>.json, scores/<cell>-<RUN>.json), each counted against the converter.
// Usage: RUN=3 node compare-v2.js [details]   (RUN: 2 = prompt v3, 3 = prompt v4; default 3; BASELINE=1 adds the Phase 4 run without rules, run 1, above each row). "details" adds the case ids behind the comment column.
const fs = require('fs'), path = require('path');
const S = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'scores', n + '.json'), 'utf8'));
const O = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'out', n + '.json'), 'utf8'));
const conv = S('converter'), ids = Object.keys(conv.cases).filter(i => conv.cases[i].verdict !== 'EXCLUDED');
const usable = v => v === 'CORRECT' || v === 'DRIFT', emitted = v => ['CORRECT', 'DRIFT', 'WRONG', 'INVALID', 'N/A'].includes(v);
const grp = g => ids.filter(i => conv.cases[i].group === g);
const base = { all: ids.filter(i => usable(conv.cases[i].verdict)).length, corpus: grp('corpus').filter(i => usable(conv.cases[i].verdict)).length, spec: grp('spec').filter(i => usable(conv.cases[i].verdict)).length };
const pc = (a, b) => (100 * a / b).toFixed(1);
const RUN = process.env.RUN || '3';
const cells = ['opus-low', 'sonnet-low', 'haiku-medium']; // best to worst
const RUNS = (process.env.BASELINE ? [['1', 'no rules (Phase 4)']] : []).concat([[RUN, 'v' + (+RUN + 1)]]);
const rows = ['| Cell | Prompt | R | S | Chains | Usable (CORRECT + DRIFT) | % of converter (all / corpus / spec) | Missed (converter has it, model skips or errs) | Skipped right (converter only approximates) | Ahead (model right where the converter has a GAP) | WRONG + INVALID | Time, min | Cost, $ |', '|' + '---|'.repeat(13)];
const details = [];
const cc = ids.filter(i => emitted(conv.cases[i].verdict)).length;
rows.push(`| **converter** | — | ${conv.summary.R.toFixed(1)} | ${conv.summary.S.toFixed(1)} | ${cc} | ${base.all} | 100 / 100 / 100 | — | — | — | 0 | — | — |`);
for (const c of cells) for (const [run, label] of RUNS) {
  const s = S(c + '-' + run), r = O(c + '-' + run), v = i => s.cases[i].verdict;
  const good = g => (g ? grp(g) : ids).filter(i => usable(v(i)));
  const skipRight = ids.filter(i => conv.cases[i].verdict === 'DRIFT' && v(i) === 'CORRECT-SKIP'), missed = ids.filter(i => usable(conv.cases[i].verdict) && !usable(v(i)) && !skipRight.includes(i)), ahead = ids.filter(i => usable(v(i)) && conv.cases[i].verdict === 'GAP'); // an exact chain exists, the converter misses it
  const bad = ids.filter(i => v(i) === 'WRONG' || v(i) === 'INVALID');
  rows.push(`| ${c.replace('-', ' / ')} | ${label} | ${s.summary.R.toFixed(1)} | ${s.summary.S.toFixed(1)} | ${ids.filter(i => emitted(v(i))).length} | ${good().length} | ${pc(good().length, base.all)} / ${pc(good('corpus').length, base.corpus)} / ${pc(good('spec').length, base.spec)} | ${missed.length} | ${skipRight.length} | ${ahead.length} | ${bad.length} | ${(r.wallMs / 6e4).toFixed(1)} | ${r.cli.total_cost_usd.toFixed(2)} |`);
  const lab = i => `${conv.cases[i].orig}`;
  for (const g of ['corpus', 'spec']) details.push(`${c} ${label} ${g}: missed ${missed.filter(i => conv.cases[i].group === g).map(lab).join(' ') || '—'} | ahead ${ahead.filter(i => conv.cases[i].group === g).map(lab).join(' ') || '—'} | wrong ${bad.filter(i => conv.cases[i].group === g).map(i => lab(i) + ':' + v(i)).join(' ') || '—'}`);
}
console.log(rows.join('\n'));
console.log(`\nChecked: ${ids.length} locators (${grp('corpus').length} corpus, ${grp('spec').length} spec); converter usable ${base.all} (${base.corpus} corpus, ${base.spec} spec).`);
if (process.argv[2] === 'details') console.log('\n' + details.join('\n'));
