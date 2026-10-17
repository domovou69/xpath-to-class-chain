# Converter audit plan

The goal is one converter whose class chains find the same elements as the original XPath on the pinned platform. The pins are Appium 3.8.0, appium-xcuitest-driver 12.16.0 and WDA 16.14.1, as listed in [`prompts/coverage.md`](prompts/coverage.md). Progress is measured by a shareable score: R and C on the real corpus, S on the spec matrix.

## Phase 1 — audit and mini-WDA (done)

- [`coverage-report.md`](coverage-report.md) gives the baseline (R = 72.2, C = 86.9 %, S = 7.7) and the defects with their root causes (RC1–RC15, RC-S1–S3).
- [`coverage-cases.json`](coverage-cases.json) holds 684 cases with verdicts and evidence.
- [`harness/`](harness/) runs the converter's output and the original XPath against the same page sources in mini-WDA, which is WDA v16.14.1 code compiled for macOS. `./run.sh` reproduces the numbers and diffs them against `coverage-cases.json`. `check.js` checks a single locator against a saved page source. See its [README](harness/README.md).

Fixes follow the Phase 1 findings. Each fix lands in its own branch and PR:

1. Add a regression test for the root cause to `npm test`. It fails before the fix.
2. Fix the root cause.
3. Run `harness/run.sh`, then `./run.sh --update`.
4. Update the score in the report.

## Regression cases in `npm test` (selective)

Not all 684 cases are copied. Selected ones are added alongside each fix:

- one representative for each corpus shape;
- every case behind a WRONG verdict or a fixed GAP, so each root cause has a test;
- the documented DRIFT cases, so the README warnings stay true.

`npm test` stays fast, dependency-free and cross-platform. The full corpus and the semantic check (does the chain find the same element?) stay in `harness/`.

## Phase 2 — on-device verification (done)

Specified in [`prompts/coverage.md`](prompts/coverage.md#phase-2--on-device-verification-separate-session-only-on-request); results in the "Device verification" section of [`coverage-report.md`](coverage-report.md).

- [`device/`](device/) holds the LocatorLab SwiftUI app (XcodeGen), `run.js` and `results.json`. 246 cases ran twice on Appium 3.8.0 / xcuitest-driver 12.16.0 / WDA 16.14.1, Xcode 27.0, iOS 27.0 simulator (iPhone 17). See its [README](device/README.md).
- The device disagreed with mini-WDA on result order (XCTest returns matches breadth-first) and on `$…$` (it also tests the element itself). mini-WDA was corrected and `coverage-cases.json` updated: R = 92.3, C = 86.3 %, S = 54.5.
- New root causes:
  - **RC-D1.** Grouped positions `(//X)[n]` count in a different order than XPath (DRIFT, 29 corpus entries).
  - **RC-D2.** `[.//*[…]]` → `$…$` also matches the element itself (WRONG, F03). Fixed in `fix/rc-d2-descendant-self`: skipped unless both steps name different types; S = 57.5.

RC-D1 is documented in `fix/rc-d1-grouped-position` (README, plus a `warning` in the console and `--json` report): R = 95.3, S = 61.9. Phase 2b is done (below). As before, each further fix gets its own branch with the steps listed under Phase 1; re-run `device/run.js` after converter changes that affect positions or nested predicates.

## Phase 2b — real device (done)

Results in the "Real device (Phase 2b)" section of [`coverage-report.md`](coverage-report.md) and in [`device/results-device.json`](device/results-device.json).

- iPhone 13 Pro Max, iOS 26.6, same pins (Appium 3.8.0, xcuitest-driver 12.16.0, WDA 16.14.1), free Apple ID signing.
- All 246 outcomes are the same as on the simulator. No verdict or score changed. Lookups take about 2.2 times as long, and the XPath/chain ratio is the same (×1.14).
- `device/run.js` has a real-device mode (`devices` in `env.json`, `XCODE_ORG_ID`), saves after every screen, and has `--resume` and `--merge`.

## Phase 3 — lookup time vs. screen size (done)

Results in the "Lookup time vs. tree size (Phase 3)" section of [`coverage-report.md`](coverage-report.md); runner and data in [`device/`](device/README.md#scale-benchmark-phase-3).

- Class chain faster in all 240 lookups (simulator and iPhone 13 Pro Max, 100–2000 elements): 22–29 % per lookup at every size, 70 → 676 ms per lookup on the iPhone.
- No effect of locator shape or target position; `[1]` and `useFirstMatch` do not help; nothing below depth 50 is found.
- Deviations from the plan below: the deep branch is UIKit (SwiftUI merges single-child containers), page sources are read without `visible`, the simulator ran on AC and on battery, and a `--variants` run was added.

The plan as agreed:


Question: does class chain get faster than XPath as the tree grows? Phase 2b showed no total gain on LocatorLab's small screens (36–275 elements). XPath serializes the whole tree on every lookup, so the gap should widen on big screens.

**Screen.** One LocatorLab screen, `-screen scale -load 100|500|1000|2000`. The targets stay the same; only the background load around them changes. Background is iPhone-shaped. A plain `UINavigationController` drops earlier screens from the tree and SwiftUI drops `opacity(0)` views, so the load comes from what really stays in the tree on a phone:

| Group | Elements | Mimics | Tree position |
|---|---|---|---|
| G1 targets | 100 (always) | "Checkout": nav bar, product cards, cart, address form, a review thread ~40 levels deep | middle |
| G2 | +400 | screens underneath in a ZStack-based navigator (RN, custom routers): Home feed, Catalog | before targets |
| G3 | +500 | long non-lazy feed below the fold (recommendations, reviews) | after targets |
| G4 | +1000 | drawer mounted off-screen (category tree), tab-bar tabs kept alive | after targets (on top) |

- Element types follow the corpus mix (StaticText > Button > Other > TextField). Realistic shop labels.
- No background name equals a target; near-misses ("Add to wishlist" vs "Add to cart") make `contains` scan everything.
- Acceptance: page-source element count within ±2 % of the target size on the simulator.
- `scale-deep`: one element at absolute depth ~55 (WDA 16.14.1 `snapshotMaxDepth` = 50, `FBConfiguration.m:356`); records what XPath and chain return. Not timed.

**Locator shapes** (~340 of the corpus's 460 XPath locators, ~74 %):

1. `//T[@name="v"]` (115)
2. `//T[contains(@name,"v")]` (44)
3. `//*[contains(@type,"v") and contains(@label,"v")]` (36)
4. `//T[@label="v"]` (34)
5. `//*[contains(@type,"v") and contains(@name,"v")]` (28)
6. `//T[contains(@label,"v")]` (22)
7. `//*[contains(@name|@label,"v")]`, untyped (22)
8. `(//T[@name="v"])[n]` (20; RC-D1 warning; exactly 3 copies in G1)
9. `//*[@name="v" and @label="v"]`, untyped and typed (16)
10. `//*[contains(@name,"v")]/child::T[@name="v"]`, a path (3; exercises the deep branch)

Each shape is used on 3 targets: top of screen (shallow, early in traversal), deep branch (~40), end of G1. Chain `findElement` may stop at the first match; XPath always serializes the tree. That makes 30 lookups per size. `following-sibling` shapes are skipped by the converter and stay XPath.

**Timing.**
- One session per size, settle, then 3 passes of all 30 lookups. XPath/chain order alternates, no warm-up, every lookup cold on the current screen; median of 3.
- Before timing, XPath and chain must find the same element at every size; a point that fails is flagged and not timed.
- `getPageSource` time per size is recorded as the tree-serialization baseline.
- Simulator first, then the iPhone 13 Pro Max over USB.

**Deliverables.**
- Scale cases and runner in `device/`, plus `results-scale*.json`.
- A report section with size × shape × position, and a chart of lookup time vs. screen size.
- README instructions so others can run the benchmark on their devices.

## Phase 4 — plain LLMs vs the converter (done, see the report)

Question: how well do Haiku, Sonnet and Opus convert the same locators when simply asked to, with no tool and no extra knowledge, compared with the converter?

**Input.** `audit/llm/input.json`: the 678 locator cases of `coverage-cases.json` (563 corpus, 115 spec) as `{ id, xpath }`; the 6 scanner-context cases are source files, not locators, and are left out. The XPath is the runtime string the driver receives, so quoting in source code is not part of the test. The order is shuffled and the group (`corpus`/`spec`) is not shown to the models; it is kept in a separate key file for scoring.

**Run.** One task per model, as a user would give it: the whole file, "convert these XPath locators to iOS class chain". The same prompt for all models, stored in `audit/llm/prompt.md` and quoted in the report.
- Isolation: `claude -p` in an empty folder outside the repository, containing only `input.json`. Tools are limited to Read and Write; there is no web access, no repository, no project memory, and `--bare`. The model may split the work itself.
- Models: Haiku, Sonnet and Opus (latest) at every effort level (`low`, `medium`, `high`, `xhigh`, `max`), all levels for every model (a higher effort may also do worse). Unsupported levels are skipped and recorded.
- Stage 1: one run per cell, in waves from `low` upwards → results table (with the converter as the reference row).
- Stage 2: two more runs per cell → stability table: R and S of the 3 runs per cell (mean, min–max), and the share of cases whose verdict differs between runs.
- Recommendation: for each of the three models, the effort level that is optimal (best results for the time and cost).
- Output contract: JSON `[{ id, chain }]` or `[{ id, skip, reason }]`. A skip is allowed.
- Each run records model id, effort, date, wall time, tokens and cost (`--output-format json`) to `audit/llm/out/<model>-<run>.json`.

**One cycle (model × effort).**
1. A new empty temporary folder outside the repository; copy in `input.json` only.
2. `claude -p "<prompt>" --model <m> --effort <e> --tools Read,Write --bare --output-format json`, run in that folder. The model reads the file and writes `output.json`, in parts if it wants.
3. Save `output.json` and the CLI's metadata (model, effort, time, tokens, cost) as `audit/llm/out/<model>-<effort>-<run>.json`. A missing or broken file is a failed run, not fixed by hand.
4. Normalize mechanically only (e.g. strip a `-ios class chain:` prefix); ids not in the output are MISSING.
5. Score with the harness, as for the converter.
6. Add one row to the results table.

**Scoring.** The same oracle as the converter: `audit/harness` (WDA 16.14.1 parser, corrected after Phase 2). Verdicts:

| Verdict | Meaning |
|---|---|
| CORRECT | finds the same as the XPath |
| CORRECT-SKIP | skipped an inexpressible locator |
| GAP | skipped although expressible |
| DRIFT | differs in edge cases (order, positions) |
| WRONG | reported as converted but finds something else |
| INVALID | WDA rejects the chain |
| MISSING | id not in the output |

Scores R (corpus) and S (spec) from 0 to 100, C, and the WRONG / INVALID / MISSING counts, with the converter as the reference row. Efficiency: time, tokens and cost per run.

**Text analysis.** Opus (effort `high`) groups the errors by type and writes the findings from the scored results only; it does not grade.

**What changed during the run (2026-10-11/12).**
- `--bare` was dropped: in CLI 2.1.296 it accepts only an API key, and the runs used the account login. Isolation is the same otherwise: `--tools Read,Write`, `--setting-sources ""`, an empty MCP config, `--no-session-persistence`, a clean environment and an empty folder in the system temp dir.
- The prompt asks for the full locator with the `-ios class chain:` prefix; the scorer strips it and counts missing prefixes (there were none).
- One run per cell. `xhigh` was skipped for all models and Stage 2 (repeats) was not run, to stay within the account's usage limit. Opus / `max` was cut off by that limit after 460 of 678 answers and is left out of the comparison.
- Scoring rule for skips: a skipped locator with no exact class chain is CORRECT-SKIP and leaves that run's denominator (the report's "skip grouped positions" variant); `R=` / `S=` also give every row the converter's denominator. (Phase 5 A: only the fixed-denominator pair is kept, as R / S; E10 left out of the comparison.)

**Deliverables.** `audit/llm/` (input, key, prompt, runner, outputs, scores), a report section with the prompt, the results table, the per-model recommendation (the stability table is not made: Stage 2 was not run), the error analysis and conclusions, and a PR from branch `audit/llm-comparison`.

## Phase 5 — fixes from Phase 4 (planned)

Phase 4 showed exact chains the converter misses (all 24 of its GAPs, 5 DRIFTs with an exact form) and three problems in the harness's own expectations. Phase 5 fixes the harness first, then the converter in groups, checks the forms that depend on XCTest on the app before using them, and measures again. Case lists: `audit/llm/analysis/cross.md`, `analysis.md`.

Each task runs in its own session. Default model: **Opus, effort `medium`**. Exceptions are listed per task; the reason is in brackets.

### Stage A — harness expectations (no device)

| Task | What | Model / effort |
|---|---|---|
| A1 | H07: mark expressible, expected ``label MATCHES "[ab]{2}"``, proved by the harness | Opus / medium |
| A2 | E07 `(//X)[position()=2]` and E11 `(//Cell)[2]/Button`: judge like E02 (no exact chain; a chain like the converter's approximation is DRIFT, not WRONG) | Opus / medium |
| A3 | L157 (a class chain inside `//…[…]`, not an XPath): leave the corpus or mark it as such, out of every denominator | Opus / medium |
| A4 | `run.sh --update`, new baseline; rescore Phase 4 from the stored answers (`node audit/llm/score.js …`), no new model runs | Sonnet / medium (mechanical) |

### Stage B — converter fixes provable by the parser (mini-WDA)

One branch per group, as in Phase 1's fix branches; every fix is proved by the harness and gets tests.

| Task | Cases | Model / effort |
|---|---|---|
| B1 literals | G03 (`"` inside `'…'`), G14 (`]` in a literal), G04 (backtick doubled) | Sonnet / medium (narrow, well specified by the cases) |
| B2 logic | D07 `not(@a="v")`, D08 `and not(contains(…))`, L458 `not (` with a space | Sonnet / medium (same) |
| B3 unions and `self::` | X04, X05, X07, L355, L461, L455: one predicate joined with `OR`, `type ==` when the types differ | Opus / medium |
| B4 paths | A12 `.//X`; A07, A14, A15 (optimizer rule 1 drops steps: undocumented DRIFT); A16 (`visible` moved to the wrong step: a bug) | Opus / medium |
| B5 functions | C09 `concat()` of literals folded to one literal | Sonnet / medium |

### Stage C — check on the app first, then fix

C1 runs the locators on LocatorLab on the Phase 2 simulator (fixed UDID, local Appium in `audit/device`), with a few on the iPhone where the result depends on the device. Only what it confirms goes into the converter (C2); the rest stays a skip with a reason.

| Task | What | Model / effort |
|---|---|---|
| C1 forms only the models emit | `MATCHES` (H02, H03, C06), `[c]` / `==[c]` (C08, H04–H06), `.length` (C07), `$…$` for `descendant::` / `ancestor::` (F04, R01; risk of the element matching itself, as in RC-D2), `@enabled=true()` without a predicate (B16) | Opus / medium |
| C1 forms the converter already emits, marked doubtful | `value.doubleValue` (B03), rounding of `rect.x` (B04), `index` (B11), `hittable` (B14) | (same session) |
| C1 XPath behaviour on WDA | `//XCUIElementTypeAny` (A04); negative index `[-1]` for `last()` (E05, L270–L272): if its order matches, `last()` can be converted as DRIFT | (same session) |
| C2 | converter fixes for what C1 confirmed, one branch per group | Opus / medium |

### Stage D — measure again

Status (2026-10-12): A, B and C are done (PRs #15–#24; harness R 95.8 / C 87.0 % / S 92.0). C2 found one more fact that D depends on: NSPredicate compares normalized text (see D0). Agreed with the user: D2 is the minimum, D3 compares against the Phase 4 top 3, cheap models first.

| Task | What | Model / effort |
|---|---|---|
| D1 | `audit/harness/run.sh` on a clean main (about 90 s, no device, no models): confirm R / C / S against the last C2 row; add one summary row to "Progress since Phase 1" (Phase 1 baseline → now: R 72.2 → 95.8, S 7.7 → 92.0, GAP and DRIFT counts left over: H07, documented RC-D1 DRIFTs); list what is still skipped on purpose | Sonnet / medium (mechanical) |
| D2 (minimum) | In `audit/llm/score.js` add C06, C07 and B03 to `SPEC_NOT_EXPRESSIBLE` so that it agrees with `build.js`. Rescore only the three D3 cells from their stored answers (opus/low, sonnet/low, haiku/medium; about a minute each, no model runs) and print them next to the Phase 4 numbers. The Phase 4 table is not recomputed or rewritten; the other nine cells only if rescoring them costs nothing extra. Note that the H02 fixture now rejects the models' ``MATCHES "a.c"`` | Sonnet / medium (mechanical) |
| D0 | Device check of normalization on LocatorLab (simulator only): text that XPath treats as different but NSPredicate may fold. Fullwidth `Ｑ`, ligature `ﬁ`, `①`, `ſ`, `ß`, the Kelvin sign, decomposed `é` / `Å`, against `CONTAINS`, `BEGINSWITH`, `==`, `CONTAINS[c]`, `==[c]`, `MATCHES` (mini-WDA showed these on macOS; only U+00A0 is confirmed on the device). New strings on the `c1` screen (rebuild and reinstall LocatorLab), cases in a new case file, `run.js --cases`. Result: a table in "Device check" of the report, the README note "`MATCHES`, `[c]` and `CONTAINS` compare normalized text" corrected to what the device does, and the facts D3a needs. If the device folds nothing, the limit note shrinks to U+00A0 | Opus / medium |
| D3a | Rewrite the improved prompt in the report ("An improved prompt (not yet tested)") and `audit/llm/prompt.md` variant so that it matches what C1, C2 and D0 found. Remove the refuted advice: `normalize-space` → `MATCHES [ \t\r\n]`, `string-length` → `.length`, `matches()` → whole-string `MATCHES`, `@value>5` → `doubleValue`, `SKIP last()`. Add the confirmed forms: `matches()` plain → `CONTAINS` / `CONTAINS[c]`, other → ``MATCHES "(?s:.*)(?-s:p)(?s:.*)"`` (`.` and `$` of XPath; the chain's `MATCHES` is dot-all); `lower-case(x)="v"` → ``==[c]``; `contains(upper-case(x),"V")` / `contains(translate(x, A–Z, a–z),"v")` → ``CONTAINS[c]`` (ASCII); `(…)[last()]` → `[-1]`, `[last()-n]` → `[-(n+1)]` with the grouped-position caveat; `@enabled=true()` → no predicate; the `$` rule for `$…$`; SKIP for `normalize-space`, `string-length`, `>` on text, whitespace in `MATCHES` patterns; plus the D0 findings. General rules, no answers for single cases. Save as `audit/llm/prompt-v2.md`; the old `prompt.md` stays | Opus / medium |
| D3 (optional, uses the usage limit) | Run `prompt-v2.md` on the Phase 4 top 3, one run each: **haiku/medium, sonnet/low, opus/low**. Order: haiku, sonnet first (about $0.3 and $1; 5–6 min each), opus last and only if the window allows (about $2.3, 8–9 min; Phase 4 Opus cells cost $2–3). Never `max`, no `xhigh`. Score with the D2 scorer; table: Phase 4 prompt vs v2, per cell, same scorer, plus the converter row. User's window when planned: 24 % of the 5 h limit left, so run D3 after D1, D2, D0 and D3a, and after a reset if needed. Report section "Improved prompt (tested)" in the Phase 4 section: prompt, table, what changed per error type, conclusions | Session: Sonnet / medium; the measured runs: the cells above |

D3 done (2026-10-12), three prompt versions, one changed rule each: v2 (R 79.7–79.9: the `@type` SKIP rule), v3 (`@type` narrowed as the converter does: R 94.4–95.0), v4 (`contains(@enabled,"false")` → `enabled == false`): R 94.8 / 95.0 / 95.0, S 71.1 / 83.8 / 86.0, 95.7–96.7 % of the converter's usable chains, WRONG + INVALID 5 (haiku) / 0 / 0, nobody ahead of the converter; run-to-run noise about ±3 S. Report: "Improved prompt (tested)".

Order: D1 → D2 → D0 → D3a → D3 (D1 and D2 are cheap and need no device; D0 needs the simulator; D3a after D0 because the prompt depends on it). Each task in its own session, as before.

Order: A → B → C1 → C2 → D. Stages A and B do not touch the device; C1 needs the simulator.

## Phase 6 — upstream watch (planned)

**Status (2026-10-17): implemented** in `audit/upstream/` and `.github/workflows/upstream-watch.yml`, see [`audit/upstream/README.md`](upstream/README.md). Change from the plan: changed files are found by comparing the git trees of both tags, because the compare API lists at most 300 files (WDA 13.0.0 → 16.15.3 missed `FBXPathExtensions.m`); patches beyond that come from each commit. Large `driver.ts` and `core.ts` count only when the patch mentions locator strategies. Tests 1 and 2 passed with the local CLI (same model and effort): the real pair → not important; WDA 13.0.0 → important, with the commits linked. Tests in Actions (dispatch, issue, broken token) run after the merge, because `workflow_dispatch` needs the workflow on `main`.

Goal: once a month, find out whether a new Appium, appium-xcuitest-driver or WebDriverAgent release changed anything the converter depends on, and email the user only when it did. Agreed with the user on 2026-10-17. One session, about 1–1.5 h. Branch and PR as always.

**Manual check on 2026-10-17 (the first run of this logic, by hand).** Appium 3.8.0 is still the latest. The driver is at 12.18.1 (Duo multi-display, `asAppUnderTest`, screen recording, tvOS tunnels) and WDA at 16.15.3 (Duo gestures and scrolling, `/health`, MJPEG, app launch cleanup). `compare v16.14.1...v16.15.3` touches none of the files below, and the driver's own docs for the new `currentDisplayId` setting say "Page source and element lookup are not affected". Nothing to re-check. The automated job must reach the same verdict on this pair.

**Decisions**

- Analysis: **Claude Sonnet, effort `medium`**, through `anthropics/claude-code-action` with the user's subscription token (Pro plan; `claude setup-token`, valid one year), secret `CLAUDE_CODE_OAUTH_TOKEN`. No API key. A Gemini fallback is parked: add it only if Claude runs fail in practice.
- The report names the model and effort that did the analysis.
- Notification: a GitHub Issue (label `upstream`) only when the verdict is "important". GitHub emails the repo owner about the issue. No change, or a change judged unimportant, sends nothing.
- When unsure, the model must answer "important": an extra email is better than a missed break.
- Failures are loud: if the LLM step, the token or an API call fails, or the report is missing or invalid, the job fails, and GitHub emails the failure of a scheduled workflow. Silence means "checked, nothing important".
- No duplicates: if an open `upstream` issue already names the same latest versions, do not open another.

**Baseline file `audit/upstream.json`** (new, the single source of truth):

- `checked`: the versions last verified (Appium 3.8.0, driver 12.16.0, WDA 16.14.1, Xcode 27.0, iOS 27.0 sim / 26.6 iPhone) and the date. The job always compares `checked` → latest. After a re-check on the device, the user updates `checked` through a PR. README "Checked with", `docs/results.md` and `audit/harness/wda/VERSION` keep their text; the file says it is the one to update first.
- `watch`: the files per component.
  - **WDA** (`appium/WebDriverAgent`, `WebDriverAgentLib/`): the 12 files that mini-WDA compiles (`audit/harness/wda/fetch-wda.sh`: `Utilities/FBClassChainQueryParser.{h,m}`, `Routing/FBElement.h`, `Utilities/FBElementTypeTransformer.{h,m}`, `Routing/FBElementUtils.m`, `Utilities/FBXPathExtensions.{h,m}`, `Categories/NSExpression+FBFormat.{h,m}`, `Utilities/NSPredicate+FBFormat.{h,m}`). Add the lookup and page source code: `XCUIElement+FBClassChain.m`, `FBXPath.{h,m}`, `XCUIElement+FBFind.m`, `FBFindElementCommands.m`, the attribute getters (`XCUIElement+FBWebDriverAttributes.m`). Check each path exists at `v16.14.1`.
  - **Driver** (`appium/appium-xcuitest-driver`): `lib/commands/find.*`, `lib/commands/source.*`, the locator strategy list in `lib/driver.*` (`locatorStrategies`), and `docs/reference/settings.md` (settings that change lookup or page source). Check the paths at `v12.16.0`.
  - **Appium** (`appium/appium`): `packages/base-driver` code that validates and routes locator strategies (find helpers). Check the paths at `appium@3.8.0`.
  - Tags: WDA `vX.Y.Z`, driver `vX.Y.Z`, Appium `appium@X.Y.Z`. Verify with `gh api repos/<repo>/tags`.

**Files to add**

- `audit/upstream/check.js`: the deterministic part, Node 20+ with no dependencies.
  1. Read the latest versions from the npm registry.
  2. For each component that has a newer version, call `GET /repos/<repo>/compare/<checked>...<latest>` and keep the commits (title, URL) and the patches of the watched files.
  3. If no watched file changed, print "nothing to analyse" and exit 0.
  4. Otherwise write `out/upstream-input.md` with versions, commits with links, and patches. The compare API truncates large patches; then add the file URL and say so.
- `audit/upstream/prompt.md`: the analysis prompt.
  - Context: read `.claude/skills/xpath-to-class-chain/references/class-chain-rules.md`, `README.md` "What it does" and `audit/harness/README.md`.
  - Task: for each change, say whether it can change what a class chain or an XPath finds, the attributes and types the converter relies on, the parser grammar, `MATCHES`/`[c]`/normalization, result order, or "invalid selector" handling.
  - Output: `out/upstream-report.json` with `{ important: bool, model, effort, summary, items: [{ component, change, links[], impact, recheck }] }`.
- `audit/upstream/report.js`: validate the JSON. If `important`, build the issue body (summary, a table of items with links, versions `checked → latest`, the model) and run `gh issue create --label upstream`, after the duplicate check. If the JSON is missing or invalid, exit 1.
- `.github/workflows/upstream-watch.yml`:
  - triggers: `schedule` on the 1st of each month at 06:00 UTC, and `workflow_dispatch` with optional inputs `wda_base`, `driver_base`, `appium_base` (override `checked` for a test) and `dry_run` (print the issue body instead of creating it);
  - permissions: `contents: read`, `issues: write`;
  - steps: checkout → `check.js` → the Claude step, only if there is input (`claude_args: --model <sonnet id> --effort medium`, tools limited to Read/Grep/Glob/Write; the model does not run `gh` or commit) → `report.js`.
- Short README section in `audit/upstream/README.md`: what it watches, how to update `checked`, how to test.

**Test before the PR**

1. `node audit/upstream/check.js` locally with the real pair 16.14.1 → 16.15.3. Expect "nothing to analyse" for WDA, and the same for the driver 12.16.0 → 12.18.1, unless a watched driver file changed. If one did, the LLM verdict must be "not important".
2. `workflow_dispatch` with `wda_base` set to an old tag where `FBClassChainQueryParser.m` or `FBXPathExtensions.m` changed (find one with `gh api .../commits?path=…`) and `dry_run=true`: the body must name the change, link the commits and say what to re-check.
3. The same with `dry_run=false` once: the issue is created and the email arrives. Close the issue.
4. Break the token on purpose (wrong secret name in a branch run) and confirm the run fails and the failure email arrives.

**What the user does**

- `claude setup-token` locally, then copy the token into repo Settings → Secrets and variables → Actions → `CLAUDE_CODE_OAUTH_TOKEN`.
- Keep GitHub email notifications on for Issues and for Actions failures. Both are on by default.

**Later, only if needed:** a Gemini Flash fallback (second secret; the report names the model that ran), Xcode release notes as an input, and a PR from the job that bumps `checked`.

## Parked findings (not fixed)

Found after Phase 5 and written down to check in more detail later. Neither affects a valid locator or the R / S numbers.

- **P1 — XPath 2.0 syntax that WDA rejects comes out as `success` (2026-10-17).** WDA evaluates XPath with libxml2, which is XPath 1.0 plus the seven functions from `FBXPathExtensions.m` (`matches`, `ends-with`, `lower-case`, `upper-case`, `replace`, `tokenize`, `string-join`). Other XPath 2.0/3.0 syntax inside a predicate is copied into the chain and marked `success`, though both sides fail on WDA: mini-WDA (`check.js`) gives `InvalidXPath` for the XPath and `Unable to parse the format string` for the chain. So it is a broken locator turned into another broken locator, not a wrong chain for a valid one; the 678-locator corpus has none of these.

  | Input | Output (`status: success`) |
  |---|---|
  | `//*[@name eq "a"]` (also `ne`, `gt`) | ``**/*[`name != nil eq "a"`]`` |
  | `//*[@name=("a","b")]` | ``**/*[`name != nil=("a","b")`]`` |
  | `//*[(@name,@label)="a"]` | ``**/*[`(name,label != nil)="a"`]`` |
  | `//*[@name \|\| "a"]` | ``**/*[`name != nil \|\| "a"`]`` |
  | `//*[some $v in @name satisfies $v="a"]`, `castable as`, `instance of` | the text copied as is |

  Already skipped correctly: `except`, `intersect`, `if … then … else`, `replace`, `tokenize`, `string-join`.
  Possible fix: the validator rejects bare words and comma sequences that are not class chain syntax, with the reason "XPath 2.0 syntax: WDA evaluates XPath 1.0 (libxml2)"; plus regression rows for the forms above.
