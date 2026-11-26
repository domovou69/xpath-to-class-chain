# Known issues and ideas

Problems that were found and deliberately not fixed, sorted by priority. The rule for what gets fixed and what lands here is in the project `CLAUDE.md` ("Scope of fixes"). A row leaves this file when it is fixed or when it turns out to matter (a user report, a corpus hit, a silent wrong result).

- **P1** — silently wrong result (a broken or changed locator reported as success, a file written wrongly) on realistic input. Never stays here: fix it.
- **P2** — wrong or confusing, but visible to the user (a skip with a poor reason, a surprising default), or a decision that is the maintainer's.
- **P3** — cosmetic, internal, or needs input that real code does not contain.

Each row is tracked as an issue on the project board (#N); the table is the index agents read.

Last reviewed: 2026-11-26.

| Priority | Title | Item | Seen in the corpus | Fix when |
|---|---|---|---|---|
| P2 | Library and CLI differ on `optimize` (#87) | The library default is `optimize: false`, the CLI always optimizes. The same XPath gives different chains depending on the entry point. | n/a (API decision) | When the API is next touched; the recommendation is to keep `false` |
| P3 | Vague skip reason for an unquoted `${id}` (#88) | `contains(@name, ${id})` with an unquoted interpolation is skipped as `skipped_validation_failed` ("Leftover XPath syntax") instead of a reason that names the interpolation. The result is right (a skip), only the text is vague. | no | When `rewriteStringFunctions` is touched |
| P3 | Quote and bracket scanners outside `lib/lexer.js` (#89) | Hand-written quote/bracket scanners that are not on `lib/lexer.js`: `callArguments`, `escapeStringLiterals`, `lastStructuralSlash`, `predicates.outsideQuotes`, `validator.blankBlockLiterals` / `hasUnclosedQuote`, `optimizer.parseChainSteps`. Some differ on purpose (they read finished chains or JSON/Java-escaped text). | no | Fix-on-touch: move a scanner onto the lexer only when a bug is found in it |
| P3 | `&&` and `and` rewritten to `AND` in a collapsed type test (#90) | `collapseWildcardTypes` rejoins the remaining clauses with ` AND `, so `&&` and lower-case `and` in them are rewritten to `AND` (same meaning in NSPredicate). | no | Never, unless a user needs the original spelling |
| P3 | XPath and chain list matches in another order on WDA 17 | WDA 17.1.4 (Appium 4) returns XPath matches in document order, the class chain stays breadth-first (WDA 16 and the Sauce Labs stack: both breadth-first). For a non-unique locator that matches at different depths, `findElement` can return another element for the chain than for the XPath. The set of matches and the chains are unchanged; a chain cannot be ordered by document position (the axis steps of WDA 17 do not exist in Appium 3). | Simulator: 8 of 246 cases (`//Cell/Button` with a nested cell). The harness does not model it (see `audit/harness/README.md`). | Only if users report it; then a warning or a note for non-unique locators, nothing in the chain. |
| P3 | Duplicate `Vertical scroll bar`: XPath finds both, chain one | The page source has two identical system scroll bars; WDA 17.1.4 returns both for an XPath, WDA 16 returned one, and the chain returns one on both. | Simulator: L240, H03 (broad type tests such as `//*[contains(@type,"XCUIElementTypeOther")]`). Real tests rarely target scroll indicators. | Never, unless a user locates scroll bars. |

## Not bugs

- `tokenizeXpath` and `scanText` throw on non-string input on purpose; `convertXpathToClassChain`, `validateAndFixClassChain` and `optimizeClassChain` return a skip / `valid: false`.

## Ideas

- Playground: a "paste source code" mode built on `scanText`.
