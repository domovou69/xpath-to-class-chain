# xpath-to-class-chain
Convert and optimize iOS XPath locators to iOS Class Chain selectors for Appium
with a built-in linter and an optional optimizer pass for chains that would otherwise be rejected.

Use it as:
- A **bulk scanner** that rewrites locators across a folder tree
- A **library** when you need to validate / optimize chains from your own code

## Requirements

Node.js ≥ 20 (uses `fs.rmSync`). No npm dependencies.

---

## Quick start

### 1. Default: dry-run a folder (safe — no files touched)

```bash
node xpath-to-class-chain.js ./tests/e2e
node xpath-to-class-chain.js ./tests/e2e --dry-run
```

Walks the folder, prints a `- old / + new` diff for every locator it would change, prints a summary, **writes nothing**. This is the default mode (`DRY_RUN = true`). Always run this first.

### 2. Write mode — apply the rewrites

```bash
node xpath-to-class-chain.js ./tests/e2e --write
```

Same scan, but each modified file is saved in place. `--dry-run` wins if you pass both.

### 3. With `--optimize`

```bash
node xpath-to-class-chain.js ./tests/e2e --write --optimize
```

Recovers locators that the validator would normally reject and applies extra cleanup rules. See [The `--optimize` flag](#the---optimize-flag) below.

### 4. JSON output
```bash
node xpath-to-class-chain.js ./tests/e2e --json
# → Report written to <script-dir>/xpath-to-class-chain.report.json
```

The full report is written to `xpath-to-class-chain.report.json` next to the script (so the path is stable regardless of CWD). Stdout only carries a single confirmation line; `--json` still implies `--quiet` so the per-match noise is suppressed.

---

## The `--optimize` flag

Eight rules, run together inside an idempotent loop until the chain stops changing:

1. **`==` with wildcard → `LIKE`**. NSPredicate's `==` is exact-match (no wildcards), so `@name="abc*"` would otherwise fail validation. With `--optimize` it becomes `name LIKE "abc*"`.
2. **`XCUIElementTypeAny` → `*`**. Normalises the verbose API name to the idiomatic wildcard symbol.
3. **`IN {"single"}` → `==`**. A one-item set degrades to a hash lookup anyway; `==` is clearer and avoids the set-iteration path.
4. **`**/` deduplication**. `**/**/` is equivalent to `**/`; the second recursive scan adds no filtering but does add overhead.
5. **Strip meaningless intermediates**. No-predicate `XCUIElementTypeOther` and `XCUIElementTypeWindow` steps force XCTest to materialise an intermediate result set for zero filtering benefit. They are removed; any gap becomes `/**/` so depth is not accidentally asserted.
6. **Defer `visible == 1` to the final step**. Evaluating visibility triggers a layout pass per element. On intermediate steps this means a pass for every candidate before the chain continues. `visible == 1` is stripped from non-terminal steps and merged onto the final target's predicate.
7. **Strip redundant `type ==` from concrete-typed nodes**. XCTest pre-filters by node type before evaluating the predicate, so `XCUIElementTypeButton[\`type == "XCUIElementTypeButton" AND name == "OK"\`]` → `XCUIElementTypeButton[\`name == "OK"\`]`. (The wildcard case `*[\`type == "X"\`]` → `X` is handled by the validator in all modes.)
8. **AND condition cost reordering**. Compound AND predicates short-circuit on the first false condition. Conditions are sorted cheapest-first: `==`/`!=` → `BEGINSWITH` → `ENDSWITH` → `CONTAINS` → `LIKE` → `MATCHES`.

**Idempotency**. The validator and optimizer re-run until the output is stable. Matters when one rewrite *unlocks* another — e.g.:
   ```
   //*[contains(@type,"XCUIElementTypeButton") and @name="abc*"]
     → pass 1 (validator type-collapse): XCUIElementTypeButton[`name == "abc*"`]
     → pass 2 (optimizer LIKE rule):     XCUIElementTypeButton[`name LIKE "abc*"`]
     → pass 3 (stable, returned)
   ```

```bash
node xpath-to-class-chain.js ./tests --optimize --write
```

Without `--optimize`, wildcard inputs are skipped with `skipped_validation_failed`.

---

## Flags reference

| Flag | Default | Effect |
|---|---|---|
| `--dry-run` | **ON** | Preview only, never write. Wins if combined with `--write`. |
| `--write` | — | Actually rewrite files. Overrides the safe default. |
| `--optimize` | OFF | Run the optimizer pass (LIKE recovery + idempotency loop). |
| `--json` | OFF | Write a JSON report file next to the script and print its path. Implies `--quiet`. |
| `--quiet` | OFF | Drop per-match diffs and banner; keep the final summary. |

---

## JSON report shape

Written to `<script-dir>/xpath-to-class-chain.report.json`:

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

## What it skips on purpose

| Pattern | Status |
|---|---|
| `following-sibling::`, `preceding-sibling::`, `parent::`, `following::`, `preceding::`, `ancestor::`, `self::` | `skipped_unsupported_logic` |
| `not()`, `count()`, `last()`, `position()` | `skipped_unsupported_logic` |
| Union `a | b` | `skipped_unsupported_logic` |
| Grouped XPath `(//Btn[@name="x"])[1]` | `skipped_unsupported_logic` |
| `//android.widget.*` | `skipped_android` |
| Already a valid `-ios class chain:…` | `skipped_no_change` |

The scanner also gates strings starting with `//` through `isLikelyIosLocator` — protocol-relative URLs (`//cdn.example.com/lib.js`), comments lifted into strings, and plain paths are left untouched even if they live inside a `'…'`/`"…"`/`` `…` `` literal.

---

## Configuration

Top of [xpath-to-class-chain.js](xpath-to-class-chain.js) — change in place or override via CLI:

```js
const DEFAULT_TARGET_DIR = './tests';  // used when no folder is passed
const DRY_RUN = true;                  // safety-first default; --write overrides
```

In [lib/scanner.js](lib/scanner.js):

- `FILE_EXTENSIONS` — `.js .ts .mjs .cjs .mts .cts .jsx .tsx .java .kt .kts .groovy .py .rb .cs .php .swift .m .json .yaml .yml .xml .feature .properties .txt`
- `IGNORE_DIRS` — `node_modules .git dist build .next coverage .cache`

Files outside `FILE_EXTENSIONS` are not even read.

---

## Library mode

```js
const {
  convertXpathToClassChain,
  validateAndFixClassChain,
  optimizeClassChain,
  isLikelyIosLocator,
  STATUS,
} = require('./xpath-to-class-chain');

// One-shot XPath → class chain
const { locator, status } = convertXpathToClassChain('//XCUIElementTypeButton[@name="OK"]');
if (status === STATUS.SUCCESS) { /* … */ }

// With LIKE recovery
convertXpathToClassChain('//Btn[@name="a*"]', { optimize: true });

// Lint an existing chain
const { valid, fixedLocator, reason } = validateAndFixClassChain(
  '-ios class chain:**/Btn[`name == "OK"`]'
);

// Optimize an existing chain (idempotent + LIKE)
optimizeClassChain('-ios class chain:**/Btn[`name == "a*"`]');
```

---

## Tests

```bash
node xpath-to-class-chain.test.js
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
README.md                     ← this file
docs/
  optimization-rules.md  ← the optimizer rule spec (--optimize)
xpath-to-class-chain.js       ← entry / CLI / re-exports
xpath-to-class-chain.test.js  ← all tests in one file
lib/
  status.js        ← STATUS enum
  predicates.js    ← PREDICATE_REGEX + shared rewrites (rewriteStringFunctions, upperCaseLogicOps)
  validator.js     ← validateAndFixClassChain
  optimizer.js     ← optimizeClassChain + LIKE recovery rule
  converter.js     ← tokenizeXpath + convertXpathToClassChain
  scanner.js       ← walkDir + processFile + isLikelyIosLocator + makeStats
```

Dependency graph (acyclic): `status ← predicates ← validator ← optimizer ← converter ← scanner ← entry`.
