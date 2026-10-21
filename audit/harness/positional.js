// Positional check (Phase 7): for every corpus entry whose fuzz result is not EQUAL and whose XPath has a
// position ([n], [last()], [last()-n], or a grouped (…)[n]), fuzz the same XPath with every position removed.
// If that variant is EQUAL, the difference comes from the position alone: per-parent [n] read as global [n]
// (E01, README) or the grouped position (RC-D1). build.js scores those as documented DRIFT.
// Writes $OUT/positional.json: { id: 'EQUAL' | <outcome of the stripped variant> }.
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

const flagged = new Set();
for (const [k, b] of Object.entries(fuzz)) if (b.outcome !== 'EQUAL' && b.outcome !== 'CC_ERROR' && b.outcome !== 'XPATH_ERROR') flagged.add(k.split('~')[0]);
const variants = corpus.filter((x) => flagged.has(x.id) && POSITION.test(x.source))
  .map((x) => ({ ...x, source: strip(x.source) }));
fs.writeFileSync(out('positional-corpus.json'), JSON.stringify(variants));
execFileSync(process.execPath, [path.join(__dirname, 'fuzz.js')], {
  env: { ...process.env, CORPUS: out('positional-corpus.json'), RESULT: 'positional-fuzz.json', TRIALS: '200', DIRECTED: '1' },
  stdio: ['ignore', 'ignore', 'ignore'],
});
const res = require(out('positional-fuzz.json'));
const verdict = {};
for (const x of variants) {
  const outs = Object.entries(res).filter(([k]) => k.split('~')[0] === x.id).map(([, b]) => b.outcome);
  verdict[x.id] = outs.length && outs.every((o) => o === 'EQUAL') ? 'EQUAL' : (outs.find((o) => o !== 'EQUAL') || 'NOT_RUN');
}
fs.writeFileSync(out('positional.json'), JSON.stringify(verdict, null, 1));
const n = Object.values(verdict).filter((v) => v === 'EQUAL').length;
console.log(`positional: ${n} of ${variants.length} flagged entries are EQUAL without their positions`);
