#!/bin/sh
# Full Phase-1 pipeline. Usage: ./run.sh [--update]   (--update rewrites audit/coverage-cases.json)
set -e
cd "$(dirname "$0")"
OUT=${HARNESS_OUT:-out}; mkdir -p "$OUT"
./wda/build.sh                                                   # → $OUT/wdaemu
node selftest.js                                                 # mini-WDA vs WDA's own FBClassChainTests
COARSE=1 node shapes.js --json > "$OUT/coarse.json"              # corpus grouped by shape (used by build.js)
node shapes.js > "$OUT/shapes.txt"                               # fine-grained shapes, human-readable
TRIALS=200 DIRECTED=1 RESULT=fuzzresults_directed.json node fuzz.js   # corpus: converter output vs XPath
node positional.js                                               # flagged entries re-fuzzed without positions (Phase 7)
node planted.js                                                  # entries that never matched, re-fuzzed with their path planted (Phase 7)
TRIALS=300 DIRECTED=1 GAPS=1 RESULT=gapresults.json node fuzz.js      # GAP entries: hand-written expected chains vs XPath
node spec.js > "$OUT/spec.txt"                                   # spec matrix A–H, R, X
node contexts.js                                                 # scanner over audit/corpus/contexts (copy)
node perf.js > "$OUT/perf.txt"                                   # crash / super-linear time probe
node build.js "$@"                                               # verdicts, R / C / S, diff vs baseline
node table.js > "$OUT/shapes_table.md"
node spectable.js > "$OUT/spec_table.md"
