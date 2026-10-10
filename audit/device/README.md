# Device verification (Phase 2)

Runs each selected XPath and the class chain the converter makes from it against the same screen of a purpose-built iOS app, under a real Appium + WebDriverAgent on the simulator, and compares what they find and how long the lookup takes. Results feed the "Device verification" section of [`../coverage-report.md`](../coverage-report.md).

Nothing here is part of the npm package (`files` in the root `package.json` lists only the library).

## Pinned environment

Recorded in [`env.json`](env.json); `run.js` writes the versions it actually saw into `results.json` and warns if they differ.

| Component | Version |
|---|---|
| macOS | 26.6.2 (25G83), Apple silicon |
| Xcode | 27.0 (27A266a) |
| iOS simulator runtime | iOS 27.0 (24A434) |
| Simulator | `LocatorLab iPhone 17` (iPhone 17), UDID `208FA758-C937-49C4-ADE6-E16B0D7E0630` |
| Appium | 3.8.0 (local, `node_modules/`) |
| appium-xcuitest-driver | 12.16.0 (`APPIUM_HOME=./.appium`) |
| WebDriverAgent | 16.14.1 (bundled by the driver; `appium-webdriveragent` 16.14.2 exists, not used) |
| Node | 24.21.0 (≥ 20 works) |
| XcodeGen | 2.46.0 (Homebrew) |

WDA settings are the defaults. The only capability that differs from a minimal session is `appium:derivedDataPath=DerivedData/WDA`, so the WDA build stays inside this folder.

## From scratch

```sh
cd audit/device
npm install                                    # Appium 3.8.0 into ./node_modules
export APPIUM_HOME=$PWD/.appium
npx appium driver install xcuitest@12.16.0    # bundles WDA 16.14.1
brew install xcodegen                          # once
xcodegen generate                              # LocatorLab.xcodeproj from project.yml
# the simulator: reuse the UDID in env.json; on another machine create one and put its UDID in env.json
xcrun simctl create "LocatorLab iPhone 17" com.apple.CoreSimulator.SimDeviceType.iPhone-17 com.apple.CoreSimulator.SimRuntime.iOS-27-0
xcrun simctl boot <udid>
xcodebuild -project LocatorLab.xcodeproj -scheme LocatorLab -configuration Debug \
  -destination "id=<udid>" -derivedDataPath DerivedData build
npx appium --port 4723 &                       # keep APPIUM_HOME exported
node run.js --smoke                            # versions, two lookups, page source
node make-cases.js                             # cases.json from ../coverage-cases.json
node run.js                                    # all cases → results.json
node run.js --out out/run2.json && node run.js --diff results.json out/run2.json
```

Timings on the reference machine: `npm install` 20 s, driver install 5 s, app build 10 s, first session ~70 s (it builds WDA), later sessions ~15 s. A full run of 246 cases takes about 13 minutes (about 25 with `REPS=5`). `node_modules/`, `.appium/`, `DerivedData/`, `LocatorLab.xcodeproj/` and `out/` are git-ignored.

## Files

| File | Role |
|---|---|
| `project.yml` | XcodeGen spec for LocatorLab (SwiftUI, iOS 17+, display name `LL`) |
| `LocatorLab/Lab.swift` | A small tree DSL: SwiftUI nodes (`text`, `button`, `box`, `combined`, …) and UIKit nodes for tables and the window overlay |
| `LocatorLab/Screens.swift` | The screens: `identity`, `functions`, `siblings`, `lists`, `states`, `nesting`, `modal` |
| `LocatorLab/ProbeScreen.swift`, `Probe2Screen.swift`, `SmokeScreen.swift` | Not test screens: how SwiftUI/UIKit constructs map to `XCUIElementType*` on this iOS, and the smoke test |
| `make-cases.js` | Builds `cases.json` from `../coverage-cases.json`; fails if an adapted XPath's structure differs from the original |
| `cases.json` | `{ id, variant?, screen, xpath, quote?, subst?, expectedChain?, dead?, original?, verdict, category }` |
| `run.js` | The harness (zero dependencies, raw W3C over `fetch`) |
| `results.json` | `{ env, date, seconds, counts, perf, cases: [...] }` |
| `env.json` | The pinned environment and the simulator UDID |

## How a case runs

The screen is chosen by a launch argument (`-screen <name>` via `appium:processArguments`), so the harness never navigates. One session per screen; after launch the harness waits until two page sources in a row are identical.

For each case:
1. Convert with the library from the repository root (`convertXpathToClassChain(xpath, { optimize: true })`). A corpus case keeps its JS quote and `${…}` text: it is converted as raw source text, as the scanner does, then both the XPath and the chain are turned into the runtime strings the driver receives (`../harness/runtime.js`, the same code the mini-WDA harness uses).
2. `findElements` by XPath and by `-ios class chain`, and fingerprint each hit as `type|name|label|value|rect`, in the order returned.
3. If Phase 1 has a hand-written chain that differs from the converter's output (GAP, DRIFT), run it as well (`expected`).
4. Time both lookups (below).

| Outcome | Meaning |
|---|---|
| `EQUAL` | same set, same first element |
| `FIRST_DIFFERS` | same set, different first element |
| `SET_DIFFERS` | different sets |
| `XPATH_ONLY` | the converter skipped it, the XPath finds something |
| `CC_ERROR` | WDA rejects the chain |
| `XPATH_ERROR` | WDA rejects the XPath |
| `DEAD` | expected empty: the XPath can never match on WDA (`@text`, `text()`, `@selected`, unknown type) |
| `NONE` | neither side finds anything: a fixture problem, not a verdict |

**Errors are invisible through Appium.** appium-xcuitest-driver 12.16.0 swallows every WDA error in element lookup (`build/lib/commands/find.js`, `doNativeFind`: `catch { els = [] }`), so `findElements` returns `[]` and `findElement` "no such element" for an invalid XPath or class chain. When Appium returns nothing, `run.js` sends the same request straight to WDA (`webDriverAgentUrl`, strategy `class chain`/`xpath`) to tell an error from an empty result.

## Timing

The two lookups that are compared are also the ones timed: one cold `findElements` call per side, wall time Appium → WDA → back, without reading attributes. That is what a test does: one lookup, then it works with the element. Which side goes first alternates from case to case (`first` in each timing), so neither profits systematically from WDA's snapshot cache warmed by the other.

- Per case: `xpathMs`, `chainMs`, `speedup = xpathMs / chainMs` (> 1 means the class chain is faster). A single call is noisy, so read per-case numbers as indications.
- Per run (`perf` in `results.json`): median and p95 of the per-case times for each side, and the **geometric mean of the per-case speedups**. The geometric mean is the right average for ratios: one ×10 outlier does not dominate it, and A/B and B/A average to reciprocals. Over ~180 cases these summaries are stable.
- `REPS=N node run.js` adds an untimed warm-up and N timed lookups per side and reports their median instead, for a closer look at single cases (a full run then takes about twice as long with `REPS=5`).
- To compare two runs (another iOS version, device or WDA): `node run.js --compare a.json b.json`. It prints both summaries and, over the cases timed in both, the geometric-mean ratio of the times per side.

Timings depend on the screen size (XPath serialises the whole page source; class chain runs an XCTest query), so compare runs made with the same `cases.json`.

## Notes on the app

- SwiftUI on iOS 27 wraps content in several identifier-less `XCUIElementTypeOther` and marks some of them `visible="false"`; nested identifier-less `.contain` containers collapse into one. A table whose cells have direct `Button` / `StaticText` children needs UIKit (`KitTable`); a `Button` or `Other` directly under `Window` needs a UIKit view in the window (`WindowOverlay`).
- The app's display name is `LL`, so that `//*` locators with short literals do not also match the `Application` root (assumption A1 in the report). `A03~app-root` checks A1 itself.
- `visible` in `/source` can disagree with what a `visible` predicate sees at lookup time. Cases that depend on visibility use geometry the two agree on (a cell clipped by its scroll view).
