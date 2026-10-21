# Project rules

## README.md is the npm page

`README.md` ships in the npm package and is the page users see on npmjs.com. Keep it short and practical: what the tool does, how to run it, one example, the key results in a few lines, the versions checked, the library call, links to the docs, the license.

Everything else goes to `docs/`: full result tables and per-source breakdowns, LLM comparisons, articles, the Claude Code skill, device findings, flags, the report format. Link to it from the README's "Documentation" list instead of copying it.

When a phase or a release adds results, update `docs/` first; touch the README only if one of its few headline numbers changes.

## Changes

- A new branch and a PR for every change, never a commit on `main`.
- Release: a PR that bumps `version` in `package.json` and lists the fixes in its description (no CHANGELOG file); after the merge, an annotated tag `vX.Y.Z` on the merge commit. The user runs `npm publish`.
