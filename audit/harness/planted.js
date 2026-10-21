// Planted check (Phase 7): corpus entries whose random trees never matched (fuzz hits 0: long paths from the
// root, deep chains) are fuzzed again with their own path planted in the tree (fuzz.js PLANT=1). A planted
// difference is re-run with every position removed: if that is EQUAL, the position alone differs (per-parent
// [n] read as global [n], E01) and build.js scores a documented DRIFT, as positional.js does.
// Writes $OUT/planted-verdict.json: { id: { verdict: 'EQUAL' | 'POSITIONAL' | 'NO_MATCH' | <outcome>, hits, trials, example } }.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { ROOT, out } = require('./paths');
const corpus = require(path.join(ROOT, 'audit/corpus/ios-locators.json'));
const fuzz = require(out('fuzzresults_directed.json'));

const POSITION = /\[\s*(\d+|last\(\)(\s*-\s*\d+)?)\s*\]/;
const strip = (s) => {
  let t = s.replace(new RegExp(POSITION.source, 'g'), '');
  if (/^\(.*\)$/.test(t)) t = t.slice(1, -1);
  return t;
};
const byId = (res) => {
  const m = {};
  for (const [k, b] of Object.entries(res)) (m[k.split('~')[0]] ??= []).push(b);
  return m;
};
const outcome = (bs) => (bs.find((b) => b.outcome !== 'EQUAL') || bs[0]).outcome;
const runFuzz = (corpusFile, result) => execFileSync(process.execPath, [path.join(__dirname, 'fuzz.js')], {
  env: { ...process.env, CORPUS: corpusFile, RESULT: result, TRIALS: '200', DIRECTED: '1', PLANT: '1' },
  stdio: ['ignore', 'ignore', 'ignore'],
});

const zero = Object.entries(byId(fuzz)).filter(([, bs]) => bs.every((b) => b.outcome === 'EQUAL') && Math.max(...bs.map((b) => b.hits)) === 0).map(([id]) => id);
fs.writeFileSync(out('planted-corpus.json'), JSON.stringify(corpus.filter((x) => zero.includes(x.id))));
runFuzz(out('planted-corpus.json'), 'planted-fuzz.json');
const planted = byId(require(out('planted-fuzz.json')));

const differ = Object.entries(planted).filter(([id, bs]) => outcome(bs) !== 'EQUAL' && POSITION.test(corpus.find((x) => x.id === id).source)).map(([id]) => id);
fs.writeFileSync(out('planted-positional-corpus.json'), JSON.stringify(corpus.filter((x) => differ.includes(x.id)).map((x) => ({ ...x, source: strip(x.source) }))));
if (differ.length) runFuzz(out('planted-positional-corpus.json'), 'planted-positional-fuzz.json');
const stripped = differ.length ? byId(require(out('planted-positional-fuzz.json'))) : {};

const verdict = {};
for (const id of zero) {
  const bs = planted[id];
  if (!bs) { verdict[id] = { verdict: 'NO_SPINE' }; continue; }
  const hits = Math.min(...bs.map((b) => b.hits)), trials = bs.reduce((a, b) => a + b.trials, 0);
  const o = outcome(bs), example = (bs.find((b) => b.example) || {}).example || null;
  if (o === 'EQUAL') verdict[id] = { verdict: hits > 0 ? 'EQUAL' : 'NO_MATCH', hits, trials };
  else if (stripped[id] && stripped[id].every((b) => b.outcome === 'EQUAL')) verdict[id] = { verdict: 'POSITIONAL', hits, trials, example };
  else verdict[id] = { verdict: o, hits, trials, example };
}
fs.writeFileSync(out('planted-verdict.json'), JSON.stringify(verdict, null, 1));
const tally = {};
for (const v of Object.values(verdict)) tally[v.verdict] = (tally[v.verdict] || 0) + 1;
console.log(`planted: ${zero.length} entries with no match in random trees →`, tally);
