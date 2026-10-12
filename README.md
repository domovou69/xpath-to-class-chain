# xpath-to-class-chain
[![CI](https://github.com/domovou69/xpath-to-class-chain/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/domovou69/xpath-to-class-chain/actions/workflows/test.yml)

Convert and optimize iOS XPath locators to iOS Class Chain selectors for Appium,
with a built-in linter and an optimizer pass that recovers chains which would otherwise be rejected.

Use it as:
- A **bulk scanner** that rewrites locators across a folder tree
- A **library** when you need to validate / optimize chains from your own code

## Try it now

Runs straight from this GitHub repo — nothing to install. The bare command only
previews; review the diff, then add `--write`.

```bash
npx github:domovou69/xpath-to-class-chain ./tests            # preview
npx github:domovou69/xpath-to-class-chain ./tests --write    # save it
```

Point `./tests` at the folder holding your Appium/XCUITest locators. It scans the tree, converts every XPath locator to a Class Chain and applies all optimizer rules — printing a `- old / + new` diff, or **saving the files in place** with `--write`.

The optimizer runs in both modes, so the preview is exactly what `--write` produces.

## Requirements

Node.js ≥ 20. No npm dependencies.

---

## Installation

**Run once without installing** (fetches from registry on the fly):

```bash
npx xpath-to-class-chain ./tests/e2e --write
pnpm dlx xpath-to-class-chain ./tests/e2e --write
yarn dlx xpath-to-class-chain ./tests/e2e --write
```

---

## Quick start

### 1. Preview first (safe — no files touched)

```bash
npx xpath-to-class-chain ./tests/e2e
```

Scans the folder, converts every XPath locator to a Class Chain and applies all optimizer rules, then prints a `- old / + new` diff for every locator it would change. **Writes nothing.** `--dry-run` names this mode explicitly, but it is already the default.

### 2. Apply the migration

```bash
npx xpath-to-class-chain ./tests/e2e --write
```

Same scan, same optimizer, **saved in place**. The output is exactly what the preview showed. There is no built-in undo — run it on a clean working tree so `git diff` is your undo.

`--write` requires an explicit folder: a bare `--write` is refused rather than falling back to `DEFAULT_TARGET_DIR`.

### 3. JSON report

```bash
npx xpath-to-class-chain ./tests/e2e --json
# → Report written to <cwd>/xpath-to-class-chain.report.json
```

Writes a machine-readable JSON report named `xpath-to-class-chain.report.json` in the current working directory. `--json` implies `--quiet` so stdout stays clean.

---

## npm scripts (contributors / cloned repo)

Shortcuts for running the tool without typing `node xpath-to-class-chain.js` each time. Not needed by consumers — use the CLI directly via `npx` or the installed binary. **Pass the target folder via `--`**; without one they fall back to `DEFAULT_TARGET_DIR` (`./tests`), which does not exist in a fresh clone (and `npm run write` refuses to run at all without an explicit folder).

```bash
npm run dry -- ./src/e2e    # preview, write nothing
npm run write -- ./src/e2e  # migrate: convert, optimize, save in place
npm run json -- ./src/e2e   # JSON report (preview unless you add --write)
```

---

## The optimizer

The optimizer always runs — in both the preview and `--write` paths, so the preview never disagrees with the result. Six rules run together inside an idempotent loop until the chain stops changing. Every rule keeps the set of matched elements; a rewrite that would change it is not an optimization and is not applied. (These are the rules that actually ship — [docs/optimization-rules.md](docs/optimization-rules.md) records the wider 14-rule research spec and marks which of those are deliberately not implemented.)

1. **`XCUIElementTypeAny` → `*`**. Normalises the verbose API name to the idiomatic wildcard symbol.
2. **`IN {"single"}` → `==`**. A one-item set degrades to a hash lookup anyway; `==` is clearer and avoids the set-iteration path.
3. **`**/` deduplication**. `**/**/` is equivalent to `**/`; the second recursive scan adds no filtering but does add overhead.
4. **Merge sibling predicate blocks**. Adjacent `[\`a\`][\`b\`]` on the same step can be misread by the engine as an index. They are merged into `[\`a AND b\`]`; a block with `OR` keeps its parentheses, `[\`a OR b\`][\`c\`]` → `[\`(a OR b) AND c\`]`. Numeric index brackets like `[2]` are never merged.
5. **Strip redundant `type ==` from concrete-typed nodes**. XCTest pre-filters by node type before evaluating the predicate, so `XCUIElementTypeButton[\`type == "XCUIElementTypeButton" AND name == "OK"\`]` → `XCUIElementTypeButton[\`name == "OK"\`]`. (The wildcard case `*[\`type == "X"\`]` → `X` is handled by the validator in all modes.)
6. **AND condition cost reordering**. Compound AND predicates short-circuit on the first false condition. Conditions are sorted cheapest-first: `==`/`!=` → `BEGINSWITH` → `ENDSWITH` → `CONTAINS` → `LIKE` → `MATCHES`.

**Removed rules.** Two earlier rules changed which elements a chain matches and were removed (coverage audit, Phase 5 B4):
- *Strip `XCUIElementTypeOther` / `XCUIElementTypeWindow` steps without a predicate.* `**/XCUIElementTypeWindow/XCUIElementTypeOther/XCUIElementTypeButton` → `**/XCUIElementTypeButton` also matched buttons outside any `Other`, and `/XCUIElementTypeOther/` → `/**/` matched elements at any depth.
- *Move `visible == 1` from intermediate steps to the final step.* The visibility of a container and of an element inside it are independent: a visible cell can hold a button that is not visible, and the reverse.

**Idempotency**. The validator and optimizer re-run until the output is stable. Matters when one rewrite *unlocks* another — e.g.:
   ```
   //*[contains(@type,"XCUIElementTypeButton") and contains(@name,"ab") and @enabled="true"]
     → validator type-collapse: XCUIElementTypeButton[`name CONTAINS "ab" AND enabled == true`]
     → cost reordering:         XCUIElementTypeButton[`enabled == true AND name CONTAINS "ab"`]
     → stable, returned
   ```

   The type collapse fires only when exactly one WDA element type matches the test and the clause is ANDed with the rest: `type CONTAINS "XCUIElementTypeText"` (TextField and TextView) or a type test under `OR` stays a predicate.

---

## Flags reference

**Previewing is the default.** The bare command converts and optimizes but writes nothing; `--write` is how you opt in to modifying files.

| Flag | Default | Effect |
|---|---|---|
| `--dry-run` | **ON** | Preview only, write nothing. Already the default; wins if combined with `--write`. |
| `--write` | OFF | Save the changes in place. Requires an explicit target folder. |
| `--json` | OFF | Write a JSON report file in the current working directory and print its path. Implies `--quiet`. |
| `--quiet` | OFF | Drop per-match diffs and banner; keep the final summary. |
| `--optimize` | **implied** | Accepted for compatibility — the optimizer always runs. |
| `-h`, `--help` | — | Print usage and exit. |
| `-V`, `--version` | — | Print the version and exit. |

Unknown flags are rejected with exit code 1 rather than ignored — a typo'd `--optimise` would otherwise run the *unoptimised* path while looking like it worked.

## What it will not touch

- **Symlinks and Windows junctions are never followed.** A link inside the target folder can point anywhere on disk, and `--write` would then rewrite files outside the folder you named. Skipped links are reported.
- **Files that aren't valid UTF-8 are left alone.** Rewriting a latin-1 or UTF-16 file as UTF-8 would corrupt the whole file, not just the locator. Skipped files are reported.
- **Unreadable folders are stepped over,** not fatal — one permission-denied directory won't discard the rest of the scan.
- `node_modules`, `.git`, `dist`, `build`, `.next`, `coverage`, and `.cache` are never descended into.

---

## JSON report shape

Written to `xpath-to-class-chain.report.json` in the current working directory:

```json
{
  "mode": "dry-run",
  "directory": "D:/repos/your-app/tests",
  "stats": {
    "filesScanned": 12,
    "locatorsFound": 48,
    "locatorsUpdated": 38,
    "warnings": 1,
    "skipped": { "android": 0, "xpathStrategy": 1, "validationFailed": 2, "unsupportedLogic": 5, "notXpath": 0, "noChangeNeeded": 2 }
  },
  "updated": [
    { "file": "login/login.spec.ts", "old": "//XCUIElementTypeButton[@name=\"OK\"]", "new": "-ios class chain:**/XCUIElementTypeButton[`name == \"OK\"`]" },
    { "file": "cart/cart.spec.ts", "old": "(//XCUIElementTypeButton[@name=\"Remove\"])[2]", "new": "-ios class chain:**/XCUIElementTypeButton[`name == \"Remove\"`][2]", "warning": "grouped position: WDA counts class chain matches breadth-first, XPath in document order, so the element can differ when matches sit at different depths" }
  ],
  "skipped": [
    { "file": "nav/nav.spec.ts", "locator": "//*[last()]", "status": "skipped_unsupported_logic" },
    { "file": "pages/LoginPage.java", "locator": "//XCUIElementTypeButton[@name=\"OK\"]", "status": "skipped_xpath_strategy", "reason": "xpath strategy: AppiumBy.xpath(" },
    { "file": "pages/page.spec.ts", "locator": "-ios class chain:**/Btn[`name == \"x`]", "status": "skipped_validation_failed", "reason": "Unbalanced backticks" }
  ]
}
```

`file` is relative to the scanned folder and always uses `/` separators, so reports match across Windows and POSIX.

`warning` is present only on `updated[]` entries whose chain may still select a different element than the XPath. Today that is a grouped position, `(//X)[n]` (see [On the device](#on-the-device)). `stats.warnings` counts them, and the console prints the warning under the diff (`! …`).

`reason` is only present on `skipped[]` entries where the validator produced a diagnostic (typically class-chain lint failures) and on `skipped_xpath_strategy` entries, where it names the strategy found. It's omitted otherwise — most XPath-conversion skips fall into this category.

Status values used in `skipped[]`:

| Status | Meaning |
|---|---|
| `success` | Converted or lint-fixed; appears in `updated[]`. |
| `skipped_not_xpath` | Grouped XPath whose outer index isn't a static position, e.g. `(//XCUIElementTypeButton[@name="x"])[position()<=2]`. (Non-locator strings such as URLs are filtered out earlier and never counted at all.) |
| `skipped_android` | Locator targets Android UI (`android.widget.*`). |
| `skipped_xpath_strategy` | The string is passed to an explicit XPath strategy (`AppiumBy.xpath(…)`, `(By.XPATH, …)`, …); `reason` names it. |
| `skipped_unsupported_logic` | XPath uses an axis or function Class Chain can't express. |
| `skipped_validation_failed` | Output didn't pass NSPredicate validation, even after the optimizer pass. |
| `skipped_no_change` | Already a valid class chain; nothing to do. |

---

## What gets converted

| XPath | Class Chain |
|---|---|
| `//XCUIElementTypeButton[@name="OK"]` | ``**/XCUIElementTypeButton[`name == "OK"`]`` |
| `//*[contains(@label, "Save")]` | ``**/*[`label CONTAINS "Save"`]`` |
| `//XCUIElementTypeStaticText[starts-with(@label,"Welcome")]` | ``**/XCUIElementTypeStaticText[`label BEGINSWITH "Welcome"`]`` |
| `//XCUIElementTypeButton[text()="OK"]` | ``**/XCUIElementTypeButton[`label == "OK" OR value == "OK"`]`` (`text()` maps to label OR value) |
| `//*[contains(@type,"XCUIElementTypeOther")]` | `**/XCUIElementTypeOther` (type-collapse) |
| `//XCUIElementTypeCell[@name="a"][@label="b"][3]` | ``**/XCUIElementTypeCell[`name == "a" AND label == "b"`][3]`` (merge + index) |
| `//*[@name="a" or @label="b"][@value="c"]` | ``**/*[`(name == "a" OR label == "b") AND value == "c"`]`` (each `or` group keeps its parentheses) |
| `//XCUIElementTypeCell[.//XCUIElementTypeButton[@name="x"]]` | `**/XCUIElementTypeCell[$type == "XCUIElementTypeButton" AND name == "x"$]` (descendant predicate: a Cell that contains such a Button) |
| `//XCUIElementTypeCell[@name="a/b"]` | ``**/XCUIElementTypeCell[`name == "a/b"`]`` (slashes inside values are safe) |
| `//XCUIElementTypeButton[@name="abc*"]` | ``**/XCUIElementTypeButton[`name == "abc*"`]`` (`*` is a literal character in both languages) |
| `//XCUIElementTypeButton[contains(@enabled,"false")]` | ``**/XCUIElementTypeButton[`enabled == false`]`` (boolean attributes compare as booleans) |
| `//XCUIElementTypeCell/./XCUIElementTypeButton` | `**/XCUIElementTypeCell/XCUIElementTypeButton` (`.` steps dropped) |
| `.//XCUIElementTypeButton[@name="a"]` | ``**/XCUIElementTypeButton[`name == "a"`]`` (a leading `.//` searches below the context node, as `**/` does; `./X` is not converted. Library API only: the CLI scanner picks up strings that start with `//` or `(//`) |
| `//XCUIElementTypeButton[@x>60]`, `//*[@index="1"]` | ``**/XCUIElementTypeButton[`rect.x > 60`]``, ``**/*[`index == 1`]`` (`x`/`y`/`width`/`height` are `rect.*`; numbers compare as numbers) |
| `//XCUIElementTypeSlider[@value>0.5]` | ``**/XCUIElementTypeSlider[`value.doubleValue > 0.5`]`` |
| `//XCUIElementTypeButton[@label!="a"]` | ``**/XCUIElementTypeButton[`label != nil AND label != "a"`]`` (XPath `!=` needs the attribute to exist) |
| `//XCUIElementTypeButton[@name]` | ``**/XCUIElementTypeButton[`name != nil`]`` |
| `//*[@label="C:\dir"]` | ``**/*[`label == "C:\\dir"`]`` (NSPredicate decodes `\`, so backslashes and newlines are escaped) |
| `//*[@label=concat("a","b")]` | ``**/*[`label == "ab"`]`` (`concat()` of two or more string literals is folded into one; with an attribute, a number or a function argument it is skipped) |
| `(//XCUIElementTypeButton[@name="OK"])` | ``**/XCUIElementTypeButton[`name == "OK"`]`` (outer parens stripped) |
| `(//XCUIElementTypeButton[@name="OK"])[2]` | ``**/XCUIElementTypeButton[`name == "OK"`][2]`` (outer position index appended) |
| `(//XCUIElementTypeOther[@name="row"])[${index}]` | ``**/XCUIElementTypeOther[`name == "row"`][${index}]`` (template expression preserved) |
| `(//XCUIElementTypeButton[@name="OK"])[last()]` | ``**/XCUIElementTypeButton[`name == "OK"`][-1]`` (`[last()-n]` becomes `[-(n+1)]`; a chain counts negative positions from the end) |

> ⚠️ **Positional indexes are not equivalent between the two languages.** In XPath, `//X[2]` means "every `X` that is the 2nd `X` child of its parent" — it can match many elements. In a Class Chain, `**/X[2]` means "the 2nd element of the matched set" — it matches at most one. Indexes are passed through unchanged, so a converted locator that uses `[n]` may select a different element than the original. Review indexed locators by hand after converting.
>
> A grouped position `(//X)[n]` converts to `**/X[n]`, and `(//X)[last()]` to `**/X[-1]`; both are flagged with a `warning`. XPath counts the matches in document order, while WDA counts a chain's matches breadth-first, so the two pick the same element only when all matches sit at the same depth (for example, the rows of one list). See [On the device](#on-the-device).

## What it skips on purpose

| Pattern | Status |
|---|---|
| `following-sibling::`, `preceding-sibling::`, `parent::`, `following::`, `preceding::`, `ancestor::`, `self::` | `skipped_unsupported_logic` |
| `count()`, `last()` and `position()` inside a step, e.g. `//XCUIElementTypeButton[last()]` (per parent) | `skipped_unsupported_logic` |
| Element type that isn't `*` or one of WDA's `XCUIElementType*` names (e.g. `//Btn[...]`, `//XCUIElementTypeLabel[...]`) — WDA would read an unknown name as `Other` | `skipped_unsupported_logic` |
| Parent step `..` | `skipped_unsupported_logic` |
| An attribute WDA does not have, e.g. `@text` — the XPath matches nothing and the chain would raise `FBUnknownAttributeException` | `skipped_unsupported_logic` |
| A numeric comparison with no exact chain form: `@value<5` (non-numeric text reads as 0 in NSPredicate, NaN in XPath), `@value=5`, `@index="a"`, ordering a boolean | `skipped_unsupported_logic` |
| Union `a \| b` | `skipped_unsupported_logic` |
| Grouped XPath with any other function outer index, e.g. `(//XCUIElementTypeButton[@name="x"])[position()<=2]` or `[last()+1]` — not a single position | `skipped_not_xpath` |
| Grouped `(//XCUIElementTypeCell/XCUIElementTypeButton[2])[last()]` — the inner chain already ends with a position | `skipped_unsupported_logic` |
| Grouped `(//XCUIElementTypeCell[2])[3]` where the inner chain ends with a positional index and has no named parent to anchor the outer position (parent reduces to `**`) | `skipped_unsupported_logic` |
| A path inside a predicate other than `.//Type[…]`: child existence `[./X]` / `[X]`, nested descendant paths, `[.//X[2]]` | `skipped_unsupported_logic` |
| A descendant test that the element itself could pass: `//XCUIElementTypeCell[.//*[@name="x"]]`, `//*[.//XCUIElementTypeButton]`, `//XCUIElementTypeCell[.//XCUIElementTypeCell]`. A chain's `[$…$]` also tests the element itself, so `.//` is converted only when both steps name a type and the types differ | `skipped_unsupported_logic` |
| An index before a filter, `//XCUIElementTypeCell[2][@name="a"]` — XPath indexes each parent's children first; a chain filters first | `skipped_unsupported_logic` |
| `//android.widget.*` | `skipped_android` |
| A string passed straight to an explicit XPath strategy: `AppiumBy.xpath("…")`, `@iOSXCUITFindBy(xpath = "…")` (Java, Kotlin, Groovy), `find_element(AppiumBy.XPATH, '…')` (Python), `MobileBy.XPath("…")` (C#), `find_element(:xpath, '…')` (Ruby), `{ xpath: '…' }` / `findElement('xpath', '…')` (JS/TS), `WebDriverBy::xpath('…')` (PHP). Rewriting only the string would leave the strategy at XPath and break the locator. The full list is in [`lib/strategy.js`](lib/strategy.js). A string kept in a variable or constant and passed to the call later is not recognised and still converts | `skipped_xpath_strategy` |
| Already a valid `-ios class chain:…` | `skipped_no_change` |

The scanner also gates strings starting with `//` through `isLikelyIosLocator` — protocol-relative URLs (`//cdn.example.com/lib.js`), comments lifted into strings, and plain paths are left untouched even if they live inside a `'…'`/`"…"`/`` `…` `` literal.

---

## On the device

Checked on Appium 3.8.0, appium-xcuitest-driver 12.16.0 and WebDriverAgent 16.14.1, on an iOS 27.0 simulator and on an iPhone 13 Pro Max with iOS 26.6, which gave the same results. The method and the results are in [`audit/coverage-report.md`](audit/coverage-report.md) ("Device verification" and "Real device").

- **Grouped positions count breadth-first.** XCTest returns query matches breadth-first, for XPath lookups as well as for class chains. An XPath position `(//X)[n]` is still counted in document order. So `(//XCUIElementTypeButton)[2]` → `**/XCUIElementTypeButton[2]` can return a shallower button further down the screen. The same holds for `(//X)[last()]` → `**/X[-1]` and `(//X)[last()-1]` → `**/X[-2]`: they pick the last and second-to-last elements of the breadth-first list, not of the document-order one. No class chain counts in document order. These locators are still converted and are flagged with a `warning` in the console and in the `--json` report; check each one on the screen it is used on. `findElement` without a position returns the same first element on both sides whenever the matched sets are equal.
- **Selector errors look like "element not found".** appium-xcuitest-driver 12.16.0 catches the error WDA returns for an invalid XPath or class chain (`400 invalid selector`). `findElements` then returns `[]` and `findElement` fails with "no such element". A chain that does not parse therefore looks like a missing element in a test run. This is one reason the tool validates every chain it emits and skips what it cannot convert exactly.
- **`visible` on the final step can be much slower as a chain.** `**/XCUIElementTypeButton[\`visible == true\`]` took 12.6 s against 2.0 s for `//XCUIElementTypeButton[@visible='true']` on a screen where 32 buttons are visible, because WDA reads visibility for each candidate. Prefer a locator that does not depend on `visible` where lookup time matters. The optimizer leaves `visible` on the step it was written on: moving it to another step changes which elements match. Over all checked locators the chain was faster, ×1.11 (geometric mean).

## Configuration

The target directory is always passed as a CLI argument. Defaults (for contributors running scripts directly):

- **`DEFAULT_TARGET_DIR`** — `./tests` — previewed when no path argument is given. Never written to: `--write` without an explicit folder is an error, not a fallback.
- **`DRY_RUN`** — `true` — preview by default; `--write` overrides it

Scanner behaviour (not configurable via CLI):

- **`FILE_EXTENSIONS`** — `.js .ts .mjs .cjs .mts .cts .jsx .tsx .java .kt .kts .groovy .py .rb .cs .php .swift .m .json .yaml .yml .xml .feature .properties .txt`
- **`IGNORE_DIRS`** — `node_modules .git dist build .next coverage .cache`

Files outside `FILE_EXTENSIONS` are not read.

---

## Library mode

```js
const {
  convertXpathToClassChain,
  validateAndFixClassChain,
  optimizeClassChain,
  isLikelyIosLocator,
  STATUS,
} = require('xpath-to-class-chain');

// One-shot XPath → class chain
const { locator, status } = convertXpathToClassChain('//XCUIElementTypeButton[@name="OK"]');
if (status === STATUS.SUCCESS) { /* … */ }

// With the optimizer pass (what the CLI always runs)
convertXpathToClassChain('//XCUIElementTypeButton[@name="a" and @enabled="true"]', { optimize: true });

// Lint an existing chain
const { valid, fixedLocator, reason } = validateAndFixClassChain(
  '-ios class chain:**/Btn[`name == "OK"`]'
);

// Optimize an existing chain (idempotent + all optimizer rules)
optimizeClassChain('-ios class chain:**/Btn[`name == "a*"`]');
```

---

## Tests

```bash
npm test
```

Zero-dependency runner, exits non-zero on any failure. Sections:

- `CONVERT` — XPath → class chain happy paths
- `SKIP` — inputs that must be left untouched
- `LINT` — `validateAndFixClassChain` on existing chains
- `TOKENIZER` — `tokenizeXpath` bracket/quote awareness
- `DETECT` — `isLikelyIosLocator` gating
- `FLAGS` — `parseFlags` CLI parsing
- `OPTIMIZE` — the optimizer pass: rewrite rules + idempotency
- `SCANNER` — `walkDir`, `processFile`, `makeStats` against real on-disk fixtures

Add a row to the relevant `*_CASES` array and re-run.

---

## File layout

```
xpath-to-class-chain.js       ← entry / CLI / re-exports
xpath-to-class-chain.test.js  ← all tests in one file
lib/
  status.js        ← STATUS enum
  predicates.js    ← PREDICATE_REGEX + shared rewrites (rewriteStringFunctions, upperCaseLogicOps)
  validator.js     ← validateAndFixClassChain
  optimizer.js     ← optimizeClassChain + all optimizer rules
  converter.js     ← tokenizeXpath + convertXpathToClassChain
  scanner.js       ← walkDir + processFile + isLikelyIosLocator + makeStats
```

Dependency graph (acyclic): `status ← predicates ← validator ← optimizer ← converter ← scanner ← entry`.
