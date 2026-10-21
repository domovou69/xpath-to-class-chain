// D3: the converter and the prompt-test cells (out/<cell>-<RUN>.json, scores/<cell>-<RUN>.json), each counted against the converter.
// Usage: RUN=3 node compare-v2.js [details]   (CELLS=a-low,b-medium picks the cells)   (RUN: 2 = prompt v3, 3 = prompt v4; default 3; BASELINE=1 adds the Phase 4 run without rules, run 1, above each row). "details" adds the case ids behind the comment column.
const fs = require('fs'), path = require('path');
const S = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'scores', n + '.json'), 'utf8'));
const O = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'out', n + '.json'), 'utf8'));
const conv = S('converter'), ids = Object.keys(conv.cases).filter(i => conv.cases[i].verdict !== 'EXCLUDED');
const usable = v => v === 'CORRECT' || v === 'DRIFT', emitted = v => ['CORRECT', 'DRIFT', 'WRONG', 'INVALID', 'N/A'].includes(v);
const grp = g => ids.filter(i => conv.cases[i].group === g);
const base = { all: ids.filter(i => usable(conv.cases[i].verdict)).length, corpus: grp('corpus').filter(i => usable(conv.cases[i].verdict)).length, spec: grp('spec').filter(i => usable(conv.cases[i].verdict)).length };
const pc = (a, b) => (100 * a / b).toFixed(1);
// R and S from the per-case verdicts, so the scheme can be chosen without rescoring. Scoring v2 (default, Phase 7):
// CORRECT 1, documented DRIFT 0.5, skip 0, WRONG / INVALID -1. SCORING=v1: WRONG / INVALID 0 (the published article).
const V2 = process.env.SCORING !== 'v1', W = { A: 15, B: 15, C: 15, D: 12, E: 12, F: 10, G: 10, H: 6, R: 5 };
const credit = c => c.verdict === 'CORRECT' ? 1 : c.verdict === 'DRIFT' && c.documented ? 0.5 : V2 && ['WRONG', 'INVALID'].includes(c.verdict) ? -1 : 0;
function RS(sc) {
  const cs = Object.values(sc.cases), corp = cs.filter(c => c.group === 'corpus' && c.inDen);
  let S = 0;
  for (const [cat, w] of Object.entries(W)) { const d = cs.filter(c => c.group === 'spec' && c.cat === cat && c.inDen); S += d.length ? w * d.reduce((a, c) => a + credit(c), 0) / d.length : w; }
  return { R: 100 * corp.reduce((a, c) => a + credit(c), 0) / corp.length, S };
}
// Q, % of the converter: R and S each as a share of the converter's, S weighted higher (the models differ there).
const RSc = RS(conv), Q = ({ R, S }) => (100 * (0.4 * R / RSc.R + 0.6 * S / RSc.S)).toFixed(1);
const RUN = process.env.RUN || '3';
const cells = process.env.CELLS ? process.env.CELLS.split(',') : ['opus-low', 'sonnet-low', 'haiku-medium']; // best to worst; CELLS=sonnet46-low,haiku45-medium RUN=1 for the older models
const RUNS = (process.env.BASELINE ? [['1', 'no rules (Phase 4)']] : []).concat([[RUN, RUN === '1' ? 'no rules (Phase 4)' : isNaN(+RUN) ? 'no rules (' + RUN + ')' : 'v' + (+RUN + 1)]]);
const rows = ['| Cell | Prompt | R | S | Q, % of converter | Chains | Usable (CORRECT + DRIFT) | % of converter (all / corpus / spec) | Missed (converter has it, model skips or errs) | Skipped right (converter only approximates) | Ahead (model right where the converter has a GAP) | WRONG + INVALID | Time, min | Cost, $ |', '|' + '---|'.repeat(14)];
const details = [];
const cc = ids.filter(i => emitted(conv.cases[i].verdict)).length;
rows.push(`| **converter** | — | ${RSc.R.toFixed(1)} | ${RSc.S.toFixed(1)} | 100 | ${cc} | ${base.all} | 100 / 100 / 100 | — | — | — | 0 | — | — |`);
for (const c of cells) for (const [run, label] of RUNS) {
  const s = S(c + '-' + run), r = O(c + '-' + run), v = i => s.cases[i].verdict, rs = RS(s);
  const good = g => (g ? grp(g) : ids).filter(i => usable(v(i)));
  const skipRight = ids.filter(i => conv.cases[i].verdict === 'DRIFT' && v(i) === 'CORRECT-SKIP'), missed = ids.filter(i => usable(conv.cases[i].verdict) && !usable(v(i)) && !skipRight.includes(i)), ahead = ids.filter(i => usable(v(i)) && conv.cases[i].verdict === 'GAP'); // an exact chain exists, the converter misses it
  const bad = ids.filter(i => v(i) === 'WRONG' || v(i) === 'INVALID');
  rows.push(`| ${c.replace('-', ' / ')} | ${label} | ${rs.R.toFixed(1)} | ${rs.S.toFixed(1)} | ${Q(rs)} | ${ids.filter(i => emitted(v(i))).length} | ${good().length} | ${pc(good().length, base.all)} / ${pc(good('corpus').length, base.corpus)} / ${pc(good('spec').length, base.spec)} | ${missed.length} | ${skipRight.length} | ${ahead.length} | ${bad.length} | ${(r.wallMs / 6e4).toFixed(1)} | ${r.cli.total_cost_usd.toFixed(2)} |`);
  const lab = i => `${conv.cases[i].orig}`;
  for (const g of ['corpus', 'spec']) details.push(`${c} ${label} ${g}: missed ${missed.filter(i => conv.cases[i].group === g).map(lab).join(' ') || '—'} | ahead ${ahead.filter(i => conv.cases[i].group === g).map(lab).join(' ') || '—'} | wrong ${bad.filter(i => conv.cases[i].group === g).map(i => lab(i) + ':' + v(i)).join(' ') || '—'}`);
}
console.log(rows.join('\n'));
console.log(`\nScoring ${V2 ? 'v2 (WRONG / INVALID -1)' : 'v1 (WRONG / INVALID 0, as published)'}. Q = 100 × (0.4 × R / R_converter + 0.6 × S / S_converter).`);
console.log(`Checked: ${ids.length} locators (${grp('corpus').length} corpus, ${grp('spec').length} spec); converter usable ${base.all} (${base.corpus} corpus, ${base.spec} spec).`);
if (process.argv[2] === 'details') console.log('\n' + details.join('\n'));
