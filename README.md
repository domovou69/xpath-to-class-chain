# xpath-to-class-chain
[![CI](https://github.com/domovou69/xpath-to-class-chain/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/domovou69/xpath-to-class-chain/actions/workflows/test.yml)

Convert and optimize iOS XPath locators to iOS Class Chain selectors for Appium
with a built-in linter and an optional optimizer pass for chains that would otherwise be rejected.

Use it as:
- A **bulk scanner** that rewrites locators across a folder tree
- A **library** when you need to validate / optimize chains from your own code

## Requirements

Node.js ≥ 20. No npm dependencies.

---

## Installation

**Run once without installing** (fetches from registry on the fly):

```bash
npx xpath-to-class-chain ./tests/e2e --write --optimize
pnpm dlx xpath-to-class-chain ./tests/e2e --write --optimize
yarn dlx xpath-to-class-chain ./tests/e2e --write --optimize
```

**Install as a dev dependency**

```bash
npm install --save-dev xpath-to-class-chain
yarn add --dev xpath-to-class-chain
pnpm add -D xpath-to-class-chain
```

Then run via your package manager:

```bash
npx xpath-to-class-chain ./tests/e2e --write --optimize
yarn xpath-to-class-chain ./tests/e2e --write --optimize
pnpm xpath-to-class-chain ./tests/e2e --write --optimize
```

**Install globally** (convenient for one-off use across many projects):

```bash
npm install -g xpath-to-class-chain
yarn global add xpath-to-class-chain
pnpm add -g xpath-to-class-chain
```

Then run directly:

```bash
xpath-to-class-chain ./tests/e2e --write --optimize
```

---

## Quick start

### 1. Write + optimize — the main migration command

```bash
npx xpath-to-class-chain ./tests/e2e --write --optimize
```

Scans the folder, converts every XPath locator to a Class Chain, applies all optimizer rules, and **saves files in place**. This is the command you run when you're ready to commit the migration.

### 2. Dry run first (safe — no files touched)

```bash
npx xpath-to-class-chain ./tests/e2e --dry-run --optimize
```

Same scan, same output, **writes nothing**. Prints a `- old / + new` diff for every locator it would change. Always run this before `--write`.

### 3. JSON report

```bash
npx xpath-to-class-chain ./tests/e2e --json --optimize
# → Report written to <cwd>/xpath-to-class-chain.report.json
```

Writes a machine-readable JSON report named `xpath-to-class-chain.report.json` in the current working directory. `--json` implies `--quiet` so stdout stays clean.

---

## npm scripts (contributors / cloned repo)

Shortcuts for running the tool without typing `node xpath-to-class-chain.js` each time. Not needed by consumers — use the CLI directly via `npx` or the installed binary. All scripts accept an optional path via `--`; without one they fall back to `DEFAULT_TARGET_DIR` (`./tests`).

```bash
npm run write:optimize               # apply rewrites + optimize (most useful)
npm run write                        # apply rewrites only

npm run dry:optimize                 # preview with optimizer (safe, no writes)
npm run dry                          # preview without optimizer

npm run json:optimize                # JSON report + optimize
npm run json                         # JSON report only

npm run write:optimize -- ./src/e2e  # override the target directory
npm run dry -- ./src/e2e
```

---

## The `--optimize` flag

Nine rules, run together inside an idempotent loop until the chain stops changing:

1. **`==` with wildcard → `LIKE`**. NSPredicate's `==` is exact-match (no wildcards), so `@name="abc*"` would otherwise fail validation. With `--optimize` it becomes `name LIKE "abc*"`.
2. **`XCUIElementTypeAny` → `*`**. Normalises the verbose API name to the idiomatic wildcard symbol.
3. **`IN {"single"}` → `==`**. A one-item set degrades to a hash lookup anyway; `==` is clearer and avoids the set-iteration path.
4. **`**/` deduplication**. `**/**/` is equivalent to `**/`; the second recursive scan adds no filtering but does add overhead.
5. **Strip meaningless intermediates**. No-predicate `XCUIElementTypeOther` and `XCUIElementTypeWindow` steps force XCTest to materialise an intermediate result set for zero filtering benefit. They are removed; any gap becomes `/**/` so depth is not accidentally asserted.
6. **Merge sibling predicate blocks**. Adjacent `[\`a\`][\`b\`]` on the same step can be misread by the engine as an index. They are merged into `[\`a AND b\`]`. Numeric index brackets like `[2]` are never merged.
7. **Defer `visible == 1` to the final step**. Evaluating visibility triggers a layout pass per element. On intermediate steps this means a pass for every candidate before the chain continues. `visible == 1` is stripped from non-terminal steps and merged onto the final target's predicate.
8. **Strip redundant `type ==` from concrete-typed nodes**. XCTest pre-filters by node type before evaluating the predicate, so `XCUIElementTypeButton[\`type == "XCUIElementTypeButton" AND name == "OK"\`]` → `XCUIElementTypeButton[\`name == "OK"\`]`. (The wildcard case `*[\`type == "X"\`]` → `X` is handled by the validator in all modes.)
9. **AND condition cost reordering**. Compound AND predicates short-circuit on the first false condition. Conditions are sorted cheapest-first: `==`/`!=` → `BEGINSWITH` → `ENDSWITH` → `CONTAINS` → `LIKE` → `MATCHES`.

**Idempotency**. The validator and optimizer re-run until the output is stable. Matters when one rewrite *unlocks* another — e.g.:
   ```
   //*[contains(@type,"XCUIElementTypeButton") and @name="abc*"]
     → pass 1 (validator type-collapse): XCUIElementTypeButton[`name == "abc*"`]
     → pass 2 (optimizer LIKE rule):     XCUIElementTypeButton[`name LIKE "abc*"`]
     → pass 3 (stable, returned)
   ```

Without `--optimize`, wildcard inputs are skipped with `skipped_validation_failed`.

---

## Flags reference

| Flag | Default | Effect |
|---|---|---|
| `--dry-run` | **ON** | Preview only, never write. Wins if combined with `--write`. |
| `--write` | — | Actually rewrite files. Overrides the safe default. |
| `--optimize` | OFF | Run the optimizer pass (LIKE recovery + idempotency loop). |
| `--json` | OFF | Write a JSON report file in the current working directory and print its path. Implies `--quiet`. |
| `--quiet` | OFF | Drop per-match diffs and banner; keep the final summary. |

---

## JSON report shape

Written to `xpath-to-class-chain.report.json` in the current working directory:

```json
{
  "mode": "dry-run",
  "directory": "D:/repos/your-app/tests",
  "stats": {
    "filesScanned": 12,
    "locatorsFound": 47,
    "locatorsUpdated": 38,
    "skipped": { "android": 0, "validationFailed": 2, "unsupportedLogic": 5, "noChangeNeeded": 2 }
  },
  "updated": [
    { "file": "login.spec.ts", "old": "//XCUIElementTypeButton[@name=\"OK\"]", "new": "-ios class chain:**/XCUIElementTypeButton[`name == \"OK\"`]" }
  ],
  "skipped": [
    { "file": "nav.spec.ts", "locator": "//*[last()]", "status": "skipped_unsupported_logic" },
    { "file": "page.spec.ts", "locator": "-ios class chain:**/Btn[`name == \"x`]", "status": "skipped_validation_failed", "reason": "Unbalanced backticks" }
  ]
}
```

`reason` is only present on `skipped[]` entries where the validator produced a diagnostic (typically class-chain lint failures). It's omitted otherwise — most XPath-conversion skips fall into this category.

Status values used in `skipped[]`:

| Status | Meaning |
|---|---|
| `success` | Converted or lint-fixed; appears in `updated[]`. |
| `skipped_not_xpath` | String starts with `//` but isn't an XPath (e.g. a URL). |
| `skipped_android` | Locator targets Android UI (`android.widget.*`). |
| `skipped_unsupported_logic` | XPath uses an axis or function Class Chain can't express. |
| `skipped_validation_failed` | Output didn't pass NSPredicate validation — often recoverable with `--optimize`. |
| `skipped_no_change` | Already a valid class chain; nothing to do. |

---

## What gets converted

| XPath | Class Chain |
|---|---|
| `//XCUIElementTypeButton[@name="OK"]` | ``**/XCUIElementTypeButton[`name == "OK"`]`` |
| `//*[contains(@label, "Save")]` | ``**/*[`label CONTAINS "Save"`]`` |
| `//XCUIElementTypeStaticText[starts-with(@label,"Welcome")]` | ``**/XCUIElementTypeStaticText[`label BEGINSWITH "Welcome"`]`` |
| `//*[contains(@type,"XCUIElementTypeOther")]` | `**/XCUIElementTypeOther` (type-collapse) |
| `//Btn[@a="1"][@b="2"][3]` | ``**/Btn[`a == "1" AND b == "2"`][3]`` (merge + index) |
| `//Cell[@name="a/b"]` | ``**/Cell[`name == "a/b"`]`` (slashes inside values are safe) |
| `//Btn[@name="abc*"]` *(with `--optimize`)* | ``**/Btn[`name LIKE "abc*"`]`` |
| `(//XCUIElementTypeButton[@name="OK"])` | ``**/XCUIElementTypeButton[`name == "OK"`]`` (outer parens stripped) |
| `(//XCUIElementTypeButton[@name="OK"])[2]` | ``**/XCUIElementTypeButton[`name == "OK"`][2]`` (outer position index appended) |
| `(//XCUIElementTypeOther[@name="row"])[${index}]` | ``**/XCUIElementTypeOther[`name == "row"`][${index}]`` (template expression preserved) |

## What it skips on purpose

| Pattern | Status |
|---|---|
| `following-sibling::`, `preceding-sibling::`, `parent::`, `following::`, `preceding::`, `ancestor::`, `self::` | `skipped_unsupported_logic` |
| `not()`, `count()`, `last()`, `position()` | `skipped_unsupported_logic` |
| Union `a | b` | `skipped_unsupported_logic` |
| Grouped XPath with a function outer index `(//Btn[@name="x"])[last()]` — XPath function, not a static position | `skipped_not_xpath` |
| Grouped `(//Type[n])[m>1]` where the inner chain ends with a positional index and has no named parent to anchor the outer position (e.g. parent reduces to `**`) | `skipped_unsupported_logic` |
| `//android.widget.*` | `skipped_android` |
| Already a valid `-ios class chain:…` | `skipped_no_change` |

The scanner also gates strings starting with `//` through `isLikelyIosLocator` — protocol-relative URLs (`//cdn.example.com/lib.js`), comments lifted into strings, and plain paths are left untouched even if they live inside a `'…'`/`"…"`/`` `…` `` literal.

---

## Configuration

The target directory is always passed as a CLI argument. Defaults (for contributors running scripts directly):

- **`DEFAULT_TARGET_DIR`** — `./tests` — used when no path argument is given
- **`DRY_RUN`** — `true` — safe default; `--write` overrides it

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

// With LIKE recovery
convertXpathToClassChain('//Btn[@name="a*"]', { optimize: true });

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
- `OPTIMIZE` — `--optimize` recovers wildcard equality + idempotency
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
