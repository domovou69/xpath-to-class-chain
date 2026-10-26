# Project rules

## README.md is the npm page

`README.md` ships in the npm package and is the page users see on npmjs.com. Keep it short and practical: what the tool does, how to run it, one example, the key results in a few lines, the versions checked, the library call, links to the docs, the license.

Everything else goes to `docs/`: full result tables and per-source breakdowns, LLM comparisons, articles, the Claude Code skill, device findings, flags, the report format. Link to it from the README's "Documentation" list instead of copying it.

When a phase or a release adds results, update `docs/` first; touch the README only if one of its few headline numbers changes.

## Scope of fixes

A fix must be worth the code it adds: every special case makes the converter harder to read, and the fixes themselves have caused more regressions than they removed (code reviews 1 and 2, PRs #70–#83: five of eight findings in review 2 were regressions of review 1).

- Fix now only what gives a silently wrong result (a broken or changed locator reported as `success`, a file written wrongly) on realistic input, or a crash. Show it with an input a real test suite could contain.
- Anything else (a vague skip reason, a rare construction, performance on absurd sizes, code that could be tidier) goes to `docs/known-issues.md` with a priority, a note on whether the corpus hits it and when to fix it. A finding that only a synthetic input reproduces goes there by default.
- Fix-on-touch: a listed item is fixed together with a change that already edits that code.
- One review round per change set. Review the fixes of a review only when one of them is P1.
- A refactor needs a result the user can see (fewer wrong outputs, faster, smaller); "cleaner" alone does not count.

## Changes

- A new branch and a PR for every change, never a commit on `main`.
- Commit messages carry no `Co-Authored-By` line. Claude Code is credited once, in the PR description (the closing "Generated with Claude Code" line). The repository squash-merges with the PR title and description as the commit message, so the individual commit messages do not pile up in `main`.
- Release: a PR that bumps `version` in `package.json` and lists the fixes in its description (no CHANGELOG file); after the merge, an annotated tag `vX.Y.Z` on the merge commit. The user runs `npm publish`.

## Task board

Work is tracked on the GitHub Project board (https://github.com/users/domovou69/projects/1); the maintainer does not fill it by hand.

- A finding becomes an issue (label `P2` or `P3`) only after the maintainer confirms it; the agent proposes, the maintainer says yes. A P1 finding gets an issue automatically. A row in `docs/known-issues.md` carries its `#N` once the issue exists.
- Every PR description has `Closes #N` (or `Refs #N`) when an issue exists. The board's built-in workflows move the card to Done on merge.
- When a stage starts, set `Window`, `Model`, `Effort`, `Est %`, `Est min` with `scripts/board.sh <N> --window … --model … --effort … --est-pct … --est-min …`. `Est %` is a theoretical figure. When the stage ends, set `Actual %` and `Actual min`: a real figure if one is available (the maintainer's `/usage`), otherwise the agent's estimate. The values are approximate; high precision is not needed.
