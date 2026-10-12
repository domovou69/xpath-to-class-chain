# Phase 4: plain LLMs vs the converter

Haiku, Sonnet and Opus convert the 678 locators of `../coverage-cases.json` when simply asked to. Their answers are scored with the coverage harness, the same way as the converter. Results and conclusions: [`../coverage-report.md`](../coverage-report.md#plain-llms-vs-the-converter-phase-4); the v2 prompt test: [Improved prompt (tested)](../coverage-report.md#improved-prompt-tested).

| File | Role |
|---|---|
| `prompt-v2.md`, `prompt-v3.md`, `prompt-v4.md`, `prompt-v4-run.md`, `make-run-prompt.js` | D3: the rules of v2, v3 and v4 (rules only; each version changes one rule of the previous); the runnable prompt = Phase 4 task text + rules + output format, built by `node make-run-prompt.js prompt-v4.md prompt-v4-run.md`. `PROMPT=$PWD/prompt-v4-run.md node run.js <model> <effort> 3` → `out/<model>-<effort>-3.json` (run 2 = v3, run 3 = v4; v2 runs are not kept) |
| `compare-v2.js` | D3 table (`BASELINE=1 RUN=3 node compare-v2.js`; BASELINE=1 adds the plain Phase 4 run of each cell): the converter and the cells of that run, each counted against the converter; `details` lists the case ids |
| `build-input.js` | Builds `input.json` (shuffled `{ id, xpath }`, runtime strings) and `key.json` (original id, group, baseline verdict) |
| `prompt.md` | The prompt every run gets |
| `run.js` | One run: `node run.js <haiku\|sonnet\|opus> <effort> <run>` in an empty temp folder → `out/<model>-<effort>-<run>.json` |
| `stage.sh` | Waves of runs from `low` to `max`, three models in parallel, each scored on finish. `EFFORTS="low max"` limits the levels; `touch STOP` pauses before the next wave |
| `score.js` | Scores outputs with mini-WDA (`../harness/out/wdaemu`, built by `../harness/wda/build.sh`) → `scores/<name>.json`. `node score.js --converter` scores the converter on the same input |
| `table.js` | The results table (Markdown) |
| `analyze.js` | Cross tables and `analysis/errors.json` |
| `analysis/` | `run.js` + `prompt.md`: the text analysis by Opus; `analysis.md` is its output |
| `out/`, `scores/` | Raw run records (CLI metadata, merged output) and per-case verdicts. `out/failed/` holds two runs that failed for reasons outside the model (session limit, network) and were rerun |
| `stage1.log` | Log of the runs |

Requirements: those of `../harness`, plus the Claude Code CLI. `run.js` looks for the binary bundled with the VS Code extension; set `CLAUDE_BIN` to use another. Scoring one run takes about a minute.
