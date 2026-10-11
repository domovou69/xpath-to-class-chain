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

## Phase 3 — lookup time vs. screen size (in progress)

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
