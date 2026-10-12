# iOS Class Chain rules

Condensed from this repository's audit: `audit/coverage-report.md`, `audit/llm/prompt-v4.md` and the README sections "What gets converted", "What it skips on purpose" and "On the device". Checked on Appium 3.8.0, appium-xcuitest-driver 12.16.0 and WebDriverAgent 16.14.1, on an iOS 27.0 simulator and an iPhone 13 Pro Max (iOS 26.6). Re-check when any of these change.

## What the measurements say

- On 676 real and hand-made XPath locators, the engine converted 579 and skipped 97 with a reason. It produced no wrong or invalid chains. Scores: R 95.8 (real locators), S 91.8 (edge cases), out of 100.
- An LLM given the rules below (prompt v4) reached 95.7–96.7 % of the engine's usable chains and found nothing the engine misses. Opus and Sonnet produced 0 wrong chains; Haiku produced 5. Run-to-run noise is about ±3 S.
- So: the engine's output is the reference. A chain written by hand or by a model for a locator the engine skipped is **unverified** until it is checked on the device or in `audit/harness`.
- A class chain was faster than the XPath in all 240 timed lookups: 22–29 % per lookup at 100–2000 elements (70 → 676 ms per lookup on the iPhone). Exception: `visible` on the last step (see below).

## Syntax

- Locator prefix: `-ios class chain:`. Steps are separated by `/`.
- `**/X` is any depth, `/X` is a direct child, `*` is any type (`XCUIElementTypeAny` is `*`). XPath `//` between steps becomes `/**/`. A leading `.//X` becomes `**/X`. `/XCUIElementTypeApplication/A/B` becomes `A/B`. Keep every intermediate step.
- Predicate: ``[`NSPredicate`]``. Descendant test: `[$NSPredicate$]`. Index: `[n]` (1-based), `[-1]` is the last match.
- A predicate comes before the index on the same step: ``X[`name == "a"`][2]``.
- Only real `XCUIElementType*` names. An unknown name (`XCUIElementTypeLabel`, `Btn`) is read by WDA as `Other`.

## String literals

- Double quotes. Escape `"` as `\"` and `\` as `\\`. Write line breaks as `\n`, tabs as `\t`. Write a backtick as two backticks.
- `==` is exact and has no wildcards: `*` and `?` are plain characters. Never use `LIKE` for them.

## Attributes

- Keys: `name`, `label`, `value`, `type`, `enabled`, `visible`, `accessible`, `hittable`, `placeholderValue`, `index`; `@x/@y/@width/@height` → `rect.x`, `rect.y`, `rect.width`, `rect.height`.
- Booleans and numbers are unquoted: `enabled == true`, `index == 1`, `rect.x > 60`.
- `@type="T"` is the step `T`, not a predicate. `contains(@type,"XCUIElementTypeButton")` is the step too, unless another real type name begins with that literal (Key, Menu, MenuBar, Outline, Picker, Ruler, Tab, Table, Toolbar). A partial or invented type literal has no exact form.
- A missing attribute fails an XPath comparison but is `nil` in NSPredicate: `@a!="v"` → `a != nil AND a != "v"`; `[@a]` → `a != nil`; `not(@a="v")` → `NOT (a == "v")`.
- `[@enabled=true()]` (also `visible`, `accessible`) only tests that the attribute exists; WDA always writes it, so it becomes no predicate. `contains(@enabled,"false")` → `enabled == false`. Never `CONTAINS` on a boolean attribute: WDA raises an error.
- `<` and `>` only on numeric attributes (`rect.*`, `index`). On text (`name`, `label`, `value`) there is no exact form: `value.doubleValue` reads `"10abc"` as 10, XPath reads it as NaN.
- `@text` and `@selected` are not in the XML WDA searches; `text()` and `.` as text have no chain form.
- AND binds tighter than OR in both languages. Put parentheses around every AND group inside an OR, and around an OR combined with another `[…]`.

## Text functions

- `contains` / `starts-with` / `ends-with` → `CONTAINS` / `BEGINSWITH` / `ENDSWITH`. `concat()` of literals folds into one literal.
- `lower-case(x)="v"`, `upper-case(x)="V"` → `x ==[c] "v"`. `contains` over `lower-case(x)`, `upper-case(x)` or `translate(x, "A..Z", "a..z")` → `CONTAINS[c]`. Only with an ASCII literal already in the case the function produces.
- `matches(x, p)` with no flags and no regex metacharacters → `CONTAINS`; flag `i` → `CONTAINS[c]`; any other `p` → `MATCHES "(?s:.*)(?-s:p)(?s:.*)"` (XPath searches inside the string; `MATCHES` must match the whole string and its `.` matches a line break).

## No exact class chain (the engine skips these)

| XPath construct | Why |
|---|---|
| `following-sibling::`, `preceding-sibling::`, `parent::`, `..`, `following::`, `preceding::`, `ancestor-or-self::`, `descendant-or-self::` | Class chain has no sibling or upward axis. |
| `ancestor::` other than `//T1[p]/ancestor::T2` with two different types | `[$…$]` also tests the element itself; `ancestor::X[1]` (nearest) has no form. |
| `[.//X[…]]` where the element itself could match (`*` or the same type on both steps); child tests `[X]`, `[./X]` | Same: `[$…$]` includes the element itself. |
| `last()`, `position()`, `count()` inside a step; an index before a filter (`X[2][@a="v"]`) | XPath indexes per parent before filtering; a chain filters first. |
| Union `a \| b` of different shapes | Only unions of `//T[p]` that differ in the predicate join into one `OR`. |
| `normalize-space()`, `string-length()` | `MATCHES` treats a no-break space as a space; `.length` counts UTF-16 units. |
| `matches()` with flags other than `i`, a space in the pattern, a pattern that matches the empty string | Device behaviour differs from XPath. |
| `replace()`, `tokenize()`, `string-join()` | No NSPredicate equivalent. |
| A numeric comparison on text (`@value>5`) | See Attributes. |
| An unknown attribute (`@text`) or element type | WDA raises `FBUnknownAttributeException` or reads the type as `Other`. |
| A string passed to an explicit XPath strategy (`AppiumBy.xpath("…")`, `@iOSXCUITFindBy(xpath = …)`) | Changing only the string breaks the call. Change the strategy and the string together. |

## Device facts

- **Grouped positions count breadth-first.** `(//X)[n]` → `**/X[n]` and `(//X)[last()]` → `**/X[-1]` are converted with a warning. XPath counts in document order and WDA counts breadth-first. They agree only when all matches sit at the same depth (e.g. rows of one list). Check each one on its screen.
- **Text normalization.** `==` and XPath compare code points. `CONTAINS` and `BEGINSWITH` treat canonically equivalent text as equal. `MATCHES` and `[c]` compare NFKC text: fullwidth letters, ligatures, `ß` (for `[c]`) and the Kelvin sign fold to ASCII. Conversions are exact only for text without such characters.
- **Selector errors look like "element not found".** appium-xcuitest-driver 12.16.0 turns WDA's `400 invalid selector` into `[]` / "no such element". An invalid chain therefore looks like a missing element.
- **`visible` on the final step is slow.** ``**/XCUIElementTypeButton[`visible == true`]`` took 12.6 s against 2.0 s for the XPath on a screen with 32 visible buttons. Avoid `visible` where lookup time matters.
- WDA snapshots stop at depth 50 (`snapshotMaxDepth`): nothing deeper is found by either strategy.
