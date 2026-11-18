# WebdriverIO selector optimizer, offline

Runs the "Native Mobile Selector Performance Optimizer" of `@wdio/appium-service` 10.2.0 (BETA, `trackSelectorPerformance`) on the device corpus without a device and checks each suggestion against the original XPath on every saved LocatorLab screen. The converter's chains for the same cases are checked the same way. Results: [`results.json`](results.json); summary in [`docs/results.md`](../../docs/results.md#webdriverio-selector-optimizer-offline).

## How the optimizer works (10.2.0)

At run time, for each XPath `$` / `$$` in the native context, the service:

1. reads the page source and runs the XPath on it in-process (`xpath` npm package, XPath 1.0, over the Appium page source with its `<AppiumAUT>` root);
2. if the XPath matches more than one element, it only logs a "may not be unique" warning with a suggestion and keeps the XPath (**MULTI** below);
3. otherwise it builds a selector from the first match's attributes: `~name` (or `~label`) if no other element has that name or label, else `-ios predicate string:type == '…'` plus `name`, `label`, `value` and then `enabled`/`visible`/`accessible`/`hittable == 'true'` until it is unique on this page source, else a class chain `**/Type[…]`. If nothing is unique, it still returns the last attempt with a warning;
4. runs that selector once; if it finds at least one element, the test gets **the selector's element**, and the report proposes the selector as a replacement in the code. The warning of step 3 is not logged in this path. If the selector finds nothing, the XPath result is used.

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
- Offline: mini-WDA, not a device. Two suggestion forms are not checked on a device: `enabled == 'true'` (NSPredicate does not match a BOOL attribute against the string `'true'`, so mini-WDA finds nothing; 3 cases fall back) and values with a raw newline inside `'…'` (NSPredicate cannot parse it; 4 cases fall back). `~LL` for the Application root (A03~app-root) cannot be found by `**/*`, so it falls back too. With `~x` as `name == x OR label == x` instead of `name == x`, one case (L336) moves from `SAME_EVERYWHERE` to `SAME_HERE_DIFFERS_ELSEWHERE`.
