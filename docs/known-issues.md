# Known issues and ideas

Problems that were found and deliberately not fixed, sorted by priority. The rule for what gets fixed and what lands here is in the project `CLAUDE.md` ("Scope of fixes"). A row leaves this file when it is fixed or when it turns out to matter (a user report, a corpus hit, a silent wrong result).

- **P1** — silently wrong result (a broken or changed locator reported as success, a file written wrongly) on realistic input. Never stays here: fix it.
- **P2** — wrong or confusing, but visible to the user (a skip with a poor reason, a surprising default), or a decision that is the maintainer's.
- **P3** — cosmetic, internal, or needs input that real code does not contain.

Last reviewed: 2026-10-25.

| Priority | Item | Seen in the corpus | Fix when |
|---|---|---|---|
| P2 | The library default is `optimize: false`, the CLI always optimizes. The same XPath gives different chains depending on the entry point. | n/a (API decision) | When the API is next touched; the recommendation is to keep `false` |
| P3 | `contains(@name, ${id})` with an unquoted interpolation is skipped as `skipped_validation_failed` ("Leftover XPath syntax") instead of a reason that names the interpolation. The result is right (a skip), only the text is vague. | no | When `rewriteStringFunctions` is touched |
| P3 | Hand-written quote/bracket scanners that are not on `lib/lexer.js`: `callArguments`, `escapeStringLiterals`, `lastStructuralSlash`, `predicates.outsideQuotes`, `validator.blankBlockLiterals` / `hasUnclosedQuote`, `optimizer.parseChainSteps`. Some differ on purpose (they read finished chains or JSON/Java-escaped text). | no | Fix-on-touch: move a scanner onto the lexer only when a bug is found in it |
| P3 | `collapseWildcardTypes` rejoins the remaining clauses with ` AND `, so `&&` and lower-case `and` in them are rewritten to `AND` (same meaning in NSPredicate). | no | Never, unless a user needs the original spelling |

## Not bugs

- `tokenizeXpath` and `scanText` throw on non-string input on purpose; `convertXpathToClassChain`, `validateAndFixClassChain` and `optimizeClassChain` return a skip / `valid: false`.

## Ideas

- Playground: a "paste source code" mode built on `scanText`.
