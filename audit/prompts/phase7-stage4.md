# Phase 7, stage 4: report and cleanup before the merge

You continue Phase 7 of the xpath-to-class-chain audit in a new session. Work in this repository, on the existing branch `docs/phase7-corpus-github` (draft PR #55). Do not merge into `main`: the user reviews the fixes and merges. Commit and push each step below separately.

## Context (read first)

- `audit/PLAN.md`, section "Phase 7 — GitHub corpus": the goal, the stages, the scoring decisions, the "Phase 7, stage 3 (device)" note, the cleanup list, and "Parked findings" (P1 open, P2 fixed).
- `audit/corpus/sources.md`: the 22 GitHub projects, languages, licenses, search counts.
- `audit/coverage-report.md`: "Progress since Phase 1" and the later phase sections, as models for structure and tone.
- `git log main..HEAD` and `git diff --stat main...HEAD`: what Phase 7 changed.

State after stage 3 (commits `e4002f9` … P2 fix):

- One corpus, `audit/corpus/ios-locators.json`: 1387 real locators (563 production CodeceptJS `L…` + 824 GitHub `G…`, 23 projects, 7 languages) and 115 edge cases. R 91.9 / C 85 % (1180 of 1386 in scope) / S 93.6, 0 WRONG. Production alone 96.0 (489 of 562), GitHub 89.1 (691 of 824). The README results table already shows these numbers.
- Converter and scanner fixes: stage 2 (six: `//XCUIElementTypeApplication` root, trailing `/`, absolute paths, the `[last()]` scanner gate, `android:` inside values, a raw newline), stage 3 (empty needle in `contains()` / `starts-with()` → skip), P2 (function text inside a string value is no longer rewritten). Each has regression rows in `xpath-to-class-chain.test.js`.
- Harness: `positional.js` and `planted.js` added; scoring v2 (WRONG / INVALID −1) and Q in `build.js`, `llm/score.js`, `llm/compare-v2.js`.
- Device: `audit/device/cases-p7.json` → `results-p7.json` (simulator, 22 cases, 0 differences).

**Scoring rule (user, 2026-10-21):** do not rescore past or published results. Phase 4 / D3 tables, charts, `docs/results.md` and the dev.to articles keep their numbers. Scoring v2 applies only to new results from the current converter on. Differences from the articles are fine.

## Steps

1. **Estimate first.** Give the user a time and usage estimate (about 30 min, about 6 % of the window for steps 2–4) and wait for a go.
2. **Report.** Add a "GitHub corpus (Phase 7)" section to `audit/coverage-report.md`, after the last phase section, in the report's style (short, tables, no marketing):
   - Setup: why (one team, one language), sources (link `corpus/sources.md`), corpus size by source and by language, how entries merged (ids, `project`, `lang`).
   - Results: total R / C / S, and a breakdown table by source (production / GitHub) and by language (in-scope, expressible, C %, CORRECT, DRIFT, skips, R). Compute it from `audit/coverage-cases.json` joined with the corpus by id; do not write numbers by hand. State that for the current converter R = R_max and C = C_max on these data, and why R fell from 96.0 (more per-parent `[n]` positions in GitHub code, half credit as documented DRIFT).
   - Fixes found: one table row per fix (form, what was wrong, how found: offline fuzz / planted / device, the regression test).
   - Device check (stage 3): the cases and outcomes table, power state, the Application root confirmation, the empty-needle WRONG. Keep it short; the details are in `PLAN.md`.
   - Scoring v2 and Q: one paragraph with the rule above (no rescoring of past results).
   - Add one line to "Progress since Phase 1" pointing at the section.
   Commit: `docs: Phase 7 report — GitHub corpus, fixes, device check`.
3. **Cleanup** (the list in `PLAN.md`, "Cleanup before the merge"):
   - Keep: the corpus, `sources.md`, `harvest.js` and `harvest-files.json` (the harvest tool and its pinned inputs), `scanner-misses.json` if the report cites it, the fixes and their tests, `positional.js`, `planted.js`, `cases-p7.json`, `results-p7.json`, the report and the README.
   - Check each file of `git diff --stat main...HEAD` against that list. Remove only one-off files the report does not need, and say which and why. Prompt files in `audit/prompts/` stay (earlier phases kept theirs).
   - Run `npm test` and `audit/harness/run.sh` (exit 0, "no changes vs baseline").
   - Mark the cleanup list in `PLAN.md` as done.
   Commit: `chore: Phase 7 cleanup before the merge`.
4. **PR.** The branch now holds code. Rename the PR title to `fix: Phase 7 — GitHub corpus, converter and scanner fixes, report` (`fix:`, not `docs:`), update its description (summary, numbers, fixes, how to review: the regression rows and the stage notes), and mark it ready for review (`gh pr ready 55`). Do not rename the branch: the PR keeps it. Do not merge.
5. **Stop and report** in Russian: what was written, what was removed, test and harness results, the PR link. Then list the next steps for the user (below).

## After this session (not in it)

- The user reviews PR #55 and merges it.
- **Release 1.0.3** in a separate session, only after the user's OK: a new branch from `main`, version `1.0.3` in `package.json` (no CHANGELOG file exists; the PR description lists the fixes, as PR #51 did for 1.0.2), PR, merge after the user's OK. The user runs `npm publish`.

## Rules

- Branch and PR as above. Never commit to `main`. Check `git branch --show-current` separately before each commit.
- One task per session: stop after step 5.
- Do not touch the published articles, `docs/results.md`, or the LLM tables and charts.
- Answer the user in Russian. Code, commits and repository documents are in English.
