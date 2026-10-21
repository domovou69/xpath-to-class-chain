# Phase 7, stage 3: device check (cheap variant)

You continue Phase 7 of the xpath-to-class-chain audit in a new session. Work in this repository, on the existing branch `docs/phase7-corpus-github` (draft PR #55). Do not merge into `main` and do not open a new branch. Make one commit for this stage and push it.

## Context (read first)

- `audit/PLAN.md`, section "Phase 7 — GitHub corpus": the goal, the stages, the scoring decisions (scoring v2: WRONG / INVALID −1; Q), and the cleanup list.
- `audit/corpus/sources.md`: what the GitHub corpus is (ids `G0001…`, 22 projects).
- `audit/device/README.md`: how device runs work. One session per screen; the screen is chosen by the `-screen` launch argument; a case may list `candidates`; the outcomes are `EQUAL`, `NONE`, etc.
- The coverage-report sections "Device verification" (Phase 2) and "Device check (Phase 5, C1)", as models for cases and write-up.

Stages 1–2 are done (commits `e4002f9`, `b1dbb1d`, `4b78023`). The offline check found and fixed three converter bugs, among them `//XCUIElementTypeApplication/…`, which became `**/XCUIElementTypeApplication/…` and never matched the root. Two harness steps were added: `positional.js` and `planted.js`. The corpus has 0 WRONG; R is 91.9 and S 93.6.

## What this stage checks (cheap variant, agreed with the user)

Only two things, both on the simulator:

1. **The Application root fix.** It is new converter behavior, and mini-WDA alone supports it.
   - `//XCUIElementTypeApplication/XCUIElementTypeWindow[1]/…` (a real path on a LocatorLab screen, taken from that screen's page source) → the converter's chain `XCUIElementTypeWindow[1]/…`. Add the old chain `**/XCUIElementTypeApplication/XCUIElementTypeWindow[1]/…` as a candidate: it should find nothing on the device, which confirms the bug.
   - `//XCUIElementTypeApplication[1]/…` and `//XCUIElementTypeApplication//XCUIElementTypeButton[@name="…"]` → `**/XCUIElementTypeButton[…]`.
   - One absolute `/XCUIElementTypeApplication/XCUIElementTypeWindow/…` for comparison (Phase 2 A07 is the same form).
2. **Attributes that fuzz cannot test.** The random and planted trees never generate these attributes, so the following entries are CORRECT in the harness without a single match (see `audit/harness/out/planted-verdict.json`, `NO_MATCH` / `NO_SPINE`):
   - `@height > 10` → `rect.height > 10`: G1816–G1819. One plain form (`//StaticText[@height > 10 and (@name=… or @label=… or @value=…)]`) and one with the descendant predicate (`//Cell[@height > 10][.//StaticText[…]]`).
   - `@y > 600` → `rect.y > 600`: G1475 (a button, with name / label alternatives).
   - `contains(@traits, "…")` → `traits CONTAINS "…"`: G0235. Find out on the device what `traits` holds for a cell or button (see the page source) and use a real value.
   - `@placeholderValue="…"` → `placeholderValue == "…"`: G1825, on a text field with a placeholder.

Keep the XPath structure of each corpus entry and change only the values, so that they match the app. `make-cases.js` documents the same rule. Convert each XPath with the current converter (`convertXpathToClassChain(x, { optimize: true })`) and do not write chains by hand. Add a near-miss case for each attribute (a threshold just above the real value, another placeholder), so that a match is not vacuous.

## Steps

1. **Estimate first.** Give the user a time and usage estimate before running anything heavy (about 20 min, about 4–5 % of the window). If the app needs a new screen, say so, with the extra time, before you build.
2. **Environment.** Use the fixed simulator only: `LocatorLab iPhone 17`, UDID `208FA758-C937-49C4-ADE6-E16B0D7E0630`, local Appium in `audit/device` (`APPIUM_HOME=$PWD/.appium`). Never create a new simulator; if it is missing, ask the user. Run `node run.js --smoke` first.
3. **Fixtures.** Look at the page sources of the existing screens (`identity`, `functions`, `siblings`, `lists`, `states`, `nesting`, `modal`, `c1`) and use them if they hold a text field with a placeholder, cells with a known height, and elements below y = 600. Only if something is missing, add a small `p7` screen to `LocatorLab/Screens.swift` and rebuild, as C1 did with `c1`.
4. **Cases.** Write `audit/device/cases-p7.json`, with the case fields as in `cases-c1.json` plus `candidates` for the old Application chain. If you need a script for this (`make-cases-p7.js`), it is a one-off: put it on the cleanup list in `audit/PLAN.md`.
5. **Run.** `node run.js --cases cases-p7.json --out results-p7.json`. Record the host's power state (AC or battery, Low Power Mode) next to any timing, as for Phases 3 and 5.
6. **Read the results.**
   - `EQUAL` with matches → confirmed. Note it in the harness: in `build.js`, the CORRECT note of those G entries can say "device: EQUAL (Phase 7 stage 3)".
   - The old Application chain finds nothing while the XPath finds the element → the bug is confirmed on the device.
   - Any difference on a converted chain is a WRONG. Find the cause (attribute mapping, number vs string, a value WDA reports differently). Fix the converter with a regression test in `xpath-to-class-chain.test.js`, rerun `npm test` and `audit/harness/run.sh` (exit 0), and repeat the device case.
   - `NONE` on both sides means a fixture problem, not a verdict. Fix the values.
7. **Record.** Add a short "Phase 7, stage 3 (device)" note to `audit/PLAN.md` under Phase 7: what ran, the outcomes, and fixes, if any. The full write-up goes into `coverage-report.md` in stage 4; do not write it now.
8. **Commit.** Check the branch separately first (`git branch --show-current` must print `docs/phase7-corpus-github`). Then make one commit, "audit: Phase 7 stage 3 — device check of the Application root and untested attributes", and push it.

## Rules

- Branch and PR as above. Never commit to `main`.
- One task per session. When this stage is done, stop and report: a table of the cases with their outcomes, fixes if any, the power state, and what is left for stage 4 (report).
- Do not touch the published articles or the LLM tables. That is a separate later task in `audit/PLAN.md`.
- Answer the user in Russian. Code, commits and repository documents are in English.
