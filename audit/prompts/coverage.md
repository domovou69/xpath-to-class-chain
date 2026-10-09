# Role
You are an expert in XPath 1.0/2.0, NSPredicate, and iOS Class Chain (WebDriverAgent).
You are auditing the correctness and coverage of the converter in this repository.
The task has two phases. Run Phase 1 unless told otherwise. Run Phase 2 only when the user
explicitly asks for it, in a separate session, after Phase 1's deliverables exist.

# Target platform (pinned 2026-10-09; all verdicts are judged against this)
| Component | Version | Notes |
|---|---|---|
| Appium server | 3.8.0 (2026-09-24) | |
| appium-xcuitest-driver | 12.16.0 (2026-10-08) | requires Appium ≥ 3, Node ^20.19 / ^22.12 / ≥ 24 |
| WebDriverAgent | 16.14.1 | the exact version bundled by xcuitest-driver 12.16.0 |
| Xcode / iOS simulator | current stable Xcode and its default iOS runtime | record exact versions in Phase 2 |
Read WDA source at tag `v16.14.1`. If a newer release appears during the audit, do NOT
switch: note it in the report instead.

## Platform facts that affect locators (verified 2026-10-09 from the WDA and
## appium-xcuitest-driver changelogs; re-check against v16.14.1 source)
- WDA 13.2.0 (2026-05-26, PR #1144) registers XPath extension functions in libxml2:
  `matches` (optional `i` flag), `ends-with`, `lower-case`, `upper-case`, `replace`,
  `tokenize`, `string-join`. These "XPath 2.0-style" locators WORK on the pinned platform.
- WDA 16.1.2 (2026-08-03, PR #1194) rewrote the class chain lookup (in-memory snapshot walk)
  and fixed a bug where descendant matching could include the root element itself. Judge
  index and descendant semantics against this implementation, not older docs or wikis.
- WDA 12.0.0 (2026-04-14) removed the `includeNonModalElements` setting and
  `shouldUseTestManagerForVisibilityDetection`; xcuitest-driver 11.0.0 removed
  `appium:simpleIsVisibleCheck` (affects what `visible` means).
- WDA 9.x (2025) added `placeholderValue`, `traits`, `nativeFrame`, min/max value and an
  optional real `hittable` to the XML page source; WDA 9.0.0 (2025-01-16) refactored
  snapshotting.

# Project context
`xpath-to-class-chain` (Node ≥ 20, zero dependencies) converts Appium/XCUITest XPath
locators into `-ios class chain:` selectors.
Pipeline: `lib/converter.js` (tokenizeXpath, unwrapGrouped, convertXpathToClassChain)
→ `lib/validator.js` (validateAndFixClassChain) → `lib/optimizer.js` (9 rules, looped
until stable). `lib/predicates.js` holds shared regex rewrites (PREDICATE_REGEX,
rewriteStringFunctions, BOOLEAN_ATTRS). `lib/scanner.js` finds locators in source files
and passes the RAW literal text (escapes such as `\'` and `\n` unevaluated) to the
converter with optimize=true; the library defaults to optimize=false.
Tests: `xpath-to-class-chain.test.js`. Project claims: README ("What gets converted",
"What it skips on purpose") and `docs/optimization-rules.md`.

# Inputs
- `audit/corpus/ios-locators.json` — 573 anonymized real-world locators from a production
  CodeceptJS iOS suite: `{ id, kind, quote, source, count }`. `source` is the bare locator
  (no `ios:` wrapper) exactly as the scanner sees it. `kind` is one of `xpath`,
  `xpath-dynamic` (contains `${…}`), `xpath-composed` (starts with `${…}`),
  `xpath-mixed-classchain`, `class-chain`, `non-locator`. Attribute values were replaced with
  pseudo-words; structure, quoting, escapes, `${…}`, `true`/`false`, and `XCUIElementType*`
  names are original.
- `audit/corpus/ios-locators.fixture.js` — the same locators in their original CodeceptJS
  form (`{ ios: '…' }`, parse-only).
- `audit/corpus/contexts/` — corpus locators placed in other source contexts, with the
  expected scanner behaviour per file in `expected.json`: CodeceptJS `ios`/`android` pairs,
  bare strings (constants, helper calls, object props, arrays), WebdriverIO `$()` incl.
  template literals, Java and Python XPath-strategy calls, a JSON locator store.
  Known before the audit: a dry run rewrites all 16 locators in `Strategy.java` and
  `strategy.py` while the XPath strategy stays in place.

# Phase 1 — static audit

## Ground truth (README and tests are NOT ground truth)
1. Class chain and NSPredicate as implemented by WDA v16.14.1: the class chain parser and
   lookup source, plus WDA's own tests (`WebDriverAgentTests/UnitTests/FBClassChainTests.m`,
   `FBXPathTests.m`, `IntegrationTests/XCUIElementFBFindTests.m`,
   `FBXPathIntegrationTests.m`) in github.com/appium/WebDriverAgent.
2. XPath semantics as executed by WDA: libxml2 XPath 1.0 plus the registered extensions.
3. Which attributes are queryable in class chain predicates vs. present only in the XML page
   source (check `index`, `x`, `y`, `width`, `height`, `traits`, `placeholderValue`,
   `hittable`, `text`).
Mark anything you could not confirm from a source as UNVERIFIED.

## Step 1 — Corpus classification (primary)
For every corpus entry with kind `xpath`, `xpath-dynamic` or `xpath-mixed-classchain`:
run the converter and record the verdict. Get output only by running code:
  node -e "const m=require('./xpath-to-class-chain');
           const r=require('./audit/corpus/ios-locators.json');
           for (const x of r) console.log(x.id, JSON.stringify(
             m.convertXpathToClassChain(x.source,{optimize:true})))"
For `${…}`, assume interpolated values are plain text without quotes, and that values in
`@enabled="${…}"` are `true`/`false`.
Group entries by STRUCTURAL SHAPE (same steps, functions and operators, different values)
and judge each shape once, with one representative id; list the other ids per shape.
Verdicts:
- CORRECT      — valid chain, selects the same element set (and the same first element)
- DRIFT        — valid, but semantics differ; give a minimal XML page source where they diverge
- WRONG        — status=success, but the chain is invalid or selects something else (silent failure)
- GAP          — expressible in class chain, but the tool skips it
- CORRECT-SKIP — inexpressible, and the tool correctly skips it
- CRASH        — exception, hang, or super-linear runtime
`xpath-composed`, `class-chain` and `non-locator` entries are outside the score; report
separately what the tool does with them, and whether converting the base locator of a
composed one (`${base}//X`) would break the composition.

## Step 2 — Scanner contexts
Copy `audit/corpus/contexts/` to a temporary directory, run the CLI there (dry run with
`--json`, then `--write`), and compare with `expected.json`. For every file check that it
still parses (`node --check`, `python3 -m py_compile`, JSON.parse; for `.ts` and `.java`,
check by inspection if no compiler is available) and that each rewrite is valid in its
context. A rewrite inside an XPath-strategy call is WRONG; the expected fix is to skip it
with a reason (or rewrite the strategy as well). Count each context type that breaks as one
WRONG root cause.

## Step 3 — Spec matrix (secondary, for constructs absent from the corpus)
Build a construct matrix: XPath → correct class chain (or "inexpressible", with a grammar
reason) → actual output → verdict. Cover at least:
- steps: `//`, `/`, `*`, `XCUIElementType*`, `child::`, `descendant::`, a leading single `/`,
  paths from `XCUIElementTypeApplication` (Appium Inspector output), `//X//Y`, `/..`, `.`
- attributes: `=`, `!=`, `<`, `>`, booleans, a string attribute with value "true",
  `[@name]` (existence), `@index`, `@type`, `@text`
- string functions: `contains`, `starts-with`, `text()`, `contains(., "x")`,
  `normalize-space()`, `string-length()`, case-insensitive via `translate()`, `concat()`
- WDA extension functions: `ends-with`, `matches` (incl. the `i` flag), `lower-case`,
  `upper-case`, `replace`, `tokenize`, `string-join`
- logic: `and`/`or`/`not()`, parentheses, precedence, `[@a or @b][@c]` after block merging
- positional: `[n]`, `[last()]`, `[last()-1]`, `[position()=n]`, `[position() <= n]`,
  `(//…)[n]`, `(//…)[${expr}]`, `(//…)${expr}` without brackets
- nested predicates: `//Cell[.//Button[@name="x"]]`, `//Cell[Button]`
- literals: both quote types inside values, `\'`, backtick, `\n`, unicode (`’`, `£`, `•`),
  `*` and `?` in values, `/`, `|`, `(`, `)` inside values
- inexpressible: `following-sibling`, `preceding-sibling`, `following`, `ancestor`, union,
  `count()`, `self::` inside a predicate

## Step 4 — Hypotheses (verify each; do not assume)
1. `[@a="1" or @b="2"][@c="3"]` is merged into `a … OR b … AND c …` without parentheses,
   so AND binds tighter and semantics break?
2. Optimizer rule 9 (AND-condition reordering) when the block also contains OR (corpus has
   `a and b or c`)?
3. The validator rejects any `(` outside strings, so grouping parentheses and `NOT(...)` can
   never pass?
4. `not()`, `[last()]` (3 corpus entries) and `[position() <= n]` are skipped although
   NSPredicate has `NOT` and class chain supports negative indexes?
5. `contains(@enabled,"false")` (3 corpus entries) becomes `enabled CONTAINS "false"`:
   valid for the linter, invalid or always-false on device?
6. `contains(@text, …)` becomes `text CONTAINS …`: `text` is not an iOS attribute; should
   this be a skip with a reason?
7. Outer index moved to the parent: `(//*[…]/child::*[2])[${t}]` → `**/*[…][${t}]/*[2]`.
   DRIFT or WRONG?
8. Leading single `/` and an `XCUIElementTypeApplication` step: is the produced chain valid,
   given that the class chain root is the application itself?
9. `[@name]` and `@index` yield chains the linter accepts but that fail at runtime?
10. XPath `//X[2]` (position among siblings) vs class chain `**/X[2]`: verify WDA 16.14.1's
    actual index semantics.
11. Rule 5 (drop predicate-less `XCUIElementTypeOther`/`Window`) and rule 7 (defer
    `visible`): which cases are DRIFT and which are WRONG?

## Step 5 — XPath 1.0 vs 2.0
Answer explicitly for the pinned platform: which functions work in Appium XPath; which of
them the converter supports; which map cleanly to NSPredicate (`ENDSWITH`, `MATCHES`, `[c]`)
and which are inexpressible (`replace`, `tokenize`, `string-join`).

## Step 6 — Ecosystem changes in the last 12 months
Starting from the platform facts above, check for anything else (Appium 3.x, iOS / Xcode
hierarchy and element-type changes, Appium Inspector's recommended strategies). For each:
does the converter need a change? Cite source and date for each claim.

## Ratings 0–100
100 = every locator EXPRESSIBLE in class chain converts automatically, validly, and with
identical semantics, with no user input. Inexpressible locators are excluded from the
denominator; converting them incorrectly is penalized.

### R — real-corpus score (headline)
R = 100 × (CORRECT + 0.5·DRIFT documented in the README) / (expressible corpus entries)
    − 3 per distinct WRONG root cause − 5 per distinct CRASH root cause (penalties capped
    at −30). Scanner-context WRONGs from Step 2 count as root causes.
Ceiling C = share of the corpus that is expressible in class chain at all.
Gap list: what it would take to move R toward 100, each item with its point gain.

### S — spec score (secondary)
The weights below are FIXED: do not change them, so scores stay comparable across runs.
If you think a weight is wrong, say so in a separate note.

| Category | Weight |
|---|---|
| Steps, axes, absolute paths, Application root | 15 |
| Attributes, comparisons, booleans | 15 |
| XPath 1.0 string functions (+ case-insensitive) | 15 |
| Logic and precedence (and/or/not/parentheses, block merging) | 12 |
| Positional (`[n]`, `last()`, grouped, `position()`) | 12 |
| Nested / descendant predicates | 10 |
| Literals and escaping | 10 |
| WDA XPath extension functions (2.0-style) | 6 |
| Rewritable reverse axes (`/..` etc., if expressible) | 5 |

Category score = weight × (CORRECT + 0.5·DRIFT documented in the README) / (number of
expressible cases in the category). Same penalties as R.
Show both calculations step by step.

## Phase 1 deliverables (do not commit)
- `audit/coverage-report.md` — the report
- `audit/coverage-cases.json` — every judged case as
  `{ "id", "xpath", "expected", "actual", "status", "verdict", "shape", "category", "note" }`,
  so it can be diffed on the next run and turned into regression tests

Report structure:
1. Headline for sharing, two sentences a non-specialist understands, e.g. "The converter
   handles R% of what is possible. C% of real locators can be expressed as a class chain at
   all; the rest stay XPath by design." Then S, top 3 risks, the 1.0-vs-2.0 answer.
2. Corpus results by shape (table)
3. Scanner contexts (table: file → expected → actual → verdict)
4. Spec matrix (table)
5. Defects: severity (critical/major/minor) · repro (input → output → expected) ·
   `file:line` · suggested fix
6. Rating calculations and the gap list
7. Ecosystem changes → required actions
8. What was NOT verified, and why
Keep it tight: if a claim is not backed by a run or a source, say so.

# Phase 2 — on-device verification (separate session, only on request)
Goal: replace reasoning with observation. Run each selected XPath and its converted class
chain against the same screen of a purpose-built app and compare what they find. Device
outcomes override Phase 1 verdicts where they disagree; recompute R and S.

## Setup (pin and record every version)
Full Xcode (not just Command Line Tools) with an iOS simulator runtime; Appium 3.8.0;
`appium driver install xcuitest@12.16.0` (bundles WDA 16.14.1). Default WDA settings,
except record any you change. Use XcodeGen (`project.yml`) so the project is reproducible
from text. Everything lives in `audit/device/`.

## Reference app ("LocatorLab", SwiftUI, iOS)
Deterministic by design: no network, timers, animations or random data. The screen is
chosen by a launch argument (`-screen <name>`, passed via `appium:processArguments`), so
the harness never navigates. Use `.accessibilityIdentifier` and `.accessibilityLabel`
deliberately, and `.accessibilityElement(children: .contain)` where a container must appear
as `XCUIElementTypeOther`. Time-based dynamics (elements appearing after a delay) are out of
scope: they test waiting, not matching. Dynamic CONTENT is in scope: parameterized rows such
as "Line 1…N" and "Code 1…N", so templated locators (`${line}`) can be instantiated.

Build the screens from Phase 1's `coverage-cases.json` (one representative per shape, plus
every DRIFT, WRONG and GAP case, plus about 10 inexpressible cases). At minimum:
1. `identity` — identifier vs label (name falls back to label when there is no identifier),
   value vs label, texts with `\n`, `’`, `£`, `•`, both quote types, `*`, `/`, `|`, `(`, `)`.
2. `siblings` — key/value rows ("Cost:" → value) inside containers, labels followed by
   controls, so `following-sibling`, `preceding-sibling`, `parent::` and `/..` locators
   have real targets. These cases are expected to be found by XPath only.
3. `lists` — 3 sections × 4 rows with identical labels across sections, so per-parent
   positions (`//Cell[2]`) differ from global positions (`**/Cell[2]`); grouped
   `(//…)[n]`, `[last()]`, outer-index-on-parent cases.
4. `states` — buttons with the same label in enabled and disabled state; checkbox/toggle
   rows labelled "…, Checkbox, selected/unselected"; text field with placeholder; secure
   text field; an off-screen element in a scroll view (`visible` false).
5. `nesting` — chains of identifier-less wrappers (optimizer rule 5), the same name at
   different depths (descendant predicates), a sticky bottom bar whose primary and secondary
   buttons share identifiers but change labels, an `a and b or c` precedence target where
   the two readings select different elements.
6. `modal` — a sheet with a close button, a navigation bar with back/close buttons, an alert.

## Harness (`audit/device/run.js`, Node ≥ 20, zero dependencies, raw W3C over `fetch`)
For each case `{ id, screen, xpath }` (values adapted to the app, structure unchanged):
open a session per screen, `findElements` by XPath, convert with the library
(`optimize: true`), `findElements` by class chain, and fingerprint every hit as
type + name + label + value + rect, keeping order. Outcomes:
- `EQUAL`          — same set, same first element
- `FIRST_DIFFERS`  — same set, different first element (matters for findElement)
- `SET_DIFFERS`    — different sets → confirms DRIFT or WRONG
- `XPATH_ONLY`     — converter skipped, XPath finds the target (expected for inexpressible)
- `CC_ERROR`       — class chain rejected by WDA → WRONG
- `XPATH_ERROR`    — original XPath invalid on device (e.g. `@text`)
- `NONE`           — neither finds anything → fix the app fixture, not a verdict
Write `audit/device/results.json` and append a "Device verification" section to
`audit/coverage-report.md`: versions used, outcome counts, every case where the device
disagrees with the Phase 1 verdict, and the recomputed R and S.

Report language: English.
