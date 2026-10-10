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

Next: RC-D1 (decided: keep converting, document in the README and flag in the `--json` report), in its own branch with the steps listed under Phase 1; re-run `device/run.js` after converter changes that affect positions or nested predicates.

## Phase 2b — real device (planned)

Repeat the device run on a physical iPhone 13 Pro Max with the same `device/cases.json`, so simulator and hardware can be compared.

- Prerequisites:
  - an Apple development team for signing: `DEVELOPMENT_TEAM` in `device/project.yml` for LocatorLab, and `appium:xcodeOrgId` / `appium:xcodeSigningId` / `appium:updatedWDABundleId` for WDA;
  - the phone in developer mode, trusted by this Mac;
  - an iOS version that Xcode 27.0 supports.
- Pins stay as they are (Appium 3.8.0, xcuitest-driver 12.16.0, WDA 16.14.1). Record the iOS version and model in `results.json`/`env.json` (a second env entry, keyed by UDID).
- Run twice (`--diff`), check the outcomes against the simulator run, and compare timings with `run.js --compare device/results.json <device run>`.
- Watch in particular:
  - the breadth-first result order (RC-D1);
  - `$…$` including the element itself (RC-D2);
  - `visible` on off-screen cells;
  - lookup times on real hardware.

