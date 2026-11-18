# WebdriverIO selector optimizer, offline

Runs the "Native Mobile Selector Performance Optimizer" of `@wdio/appium-service` 10.2.0 (BETA, `trackSelectorPerformance`) on the device corpus without a device and checks each suggestion against the original XPath on every saved LocatorLab screen. The converter's chains for the same cases are checked the same way. Results: [`results.json`](results.json); summary in [`docs/results.md`](../../docs/results.md#webdriverio-selector-optimizer-offline).

## How the optimizer works (10.2.0)

At run time, for each XPath `$` / `$$` in the native context, the service:

1. reads the page source and runs the XPath on it in-process (`xpath` npm package, XPath 1.0, over the Appium page source with its `<AppiumAUT>` root);
2. if the XPath matches more than one element, it only logs a "may not be unique" warning with a suggestion and keeps the XPath (**MULTI** below);
3. otherwise it builds a selector from the first match's attributes: `~name` (or `~label`) if no other element has that name or label, else `-ios predicate string:type == '…'` plus `name`, `label`, `value` and then `enabled`/`visible`/`accessible`/`hittable == 'true'` until it is unique on this page source, else a class chain `**/Type[…]`. If nothing is unique, it still returns the last attempt with a warning;
4. runs that selector once; if it finds at least one element, the test gets **the selector's element**, and the report proposes the selector as a replacement in the code. The warning of step 3 is not logged in this path. If the selector finds nothing, the XPath result is used. Since WebdriverIO 10.0, `$` is strict by default (`strictSelectors`), so when the selector finds several elements `$` throws a `StrictSelectorError` that names the selector, not the XPath in the test; with `strictSelectors: false` `$` returns the selector's first element. 9.x has no strict `$`, and the 9.33.1 service has the same replacement code (read, not run live). `$$` is never strict.

The suggestion is built from one snapshot of one screen. Nothing checks that it finds the same element as the XPath, on this screen or any other.

## Method

```sh
cd audit/wdio
npm install          # @xmldom/xmldom 0.9.12 and xpath 0.0.36, the two libraries the optimizer code imports
node extract.js      # npm pack @wdio/appium-service@10.2.0 into out/pkg (integrity checked), cut the code out
node compare.mjs     # ~5 s; prints the summary and writes results.json
```

Needs the mini-WDA binary (`audit/harness/out/wdaemu`, built by `audit/harness/wda/build.sh`) and the page sources `audit/device/out/src-<screen>.xml` (git-ignored; saved by `audit/device/run.js`).

- **The optimizer code.** `convertXPathToOptimizedSelector` is not exported. `extract.js` copies the lines from `xpath-converter.ts` up to `optimization.ts` of `build/index.js` unchanged (the conversion, the uniqueness checks, the in-process XPath) and replaces only the two `@wdio/logger` imports with a silent stub. It is called as the service calls it: `convertXPathToOptimizedSelector(xpath, { browser: { getPageSource } })`.
- **Corpus.** The cases of `audit/device/cases.json`, `cases-c1.json`, `cases-d0.json` and `cases-p7.json` (433, all with a screen), with the runtime XPath strings recorded in their device runs (`results-recheck-2026-11.json`, `results-c1.json`, `results-d0.json`, `results-p7.json`). Each case gets the optimizer's suggestion on its own screen.
- **Lookups.** The XPath, the suggestion and the converter's chain run in mini-WDA on all 8 screens. mini-WDA gets the tree WDA queries, with the Application element as the root (the `<AppiumAUT>` wrapper removed). Selectors become class chains: `~x` → `**/*[`name == "x"`]` (WDA matches the accessibility id against `name`, the identifier or else the label); a predicate string `P` → `**/*[`P`]` (the same descendant query; it differs only for the Application root itself). mini-WDA is unchanged.
- **Comparison.** Same set of elements and same first element (what `$` returns), as in the harness. A WDA error counts as an empty result, because appium-xcuitest-driver swallows lookup errors.
- **The converter.** Its current output, prepared as `audit/device/run.js` does. The device outcome is reused where the recorded chain equals today's (22 c1/d0 cases were run with an older converter and are marked `stale`). mini-WDA agrees with the device on the case's own screen in 322 of 323 cases; the exception is B08 (`@selected`, which is not in the page source, a known mini-WDA limit).

## Classes

| Class | Meaning |
|---|---|
| `SAME_EVERYWHERE` | suggestion = XPath on all 8 screens |
| `SAME_HERE_DIFFERS_ELSEWHERE` | equal on its own screen, different on another: `missing` (the suggestion finds nothing where the XPath finds something, a loud failure), `extra` (finds something where the XPath finds nothing), `other` (both find different elements) |
| `DIFFERS_HERE` | different on its own screen. `runtime`: `replaced` (another first element: `$` returns another element), `extra matches` (same first element, `$$` gets more), `falls back to XPath` (finds nothing, the service keeps the XPath result) |
| `MULTI` | the XPath matched several elements; only a warning and a suggestion. `multiOwn` says what the suggestion would find if a user adopted it |
| `NULL` | no suggestion (the in-process XPath found nothing) |

The converter's classes are the same, plus `SKIP`. Scoring v2 per case: CORRECT 1, documented DRIFT 0.5, skip 0, WRONG −1. For the optimizer, `NULL`, `MULTI` and `falls back to XPath` are skips; `replaced`, `extra matches` and any difference elsewhere are WRONG. All converter differences are documented (RC-D1 positions and `last()`, RC-D4 text normalization, assumption A1 for the Application root).

## Limits

- The corpus was built for the converter: many cases are positions (`(//X)[2]`, `last()`), sibling axes, XPath 2.0 functions and normalization probes (D0, 126 cases on one screen). Real suites use these less often; the `corpus` category (131 cases from real test suites) is the closer estimate.
- Only 8 screens, each a separate state of one test app. A real app has more screens and states, so `SAME_HERE_DIFFERS_ELSEWHERE` is a lower bound for screens and an upper bound for how often one locator is used on several of them.
- The optimizer looks at one page-source snapshot during a run, not at a test suite. Elsewhere-differences matter when its suggestion is copied into the code, as its report proposes.
- The classes come from mini-WDA. The 47 suggestions where they matter most were also run on the simulator (see [Device check](#device-check)), with the same classes; the other suggestions were not. `~LL` for the Application root (A03~app-root) cannot be found by `**/*`, so it falls back in mini-WDA. With `~x` as `name == x OR label == x` instead of `name == x`, one case (L336) moves from `SAME_EVERYWHERE` to `SAME_HERE_DIFFERS_ELSEWHERE`.
- The live run covers 4 cases on 2 screens, enough to show the mechanism, not to measure it.

## Device check

`device.mjs` runs the XPath and the optimizer's own selector (`~x` as accessibility id, the predicate string, the class chain, as the service sends them) through Appium on all 8 screens of the LocatorLab simulator of [`audit/device`](../device/README.md) (Appium 3.9.0, appium-xcuitest-driver 12.22.8, WDA 16.17.7, iOS 27.0; the versions are in `device.json`). It compares elements by type, name, label, value and rect and classifies them as `compare.mjs` does.

```sh
cd audit/wdio
node device.mjs            # ~10 min → device.json, saved after every screen
node device.mjs --resume   # continue an interrupted run
node compare.mjs           # adds onDevice to results.json
```

It covers the 47 suggestions mini-WDA could not judge or that change the element at run time: all 18 with `== 'true'`, all 6 with a raw newline in a value, the 13 `replaced` and the 10 `extra matches`. **The simulator gives the same class as mini-WDA for all 47**, so no number changes:

- `enabled == 'true'` finds nothing on WDA too (NSPredicate does not match the BOOL against the string `'true'`; `enabled == true` finds the element). The 3 cases fall back to the XPath; the 15 `MULTI` suggestions would find nothing if adopted.
- A raw newline inside `'…'` is a WDA error ("Unable to parse the format string"), which appium-xcuitest-driver turns into an empty result. The 4 cases fall back; the 2 `MULTI` suggestions would find nothing.
- All 13 `replaced` return another first element, and all 10 `extra matches` return more elements, as in mini-WDA.

## Live run

[`live/`](live) is a minimal WebdriverIO 10.2.0 project (`@wdio/cli`, `@wdio/local-runner`, `@wdio/mocha-framework`, `@wdio/spec-reporter`, `@wdio/appium-service`, Appium 3.9.0, exact versions in `package-lock.json`) with `trackSelectorPerformance` on. The service starts its own Appium on port 4724 with the xcuitest driver of `audit/device`; the simulator is the one in `audit/device/env.json` (or `UDID`). The installed `@wdio/appium-service/build/index.js` is byte-identical to the file `extract.js` cuts the code from.

```sh
cd audit/wdio/live
npm ci
npm test                     # default config (strict `$`) → result-default.json
npm run test:strict-off      # strictSelectors: false   → result-strict-off.json
npm run test:no-report-path  # outputDir only, no reportPath (webdriverio #16311)
```

The spec calls `$` / `$$` on four XPaths and compares what they return with what the same XPath finds through the raw `findElements` command, which the optimizer does not touch:

| Case | XPath finds | Default (`$` strict) | `strictSelectors: false` |
| --- | --- | --- | --- |
| L032 `//*[@label="Leba" and @enabled="false"]` (states) | the disabled "Leba" | `StrictSelectorError` for `type == 'XCUIElementTypeButton' AND name == 'Leba'` (2 elements) | the enabled "Leba" |
| P7-APP2 `…/XCUIElementTypeTable/XCUIElementTypeCell[2]/XCUIElementTypeButton` (states, from a GitHub suite) | "Open" in row 2 | `StrictSelectorError` (2 elements) | "Open" in row 1 |
| A14 `//XCUIElementTypeWindow/XCUIElementTypeOther/XCUIElementTypeButton[@name="Close"]` (nesting) | one "Close" | `StrictSelectorError` (3 elements) | another "Close" |
| L158 `$$('//*[@name="HaguhoCuzal.marivoDigivo" and @enabled="false"]')` (states) | 1 disabled button | 2: the disabled one and its enabled twin | the same |

- Nothing in the log says the element may be another one: the optimizer logs at INFO ("Optimized selector found element", then "Consider using the optimized selector …"); its "Selector may match multiple elements" warning is not logged in this path. The end-of-run report lists the three `$` selectors under "File-Based Fixes" as replacements for the XPath lines.
- With the default config the three `$` tests fail with an error about a selector that is not in the test. The `$$` test passes with an extra element.
- Without `reportPath` the worker does not start ("FAILED (1 retries)" after 0 s); the reason, `SevereServiceError: Mobile Selector Performance Optimizer: JSON report cannot be created`, is only in `out/logs/`, although `outputDir` is set (webdriverio #16311: the worker service gets the capabilities as its config). Setting `reportPath` works around it.

`result-*.json` hold the type, name, label, `enabled` and rect of each element. Logs and the optimizer's report go to `out/` (git-ignored).
