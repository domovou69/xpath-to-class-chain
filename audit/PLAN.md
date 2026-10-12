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

| Task | What | Model / effort |
|---|---|---|
| D1 | harness R / S of the converter after A–C; report rows in "Progress since Phase 1" | Sonnet / medium (mechanical) |
| D2 | Phase 4 rescored with the new expectations from the stored answers, table updated; no new model runs | Sonnet / medium (mechanical) |
| D3 (optional, uses the usage limit) | the improved prompt from the Phase 4 report on 1–2 cells, e.g. sonnet / low and haiku / medium, scored like Phase 4; never `max` (Phase 4: no gain for the cost), top level `xhigh` if needed | session: Sonnet / medium; the measured runs: the cells chosen |

Order: A → B → C1 → C2 → D. Stages A and B do not touch the device; C1 needs the simulator.
