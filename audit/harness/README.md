# Coverage harness

Checks whether the converter's output is right by running it, not by reading it. The project's own converter (`xpath-to-class-chain.js` → `lib/`) turns each XPath into a class chain. Then both the original XPath and the chain run against the same page source in **mini-WDA**, which is real WebDriverAgent code compiled for macOS. Same elements found means the conversion is correct.

This produced the numbers in [`../coverage-report.md`](../coverage-report.md) and the cases in [`../coverage-cases.json`](../coverage-cases.json). `./run.sh` reproduces both byte for byte.

## Requirements

- macOS with the Xcode Command Line Tools: `clang`, `xcrun`, and libxml2 from the SDK. Full Xcode, a simulator or a device is not needed.
- Node ≥ 20. The TypeScript context check needs Node ≥ 22.6; Node 24 is recommended.
- `python3` for the Python context check. `javac` with a JRE is optional; without it the Java check reports `tool unavailable`.

## Quick start

```sh
cd audit/harness
./run.sh              # ~2 min; everything goes to out/ (git-ignored)
./run.sh --update     # same, and rewrites audit/coverage-cases.json with the new results
```

The end of the output shows R, C, S and a list of what changed against `audit/coverage-cases.json`. The exit code is `1` when anything changed or needs review.

To check a single locator against a real screen, save the page source from Appium Inspector and run:

```sh
node check.js '//XCUIElementTypeCell[.//XCUIElementTypeButton[@name="x"]]' page.xml
node check.js '<xpath>' page.xml --chain '**/XCUIElementTypeCell[`name == "x"`]'   # test a chain you wrote yourself
```

`check.js` prints the converter output, the elements each side found and `EQUAL`/`DIFFERENT`. Elements are identified by a `k="…"` attribute if one is present, otherwise by their child-index path.

## How a verdict is made

```
XPath ──► convertXpathToClassChain (project code, unchanged) ──► class chain
  │                                                                  │
  └──────────────► mini-WDA (same page source) ◄─────────────────────┘
                   XPath result  vs  class chain result
```

Results are compared on the full set of matched elements and on the first element (the one `findElement` returns):

| Outcome | Verdict |
|---|---|
| equal on every page source | **CORRECT** |
| WDA rejects the chain or it throws | **WRONG** |
| different elements | **WRONG**, or **DRIFT** for a known, documented semantic difference (e.g. positional `[n]`) |
| the tool skipped it, but a hand-written chain was proven equal | **GAP** |
| the tool skipped it and no exact class chain exists | **CORRECT-SKIP** |

Page sources are random trees built from each locator's own literals and element types (seeded, so every run is identical), plus hand-made fixtures for tricky cases.

## Files

| File | Role |
|---|---|
| `run.sh` | Full pipeline, in order |
| `wda/` | mini-WDA (see below) |
| `selftest.js` | mini-WDA vs WDA's own `FBClassChainTests` queries (must be 43/43) |
| `shapes.js` | Groups the corpus by structural shape (`COARSE=1` for the grouping used in the report) |
| `fuzz.js` | Corpus: converter output vs XPath on random trees. `GAPS=1` tests `gapexpected.js` instead |
| `gapexpected.js` | Hand-written correct chains for corpus entries the tool skips |
| `speccases.js` | Spec matrix A–H, R, X: XPath, correct chain (or why none exists), fixtures |
| `spec.js` | Runs the spec matrix |
| `contexts.js` | Runs the real CLI over a copy of `audit/corpus/contexts/`. Checks that chains parse, that nothing is rewritten inside an XPath-strategy call, and that each file still parses |
| `perf.js` | Crash and super-linear-time probe |
| `build.js` | Assigns verdicts, computes R / C / S, writes `out/coverage-cases.json`, diffs against the baseline |
| `table.js`, `spectable.js` | Markdown tables for the report |
| `check.js` | One-off check of a single locator on your own page source |
| `paths.js`, `runtime.js`, `codespan.js` | Helpers: locations, JS-literal unescaping and `${…}` substitution, Markdown code spans |

Environment variables: `HARNESS_OUT` (output dir, default `out/`), `EMU` (path to the mini-WDA binary), `TRIALS` (random trees per locator), `ONLY=L001,L002` (subset of `fuzz.js`).

## After changing the converter

1. Run `./run.sh` and read **changed vs baseline** and **needs review**.
   - When a WRONG case now matches on every tree, `build.js` marks it CORRECT automatically.
   - New failures are counted as WRONG with root cause `RC-NEW`, which scores conservatively, and are listed for review.
2. Classify the new failures in `build.js`.
   - Corpus cases go in `CORPUS_WRONG` / `CORPUS_DRIFT`.
   - Spec cases go in `SPEC`, which maps id → verdict and root cause.
   - Root-cause descriptions go in `RC`.
   - Scanner-context verdicts go in `CTX`; `contexts.js` prints the raw facts for them.
3. Run `./run.sh --update`, then update the numbers in `coverage-report.md`.

Scoring weights live in `build.js`. Keep them fixed so scores stay comparable between runs.

To add a spec case, append `{ id, cat, xpath, expected }` to `speccases.js`. `expected` is either a class chain body or `{ inexpressible: 'why' }`. A hand-made page can be added in `FIX[id]`. The harness proves `expected` equal to the XPath before it accepts the case.

## mini-WDA (`wda/`)

- `upstream/`: 12 files copied unchanged from WebDriverAgent `v16.14.1` (`VERSION` has the commit), plus WDA's BSD `LICENSE`. They cover:
  - the class chain parser (`FBClassChainQueryParser`)
  - predicate formatting and the attribute-name mapping (`NSPredicate+FBFormat`, `NSExpression+FBFormat`, `FBElementUtils`)
  - element types (`FBElementTypeTransformer`)
  - the XPath extension functions (`FBXPathExtensions`)
- `patches/`: the only changes to WDA code, applied at build time.
  - `FBElementUtils.m` drops the methods that need a live accessibility element.
  - `NSPredicate+FBFormat.m` evaluates predicates on the harness's `Node` instead of `FBXCElementSnapshotWrapper`.
- `stubs/`: minimal headers and classes that WDA code expects from XCTest and its logger.
- `main.m`, `Node.h/.m`: written for the harness.
  - Builds the element tree from XML.
  - XPath side: libxml2, run the way `FBXPath.m` does it (attribute order, only the attributes the query uses, `"true"`/`"false"` booleans, WDA's extension functions).
  - Chain side: both lookup strategies of `XCUIElement+FBClassChain.m`. WDA uses the snapshot walk only when an intermediate step has a position (`fb_hasIntermediatePosition`); every other chain is an `XCUIElementQuery`. The query stand-in returns matches breadth-first and lets `$…$` (`containingPredicate`) test the element itself, as observed on the iOS 27 simulator in Phase 2.
  - Result order: WDA returns XPath matches through a query as well, so both sides come back breadth-first. Positions inside an XPath (`(//X)[2]`, `last()`) still count in document order (libxml2).
- `build.sh`: copies `upstream/`, applies `patches/`, and compiles to `out/wdaemu`.
- `fetch-wda.sh <tag>`: refreshes `upstream/` to another WDA release. Afterwards run `build.sh` (the patches must still apply), `node selftest.js` and `./run.sh`, then update `VERSION`.

Direct use: `out/wdaemu cases.json` where `cases.json` is `[{ "id", "xml", "xpath"?, "chain"? }]`. It prints `[{ "id", "xpath": [ids] | {"error"}, "chain": [ids] | {"error"} }]`.

## Limits

This is not a device. Four parts of mini-WDA are stand-ins rather than WDA code: the XML writer, the snapshot walk, the XCTest query (order and `containingPredicate`) and the `Node` attributes. Phase 2 (`../device/`) checked them on the simulator and corrected the query stand-in: until then mini-WDA returned every chain in document order and excluded the element itself from `$…$`. Still out of reach here: `hittable`, real `rect` values, `visible` as XCTest computes it, and type mapping on a live app.
