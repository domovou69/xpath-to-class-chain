#!/bin/sh
# Runs one stage of Phase 4: for each run number, waves from low to max effort;
# in each wave the three models run in parallel, then each output is scored.
# Usage: ./stage.sh <run> [<run> …]     e.g. ./stage.sh 1   (Stage 1)   ./stage.sh 2 3   (Stage 2)
# Existing out/<model>-<effort>-<run>.json files are kept (a stage can be resumed).
# EFFORTS="high max" limits the waves. `touch STOP` pauses before the next wave (e.g. near a usage limit); remove it and rerun to resume.
cd "$(dirname "$0")"
mkdir -p out scores
for run in "$@"; do
  for effort in ${EFFORTS:-low medium high xhigh max}; do
    if [ -f STOP ]; then echo "$(date '+%F %T') paused (STOP file) before run=$run effort=$effort"; exit 0; fi
    echo "$(date '+%F %T') wave run=$run effort=$effort"
    for model in haiku sonnet opus; do
      f="out/$model-$effort-$run.json"
      if [ -f "$f" ]; then echo "  skip $f (exists)"; continue; fi
      ( node run.js "$model" "$effort" "$run" && node score.js "$f" ) 2>&1 | sed "s/^/  [$model] /" &
    done
    wait
  done
done
echo "$(date '+%F %T') done"
