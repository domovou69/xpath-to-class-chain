# Coverage audit: XPath → iOS class chain (Phase 1, static)

> Where this report says "README", it means the README of the time. Since 2026-10-16 the reference sections it quotes ("What gets converted", "What it skips on purpose", "The optimizer", "On the device") are in [`docs/reference.md`](../docs/reference.md), and "Results at a glance" is [`docs/results.md`](../docs/results.md).

Audit date 2026-10-09/10. Target platform pinned per `audit/prompts/coverage.md`: Appium 3.8.0, appium-xcuitest-driver 12.16.0, WebDriverAgent (WDA) 16.14.1. The npm registry confirms that driver 12.16.0 depends on `appium-webdriveragent` 16.14.1.

**How verdicts were produced.** No verdict here comes from reading the converter and reasoning about it. Each comes from a run:

- **mini-WDA harness.** The class chain parser, the predicate→attribute mapping, the FBElement protocol and the XPath extension functions were compiled from WDA tag `v16.14.1` (commit 2e98ac0): ten files unchanged, two with small patches that only remove or stub device-only code: snapshot wrappers and accessibility-element ids (`audit/harness/wda/patches/`). They run on macOS Foundation with libxml2. Around them sit two thin stand-ins: the XML writer (attribute order, query-driven attribute inclusion, `"true"`/`"false"` booleans, as in `FBXPath.m`) and the snapshot-walk lookup, adapted line by line from `XCUIElement+FBClassChain.m`.
  - Self-test: all 43 valid and invalid queries from WDA's `FBClassChainTests.m` parse or fail exactly as the tests expect.
- **Corpus.** Every converted entry ran against 200 random page sources built from its own literals and types. XPath and class chain were compared on the result set and the first element. Values went through the same runtime unescaping and `${…}` substitution on both sides.
- **Spec matrix.** The same comparison, plus hand-built fixtures. A hand-written "correct" chain was run as well; a skip counts as a GAP only after that chain is shown equal to the XPath.

The harness and all scripts are in `audit/harness/`; `./run.sh` reproduces this report's numbers and `coverage-cases.json` byte for byte (see its README). Project code was not modified.

## Progress since Phase 1

Sections 1–8 below are the Phase 1 baseline and stay as they were. Each fix branch adds a row here. The `audit/phase2` row is not a fix: it applies what the device showed (see Device verification below). The numbers come from `audit/harness/run.sh`, and `coverage-cases.json` holds the current verdicts.

| Branch | Root causes fixed | R | C | S (raw) | Corpus WRONG | Spec WRONG |
|---|---|---|---|---|---|---|
| Phase 1 baseline | — | 72.2 | 86.9 % | 7.7 (37.7) | 9 | 42 |
| `fix/class-chain-parse-errors` | RC1, RC6, RC9; RC5 and RC-S3 no longer ship broken chains | 81.6 | 86.9 % | 11.7 (41.7) | 6 | 22 |
| `fix/silent-wrong-selection` | RC7, RC8, RC15 | 81.6 | 86.9 % | 21.3 (51.3) | 6 | 14 |
| `fix/predicate-literals` | RC2, RC10, RC11, RC12, RC13; RC7 in the optimizer | 85.2 | 86.9 % | 42.0 (57.0) | 3 | 6 |
| `fix/attribute-semantics` | RC3, RC4, RC14; RC-S3 | 91.6 | 86.9 % | 57.2 (63.2) | 0 | 0 |
| `fix/scanner-xpath-strategy` | RC-S1, RC-S2 | 97.6 | 86.9 % | 63.2 (63.2) | 0 | 0 |
| `audit/phase2` (device verification) | none fixed; found RC-D1 (DRIFT) and RC-D2 (WRONG), corrected mini-WDA | 92.3 | 86.3 % | 54.5 (57.5) | 0 | 1 |
| `fix/rc-d2-descendant-self` | RC-D2 | 92.3 | 86.3 % | 57.5 (57.5) | 0 | 0 |
| `fix/rc-d1-grouped-position` | RC-D1 documented (DRIFT, no exact chain) | 95.3 | 86.3 % | 61.9 (61.9) | 0 | 0 |
| `fix/harness-expectations` (Phase 5, A) | none fixed; harness expectations corrected: H07 expressible (GAP), E07 / E11 judged like E02, L157 out of every denominator | 95.3 | 86.5 % | 61.8 (61.8) | 0 | 0 |
| `fix/parser-provable-b1-b2` (Phase 5, B1 + B2) | none of RC-*: converter now emits the six GAP chains that mini-WDA proves EQUAL (G03, G04, G14, D07, D08, L458) | 95.5 | 86.5 % | 65.5 (65.5) | 0 | 0 |
| `fix/parser-provable-b3` (Phase 5, B3) | none of RC-*: unions and `self::` — the six GAP chains mini-WDA proves EQUAL (X04, X05, X07, L355, L455, L461) | 96.1 | 86.5 % | 67.9 (67.9) | 0 | 0 |
| `fix/parser-provable-b4` (Phase 5, B4) | none of RC-*: leading `.//` (A12 GAP → CORRECT); optimizer rules 1 and 7 removed (A07, A14, A15, A16 DRIFT → CORRECT) | 96.1 | 86.5 % | 72.4 (72.4) | 0 | 0 |
| `fix/parser-provable-b5` (Phase 5, B5) | none of RC-*: `concat()` of string literals folded into one literal (C09 GAP → CORRECT) | 96.1 | 86.5 % | 74.1 (74.1) | 0 | 0 |
| `fix/c2-last` (Phase 5, C2) | none of RC-*: grouped `(…)[last()]` → `[-1]`, `(…)[last()-n]` → `[-(n+1)]` as documented DRIFT (RC-D1); E05, E06, L270–L272 CORRECT-SKIP → DRIFT | 95.8 | 87.0 % | 74.3 (74.3) | 0 | 0 |
| `fix/c2-attributes` (Phase 5, C2) | RC-D3 (skip); B16 `@attr=true()` → no predicate (DRIFT → CORRECT) | 95.8 | 87.0 % | 75.3 (75.3) | 0 | 0 |
| `fix/c2-axes` (Phase 5, C2) | none of RC-*: `[descendant::T]` and `//T1[cond]/ancestor::T2` → `$…$` descendant predicate (F04, R01 GAP → CORRECT) | 95.8 | 87.0 % | 82.8 (82.8) | 0 | 0 |
| `fix/c2-functions` (Phase 5, C2) | none of RC-*: `matches()`, `lower-case()`, `contains(upper-case()…)`, `contains(translate()…)` → `CONTAINS` / `[c]` / wrapped `MATCHES` (H02–H06, C08 GAP → CORRECT); C06, C07 skipped with a reason and out of the denominator | 95.8 | 87.0 % | 92.0 (92.0) | 0 | 0 |
| `audit/scoring-ceiling` | none of RC-*: L174, L225, E13 documented in the README (DRIFT, half credit); H07 `replace()` not expressible (GAP → CORRECT-SKIP) | 96.0 | 87.0 % | 93.6 (93.6) | 0 | 0 |
| **Total, Phase 1 → now** (scoring ceiling) | RC1–RC15, RC-S1–S3, RC-D1–D3; Phase 5 B and C2 | **72.2 → 96.0** | 86.9 % → 87.0 % | **7.7 → 93.6** (93.6) | 9 → 0 | 42 → 0 |
| `docs/phase7-corpus-github` (Phase 7) | corpus grows to 1386 in scope (+824 GitHub literals), so R / C are not comparable with the rows above; 8 converter and scanner fixes, see "GitHub corpus (Phase 7)" | 91.9 (production 96.0) | 85.1 % (production 87.0 %) | 93.6 (93.6) | 0 | 0 |

D1 is a re-run of `audit/harness/run.sh` on `main` after PR #24, with no change to the converter or the harness: R 95.8, C 87.0 %, S 92.0, "no changes vs baseline". The `audit/scoring-ceiling` row then documents the three remaining DRIFT cases and moves H07 out of the denominator, with the numbers below. What is left:

- **No GAP left.** H07 (`replace()`) was the last one. It is now not expressible: NSPredicate has no string replacement, and the `MATCHES "[ab]{2}"` chain that the harness proves for it works for this one literal pair only, so it is not a conversion rule. The converter's skip (`skipped_validation_failed`) is a correct skip, and H is 6 of 6.
- **Documented DRIFT.** 39 corpus locators and the spec cases with an `approx` expectation earn half credit: the grouped-position rule (RC-D1, `(…)[n]` and, since c2-last, `(…)[last()]` → `[-1]`) and the other approximations in the README. They are why R is 96.0 and not 100 (E 6.0 of 12, G 9.64 of 10).
- **Undocumented DRIFT: none.** L174 and E13 (the outer index `(…/child::*[2])[n]` is moved onto the parent; a chain's index is per parent only) and L225 (nested matching containers) are now described in the README next to the grouped-position warning and score as documented DRIFT. L225 is not UNVERIFIED any more: on the device (`nesting` screen, `audit/device/results-device.json`) the XPath picks `Nepureze leaf` and the chain `Nepureze side`; L174 diverges there too (XPath one element, chain none). E13 is equal on the device screen and differs on the harness fixture (`z2` against none).
- **The ceiling.** The converter cannot reach 100, because every DRIFT earns 0.5 (the weight is unchanged: it measures accuracy, not feasibility): R at most 96.0 (450 CORRECT + 39 × 0.5 of 489) and S at most 93.6 (E 6.0 of 12 with eight DRIFT, G 9.64 of 10). The converter reaches both; no row can score above them. Before: R 95.8 / S 91.8 (L174, L225 and E13 earned 0, H07 was a GAP). Rows that changed on rescoring (no model was run again): converter R 95.8 → 96.0, S 91.8 → 93.6; the models' R moves by at most 0.1 and S by up to 0.9 (H07 left the denominator; see the model tables). F03 (not expressible) is now WRONG in five cells (opus medium / high, sonnet medium / high / max): its `[$name == "x"$]` chain also matches the Cell itself (RC-D2), which the rebuilt mini-WDA emulator shows; the stored scores predated that, and it does not change R or S.
- **Skipped on purpose** (CORRECT-SKIP): 73 corpus locators and 98 spec cases that have no exact class chain or would be wrong on a device: sibling / parent / following axes, unions of different paths, page-level `not()`, `normalize-space()` and `string-length()` (C06, C07), `>` on a text attribute (B03, RC-D3), same-type or `*` descendant predicates (RC-D2), regex flags other than `i`. C stays at 87.0 % because of them.


Notes on `fix/c2-functions` (Phase 5, C2):

- **`matches()`.** `matches(@attr, "p")` with no regex metacharacter (`\ ^ $ . | ? * + ( ) [ ] { }`) in `p` → ``attr CONTAINS "p"`` (H03); with the flag `"i"` → ``CONTAINS[c]`` for an ASCII pattern (H04). Any other pattern → ``attr MATCHES "(?s:.*)(?-s:p)(?s:.*)"`` (H02), with `(?i)` in front for `"i"`. That includes a plain non-ASCII pattern with `"i"`: under the `(?i)` of `MATCHES` it gets the same ICU case folding as WDA's `NSRegularExpressionCaseInsensitive`. The pattern goes through `escapeStringLiterals` (RC4): `a\.c` → ``"(?s:.*)(?-s:a\\.c)(?s:.*)"``, a backtick is doubled, and the original quote kind is kept (`'a"b'`). The validator passes `MATCHES`, `CONTAINS[c]` and `==[c]` unchanged (the `(` inside the literal is blanked before the function check).
  - Skipped with a reason: a flag other than `i` (WDA accepts `m`, `s` and `x` but applies only `i`, `FBXPathExtensions.m`; not checked on the device), a literal space or other whitespace in the pattern (C1: `MATCHES` also matches U+00A0), an empty pattern, a pattern that matches the empty string (`a*`, `^$`: WDA reads a missing attribute as `""`, and `MATCHES` on nil is false; checked with a JS `RegExp`), a pattern that a JS `RegExp` rejects, a `${…}` pattern, a backslash before a quote, backtick, `$`, `u` or `x` (left for the host language by RC4, so its meaning in the pattern is unknown), `\"…\"` literals, a wrong number of arguments, and a first argument other than a text attribute (`text()`, `.`, `@enabled`, `@x`, `@text` each with its own reason).
- **`lower-case()` / `upper-case()` / `translate()`.** `lower-case(@a)="v"` → ``a ==[c] "v"`` (H05), `contains(upper-case(@a),"V")` → ``a CONTAINS[c] "V"`` (H06), `contains(translate(@a,"A…Z","a…z"),"v")` with exactly those two alphabets → ``a CONTAINS[c] "v"`` (C08). This is only for a non-empty ASCII literal in the case the function produces. `lower-case(@a)="AB"` never matches and is skipped as such. Every other form is skipped as "not checked on the device": `upper-case(@a)="V"`, `contains(lower-case(…))`, `!=`, another `translate()`, a non-ASCII literal.
- **C06, C07.** `normalize-space()` and `string-length()` are skipped with the C1 reasons (U+00A0 under `MATCHES`; `.length` counts UTF-16 units). Their spec expectation becomes `inexpressible`, and both join `NOT_EXPRESSIBLE` in `build.js`, so C has 7 expressible cases instead of 9.
- **The functions combine with the rest.** They work inside `not()` (``NOT (name CONTAINS "b")``; a missing attribute gives true on both sides), with `and` / `or`, and in a `.//T[…]` descendant predicate.
- **`$` in a `$…$` block (found here, fixed).** WDA's class chain parser ends a descendant predicate at any `$`, even one inside a string literal: ``[$… name == "a$b"$]`` is a parse error in mini-WDA. This happened already with `//Cell[.//Button[@name="a$b"]]`, and the `MATCHES` wrapper makes it more likely (`$` anchors). A descendant predicate whose text holds a `$` outside `${…}` is now skipped with the reason `$ inside a descendant predicate`. No corpus or spec case had one.
- **Normalization (a documented limit, checked on the device in D0).** NSPredicate compares normalized text, and XPath compares code points. On the simulator (D0, 126 cases, mini-WDA agrees in all 126): `==` is exact; `CONTAINS` / `BEGINSWITH` treat canonically equivalent text as equal (Kelvin = `K`, decomposed = composed `é` / `Å`) and a base-letter pattern misses the same letter followed by a combining mark; `MATCHES` compares NFKC text case-sensitively (fullwidth `Ｑ`, `ﬁ`, `①`, `ſ`, Kelvin fold; `ß` does not); `[c]` adds full case folding (`ß` = `ss`, `ſ` = `s`, Kelvin = `k`). Table in "Device check (Phase 5, D0)"; new root cause RC-D4 (documented, not fixed). The limit is documented in the README ("On the device").
- **mini-WDA against C1.** The H02 fixture gained `abc\n` and `a\nc`. mini-WDA gives the C1 result: XPath `[b1, b4]`, the models' ``MATCHES "a.c"`` gives `[b1, b5]`, and the converter's wrapper gives `[b1, b4]`. No divergence from C1.
- Harness: 8 verdicts changed (H02–H06 and C08 GAP → CORRECT; C06, C07 GAP → CORRECT-SKIP). No new WRONG or DRIFT, no "needs review" lines. The spec expectations of H02–H04 are now the converter's forms (the models' `MATCHES "a.c"` for H02 is refuted). C goes from 6/9 to 7/7 and H from 1/7 to 6/7 (only H07 is left as GAP), so S goes from 82.8 to 92.0. R is unchanged because no corpus entry uses these functions. No fuzz notes moved. In H02's random trees the XPath never matched (0 hits), so the fixture is the real check.
- **Simulator** (`LocatorLab iPhone 17`, iOS 27.0; AC power, Low Power Mode off): `run.js --cases cases-c1.json --only H02,H03,H04,H05,H06,C08,C06,C07` in 72 s. The converter's chains are EQUAL to the XPath on `functions` and `c1` for H02–H06 and C08. On `c1`, H02's two model candidates are SET_DIFFERS, as in C1. C06 and C07 are skipped (XPATH_ONLY). The output is `device/out/c2-functions.json`, which git ignores. The iPhone was not run. The case file's verdict column still shows the pre-C2 GAP labels.
- For D2: `audit/llm/score.js` keeps its own `SPEC_NOT_EXPRESSIBLE`. Add C06 and C07 there (and B03 from `fix/c2-attributes`). The H02 fixture now rejects the models' ``MATCHES "a.c"``, so their H02 answers will change when they are rescored. That script was not run here.
- Older text still lists these functions as RC6 skips or GAPs, for example section 1 ("What the converter supports. Only `ends-with`"), the Phase 2 snapshots and the Phase 4 tables. Those are snapshots and stay as they were.
- Regression tests: 25 conversion rows (`matches` plain, `i`, metacharacters, anchors, a group, `\.`, a backslash, quotes, `]`, a backtick, non-ASCII with and without `i`, `not()`, `or`, `$…$`, a literal holding `matches(…)`, `lower-case` / `upper-case` / `translate` with spaces, single quotes, `and`, `not()`), 38 skip rows with their reasons (C06, C07, flags, space, tab, invalid, empty-matching, empty, `${…}`, a host escape, `\"…\"`, arity, never closed, `text()`, `.`, boolean, number and unknown attributes, non-ASCII, a literal of the wrong case, untested forms, inside `not()` / `or`, `$` in `$…$`), and one row for `${…}` in `$…$` (still converted). The old RC6 skip rows for H02, H05, C06 and C07 were moved.

Notes on `fix/c2-axes` (Phase 5, C2):

- **F04.** `descendant::` at the start of a predicate is read as `.//`, so `//XCUIElementTypeCell[descendant::XCUIElementTypeButton]` → `**/XCUIElementTypeCell[$type == "XCUIElementTypeButton"$]`, and `[descendant::T[cond]]` takes the same path as `[.//T[cond]]`. The RC-D2 rule therefore applies unchanged: `[descendant::*]`, `//*[descendant::T]` and `//T[descendant::T]` are skipped because `$…$` would also match the element itself. `[descendant::T[2]]`, `[descendant::T/U]` and `descendant::` after `and` are skipped too. `descendant-or-self::` stays a skip.
- **R01.** `//T1[cond]/ancestor::T2` is rewritten as `//T2[.//T1[cond]]` and converted as the descendant predicate: `//XCUIElementTypeButton[@name="x"]/ancestor::XCUIElementTypeCell` → `**/XCUIElementTypeCell[$type == "XCUIElementTypeButton" AND name == "x"$]`. Each other form is skipped with its own reason: `*` or the same type on either step (RC-D2), a predicate or index on the ancestor step (R04 `ancestor::T[1]` is the nearest ancestor), a path before or after it, `ancestor::XCUIElementTypeApplication` (the root, which `**/` never returns), an index or several `[…]` on T1, and a leading `.//` (from an element, `ancestor::` climbs to the context node and above, where `**/` does not look). `ancestor-or-self::`, `parent::`, `..` and the sibling axes are unchanged skips (R02–R04, X01–X03). A grouped `(…/ancestor::T2)[n]` gets the usual RC-D1 warning.
- Harness: 2 verdicts changed (F04, R01 GAP → CORRECT; `build.js` SPEC updated by hand), no new WRONG or DRIFT. F 4 / 4 and R 1 / 1, so S 75.3 → 82.8. R is unchanged: no corpus entry uses either axis. No fuzz notes moved.
- **Simulator** (`LocatorLab iPhone 17`, iOS 27.0; AC power, Low Power Mode off): `run.js --cases cases-c1.json --only F04,R01` in 58 s. The converter's chains are the C1 candidates and are EQUAL to the XPath: F04 16 Cells on `lists` (including `deep.cell`), R01 2 Cells on `siblings`. The output is `device/out/c2-axes.json` (ignored by git). The iPhone was not run.
- D2: `audit/llm/score.js` already counts F04 and R01 as expressible, so it needs no change for this group.

Notes on `fix/c2-attributes` (Phase 5, C2):

- **B16.** A whole predicate `[@enabled=true()]` / `[@enabled!=false()]` is dropped: `//XCUIElementTypeButton[@enabled=true()]` → `**/XCUIElementTypeButton`. The rule covers `enabled`, `visible` and `accessible`, the booleans that every Phase 2 / C1 page source holds on every element. XPath compares `true()` with the attribute node-set, so the test is "the attribute exists", whatever its value. Skipped, with a reason: `=false()` / `!=true()` on those three (they never match); `true()` / `false()` on `selected`, `focused`, `exists` (never in the page source) and `hittable` (only when the query names it; not checked on the device); and `true()` / `false()` inside a larger predicate (`[@enabled=true() and @name="a"]`, `not(@enabled=true())`), which would have to be removed from that predicate. `@enabled="true"` (a string) is unchanged: ``enabled == true``.
- **RC-D3.** `>` / `>=` on a text attribute (`@value>5`) is no longer converted to ``value.doubleValue > 5``. It is skipped with the reason `doubleValue reads "10abc" as 10, XPath as NaN`, as `@value<5` already was. `rect.*` and `index` comparisons (B04, B11) are unchanged. README: the `@value>0.5` row in "What gets converted" is replaced by the B16 row, and the skip table gives both reasons.
- **Harness fixture.** B03 now has a fixture: Buttons with `value` `10abc`, `7`, `abc` and `1e3`. With the old chain, mini-WDA gives XPath `[b2, b4]` and chain `[b1, b2, b4]`, which is RC-D3, since b1 is `10abc`. That would be WRONG under the `CORRECT` check of `build.js`, which also fails on a fixture difference. The random trees never hold such a value, so B03 had been CORRECT. Since RC-D3 there is no exact chain, so B03 joins `NOT_EXPRESSIBLE` with the label CORRECT-SKIP, like the other skips with no exact form. B is 15 / 15, and S 74.3 → 75.3.
- Harness: 2 verdicts changed (B03 CORRECT → CORRECT-SKIP, B16 DRIFT → CORRECT), no new WRONG or DRIFT; R unchanged (no corpus entry used either form). Spec DRIFT not documented: B08 and E13 are left. No fuzz notes moved, because no corpus chain changed.
- **Simulator** (`LocatorLab iPhone 17`, iOS 27.0; AC power, Low Power Mode off): `run.js --cases cases-c1.json --only B16,B03` in 63 s. B16: the converter's chain `**/XCUIElementTypeButton` is EQUAL to the XPath (and so is the candidate, as in C1). B03 (`states` and `c1`): the converter skips, XPATH_ONLY. The output is `device/out/c2-attributes.json` (ignored by git). The iPhone was not run.
- For D2: `audit/llm/score.js` keeps its own `SPEC_NOT_EXPRESSIBLE` and still counts B03 as expressible. Add B03 there when the Phase 4 answers are rescored, so that both scorers agree. That script was not run here.

Notes on `fix/c2-last` (Phase 5, C2):

- **Grouped `last()`.** `unwrapGrouped` now accepts the outer index `[last()]` and `[last()-n]` (n ≥ 1, spaces allowed) and writes it as `[-1]` / `[-(n+1)]`: `(//XCUIElementTypeButton)[last()]` → `**/XCUIElementTypeButton[-1]`. The rest of the grouped path is unchanged, so the result carries the same grouped-position warning as `(…)[n]` (RC-D1). C1 showed that `[-n]` counts from the end of the same breadth-first list that `findElements` returns, so this is the RC-D1 DRIFT, not a new one. README: a row in "What gets converted", the positional note and "On the device" name `last()`, and the skip tables keep only per-parent `last()` and other function indexes. The `not()` row in the skip table was out of date since B2 and was dropped with it.
  - Still skipped: per-parent `//X[last()]` (E04), `[last()+1]`, `[last()-0]`, `[last()-${n}]`, `[last()][1]` (`skipped_not_xpath`, as before), a grouped union (`grouped union`), and `(//Cell/Button[2])[last()]`, where the inner chain already ends with a position (`skipped_unsupported_logic`, reason `grouped last() over an inner index`). The parent-move that `(…[m])[n]` uses was not extended to positions counted from the end.
- **Simulator** (`LocatorLab iPhone 17`, iOS 27.0; AC power, Low Power Mode off): `run.js --cases cases-c1.json --only E05,E06,L270,L271,L272` in 69 s. For all five cases the converter's chain returns the same element as the `[-1]` / `[-2]` candidate in `results-c1.json` and as the candidate in the same run. Against the XPath it is SET_DIFFERS, as in C1 (that is the DRIFT). The `~all` ORDER rows are EQUAL. The output is `device/out/c2-last.json` (ignored by git, like other partial runs). The iPhone was not run, because C1 found no device-dependent case.
- Harness: 5 verdicts CORRECT-SKIP → DRIFT (documented). E05 and E06 now carry an `approx` expectation, as E02 does, and are no longer in `NOT_EXPRESSIBLE`. L270–L272 are in `CORPUS_DRIFT` with the RC-D1 reason, and fuzz gives each a counter-example. No new WRONG, no undocumented DRIFT. R 96.1 → 95.8 and C 86.5 → 87.0 %: three entries move from the excluded skips into the denominator at half weight. S 74.1 → 74.3: category E goes from 5 documented DRIFTs out of 6 to 7 out of 8.
- Fuzz notes moved: the fuzz RNG is one seeded stream (`fuzz.js:8`), and the three new chains draw from it, so the `min matching trials` counts of later corpus entries changed by a few. No verdict changed. This is why the `coverage-cases.json` diff is larger than five rows.
- Regression tests: 5 conversion rows (`[last()]`, `[last()-1]`, `[ last() - 2 ]`, with a predicate, L272's two-step shape), 2 warning rows (E05, E06), and 6 skip rows (`last()+1`, `last()-0`, `last()-${n}`, `[last()][1]`, inner index, union). The old skip row "grouped outer last()" became a conversion.

Notes on `fix/parser-provable-b5` (Phase 5, B5):

- **`concat()` of literals.** Before the predicate is rewritten, `concat("a", 'b', …)` is replaced by the single literal it evaluates to: `//*[@label=concat("a","b")]` → ``**/*[`label == "ab"`]`` (C09). The result is in double quotes unless the text contains a `"`, in which case it uses single quotes, as B1 writes `'a"b'`. A `]` or a backtick in the text is handled the same way as in any other literal (B1: the backtick is doubled). The fold happens at the start of `rewritePredicate`, so it also applies inside `contains` / `starts-with` / `ends-with`, `text()`, `not()`, `!=`, `or`, `$…$` descendant predicates and grouped positions.
  - Not folded: fewer than two arguments, `concat()`, an attribute, number, function or path argument, `\"…\"` arguments (JSON / Java source), any backslash (a host-language escape), text that contains both `'` and `"` (no NSPredicate literal works without a backslash escape, and the host language would decode that escape first), and a `${…}` that only exists once the arguments are joined (`concat("$","{x}")`, `concat("${a","}")`). A `${…}` that stays inside one argument is kept as it is: in a template literal it is the same runtime text either way. A call that is not folded is left in place, and the validator rejects it (RC6) with the same `skipped_validation_failed` as before. The RC6 rule in the validator is unchanged.
  - Checked ad hoc on mini-WDA (one fixed tree with labels `ab`, `abc`, `xaby`, `say "hi"`, `it's a]b`c`, `concat('a','b')`, …; not new harness cases): `=`, three arguments, mixed quotes, `]` and backtick, an empty argument, `contains` / `starts-with` / `ends-with` with a `concat` argument, `or` of two folds, a `$…$` descendant predicate, `(…)[2]`, and a literal that contains the text `concat(…)` all give the same element list as the XPath. `!=` and `not(…)` differ only by the Application root, `contains(text(), …)` differs by the existing `text()` → `label OR value` mapping (mini-WDA's tree has no text nodes). The same forms written with a plain literal give the same differences, so B5 adds nothing new there: the root problem is the B3 follow-up.
- Harness: 1 verdict GAP → CORRECT (C09: 35 hits, expected and actual EQUAL), no new WRONG or DRIFT. R stays 96.1 (no corpus entry changed). S 72.4 → 74.1: category C goes from 5/9 to 6/9. All GAP 12 → 11. Only the C09 row changed in `coverage-cases.json`. No fuzz notes moved, because no corpus chain changed.
- Older text still describes C09 as GAP or WRONG RC6: sections 1–8 (Phase 1), the Phase 2 snapshots and the Phase 4 tables. These are snapshots and are left as they were. The Phase 4 model table is not recomputed here (D2).
- Still open from earlier branches, not changed here: `//` → `**/` and `///` → `**//` reported as `success`; the scanner does not pick up `.//X` or `/XCUIElementTypeApplication/…`; `//*[not(…)]` (and `//*[@a!=…]`) also matches the Application root.
- Regression tests: 10 folding rows (C09, three arguments, quotes, `]` / backtick, empty argument, `!=`, inside `contains`, `${…}`, a literal that contains `concat(…)`, a `$…$` predicate), C09 through `{ optimize: true }`, and 12 skip rows (attribute, number, nested function, path, one argument, no arguments, both quote kinds, `${…}` created or split by the join, JSON-escaped quotes, a backslash, an unclosed call). The old skip row "RC6: concat (C09)" is moved to the conversions.

Notes on `fix/parser-provable-b4` (Phase 5, B4):

- **Leading `.//`.** `.//X` searches below the context node: the Application element for a driver lookup (mini-WDA evaluates it there: `.//*` does not return the root), the element itself for an element lookup. A chain is evaluated from the same node and `**/` never returns it, so `.//X` → `**/X` (A12). `(.//X)[n]` converts like `(//X)[n]`, with the grouped-position warning.
  - Still skipped: `./X`, `.`, `..//X`, `.//` with nothing after it, `.///X`, and a union that starts with `.//` (slicing the `.` off `.//X | //Y` would leave the other operand absolute). `./X`, `.//X` and `.` after a step are still handled by `dropSelfSteps` as before.
  - The CLI scanner still picks up only strings that start with `//` or `(//`, so `.//X` (and `/XCUIElementTypeApplication/…`, A07) converts through the library API only. Changing the scanner is left out of B4.
  - Checked ad hoc on mini-WDA (200 random trees each, not new harness cases): `.//*`, `.//*[@name="a"]`, `.//Cell//Button`, `.//Cell/./Button`, `.//Cell[@visible="true"]/Button`, `.//Other/Button[…]`, `.//Window/Other/Button`, `.//Cell[.//Button[…]]` and `.//*[not(@name="a")]` are 200/200 equal. `.//*[not(…)]` does not have the root problem of `//*[not(…)]` (B3 follow-up), because `.//*` does not return the Application element either. `(.//Button)[1]` differs in 19/200, which is RC-D1 (breadth-first order) and is flagged.
- **Optimizer rules 1 and 7 removed.** The harness runs the converter with `{ optimize: true }`, and the CLI always does (`--optimize` is a no-op, the optimizer cannot be turned off), so these rules were part of the measured behaviour. Both changed the matched set, and neither has a subset that is safe without knowing the screen:
  - Rule 1 (`stripMeaninglessIntermediates`) dropped `Other` / `Window` steps without a predicate: `**/Window/Other/Button` → `**/Button`, `P/Other/X` → `P/**/X`. On the device in Phase 2 this also found the `Close` buttons in the navigation bar and directly in the window (A07, A14, A15).
  - Rule 7 (`deferVisibleToFinalStep`) moved `visible == 1` from intermediate steps to the final step. Visibility of a container and of an element inside it are independent: on the device a visible cell held a button that was not visible (A16).
  - Both functions are deleted (they were never exported from the package entry point or typed in `xpath-to-class-chain.d.ts`). The removal also stops the CLI linter from rewriting chains users wrote by hand, such as `**/Window/Other/Button` or `**/Cell[\`visible == 1\`]/Button`, which the scanner passes through `optimizeClassChain`.
  - README ("The optimizer": six rules, a "Removed rules" paragraph, the `visible` note under "On the device") and `docs/optimization-rules.md` (rules 1 and 7 marked removed) are updated.
  - No corpus verdict depended on these rules: with each rule turned off, all 563 corpus entries give the same chain, so the 34 documented DRIFT and the 2 undocumented ones (L174, L225: index moved onto the parent, breadth-first order) are unchanged. Only A07, A14, A15 and A16 changed.
- Harness: 5 verdicts → CORRECT (A12 from GAP; A07, A14, A15, A16 from DRIFT), no new WRONG or DRIFT. R stays 96.1 (no corpus entry changed). S 67.9 → 72.4: category A is now 15/15. All GAP 13 → 12; spec DRIFT not documented 6 → 3 (A07, A14, A15 left; B08, B16, E13 remain), and A16 leaves the documented DRIFT (README optimizer note). Only the 5 rows changed in `coverage-cases.json`. No fuzz notes moved, because no corpus chain changed and the shared seed did not shift.
- Older text still describes A07, A14, A15, A16 as DRIFT and A12 as GAP: sections 1–8 (Phase 1), Device verification and Real device (Phase 2 / 2b), the Phase 4 tables, and the `fix/class-chain-parse-errors` note above. These are snapshots and are left as they were. The Phase 4 model table is not recomputed here (D2).
- **Found, not fixed:** `//` alone gives `**/` and `///` gives `**//`, both reported as `success`. Neither is a valid XPath. This is not a B4 form (`.//` with nothing after it is skipped).
- Regression tests: `.//` conversions (5 rows, plus a grouped-warning row), 12 skip rows for other relative forms, A07/A12/A14/A15/A16 through `{ optimize: true }`, and the old rule 1 and rule 7 rows rewritten to check that the chain is left as written.

Notes on `fix/parser-provable-b3` (Phase 5, B3):

- **Unions.** `//A[p] | //B[q] | …` becomes one `**/…` step whose predicate joins the operands with `OR`. With one type the step keeps it (X04: `Button[name == "a" OR name == "b"]`). With different types the step is `*` and each operand tests its own type (X05: `(type == "A" AND p) OR (type == "B" AND q)`). A `*` operand adds no type test. An operand with `AND` or `OR` inside is put in parentheses. Three or more operands use the same form. A `|` inside a value (L461's `${…}` with `'…'` and `?`) is text, not a split point.
  - A union stays skipped when an operand has an index, a path predicate (`.//`, `not(//…)`), more than one step, an absolute root, `position()`/`last()`, or a non-WDA type. A grouped union `(… | …)[n]` and `(… | …)` are skipped too. Corpus unions L009, L017, L018 and L189 are still CORRECT-SKIP.
  - Order: the union is the element set of one scan, the same as `//*[p or q]`, so XPath and chain return the same first element (300/300 trials for each of the six cases).
- **`self::`.** `self::Type` becomes `type == "Type"`, but only inside the predicate of a `*` / `XCUIElementTypeAny` step and only for a type in WDA's table (X07). It is still skipped on a named step, as a step of its own, for `self::*`, `self::node()`, `XCUIElementTypeAny` or a non-WDA type, inside a path predicate, and under `not()`.
- Extra union and `self::` forms the spec does not list (a `*` operand, three operands, operands without conditions, `self::` mixed with attributes) were checked ad hoc on mini-WDA: 300/300 equal each. They are not new harness cases.
- **Found, not fixed:** a negated condition on `//*` (`//*[not(self::X)]`, but also the B2 output for `//*[not(@name="a")]`) holds for the Application root, which `//*` returns and `**/*` never does. On mini-WDA every trial differs because of the root alone. This is assumption A1's mechanism. This branch keeps `self::` under `not()` skipped; the B2 behaviour is left for review.
- Harness: 6 verdicts GAP → CORRECT, no new WRONG or DRIFT. R 95.5 → 96.1 (corpus 450 CORRECT of 486 expressible; no corpus GAP left). S 65.5 → 67.9 (all GAP 19 → 13). The other `coverage-cases.json` changes are fuzz notes only: the three new corpus chains shift the shared seed, so the "min matching trials" counts move. The Phase 4 model table is not recomputed here (D2).

Notes on `fix/parser-provable-b1-b2` (Phase 5, B1 + B2):

- **B1 literals.** The validator no longer counts `[`, `]` and `"` inside a string literal in a backtick block: G14 (`"a]b"`) and G03 (`'a"b'`) are CORRECT. A quote or bracket that is really unbalanced still fails (unit tests).
  - G04: a backtick in a value (`"a`b"`) no longer makes the converter skip the input; the value gets a doubled backtick (``"a``b"``). A backtick outside a value is still read as an existing class chain and skipped.
- **B2 logic.** `not(…)` / `not (…)` becomes `NOT (…)` (D07, D08, L458 are CORRECT). `not(@name)` is the existence test `NOT (name != nil)`. `not()` around a path, a non-WDA attribute or `position()` is still skipped.
- Harness: 6 verdicts GAP → CORRECT, no new WRONG or DRIFT, R 95.3 → 95.5 (corpus 447 CORRECT of 486 expressible; L458 left the GAPs), S 61.8 → 65.5 (GAP 25 → 19). The Phase 4 model table is not recomputed here; that is planned once, after all stages.
- The text of sections 1–8 and the Phase 4 tables below still show these six as GAP: they are the Phase 1 / Phase 4 snapshots.

Notes on `fix/class-chain-parse-errors`:

- **RC1** `//` after a step now emits `/**/`. A06, A09, A10, L483 and L484 are CORRECT.
- **RC9** An absolute `/XCUIElementTypeApplication/…` path drops the root step, which makes A08 CORRECT. Other absolute roots are skipped with a reason.
  - A07 still differs from its XPath, but now for a different reason. Its output is `**/XCUIElementTypeButton` because optimizer rule 1 drops the `Window` step, so the verdict is DRIFT (not documented), the same as A14 and A15.
- **RC6** The validator now checks the inside of every backtick or `$` block, with string literals blanked out:
  - no XPath function names, `@`, `/` or `::`;
  - at least one comparison;
  - predicates outside a block must be an index.

  Every rule was checked against the WDA parser in mini-WDA. As a result:
  - 11 spec cases went from WRONG to GAP (the tool skips them, and a correct chain exists).
  - 4 spec cases went from WRONG to CORRECT-SKIP.
  - L476 (RC5, `[${…}]` body) is now skipped.
  - The escaped-quote JSON/Java/Python entries (RC-S3) are skipped instead of emitted unparseable.
- The S penalty is still capped at −30: 13 root causes remain. S will move once fewer than 10 are left.
- Regression tests: 32 rows in `xpath-to-class-chain.test.js` marked `audit regressions`.

Notes on `fix/silent-wrong-selection`:

- **RC7** Logic predicates joined with ` AND ` keep each `OR` group in parentheses, so D06 and D12 are CORRECT. The same precedence bug hit the `text()` expansion: `[contains(text(),"a") and @enabled="true"]` became `label CONTAINS "a" OR value CONTAINS "a" AND enabled == true`, which in mini-WDA also selects a disabled button. That expansion is now grouped whenever AND or NOT sits next to it.
- **RC8** Predicates are split by bracket depth, so a nested `[…]` is no longer read as a filter on the outer step.
  - `[.//Type[cond]]`, `[.//*[cond]]` and `[.//Type]` become the descendant predicate `[$…$]`. F01, F03, F07 and F08 are CORRECT; F08 was a GAP.
  - Any other path inside a predicate is skipped with a reason: `[./X]` and `[X]` (child existence), nested descendant paths, an index inside the path, and functions with an indexed argument. F05 and H08 are CORRECT-SKIP.
- **RC15** An index followed by a filter (`Cell[2][@name="a"]`) is skipped: XPath indexes per parent before filtering, a chain cannot. E12 is CORRECT-SKIP.
- A step with text after its predicates (`Cell[1]extra`) is now skipped instead of being truncated to `Cell[1]`.
- No corpus verdict changed; the directed and gap fuzz results are identical to the previous run.
- S rose because its raw score rose; the penalty is exactly −30 with 10 root causes left (8 spec, 2 context), so each further fix now lowers it.
- Regression tests: 13 more rows (45 in total); F08 moved from the skip list to the convert list.

Notes on `fix/predicate-literals`:

- **RC2** `contains()`, `starts-with()` and `ends-with()` on a boolean attribute with the full text `"true"`/`"false"` become `attr == true|false`; any other value is skipped (a string operator on a boolean raises in WDA). B18 and corpus L278, L520, L521 are CORRECT.
- **RC10** `.` steps are dropped and their separators merged (`A/./B` → `A/B`, `A//./B` → `A/**/B`); `..` and a trailing `//.` are skipped. A11 is CORRECT, R02 is CORRECT-SKIP. A step the converter does not recognise is now skipped instead of copied into the chain.
- **RC11** Element type names are checked against WDA's `FBElementTypeTransformer` table (`lib/elementTypes.js`). A13 (`XCUIElementTypeLabel`) is CORRECT-SKIP. The validator collapses `*[type OP "X" AND …]` into a step only when exactly one WDA type matches and no `OR`/`NOT` is involved, so C10 (`type CONTAINS "XCUIElementTypeText"`) is CORRECT. `XCUIElementTypeAny` stays the wildcard, because WDA rewrites it to `*` in XPath as well (A04 unchanged).
- **RC12** `@` is stripped only outside string literals. G13 is CORRECT.
- **RC13** The optimizer's `==` → `LIKE` rule and the validator's wildcard check are removed: `*` is literal in both languages, and `name == "a*b"` is a valid chain. G07 and G09 are CORRECT. This removes a documented rule; README and `docs/optimization-rules.md` are updated.
- **RC7 in the optimizer** (found during this fix): merging `[\`a OR b\`][\`c\`]` on an existing chain gave `a OR b AND c`, and the `visible == 1` deferral appended `AND visible == 1` to an OR block the same way. Both now keep the OR group in parentheses.
- B02 output changed only in spacing (`label != "a"`); its verdict is still DRIFT.
- Directed fuzzing: CC_ERROR 6 → 3 (the three RC2 corpus shapes now evaluate and agree); no other shape changed.
- Penalty: 5 root causes left (RC3, RC4, RC14, RC-S1, RC-S2) → −15, no longer capped.
- Regression tests: 27 more rows (72 in total); the LIKE-recovery tests now check that `*` stays literal.

Notes on `fix/attribute-semantics`:

- **RC3** XPath attributes are mapped by kind: text (`name`, `label`, `value`, `type`, `placeholderValue`, `traits`), boolean, and number (`index`; `x`/`y`/`width`/`height` → `rect.*`). Any other attribute is absent from the page source and unknown to WDA's predicate parser, so it is skipped. B04 is CORRECT; B13 and corpus L306 (`@text`) are CORRECT-SKIP.
- **RC14** Numbers compare as numbers: `@index="1"` → `index == 1` (B11). On a text attribute, `>`/`>=` become `value.doubleValue > n` only where XPath's NaN and NSPredicate's 0 for non-numeric text agree (`> n` with n ≥ 0, `>= n` with n > 0); other numeric comparisons are skipped. B03 is CORRECT.
- **RC4** Backslashes and control characters inside string values are escaped for NSPredicate. Host-literal escapes in raw source text (`\'`, `\"`, `` \` ``, `\$`, `\uXXXX`, `\xXX`) are left for the host language, so the same rule is right for API input and for scanner input: G05, G12 and corpus L119, L162 are CORRECT. Limitation: a raw (unescaped) newline inside a multi-line template literal becomes `\n` in the source, i.e. a real newline at run time, which NSPredicate rejects.
- **B02** (DRIFT before): an XPath `!=` needs the attribute to exist, so `@label!="a"` → `label != nil AND label != "a"`. **B10** (GAP before): `[@name]` → `name != nil`.
- **RC-S3** String values delimited by escaped quotes (`\"…\"`, raw JSON / Java source) now convert; the escaped quotes are kept. `store.json` converts 6/6 and is CORRECT. The Java and Python fixtures convert 8/8 each, which raises the count of rewrites inside an XPath strategy (RC-S1, RC-S2 — next).
- Corpus and spec WRONG are both 0. What is left: RC-S1, RC-S2 (penalty −6).
- Regression tests: 28 more rows (100 in total); four older rows that encoded the old behaviour were updated (`@a`/`@b` attributes, an unescaped newline, `@text`, `!=` without the nil check).

Notes on `fix/scanner-xpath-strategy`:

- **RC-S1, RC-S2** Before converting, the scanner looks at the text in front of the opening quote (`lib/strategy.js`). If the string is passed straight to an explicit XPath strategy, it is left untouched and reported as `skipped_xpath_strategy` with the reason `xpath strategy: <marker>`, for example `xpath strategy: AppiumBy.xpath(`. It is counted in `stats.skipped.xpathStrategy` and listed in the `--json` report. The strategy itself is not rewritten (`AppiumBy.xpath` → `AppiumBy.iOSClassChain` is out of scope). An existing `-ios class chain:…` string under an XPath strategy is reported the same way, since it is already broken.
- Markers are per language, and each one was checked against the client source:
  - Java, Kotlin, Groovy: `By.xpath(`, `AppiumBy.xpath(`, `MobileBy.xpath(` (both extend `By`), `xpath =` in any annotation (`@iOSXCUITFindBy`, `@iOSXCUITBy`, `@AndroidFindBy`, `@FindBy`), `How.XPATH, using =`, Selenium 3 `findElement(s)ByXPath(`.
  - Python: `By.XPATH`, `AppiumBy.XPATH`, `MobileBy.XPATH` and the string `"xpath"` as the strategy argument (also with `value=`); Selenium 3 `find_element(s)_by_xpath(`.
  - C#: `By.XPath(`, `MobileBy.XPath(`, `FindElement("xpath", …)`, `XPath =` on the dotnet-client 4.x `FindsBy*` attributes, `How.XPath, Using =`, Selenium 3 `FindElement(s)ByXPath(`.
  - Ruby: `:xpath,`, `:xpath =>`, `xpath:`, `"xpath",`, and the appium_lib helpers `xpath` / `xpaths`.
  - JS/TS: CodeceptJS strict locator `{ xpath: … }`, WebdriverIO `findElement(s)('xpath', …)`, selenium-webdriver `By.xpath(`.
  - PHP: php-webdriver `WebDriverBy::xpath(`.
  - Data and config files and Swift/Objective-C have no markers. Plain strings, WebdriverIO `$('//…')` and CodeceptJS `{ ios: '//…' }` still convert.
- A marker counts only when it ends right before the string, but it may sit on an earlier line (multi-line calls and annotations). An XPath call that closed earlier on the same line does not count. Android detection still runs first.
- Limitation: a string held in a variable or constant and passed to `By.xpath(…)` elsewhere is not recognised and is still rewritten.
- `Strategy.java` and `strategy.py`: 0/8 rewritten each, both files byte-identical after `--write`; `insideXpathStrategy` 8 → 0. Both are CORRECT. The other four context files are unchanged.
- No corpus or spec verdict changed. No root causes are left, so the penalty is 0 and R and S equal their raw scores.
- Regression tests: 53 more checks in the scanner section (`SCANNER: audit regressions`): 40 strategy markers across all languages, 10 strings that must still convert, the Android and closed-call cases, and the `--json` report.

Notes on `fix/rc-d2-descendant-self`:

- **RC-D2** `[.//Type[cond]]` becomes `[$type == "Type" AND cond$]` only when the step itself names a type and that type differs from `Type`. Then the element cannot pass its own `$…$` test, so XCTest's `containingPredicate` (which also tests the element itself) and XPath's `.//` (which never does) select the same elements. Otherwise the locator is skipped with the reason `descendant predicate would also match the element itself: [.//…]`: `.//*` inside, a `*` or `XCUIElementTypeAny` step outside, or the same type on both sides. F03 is CORRECT-SKIP.
- F01, F07, F08 and the corpus are unchanged. No corpus entry has the skipped shapes, so R and C stay the same.
- No root causes are left in the spec matrix, so the penalty is 0 and S equals its raw score, 57.5.
- Regression tests: F03 moved from the convert list to the skip list, and 5 more skip rows (`XCUIElementTypeAny` inside and outside, `*` outside, the same type on both sides, a grouped form).
- Device re-run (`device/run.js`, 246 cases, same simulator and versions): `--diff` against `results.json` shows one change, F03 SET_DIFFERS → XPATH_ONLY (now skipped). `--verdicts` against the updated `coverage-cases.json`: 241 agree, 4 not exercised, 1 is the A1 check, as in Phase 2. No chain was rejected by WDA. `results.json` stays the Phase 2 run that the device section describes.

Notes on `fix/rc-d1-grouped-position`:

- **RC-D1** has no exact class chain, so grouped positions still convert. The README now says that WDA counts a chain's matches breadth-first and XPath counts `(//X)[n]` in document order (the positional warning and a new "On the device" section).
- Every grouped position is flagged: the conversion result has a `warning`, the console prints it under the diff, and the `--json` report puts it on the `updated[]` entry and counts it in `stats.warnings`. This covers all three grouped forms: index appended, outer `[1]` dropped, outer index moved to the parent.
- The 29 corpus entries and E02, E03, E09, E14 and G11 are DRIFT documented. R_raw = 100 × (446 + 0.5 × 34) / 486 = **95.27**; S gains 4.0 in positional and 0.36 in literals, **61.9**. No verdict changed, and neither did any chain, so `device/run.js` was not re-run.
- Still DRIFT undocumented: L174 and E13 (outer index moved onto the parent) and L225 (nested matching containers). The new warning is shown for L174 and E13, but the README does not describe the move itself.
- README also has two more device facts from Phase 2: appium-xcuitest-driver 12.16.0 turns WDA's `invalid selector` into "not found", and `visible` on the final step is much slower as a chain (B07: 12.6 s vs 2.0 s; 12.9 s vs 2.1 s in the RC-D2 re-run).
- Regression tests: 7 conversion rows check the warning (4 grouped forms flagged, 3 plain or index-free forms not), plus 1 `--json` report check.

## Device verification (Phase 2)

Run 2026-10-10. Each selected XPath and the class chain the converter makes from it ran against the same screen of a purpose-built SwiftUI app (LocatorLab), under a real Appium + WDA on the iOS simulator. Where the device disagreed with the verdict, the device won. The harness, the app and the raw results are in `audit/device/` (see its README).

### Setup

| Component | Version |
|---|---|
| Xcode | 27.0 (27A266a) |
| iOS simulator runtime | iOS 27.0 (24A434) |
| Simulator | iPhone 17 (`LocatorLab iPhone 17`, UDID `208FA758-C937-49C4-ADE6-E16B0D7E0630`) |
| Appium | 3.8.0, installed locally in `audit/device/` |
| appium-xcuitest-driver | 12.16.0 |
| WebDriverAgent | 16.14.1 (as bundled, and as reported by the running WDA) |
| Node | 24.21.0 |
| XcodeGen | 2.46.0 |

- **WDA settings.** All defaults. The only non-minimal capability is `appium:derivedDataPath`, which keeps the WDA build inside `audit/device/`.
- **Newer than the pin, not used:** `appium-webdriveragent` 16.14.2 (2026-10-08). The driver pins 16.14.1 exactly. Appium 3.8.0 and driver 12.16.0 are still the latest releases.
- **Cases (246).** They come from `coverage-cases.json` and comprise:
  - one representative per corpus shape;
  - every DRIFT and GAP case;
  - every case that was WRONG in Phase 1: the 42 spec ids of §4 and corpus L119, L162, L278, L306, L476, L483, L484, L520, L521;
  - 15 inexpressible corpus entries;
  - all 115 spec cases.
- **Values.** Values were adapted to the app only where the case is not about the literal; `make-cases.js` fails if an XPath's structure changes. Corpus cases keep their JS quote and `${…}` text and are converted the way the scanner converts source text.
- **Two full runs.** Run A (24.5 min) and run B (12.4 min, after the timing change below) gave identical outcomes and hits for all 246 cases (`run.js --diff`, both directions). `results.json` is run B.

### Outcomes

246 cases: EQUAL 146 · SET_DIFFERS 33 · XPATH_ONLY 61 · DEAD 4 · XPATH_ERROR 2 · FIRST_DIFFERS 0 · CC_ERROR 0 · NONE 0. No chain the converter emitted was rejected by WDA.

| Verdict (current) | Device outcome | Cases |
|---|---|---|
| CORRECT | EQUAL | 142 |
| CORRECT | SET_DIFFERS | 1 (A03~app-root, assumption A1, below) |
| DRIFT | SET_DIFFERS | 31 |
| DRIFT | EQUAL (not exercised) | 4 |
| WRONG | SET_DIFFERS | 1 (F03) |
| GAP | XPath only; Phase 1 hand-written chain EQUAL | 25 |
| CORRECT-SKIP | XPath only; Phase 1 hand-written chain SET_DIFFERS | 7 (E05–E07, E11, L270–L272) |
| CORRECT-SKIP | XPath only | 29 |
| CORRECT-SKIP | DEAD | 4 |
| CORRECT-SKIP | XPATH_ERROR | 2 |

Against the current `coverage-cases.json`: 241 agree, 4 DRIFT not exercised, 1 is the A1 check.

- **DEAD** means the XPath can never match on WDA: `@text` (L306, B13), `contains(., …)` (C05), `XCUIElementTypeLabel` (A13). It is the expected observation.
- **XPATH_ERROR** cases are L157 (backtick syntax inside XPath) and H08 (`tokenize(…)[2]`). WDA reports `invalid selector`, as mini-WDA did.
- **Not exercised:** A15~modal, A16~lists, L207, E13. In each of them the screen happened to give the same result for both sides; the same mechanism is shown diverging by a sibling case (A15 on `nesting`, A16 on `states`, L207's shape by L062/L171/L182, E13's by L174). A16~lists diverged in one earlier run and not in the final two: off-screen table buttons on that screen do not get a stable `visible` value (see platform facts).

### Where the device disagreed with the verdicts before Phase 2

These are compared with `coverage-cases.json` on `main` at 7858ec3. All of them are now reflected in `coverage-cases.json`.

| Case | Verdict before | Device | Cause | Verdict now |
|---|---|---|---|---|
| E02 `(//Button)[2]`, E03, E09, E14, G11; corpus L062, L081, L162, L171, L182, L258, L262, L451, L567 | CORRECT | SET_DIFFERS | RC-D1 | DRIFT (undocumented) |
| E05 `(//Button)[last()]`, E06, E07, E11; corpus L270, L271, L272 | GAP | XPath only; the Phase 1 hand-written chain `[-1]` / `[2]` gives a different element | RC-D1 | CORRECT-SKIP (no exact chain) |
| F03 `//Cell[.//*[@name="x"]]` | CORRECT | SET_DIFFERS: the chain also returns the Cell named `x` | RC-D2 | WRONG |
| A03~app-root `//*[@name="LL"]` (the app's own name) | CORRECT under assumption A1 | SET_DIFFERS: XPath also returns the Application, the chain cannot | A1 confirmed | unchanged (A1 is the stated scoring assumption) |

- **Same shape, scored with these.** 15 more corpus entries of the same grouped-position shapes (S006, S018, S043, S047, S084, S105, S106, S136, S160) moved with them: L070, L082, L177, L207, L208, L234, L310, L382, L396, L397, L407, L428, L471, L498, L564–L566, L571–L573.
- **How they were found.** The corrected mini-WDA found a counter-example for each of these entries, except L397, which is judged by its shape.

Everything else agreed, including every DRIFT the earlier phases predicted:
- the optimizer's rule 1 broadening (A07, A14, A15: the dropped `Window`/`Other` step also finds the `Close` buttons in the navigation bar and directly in the window);
- rule 7 (A16: a table cell clipped by its scroll view is `visible`, its button is not; the optimized chain tests the button);
- per-parent `[n]` (E01, L013, L120, L349, L350, L556);
- the outer index moved to the parent (L174);
- nested matching containers (L225, UNVERIFIED in Phase 1);
- `text()` → label/value (C03, C04, H10), `@enabled=true()` (B16), and `@selected` (B08: `selected` is not in WDA's XML, so the XPath never matches while the chain finds the selected button).

### mini-WDA corrections

The device showed two stand-ins in `audit/harness/wda/` to be wrong. Both are fixed; `wda/upstream/` is unchanged and the self-test is still 43/43.

1. **Result order.** WDA 16.14.1 resolves a chain with an `XCUIElementQuery` unless an intermediate step has a position (`XCUIElement+FBClassChain.m:38-40`), and XCTest returns query results **breadth-first**. WDA hands XPath matches back through a query too, so both sides come back in that order (checked against the page source on six screens, all but `siblings`: every element with a unique key is in breadth-first order). XCTest's `descendantsByFilteringWithBlock`, which the snapshot strategy uses, is breadth-first as well (E11). XPath positions are still evaluated by libxml2 in document order.
   - mini-WDA ran the snapshot walk for every chain, pre-order, and sorted all results into document order.
   - It now runs the query strategy for chains without an intermediate position, numbers nodes breadth-first, and walks breadth-first.
2. **`$…$` and the element itself.** In the query strategy `$…$` is `containingPredicate`, which on the device also tests the element itself. WDA's snapshot strategy excludes it (`descendant != candidate`), as mini-WDA did everywhere. mini-WDA now follows the strategy WDA picks.

Then `./run.sh` and `./run.sh --update`. Changed against `main`:
- 34 CORRECT → DRIFT (29 corpus entries, E02, E03, E09, E14, G11);
- 7 GAP → CORRECT-SKIP (L270–L272, E05–E07, E11);
- 1 CORRECT → WRONG (F03).

The spec fixtures for E03 and E09 now include a deeper match placed first, and `gapexpected.js` no longer lists L270–L272. A second `./run.sh` reports no changes.

### New root causes (converter not changed in this branch)

| Id | Sev. | Repro: input → output → device | Location | Suggested fix |
|---|---|---|---|---|
| RC-D1 | major | `(//XCUIElementTypeButton)[2]` → `**/XCUIElementTypeButton[2]`. On `lists` the XPath returns the second button in document order (`Delete` in the first row), the chain the second button breadth-first (`Pako geviv: 12`, a shallower button further down). Same for `(//X)[1]`, `[${i}]` and Phase 1's `[last()]` → `[-1]`. Equal only when every match sits at the same depth (rows of one list). | `lib/converter.js:393` (outer index appended), `:378` (moved onto the parent) | No exact class chain exists. Either document it next to the README positional warning (grouped positions count in XCTest's breadth-first order), or skip grouped positions with a reason. The first keeps today's conversions and earns half credit; see the gap list. |
| RC-D2 | major | `//XCUIElementTypeCell[.//*[@name="x"]]` → `**/XCUIElementTypeCell[$name == "x"$]` also returns a Cell that is itself named `x`. The same holds for `//*[.//Button[@name="x"]]` (the button itself matches) and `//Cell[.//Cell[@name="x"]]`. | `lib/converter.js:508` (`descendantPredicate`), emitted at `:533` | Emit `[$…$]` only when the outer step and the inner step both name a type and the types differ (then the element cannot match its own predicate); otherwise skip with a reason. F01, F07, F08, R01 and F04's hand-written chain already have that form and are exact on the device. |

RC-D1 is scored as DRIFT, not WRONG. No exact chain exists, and the difference depends on the page, as with the per-parent index (E01) and the outer-index move (L174), which Phase 1 also scored as DRIFT. RC-D2 is WRONG: the affected inputs can be recognised statically and skipped, as with RC15.

### Platform facts found on the device

- **appium-xcuitest-driver 12.16.0 hides selector errors.** `doNativeFind` (`build/lib/commands/find.js:66-72`) catches every WDA error: `findElements` returns `[]` and `findElement` "no such element" for an invalid XPath or class chain, although WDA answers `400 invalid selector`. A broken chain therefore looks like "element not found" in a test run. `run.js` sends the same request straight to WDA whenever Appium returns nothing. This also means that a WRONG class chain that does not parse fails silently on this platform, which makes the linter's checks more valuable.
- **Result order is breadth-first on both sides** (above). `findElement` returns the same first element for an XPath and its chain whenever the sets are equal.
- **Assumption A1 holds:** `//*` also matches the `Application` element (name = the app's display name); `**/*` never does.
- **`visible`** in `/source` can disagree with what a `visible` predicate sees at lookup time. For example, table buttons on screen were reported `visible="false"` in one page source while the queries treated them as visible. Cases that depend on visibility use a clipped cell, which both agree on.
- **SwiftUI on iOS 27** wraps content in several identifier-less `XCUIElementTypeOther` (some `visible="false"`) and collapses nested `.contain` containers, even with identifiers. `List` is `CollectionView`/`Cell` with three wrapper levels; direct `Cell/Button` children need UIKit.

### Ratings recomputed

Weights unchanged. `audit/harness/run.sh` with the corrected mini-WDA reproduces every device outcome above, so these are the numbers of the current `coverage-cases.json`.

**R (real corpus).**
- Scored 563, CORRECT-SKIP 77 (L270–L272 added), so expressible = **486**.
- CORRECT 446; DRIFT documented 5 (L013, L120, L349, L350, L556); DRIFT undocumented 31 (29 × RC-D1, L174, L225); GAP 4 (L355, L455, L458, L461); WRONG 0.
- R_raw = 100 × (446 + 0.5 × 5) / 486 = 100 × 448.5 / 486 = **92.28**.
- Root causes in the corpus or contexts: 0, so the penalty is 0.
- **R = 92.3** (was 97.6). **C = 486 / 563 = 86.3 %** (was 86.9 %).

**S (spec matrix).**

| Cat. | Weight | Calculation | Score | Change against `main` |
|---|---|---|---|---|
| Steps, axes, absolute paths, Application root | 15 | 15 × (10 + 0.5·1) / 15 | 10.50 | — |
| Attributes, comparisons, booleans | 15 | 15 × 15 / 16 | 14.06 | — |
| XPath 1.0 string functions | 15 | 15 × 5 / 9 | 8.33 | — |
| Logic and precedence | 12 | 12 × 10 / 15 | 8.00 | — |
| Positional | 12 | 12 × (0 + 0.5·1) / 6 | 1.00 | E02, E03, E09, E14 → DRIFT; E05–E07, E11 excluded |
| Nested / descendant predicates | 10 | 10 × 3 / 4 | 7.50 | F03 → WRONG, excluded |
| Literals and escaping | 10 | 10 × 10 / 14 | 7.14 | G11 → DRIFT |
| WDA XPath extension functions | 6 | 6 × 1 / 6 | 1.00 | — |
| Rewritable reverse axes | 5 | 5 × 0 / 1 | 0.00 | — |
| **Sum** | 100 | | **57.54** | |

- Penalty: 1 root cause (RC-D2) → −3.
- **S = 57.54 − 3 = 54.5** (was 63.2).

**Gap list (R).** Each expressible entry is worth 100/486 = 0.206 points.

| Change | Entries | Point gain |
|---|---|---|
| Document RC-D1 in the README (grouped positions count breadth-first) | 29 | +2.98 → R 95.3 |
| *or* skip grouped positions with a reason (no exact chain, so they leave the denominator) | 29 | R = 100 × 448.5 / 457 = 98.1 |
| Single-step unions → one `OR` predicate | L355, L455, L461 | +0.62 |
| `not(…)` → `NOT (…)` | L458 | +0.21 |
| Document the outer-index move and nested-match ordering | L174, L225 | +0.21 |

For S, fixing RC-D2 (skip) removes the −3 penalty, and documenting RC-D1 would add 0.5 credit to E02, E03, E09, E14 and G11 (+4.0 in positional, +0.4 in literals).

### Lookup time: XPath vs converted class chain

Each case times the two lookups that are compared: one cold `findElements` call per side, Appium → WDA → back, the side that goes first alternating between cases. This is what a test does, so no warm-up or repetition. Run A used a warm-up and the median of 5 lookups per side; both methods give the same summary (B/A time ratio ×0.97 for both sides), and the full run takes half the time.

Over the 179 cases where both sides found the same thing or a comparable set (`results.json` → `perf`):

| | XPath | Class chain |
|---|---|---|
| Median | 150 ms | 118 ms |
| p95 | 1238 ms | 1596 ms |

- **Speedup** (XPath time / chain time, geometric mean over cases): **×1.11**; median ×1.18; the class chain is faster in 130 of 179 cases.
- **Order effect:** small. ×1.13 when XPath went first, ×1.08 when the chain went first; the second lookup gains a few percent from WDA's cache.

| Screen | Cases | XPath median | Chain median | Speedup (geomean) |
|---|---|---|---|---|
| identity | 54 | 150 ms | 109 ms | ×1.34 |
| modal | 5 | 157 ms | 153 ms | ×1.01 |
| lists | 45 | 245 ms | 248 ms | ×1.06 |
| states | 28 | 136 ms | 101 ms | ×0.98 |
| nesting | 32 | 113 ms | 90 ms | ×1.07 |
| functions | 15 | 80 ms | 95 ms | ×0.88 |

- **Where the chain is much slower:**
  - `visible == true` on a final step (B07: 12.6 s vs 2.0 s): WDA asks for visibility per candidate.
  - An intermediate position, which forces WDA's snapshot walk (L174 `[2]/*[2]`: 729 vs 241 ms).
  - `**/XCUIElementTypeButton` on a screen with buttons in two windows (A07: 749 vs 121 ms).
  - OR over label and value (C04, H10).
- **Where it is much faster:** positional chains on big screens (L120 ×3.8, E01 ×2.5) and `visible` on an intermediate step (A16 ×2.0, optimizer rule 7).
- **What the gain depends on.** On these screens (35–250 elements) the gain is modest because Appium's proxy round trip dominates. It is largest where XPath has to serialise a big page source; `run.js --compare` measures it on other devices or iOS versions.

### Not verified, and why

- **Simulator only** in this phase: one device type (iPhone 17), one iOS version (27.0), portrait, no iPad. The physical-device run is in Phase 2b below.
- **Coverage.** One representative per corpus shape, plus every DRIFT, GAP and Phase 1 WRONG. The other 400+ corpus entries are judged by shape through the corrected mini-WDA, which now agrees with every device outcome.
- **Scanner contexts (§3)** are about rewriting source files, not about lookups; they were not run on the device.
- **Three DRIFT cases** did not diverge on their screen (listed above); the mechanism is shown by sibling cases.
- **Breadth-first order** was checked on six LocatorLab screens (SwiftUI and UIKit content, a sheet and an alert). It is an observation of XCTest on iOS 27, not a documented guarantee.
- **`${…}` values** are the same assumptions as Phase 1 (plain text, `true`/`false`, small integers). `${condition('label')}` was instantiated as XPath text.
- **Timing** includes the Appium proxy round trip and depends on screen size. It was measured on the simulator of one Mac, with no other jobs running during the final two runs.

## Real device (Phase 2b)

The same 246 cases on a physical iPhone, compared with the simulator run of `fix/rc-d2-descendant-self` (`device/out/rcd2.json`, the current converter). Results: `device/results-device.json`.

### Setup

| | |
|---|---|
| Device | iPhone 13 Pro Max (iPhone14,3), iOS 26.6 (23G71), British English locale, USB |
| Appium / driver / WDA | 3.8.0 / 12.16.0 / 16.14.1, as in Phase 2 |
| Xcode | 27.0 (27A266a) |
| Signing | free Apple ID (Personal Team, automatic signing). WDA as `io.github.domovou69.WebDriverAgentRunner`, LocatorLab as `io.github.domovou69.LocatorLab`; the team id comes from `XCODE_ORG_ID` and is not in the repository |

Differences from the simulator setup, all in `device/run.js` (real-device mode, chosen by a UDID listed under `devices` in `env.json`):
- WDA is forwarded to port 8101, because the simulator's WDA keeps 8100.
- LocatorLab is installed once with `devicectl` and each session starts it by `appium:bundleId`. With `appium:app`, Appium reinstalls the app for every session and launches it about 90 ms later. iOS then sometimes refuses the launch ("unknown to FrontBoard"), and a retry reinstalls and hits the same race. Installing is not timed, so the lookups are unaffected.

### Outcomes

246 cases: EQUAL 146 · SET_DIFFERS 32 · XPATH_ONLY 62 · DEAD 4 · XPATH_ERROR 2. These are the same counts as the simulator, case by case: **no outcome differs**. `--verdicts` against `coverage-cases.json`: 241 agree, 4 not exercised, 1 is the A1 check, as on the simulator. WDA rejected no chain.

`--diff` reports most cases as different because hits include the element's rect, and the screen is larger (428 × 926 against 402 × 874). Without the rect, 5 cases differ in what both sides found, never between XPath and chain:
- A16~lists, L240, B16: more rows fit on the larger screen, so both sides find more elements.
- L513: the system image label is `Favourite` (en-GB) instead of `Favorite`.
- B11 `//*[@index="1"]`: the second match is the scroll bar on the device and an unnamed container on the simulator.

Everything the simulator showed holds on the device: breadth-first result order (RC-D1: the 29 corpus cases and E02, E03, E09, E14, G11 diverge the same way), `$…$` testing the element itself (F03 is now skipped, F01, F07, F08 EQUAL), A1, and the DRIFT cases. The 4 cases that were not exercised on the simulator are not exercised on the device either.

### How the run was assembled

- **Run A**, 246 cases, 1373 s. The USB connection dropped once, on the `states` screen right after B14–B16: Appium logged `Device with UDID … not found` for every request to WDA, and the connection was back within seconds (the next session needed one retry). The affected cases (B14 XPATH_ERROR; B15–B18, C10 CC_ERROR with `fetch failed`) were re-run with `--only` and merged into run A with `run.js --merge`.
- In the first re-run (B14–B18, C10) the connection dropped again at the same point, after B16, so B17, B18 and C10 were re-run once more on their own. All 6 are now as on the simulator.
- Both drops came right after the heaviest lookups of the run (B14 ~4.8 s, B16 ~3 s per side). They look like an environment problem (the USB tunnel), not WDA: WDA kept its session. It is noted here because a long test suite on a real device may hit it.
- **Repeat.** No second full run. An earlier attempt stopped after 196 cases (the reinstall race above) and serves as the repeat: all 196 outcomes match run A.
- `run.js` now saves the output file after every screen (`"partial": true`), and `--resume` continues an interrupted run.

### Lookup time on the device

| | Simulator (Mac) | iPhone 13 Pro Max |
|---|---|---|
| Cases timed | 178 | 178 |
| XPath median / p95 | 153 / 1241 ms | 350 / 3201 ms |
| Chain median / p95 | 121 / 1621 ms | 285 / 3240 ms |
| Speedup (geomean) | ×1.11 | ×1.14 |
| Chain faster in | 133 | 138 |

- Lookups take about 2.2 times as long on the phone as on the simulator, for both sides (same 178 cases, geomean: XPath ×2.24, chain ×2.15). The ratio between XPath and chain stays the same.
- Per screen (geomean): identity ×1.33, modal ×1.06, lists ×1.15, states ×1.09, nesting ×1.05, functions ×0.86.
- The cases where the chain is much slower are the same as on the simulator: B07 `visible` on the final step (10.8 s against 3.3 s), A07 (1.7 s against 0.29 s), L174 and E13 (intermediate position), C04 and H10 (OR over label and value). The largest gains are also the same: L120 ×4.3, E01 ×2.6, A16 ×1.9.

### Not verified on the device

- One device and one iOS version (26.6, older than the simulator's 27.0). No iPad, no landscape.
- Only one full run, plus a 196-case repeat (above).
- Lookup times include the USB tunnel; Wi-Fi was not tried.

## Lookup time vs. tree size (Phase 3)

Does converting to class chain make tests faster? Phase 2 and 2b timed small screens. Phase 3 times the same lookups while the number of elements in the accessibility tree grows. Data: `device/results-scale-*.json`; how to run it: [`device/README.md`](device/README.md#scale-benchmark-phase-3).

### Setup

| | |
|---|---|
| Screen | LocatorLab `scale`, `-load 100/500/1000/2000`. The same Checkout page with 100 target elements; extra elements are added around it: screens underneath in a ZStack navigator (+400), a long feed below the fold (+500), a drawer mounted off-screen and kept-alive tabs (+1000). Deep targets sit at depth 39 (a UIKit branch: SwiftUI merges single-child containers) |
| Locators | the 10 most frequent convertible shapes of the corpus (~340 of its 460 XPath locators), each on 3 targets: top of the page, deep branch, end of the page. 30 lookups per size |
| Method | one session per size, then 3 passes; each lookup is one cold `findElement`, no warm-up, XPath/chain order alternating; median of the 3 passes. Before timing, XPath and chain must return the same single element (all 240 did) |
| Devices | simulator iPhone 17, iOS 27.0, on an M1 Pro (16 GB); iPhone 13 Pro Max, iOS 26.6, USB. Appium 3.8.0 / xcuitest-driver 12.16.0 / WDA 16.14.1 |
| Host power | simulator runs on AC with Low Power Mode off (`results-scale-ac.json`) and on battery with Low Power Mode on (`results-scale-battery.json`); recorded per size in `host` |

### Class chain savings by tree size (%)

Savings = (XPath − chain) / XPath, over the 30 lookups; in brackets the time saved per lookup.

| Elements in the tree (simulator / iPhone) | Simulator | iPhone 13 Pro Max |
|---|---|---|
| 102 / 99 | 21.9 % (25 ms) | 23.8 % (70 ms) |
| 503 / 494 | 24.1 % (109 ms) | 23.4 % (178 ms) |
| 998 / 989 | 25.8 % (235 ms) | 28.9 % (405 ms) |
| 1998 / 1989 | 25.4 % (445 ms) | 24.9 % (676 ms) |

The chain was faster in all 240 lookups (30 × 4 sizes × 2 devices).

![Time per element lookup vs. elements in the tree, XPath and class chain, simulator and iPhone](scale-chart.svg)

Chart: `node device/make-scale-chart.js` (simulator on AC, iPhone).

### Time per lookup by tree size

| Elements | Simulator XPath | Simulator chain | iPhone XPath | iPhone chain | Page source (simulator, without `visible`) |
|---|---|---|---|---|---|
| 100 | 115 ms | 90 ms | 295 ms | 225 ms | 139 ms |
| 500 | 453 ms | 344 ms | 760 ms | 582 ms | 683 ms |
| 1000 | 912 ms | 677 ms | 1.40 s | 997 ms | 1.35 s |
| 2000 | 1.75 s | 1.31 s | 2.72 s | 2.04 s | 2.58 s |

### Host power (simulator)

| Elements | XPath per lookup, battery + LPM → AC | Chain per lookup, battery + LPM → AC | Faster on AC | Chain savings, battery + LPM → AC |
|---|---|---|---|---|
| 100 | 133 ms → 115 ms | 105 ms → 90 ms | 14 % | 21.4 % → 21.9 % |
| 500 | 541 ms → 453 ms | 409 ms → 344 ms | 16 % | 24.4 % → 24.1 % |
| 1000 | 1.09 s → 912 ms | 808 ms → 677 ms | 16 % | 25.9 % → 25.8 % |
| 2000 | 2.10 s → 1.75 s | 1.57 s → 1.31 s | 16 % | 25.3 % → 25.4 % |

### Regular screens (Phase 2 and 2b)

The LocatorLab test screens (36–275 elements) with the same per-lookup method, but `findElements` (all matches), and the audit's spec and corpus cases rather than the most frequent shapes.

| | Simulator (`results.json`) | iPhone 13 Pro Max (`results-device.json`) |
|---|---|---|
| Cases timed | 179 | 178 |
| Median per lookup, XPath / chain | 150 / 118 ms | 350 / 285 ms |
| Savings on the median | 21.4 % | 18.5 % |
| Chain faster in | 130 | 138 |
| Total, XPath / chain | 53.7 / 64.8 s | 114.8 / 118.6 s |
| Savings on the total | −20.7 % | −3.4 % |
| Total without A07, A16, B07, B10 | 45.7 / 43.9 s (3.8 %) | 100.6 / 92.6 s (8.0 %) |

### Slow class chains in Phase 2

None of these shapes is in the corpus: it has no `visible` locator and one bare-type locator (`//XCUIElementTypeWebView`).

| Case | XPath | Chain | Matches | Simulator XPath / chain | iPhone XPath / chain |
|---|---|---|---|---|---|
| B07 | `//XCUIElementTypeButton[@visible='true']` | ``**/XCUIElementTypeButton[`visible == true`]`` | 32 | 2.05 / 12.60 s | 3.30 / 10.77 s |
| A16 (lists) | `//XCUIElementTypeCell[@visible="true"]/XCUIElementTypeButton` | ``**/XCUIElementTypeCell/XCUIElementTypeButton[`visible == 1`]`` | 23 / 24 | 3.46 / 5.14 s | 6.01 / 8.71 s |
| B10 | `//XCUIElementTypeButton[@name]` | ``**/XCUIElementTypeButton[`name != nil`]`` | 36 | 1.15 / 1.78 s | 3.03 / 4.08 s |
| A07 | `/XCUIElementTypeApplication/XCUIElementTypeWindow/XCUIElementTypeButton` | `**/XCUIElementTypeButton` | 1 | 0.12 / 0.75 s | 0.29 / 1.69 s |

### First match (simulator, battery + LPM)

Savings over the chain as converted, same method (`results-scale-variants.json`).

| Variant | 100 elements | 2000 elements |
|---|---|---|
| Chain with an explicit `[1]` (27 cases; shape 8 already has a position) | 0.1 % | 0.1 % |
| Chain with the `useFirstMatch` setting | 2.7 % | −5.7 % (deep targets −15 %) |

In WDA 16.14.1 a single lookup without a position and one with `[1]` both go through `fb_firstMatch`, which collects all matches and takes the first unless `useFirstMatch` is on (`FBXCodeCompatibility.m`).

### Depth limit

`scale-deep`: one chain of nested views with a marker every 5 levels (`results-scale-deep*.json`). WDA's default `snapshotMaxDepth` is 50.

| Depth in the page source | XPath | Chain |
|---|---|---|
| up to 50 | found | found |
| over 50 (markers 45–70) | `no such element` | `no such element` |

Same on the simulator and the iPhone. The page source ends at depth 50 as well.

### Limits of these measurements

- Only element lookup is timed: one cold `findElement` per locator. With an implicit wait or a retry loop, a lookup that does not find the element at once repeats the whole search, so the time saved per lookup is multiplied by the number of attempts (not measured).
- The screen is synthetic (LocatorLab); no production app was measured.
- One WDA version (16.14.1). Its class chain lookup strategy changed recently (`XCUIElement+FBClassChain.m`, appium/WebDriverAgent PR #1194), so other versions may give other numbers.
- One phone (iPhone 13 Pro Max) and one iOS version per device (26.6 on the phone, 27.0 on the simulator).
- The simulator ran on one Mac (Apple M1 Pro, 16 GB, macOS 26.6.2), on AC with Low Power Mode off and on battery with Low Power Mode on; absolute times on other hosts will differ.

### Conclusions

1. The class chain was faster than XPath in all 240 lookups.
2. In percent, the savings do not depend on the tree size: 22–29 %. In time, they grow with it: 25 → 445 ms per lookup on the simulator, 70 → 676 ms on the iPhone.
3. Neither the locator shape nor the target's position (top, depth 39, end) changes the savings: both strategies pay for the whole tree on every lookup.
4. An explicit `[1]` changes nothing; `useFirstMatch` does not help and is slower for deep targets.
5. Nothing deeper than 50 levels is found by either strategy, and the error is a plain `no such element`.
6. The iPhone is 2.6 times slower than the simulator at 100 elements and 1.55 times at 1000–2000 (a fixed per-request cost over USB). Host power changes the simulator's times (16 % faster on AC on an M1 Pro), not the savings.
7. A page source with the `visible` attribute takes 53 s at 1000 elements on the simulator, 1.4 s without it.
8. On regular screens (up to ~300 elements in the tree) the per-lookup savings are similar in percent (18–21 % on the median) but only tens of milliseconds. In total, Phase 2 lost time on the chain side because of four cases: `visible` predicates, lookups of all matches when there are dozens, and a short absolute path that the optimizer turns into `**/`. Convert lookups of one element by name, label, value or type; check locators with `visible`, list lookups with many matches, and absolute paths before converting them.

## Plain LLMs vs the converter (Phase 4)

If you have an LLM, do you still need a converter? Phase 4 gives Haiku, Sonnet and Opus the same 678 locators the converter is scored on, with a plain request to convert them, and scores their answers with the same harness. Data and scripts: [`llm/`](llm/).

### Setup

| | |
|---|---|
| Input | [`llm/input.json`](llm/input.json): the 678 locator cases of `coverage-cases.json` (563 corpus, 115 spec) as `{ id, xpath }`, shuffled, with neutral ids and no group. The XPath is the runtime string the driver receives (the harness's substitutions for `${…}`). The 6 scanner-context cases are source files and are left out. The key is in [`llm/key.json`](llm/key.json) |
| Models | `claude-haiku-5-5`, `claude-sonnet-5-5`, `claude-opus-5-5` at effort `low`, `medium`, `high`, `max`; one run per cell. `xhigh` and repeated runs were skipped to stay within the account's usage limit |
| Run | `claude -p` (Claude Code 2.1.296) in an empty folder in the system temp dir with only `input.json`: tools `Read` and `Write`, no settings, hooks, MCP or session, a clean environment. The model reads the file and writes `output.json` (in parts if it wants). Runs of one effort level go in parallel, one per model. Runner: [`llm/run.js`](llm/run.js), [`llm/stage.sh`](llm/stage.sh) |
| Scoring | [`llm/score.js`](llm/score.js): mini-WDA (WDA 16.14.1) runs each chain and its XPath on the same page sources, 200 per corpus case and 300 plus the hand-made fixture per spec case, seeded per case, so every run and the converter are judged on identical pages. The `-ios class chain:` prefix is required and then stripped (no answer lacked it) |
| Converter | the same `input.json` through `convertXpathToClassChain`, scored by the same script: R = 95.3, S = 61.8, the same as the harness. E10 is left out of the comparison: the harness judges its source string `)${suffix}`, the models got its runtime string, which is E09's locator |

The prompt, the same for every run ([`llm/prompt.md`](llm/prompt.md)):

> `input.json` in the current folder has 678 XPath locators from iOS UI tests (Appium, XCUITest driver). Convert each one to an iOS class chain locator (`-ios class chain`) that finds the same elements. If a locator cannot be expressed as a class chain that finds the same elements, skip it and give the reason.
>
> Write the result to `output.json` in the current folder: a JSON array with one entry per input `id`, either `{ "id": "x001", "chain": "-ios class chain:**/XCUIElementTypeButton[`name == \"OK\"`]" }` or `{ "id": "x002", "skip": true, "reason": "..." }`.
>
> Write each chain as the full locator string, with the `-ios class chain:` prefix. If the result is too large for one file, write it in parts as `output-1.json`, `output-2.json`, …; the parts are merged after you finish. Every id must be present in the end.

Verdicts are the harness's: CORRECT, CORRECT-SKIP, GAP, DRIFT (half credit when documented), WRONG, plus INVALID (WDA rejects the chain or it throws) and MISSING. Two rules are specific to Phase 4:

- One fixed denominator for every row: the harness's expressible cases, as for the converter. A skip inside it earns 0, so skipping more cannot raise R or S. A chain for a case with no exact class chain (grouped positions, per-parent indexes) that behaves like the converter's approximation is DRIFT.
- L157 (not an XPath) and E10 (see Converter above) are EXCLUDED from every count.

Until Phase 5 the table also had a second pair, R / S over each run's own denominator, where a skipped no-exact-chain case left it; haiku / max scored R 99.6 there by skipping a quarter of the input. Only the fixed-denominator pair (then called R= / S=) is kept.

### Results

Rescored in Phase 5 (task A, branch `fix/harness-expectations`) from the stored answers, after three harness expectations were corrected (see the end of the next section); no model was run again.

Rescored in Phase 5 (task D2 and a later pass on 2026-10-13): all eleven stored answers and the converter now use the same Phase 5 expectations, so every row is on the same scale (the earlier snapshot had the converter at S 61.8 and the nine cells not rescored in D2 on the old expectations). No model was run again. The converter converts 85.7 % of the input after the Phase 5 fixes (81.8 % before).

| Cell | R | S | Converted | Skipped | of which GAP | Precision | WRONG | INVALID | MISSING | Time, min | Cost, $ | Output tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **converter (maximum)** | 96.0 | 93.6 | 85.7 % | 14.3 % | 0 | 100.0 % | 0 | 0 | 0 | — | — | — |
| haiku / low | 91.3 | 51.3 | 79.7 % | 20.3 % | 27 | 92.8 % | 22 | 17 | 0 | 8.6 | 0.39 | 139k |
| haiku / medium | 94.1 | 63.6 | 80.9 % | 19.1 % | 21 | 99.3 % | 4 | 0 | 0 | 6.0 | 0.28 | 99k |
| haiku / high | 94.5 | 61.5 | 80.9 % | 19.1 % | 21 | 99.1 % | 2 | 3 | 0 | 7.6 | 0.36 | 131k |
| haiku / max | 91.6 | 57.1 | 75.4 % | 24.6 % | 19 | 99.2 % | 2 | 2 | 0 | 13.5 | 0.64 | 222k |
| sonnet / low | 94.8 | 68.5 | 83.3 % | 16.7 % | 11 | 98.6 % | 3 | 4 | 0 | 5.2 | 1.03 | 58k |
| sonnet / medium | 94.1 | 77.6 | 82.8 % | 17.2 % | 12 | 98.8 % | 4 | 3 | 0 | 5.3 | 1.05 | 58k |
| sonnet / high | 94.2 | 77.9 | 82.8 % | 17.2 % | 11 | 98.8 % | 3 | 4 | 0 | 6.0 | 1.14 | 65k |
| sonnet / max | 95.1 | 81.2 | 83.9 % | 16.1 % | 4 | 98.9 % | 3 | 3 | 0 | 36.0 | 4.85 | 339k |
| opus / low | 95.1 | 81.9 | 83.4 % | 16.6 % | 9 | 99.3 % | 1 | 3 | 0 | 7.1 | 2.04 | 57k |
| opus / medium | 95.1 | 81.9 | 83.4 % | 16.6 % | 9 | 99.3 % | 1 | 3 | 0 | 8.5 | 2.33 | 66k |
| opus / high | 95.1 | 82.9 | 83.6 % | 16.4 % | 8 | 99.3 % | 1 | 3 | 0 | 10.7 | 2.83 | 85k |

![S against cost per run for every effort level of the three 5.5 models, plain request](llm-chart-efforts.svg)

*Converted*: share of the 676 compared cases that got a chain (L157 and E10 are left out). *Precision*: share of emitted chains that are CORRECT or DRIFT. Cost is the CLI's API-equivalent figure; the runs used a subscription. Time is wall time and includes the account's rate limiting while three runs shared it.

**Excluded: opus / max.** Not completed, and not run again. The first run was cut off by the account's 5-hour session limit (HTTP 429) after 38.7 min, $7.57 and 284k output tokens (253k of them thinking), with 460 of 678 answers written. It ran in parallel with sonnet / max, so the limit was shared; how much each run used is not measured. A second attempt (2026-10-13) on the 218 locators without an answer, as one request, ran 42.3 min, $5.41 and 256k output tokens (all but 112 of them thinking) and wrote no answer file. Together the two attempts spent 81 min and $12.98 (API equivalent) and used almost the whole 5-hour usage limit, with no usable result. Two earlier `max` attempts (sonnet: session limit; opus: network error) were rerun; their records are in `llm/out/failed/`, the second opus attempt is in `llm/out/opus-max-rest/`.

**Rescored with the Phase 5 expectations (task D2).** The same stored answers, scored again with `audit/llm/score.js` after Phase 5. The table above was later rescored in full (see its note); the numbers below are the D2 intermediate step. Only three cells were rescored, and no model was run; the other nine hold their earlier scores in `scores/`.

| Cell | R (before → now) | S (before → now) | WRONG (before → now) |
|---|---|---|---|
| **converter** | 95.3 → **95.8** | 61.8 → **91.8** | 0 → 0 |
| opus / low | 95.3 → 95.0 | 81.1 → 81.9 | 6 → 1 |
| sonnet / low | 95.2 → 94.8 | 68.8 → 68.6 | 6 → 3 |
| haiku / medium | 94.5 → 94.1 | 60.8 → 63.8 | 7 → 4 |

- The converter now has a higher R than all three cells (95.8 against 95.0 / 94.8 / 94.1). On S it was 19 points below opus / low and is now 10 below (91.8 against 81.9). INVALID is unchanged (3, 4, 0), and the converter has none.
- **Changes in `score.js`.** C06, C07 and B03 added to `SPEC_NOT_EXPRESSIBLE` (as in `build.js`). `RUNTIME_OVERRIDE` entries for L270–L272 (grouped `last()` is a documented DRIFT now; without this the converter's own `[-1]` chains were 3 corpus WRONG, and the models' `[-1]` accounts for most of the drop in WRONG above) and for A07, A14–A16, B16 (exact since B4 and c2-attributes; without this the converter's S was 86.8). The converter's S is 91.8 here and 92.0 in the harness; the 0.2 is E05 / E06 (below).
- **H02 now fails the models.** The fixture rejects ``name MATCHES "a.c"`` (C1: it also matches `a\nc`), so sonnet / low and haiku / medium went CORRECT → WRONG on H02. Opus / low did not give that chain (H02 stays a GAP).
- B03, C06, C07 are not expressible any more, so the models' skips there are right (GAP → CORRECT-SKIP). Their E05 / E06 `[-1]` chains went WRONG → DRIFT, like L270–L272.
- **Lists that still differ:** `score.js` has E05 and E06 in `SPEC_NOT_EXPRESSIBLE`, `build.js` does not (there they are documented DRIFT since c2-last). Left as it is; removing them would move the converter's S from 91.8 to 92.0 (tried, not kept). There is no other difference between the two lists.
- Not rescored: haiku low / high / max, sonnet medium / high / max, opus medium / high (about 1.5 min each). `table.js` therefore mixes old and new rows until they are.

**Where the tokens go.** At `low`–`high` the output is 57–131k tokens, most of it the answer itself. At `max` it is 222–339k, and 79–89 % of it is thinking that did not improve the result.

### Where the models are right and the converter is not

A model found an exact chain for 30 cases: all 25 that the converter skips although an exact chain exists (GAP, H07 included since Phase 5), and 5 that it only approximates (DRIFT); full list in [`llm/analysis/cross.md`](llm/analysis/cross.md). By kind:

| Kind | Cases | Runs right (of 11) |
|---|---|---|
| all 4 corpus GAPs: union `A \| B` as one `OR` predicate, `and not (` with a space | L355, L455, L458, L461 | 6–11 |
| `not()`, `and not()` | D07, D08 | 11 |
| quotes, `]` and backticks inside literals (backtick doubled) | G03, G14, G04 | 11, 11, 3 |
| path kept as written instead of collapsed to `**/Button` (undocumented DRIFT) | A07, A14, A15 | 10–11 |
| `visible == 1` kept on the Cell step (the converter moves it to the Button step) | A16 | 11 |
| `@enabled=true()` (attribute exists) | B16 | 8 |
| `.//X`, `self::A or self::B`, unions in the spec | A12, X07, X04, X05 | 7–10 |
| `translate()`, `concat()`, `string-length()`, `normalize-space()` | C08, C09, C07, C06 | 11, 10, 7, 4 |
| `matches()`, `lower-case()`, `upper-case()` | H02–H06 | 5 |
| `descendant::`, `ancestor::` as `$…$` | F04, R01 | 6, 3 |

These are candidates for the converter. Before adding them, the ones that depend on how XCTest evaluates a predicate (`MATCHES`, `[c]`, `.length`, `$…$`) need the device check of Phase 2; the others only need the parser and are proved by mini-WDA.

The runs also showed three problems in the harness's own expectations. Phase 5 (task A) corrected them, and every number in this section is rescored with the corrections:

- **H07** `//*[replace(@label,"a","b")="bb"]` was marked inexpressible, but `label MATCHES "[ab]{2}"` (3 runs) is exact: replacing every a by b gives "bb" exactly when the label is two characters from {a, b}. The harness proves it (300 of 300 page sources equal). H07 is now in the denominator: a GAP for the converter and for the runs that skipped it, CORRECT for the 3 runs that wrote it.
- **E07** `(//Button)[position()=2]` got WRONG for `**/XCUIElementTypeButton[2]`, while the same chain for the same locator written as `(//Button)[2]` (E02) is DRIFT. **E11** `(//Cell)[2]/Button` is the same grouped position on an intermediate step. Both are now judged like E02: no exact chain exists, and a chain that behaves like the grouped-position approximation (`**/X[2]`, `**/Cell[2]/Button`) is documented DRIFT. The converter skips both, which stays CORRECT-SKIP and leaves the denominator, so its scores do not change. 9 runs lose 2 WRONG each.
- **L157** is a class chain inside `//…[…]`, not an XPath. It stays in the corpus, marked EXCLUDED, and is out of every count and denominator (R, C, Converted, Precision).

Effect, together with dropping E10 from the comparison: the converter's S goes from 62.0 to 61.8 (H07 is a new GAP in category H), R is unchanged. For the models, S drops by 0–1.2 points (most by 0.2–0.3; sonnet / high and max by 1.2, as they skipped H07), R is unchanged, the WRONG column drops by 2 in the 9 runs that wrote E07 and E11, and Precision rises by up to 0.6 points. The ranking does not change.

Checked and confirmed: `matches`, `ends-with`, `lower-case`, `upper-case`, `replace`, `tokenize` and `string-join` are registered by WDA itself (`FBXPathExtensions.m`), so H01–H09 are valid locators on the driver. The runs that skipped H01–H06 as "XPath 1.0 has no such function" (opus at every level, haiku / high and max) were wrong about the driver.

### Where the converter is right and the models are not

| Error type | Cases | Runs |
|---|---|---|
| raw line break copied into the NSPredicate string (WDA cannot parse it) | G05, L119, L162 | INVALID in 10 of 11 (every sonnet and opus run) |
| `@label!="a"` → `label != "a"`: NSPredicate is true for a missing label, XPath is false | B02 | WRONG in 7 (haiku, sonnet low–high) |
| positions with no exact form emitted anyway: `last()` → `[-1]`, `last()-1` → `[-2]` | E05, E06, L270–L272 | WRONG in 3–5 per run; more with stronger models |
| `[.//*[@name="x"]]` → `[$name == "x"$]` (`$…$` also matches the element itself, RC-D2) | F03 | WRONG in 6 (sonnet medium–max, every opus run) |
| zero-based indexes (`[0]`, `[n-1]`) | 35 positional cases | haiku / low only: 21 WRONG, 14 INVALID |
| skipped although the converter handles it: `@value>5`, `@x>60`, `@index`, `//XCUIElementTypeAny`, `$…$` for descendants, `hittable`, `placeholderValue` | B03, B04, B11, A04, F01, F07, F08, B14, B15 | GAP in 3–11 |

Sonnet and Opus make the first and third errors at every effort level, and no run is free of WRONG or INVALID chains: 4–43 per run, against 0 for the converter. They look like valid locators and either fail in WDA or find other elements. The full analysis, by error type and by run, written by Opus (effort `high`) from the scored results only: [`llm/analysis/analysis.md`](llm/analysis/analysis.md).

### Effort level, per model

| Model | Best effort | Why |
|---|---|---|
| Haiku | **medium** | low makes zero-based indexes (43 WRONG/INVALID). medium has no INVALID and the best S of Haiku. high has a lower S (the line-break INVALIDs return). max skips a quarter of the input and drops to R 92.2 |
| Sonnet | **low** (or medium for edge cases) | medium: +7.5 S for the same cost, −0.7 R. high is no better (−0.7 S). max: +1.6 S over high for 4× the cost and 6× the time |
| Opus | **low** | low and medium have identical verdicts; high adds 1.0 S for +39 % cost |

A higher effort was never better in proportion to its cost, and for Haiku it was worse.

### Top 3

| | Cell | R | S | Precision | Converted | WRONG + INVALID | Time | Cost |
|---|---|---|---|---|---|---|---|---|
| 1 | opus / low | 95.3 | 81.1 | 98.4 % | 83.4 % | 9 | 7.1 min | $2.04 |
| 2 | sonnet / low | 95.2 | 68.8 | 98.0 % | 83.3 % | 10 | 5.2 min | $1.03 |
| 3 | haiku / medium | 94.5 | 60.8 | 98.7 % | 80.9 % | 7 | 6.0 min | $0.28 |
| ref | converter (as of Phase 4, before Phase 5) | 95.3 | 61.8 | 100 % | 81.8 % | 0 | seconds | — |

On real-world locators (R) no run beats the converter; the best ones tie it. The models are ahead on edge cases (S, up to +20), and they pay for it with wrong chains the converter does not make. In the per-case verdicts, the models' strength lies exactly where the converter skips: on its 25 GAPs, opus / low is right on 19 and wrong on none, sonnet / low right on 22 with one INVALID. A model asked about all skipped locators would also convert the ones that have no exact form: E05, E06, L270–L272 and F03 wrong, E07 and E11 as the grouped-position approximation (DRIFT). This combination was not run as a pipeline.

### An improved prompt

**Tested in D3, see [Improved prompt (tested)](#improved-prompt-tested).** This is `audit/llm/prompt-v2.md` (Phase 5, D3a). The first version of this section came from the Phase 4 error types; v2 is rewritten to match what C1, C2 and D0 found on the device. The refuted advice is gone and the confirmed forms are in. General rules, no answers for particular cases. The old `audit/llm/prompt.md` is the prompt Phase 4 ran and is unchanged. v2 was tested first and led, in two steps of one rule each, to `audit/llm/prompt-v4.md`; results in the section below.

```
Convert each Appium XCUITest XPath into an iOS class chain that finds exactly
the same elements. Reply with the chain, or "SKIP: <reason>" if no exact chain
exists. A skip costs little; a chain that WDA rejects or that finds other
elements costs more. Convert what the rules below cover, skip the rest.

Structure
- **/X any depth, /X child, * any type (XCUIElementTypeAny is *). `//` between
  steps -> /**/. .//X at the start -> **/X. /XCUIElementTypeApplication/A/B ->
  A/B. Keep every intermediate step.
- Predicate [`NSPredicate`]; descendant test [$NSPredicate$].
- Only real XCUITest type names. SKIP any other name (e.g. XCUIElementTypeLabel).

String literals
- Double quotes. Escape " as \" and \ as \\. Write line breaks as \n and tabs
  as \t, never raw. Write a backtick as two backticks.
- == is exact and has no wildcards: * and ? in a literal are plain characters,
  so never use LIKE for them.

Attributes
- Keys: name, label, value, type, enabled, visible, accessible, hittable,
  placeholderValue, index; @x/@y/@width/@height -> rect.x, rect.y, rect.width,
  rect.height. Booleans and numbers are unquoted: enabled == true, index == 1,
  rect.x > 60.
- @type="T" is the step T, not a predicate. Other tests on @type: SKIP.
- SKIP @selected and @text (not in the XML WDA searches), text(), and any use
  of "." as text: contains(., "a").
- A missing attribute fails an XPath comparison, but is nil in NSPredicate:
  @a!="v" -> a != nil AND a != "v"; [@a] -> a != nil;
  not(@a="v") -> NOT (a == "v").
- @a=true() on enabled, visible, accessible or hittable only tests that the
  attribute exists, and WDA always writes it: no predicate. Other uses of true()
  and false(): SKIP.
- < and > on a text attribute (name, label, value): SKIP. XPath reads "10abc"
  as NaN, NSPredicate reads it as 10. Only the numeric attributes above
  (rect.*, index) take < and >.
- AND binds tighter than OR in both languages; add parentheses around every
  AND group inside an OR, and around an OR that is combined with a second
  [..] -> (a OR b) AND c.

Text functions
- contains / starts-with / ends-with -> CONTAINS / BEGINSWITH / ENDSWITH.
  Fold concat() of literals. Convert XPath 2.0 functions too (WDA has them).
- Case: lower-case(x)="v", upper-case(x)="V" -> x ==[c] "v"; contains of
  lower-case(x), upper-case(x) or translate(x, "A..Z", "a..z") -> CONTAINS[c].
  Only with a literal of ASCII letters, already in the case the function
  produces (otherwise the XPath never matches: SKIP).
- matches(x, p) without flags, p with no regex metacharacters -> CONTAINS; with
  flag "i" -> CONTAINS[c]. Any other p -> MATCHES "(?s:.*)(?-s:p)(?s:.*)", with
  p keeping its own ^ and $. Reason: XPath matches() searches inside the string,
  and MATCHES must match the whole string, and its "." also matches a line
  break. SKIP flags other than "i", and any p that contains a space.
- SKIP normalize-space() and string-length(). MATCHES treats a no-break space
  as a space, and .length counts UTF-16 units, so neither has an exact form.
  Never use MATCHES to work around whitespace or text normalization.
- == is exact. CONTAINS and BEGINSWITH equal the XPath on ordinary text.
  MATCHES and [c] also fold compatibility characters (fullwidth letters,
  ligatures, ß); they are an approximation for such text. Do not claim more.
- SKIP replace(), tokenize(), string-join(), count().

Combining
- [a][b] -> a AND b. Unions of //T[p] tests that differ only in the predicate
  -> one step with the predicates joined by OR (add type == "T" when the types
  differ). Other unions: SKIP.
- [.//T[p]] or [descendant::T[p]] -> [$type == "T" AND p$];
  //T1[p]/ancestor::T2 -> **/T2[$type == "T1" AND p$].
  $...$ also tests the element itself. So use it only when the outer step and
  the inner step both name a type and the types differ. With * or the same type
  on either side: SKIP. Child tests like [T] or [./T]: SKIP.
- SKIP parent, sibling, preceding, following axes, ancestor with a predicate or
  an index, and any other ancestor form.

Positions (1-based, never 0)
- (//X[p])[n] -> **/X[`p`][n]; (//X)[last()] -> **/X[-1];
  (//X)[last()-n] -> **/X[-(n+1)]. In the chain, a predicate comes before the
  index. These count in WDA's breadth-first order, which differs from XPath's
  document order when the matches sit at different depths; convert them anyway.
- SKIP: last() inside a step (//X[last()]), position() tests, ranges, an index
  written before a filter (X[2][@a="v"]), an index on a parenthesised path that
  has a further step or an inner index, and a position that is not a number.
```

#### Rule check

Every rule of `prompt-v2.md` against the case that supports it. **C1/C2/D0** = checked on the device (simulator, C1 also the iPhone); **harness** = verdict of the Phase 1–2 harness and converter fix (mini-WDA, and the Phase 2 device run where the case was in it), not re-run in C1/C2/D0; **unverified** = no case found. The refuted advice of the Phase 4 prompt (`normalize-space` → `MATCHES`, `string-length` → `.length`, `matches()` → whole-string `MATCHES`, `@value>5` → `doubleValue`, SKIP for `last()`) is not in v2; C06, C07, H02, B03 and E05/E06 are the cases that remove it.

| v2 rule | Support | Status |
|---|---|---|
| `**/`, `/`, `*`, `XCUIElementTypeAny` = `*` | A01–A05; A04 on the device in C1 | C1 |
| `//` between steps → `/**/`, leading `.//X` → `**/X` | A06, A09–A12 (RC1) | harness |
| `/XCUIElementTypeApplication/A/B` → `A/B` | A07, A08 (old prompt; the converter now writes `**/` for A07, "exact since B4") | **unverified** |
| Only real type names | A13 (RC11) | harness |
| `[…]` predicate, `[$…$]` descendant test | F01, F07, F08, R01 on the device | C1 |
| Escapes `\"`, `\\`, `\n`, `\t`, doubled backtick | G03–G05, G12 (RC4); Phase 4 INVALID for raw line breaks | harness (G03, G04 were GAP; the backtick form is **unverified** on the device) |
| `==` exact, `*` / `?` not wildcards, no `LIKE` | G07, G09 (RC13); D0 (`==` exact on 21 probes) | D0 + harness |
| Boolean / number unquoted, `rect.*`, `index` | B04, B11, B14 on the device | C1 |
| `@type="T"` is the step; other `@type` tests SKIP | B12, C10, C11 (RC11) | harness |
| SKIP `@selected`, `@text`, `text()`, `contains(., …)` | B08, B13, C03–C05, H10 (WDA XML) | harness |
| `!=` → `a != nil AND a != "v"`, `[@a]` → `a != nil`, `not()` → `NOT (…)` | B02, B10, D07, D08 | harness |
| `@a=true()` → no predicate (enabled, visible, accessible, hittable) | B16 on the device | C1 (`enabled` only; the other three are **unverified**) |
| Other `true()` / `false()` uses SKIP | none | **unverified** |
| SKIP `<` / `>` on text attributes | B03 (RC-D3), `10abc` on the device | C1 |
| AND / OR parentheses, `[a][b]` → AND | D03–D06, D09–D12 (RC7) | harness |
| `contains` / `starts-with` / `ends-with` → `CONTAINS` / `BEGINSWITH` / `ENDSWITH` | C01, C02, H01; D0 for `CONTAINS`, `BEGINSWITH` | D0 (`ENDSWITH` **unverified** on the device) |
| Fold `concat()` of literals | C09 | harness |
| `lower-case` / `upper-case` / `translate` → `==[c]` / `CONTAINS[c]`, ASCII literal | H05, H06, C08 on the device | C2 |
| Literal already in the case the function produces, else SKIP | derived from XPath semantics | **unverified** |
| `matches()` without metacharacters → `CONTAINS` / `CONTAINS[c]` | H03, H04 on the device | C2 (`i` flag with `CONTAINS[c]`: D0 did not run `(?i)`, see below) |
| other `matches()` → `MATCHES "(?s:.*)(?-s:p)(?s:.*)"` | H02 on the device (C1) | C1 |
| SKIP flags other than `i`, and a space in the pattern | C1 no-break-space fact; C2 rule | C1 |
| SKIP `normalize-space`, `string-length`; no `MATCHES` workaround | C06, C07 on the device; D0 | C1 + D0 |
| `MATCHES` / `[c]` fold compatibility characters; `==` exact; `CONTAINS` / `BEGINSWITH` equal on ordinary text | D0, 126 cases | D0 |
| SKIP `replace`, `tokenize`, `string-join`, `count` | H07–H09, F06 (no NSPredicate form) | harness |
| Unions with OR of predicates | none (README: unions are a skip in the converter) | **unverified** |
| `$…$` only with different named types, else SKIP; child tests SKIP | F01, F04, F03, R01 on the device; F02, F05 | C1 + C2 |
| SKIP parent / sibling / preceding / following axes, other `ancestor` forms | R02–R04, X01–X03; C2 axes | harness |
| `(//X[p])[n]` → `**/X[p][n]`, breadth-first caveat | E02, E03, E09, E14; RC-D1 | harness (device, Phase 2) |
| `(…)[last()]` → `[-1]`, `[last()-n]` → `[-(n+1)]` | E05, E06, L270–L272 on the device | C1 + C2 |
| SKIP per-parent `last()`, `position()`, ranges, index before filter, further-step grouped index | E04, E07, E08, E11–E13 | harness |

### Improved prompt (tested)

Phase 5, task D3. The prompt is [`llm/prompt-v4.md`](llm/prompt-v4.md) (rules; the runnable text is [`llm/prompt-v4-run.md`](llm/prompt-v4-run.md): the Phase 4 task paragraph, the rules, the Phase 4 output format; built by `llm/make-run-prompt.js`). It was run on the three cells that Phase 4 ranked first, one run each, everything else as in Phase 4 (same model IDs and effort, tools, empty folder, `input.json`). The three runs went in parallel, started together at 20:46 UTC and took 5.1–8.9 min. The host was on battery (65–66 %), Low Power Mode off, `caffeinate` on. The scoring (about 1 min per cell) ran on battery too. Run records: `llm/out/<cell>-3.json`, scores `llm/scores/<cell>-3.json`; table: `RUN=3 node llm/compare-v2.js`.

**How v4 came about.** There were three versions, each changing the previous one in one place:

| Version | Change | Result |
|---|---|---|
| v2 (`prompt-v2.md`, D3a) | the rules of C1, C2 and D0 | no wrong chain, but R 79.7–79.9: the rule "other tests on `@type`: SKIP" made the models skip 76 convertible corpus locators (a skip of a convertible locator counts 0 in R) |
| v3 (`prompt-v3.md`) | `contains` / `starts-with` / `ends-with` on `@type` with a complete real type name give the step too, unless another real name begins with that literal (Key, Menu, MenuBar, Outline, Picker, Ruler, Tab, Table, Toolbar); partial names stay SKIP. This is the converter's own test (`singleTypeMatch` in `lib/validator.js`) | R 94.4–95.0, S 72.6 / 86.8 / 87.8, 96.0–97.1 % of the converter; sonnet skipped the four `contains(@enabled,"false")` locators |
| v4 (`prompt-v4.md`) | `contains(@a,"true")` / `contains(@a,"false")` on `enabled`, `visible`, `accessible`, `hittable` → `a == true` / `a == false`; never `CONTAINS` on them (the device raises an error, RC2) | the table below |

The v2 runs are not kept; the v3 runs are (`llm/out/<cell>-2.json`).

**Measured against the converter.** 676 locators were compared (562 corpus, 114 spec; L157 and E10 are left out). The converter gives a usable chain (CORRECT or DRIFT) for 579 of them (490 corpus, 89 spec); that is 100 %. Every other row is counted against that number.

Each model is shown twice: with the plain Phase 4 prompt (task text and one example chain, no rules; the stored Phase 4 run, scored again by the same scorer) and with the v4 rules. Best model first.

| Cell | Prompt | R | S | Chains | Usable | % of converter (all / corpus / spec) | Missed | Skipped right | Ahead | WRONG + INVALID | Time, min | Cost, $ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **converter (maximum)** | — | 96.0 | 93.6 | 579 | 579 | 100 / 100 / 100 | — | — | — | 0 | — | — |
| opus / low | no rules (Phase 4) | 95.1 | 81.9 | 564 | 560 | 96.7 / 98.4 / 87.6 | 12 | 11 | 0 | 4 | 7.1 | 2.04 |
| opus / low | v4 | 95.0 | 86.9 | 560 | 560 | 96.7 / 98.2 / 88.8 | 5 | 14 | 0 | 0 | 5.1 | 1.72 |
| sonnet / low | no rules (Phase 4) | 94.8 | 68.5 | 563 | 555 | 95.9 / 98.0 / 84.3 | 17 | 12 | 0 | 7 | 5.2 | 1.03 |
| sonnet / low | v4 | 95.0 | 84.7 | 558 | 558 | 96.4 / 98.2 / 86.5 | 7 | 14 | 0 | 0 | 8.9 | 1.58 |
| haiku / medium | no rules (Phase 4) | 94.1 | 63.6 | 547 | 543 | 93.8 / 97.1 / 75.3 | 24 | 15 | 0 | 4 | 6.0 | 0.28 |
| haiku / medium | v4 | 94.8 | 72.0 | 559 | 554 | 95.7 / 98.0 / 83.1 | 11 | 14 | 0 | 5 | 5.7 | 0.27 |
| sonnet 5 / low | no rules (Phase 4) | 95.2 | 56.5 | 559 | 547 | 94.5 / 98.8 / 70.8 | 27 | 7 | 0 | 12 | 21.8 | 2.27 |
| sonnet 4.6 / low ‡ | no rules (7 × 100 chunks) | 89.1 | 48.9 | 540 | 501 | 86.5 / 91.8 / 57.3 | 62 | 17 | 0 | 39 | 23.1 | 2.58 |
| haiku 4.5 / medium † | no rules (Phase 4, run 2 of 3) | 59.6 | 18.1 | 370 | 311 | 53.7 / 59.6 / 21.3 | 217 | 51 | 0 | 59 | 6.0 | 0.61 |

† **Older models** (2026-10-13; `run.js sonnet46|haiku45`, `CELLS=haiku45-medium RUN=1 node compare-v2.js`): the plain Phase 4 prompt, same isolation, one run each. `claude-haiku-4-5` / medium, three runs (`haiku45-medium-1/2/3`): in every one it wrote Python converters (`convert.py`, `process.py`, … up to 11 files) instead of converting the locators itself. Run 1 answered 100 of 678 ids (65 chains, 35 skips) and asked the user to run its script (R 7.8, S 1.0, 25 of 65 chains WRONG or INVALID, 6.0 min, $0.66, 42k output tokens of which 5k thinking). Run 2 ran its own script and returned all 678 in three parts (R 59.6, S 18.1, 370 chains, 311 usable, 59 WRONG or INVALID, 6.0 min, $0.61, 44k / 3k); this is the run in the table and in the README, because it is the only one that fulfilled the task and can be scored. Run 3 wrote 11 scripts, answered nothing and ended with the command for the user to run (3.4 min, $0.47, 28k / 3k; scored 0 on 678 MISSING). `claude-sonnet-5` / low finished all 678 ids in four parts (21.8 min, $2.27, 9 turns, output 140k tokens of which 81k thinking, cache write 191k, cache read 566k; Sonnet 5.5: 5.2 min, $1.03, 58k / 15k). On the corpus it is level with the 5.5 models (R 95.2, missed only L012, L119, L162; L119 and L162 INVALID: raw line break), on the edge cases it is far behind (S 56.3; 7 WRONG: A07, A13, B02, B10, B16, E04, G12; 3 INVALID: B03, B04, G05). Haiku 4.5 is not usable for this task as given (one run in three delivers answers, at R 59.6), and Sonnet 4.6 only in chunks of 100; the comparison with the 5.5 models is a comparison of task completion, not of conversion quality.

‡ **Sonnet 4.6, chunked** (2026-10-13; `run-chunked.js sonnet46 low 100 all 2`, `CELLS=sonnet46-low RUN=c100 node compare-v2.js details`): not the same conditions as the other rows. The other models get all 678 ids in one request; `claude-sonnet-4-6` / low got seven isolated runs of 100 ids (the last 78), the same `prompt.md` and tools (Read, Write), only the count differs. The full-file run wrote no output in 20 min (Sonnet 5.5: 5.2 min) and was stopped. Chunks: 3.3, 4.3, 3.1, 3.7, 3.3, 3.0, 2.5 min, $0.37, 0.43, 0.36, 0.40, 0.36, 0.35, 0.31; total 23.1 min, $2.58, output 86k tokens of which 51k thinking. Chunk 1 has wrong token counts (17 output recorded; its cost is right), so the token totals are about 14k low. Result: 540 chains, 138 skips; usable 501 (corpus 91.8 %, spec 57.3 % of the converter); 39 WRONG or INVALID (10 WRONG, 29 INVALID, all rejected by the WDA parser, e.g. `**[`label == "…"`]` without an element type: "Cannot parse class chain query … position 3"); 62 chains missed that the converter has, 17 skips right. Against the others: Sonnet 5.5 low R 94.8, S 68.6, $1.03; Sonnet 5 low R 95.2, S 56.3, 21.8 min, $2.27; Haiku 4.5 medium R 59.6, S 18.1, $0.61 (run 2 of 3).

| Cell | Prompt | Comment, corpus (562) | Comment, spec (114) |
|---|---|---|---|
| **converter** | — | Reference. 39 chains are documented approximations (DRIFT: positions, `//X[n]`) | Reference. 13 DRIFT chains; skips what has no exact form |
| opus / low | no rules | 2 INVALID: a raw line break in a literal (L119, L162) | 1 WRONG (F03: `$…$` for a descendant `*`), 1 INVALID (G05, raw line break). Skips `matches`, `ends-with`, `lower-case`, `upper-case` ("XPath 2.0", H01–H06), A04, B04, B11 |
| opus / low | v4 | Skips L012 | Skips A08, X05 (union of two types), X07 (`self::`), C10 |
| sonnet / low | no rules | 2 INVALID (L119, L162, raw line break); skips L012 | 3 WRONG (B02 `!=`, H02 `MATCHES "a.c"`, H09), 2 INVALID (G04 backtick, G05 line break). Skips the `$…$` group (F01, F04, F07, F08, R01), B04, B10, B11, A04, G12 |
| sonnet / low | v4 | Skips L012. The four `contains(@enabled,"false")` locators are right | Skips A04 (`XCUIElementTypeAny`), A06 (`descendant::` in the path), A08, A11 (`/./`), X07 (`self::`), C10 |
| haiku / medium | no rules | Skips L012, L119 (line break) and the unions L355, L455, L461. No wrong chain | 4 WRONG (A13, A07, B02, H02). Skips the unions X04, X05, the `$…$` group, six attribute cases (B04, B10, B11, B14, B15, B17), G04, G05, A04 |
| haiku / medium | v4 | Skips L012. **1 WRONG: L129** (`contains(@type,"XCUIElementTypeStaticText") and contains(@label,…)` became `**/*[label CONTAINS …]`, the type test dropped; right in v3) | 4 INVALID: `$…$` written inside backticks (F01, F04, F07, F08; the same four as in v3, right in v2). Skips R01 (`ancestor::`), A08, X07, C10, G13 (a literal with `$`) |

**Columns.** *Usable*: chains that are CORRECT or DRIFT on the fixture pages; *% of converter*: usable ÷ the converter's 579, all, corpus only, spec only. *Missed*: the converter has a usable chain and the model skipped the locator or sent a chain that does not work. *Skipped right*: the converter only approximates (DRIFT: positions that have no exact form) and the model skipped it, which the harness counts as right. *Ahead*: a usable model chain where the converter has a GAP (an exact chain exists and the converter misses it); this is where a model can be better than the converter, and the column is there to catch it in later versions. The only case is H07 (`replace()` as `MATCHES "[ab]{2}"`), in the two plain-prompt runs of sonnet and haiku. The converter's other skips are right, and the plain-prompt chains for E07, E11 (positions that have no exact form) and C06, C07 (`MATCHES` forms that the device refuted in C1, but that mini-WDA accepts) are not counted: the first are approximations, the second cannot be seen by this scorer. The v4 rules (and v2, v3) skip all of them. *Chains* counts every chain sent, including WRONG and INVALID.

**What R and S are.** **R** is the score on the 562 real-world locators: 100 × credit ÷ locators that have an exact chain; credit is 1 for CORRECT, 0.5 for a documented DRIFT, 0 for a skip of a convertible locator, WRONG or INVALID. A skip that is right (no exact chain exists) is not in the denominator. **S** is the score on the 114 hand-made edge cases, weighted by group (A paths 15, B attributes 15, C string functions 15, D logic 12, E positions 12, F nested 10, G literals 10, H extension functions 6, R reverse axes 5; total 100). Both use the same credit.

**Findings.**

1. **The v4 rule does what it was written for.** Sonnet converts the four `contains(@enabled,"false")` locators now (L278, L520, L521, B18); opus and haiku already did. The rule costs nothing on the corpus: R is 94.8 / 95.0 / 95.0, within 0.8 of the converter's 95.8, and sonnet and opus make no wrong chain.
2. **What the rules change, against the plain prompt.** R barely moves (opus 95.0 → 95.0, sonnet 94.8 → 95.0, haiku 94.1 → 94.8): on real-world locators a model with no rules already gets as far as the rules do. The gain is elsewhere: S rises by 4.1 (opus), 15.2 (sonnet) and 7.3 (haiku); WRONG + INVALID falls from 4 / 7 / 4 to 0 / 0 / 5 (the five of haiku are two mistakes, see below); the three models come closer to each other (S 63.8–81.9 → 71.1–86.0); a run costs 16 % less for opus and 50 % more for sonnet (one noisy run). The rules do not make the models beat the converter; they take away most of the wrong and invalid chains.
3. **v3 and v4 differ in cases the v4 rule does not touch, which is the run-to-run noise.** Between the v3 and the v4 run, S moved by −1.5 (haiku), −3.0 (sonnet) and −1.8 (opus) because single edge cases flipped: sonnet lost A04, A06, A11, opus lost A08 and X05, haiku lost G13, and each of them was right in the other run. One run per cell therefore cannot show differences of about 3 S points. Sonnet's run also took 8.9 min and 32k thinking tokens (v3: 4.1 min, 6k).
4. **Against the converter.** With v4: 95.7–96.7 % of its usable chains (98.0–98.2 % on the corpus, 83–89 % on the spec cases); the gap on the corpus is 11, 7 and 5 locators. With the plain prompt: 93.8–96.7 %. No model is ahead of the converter on any case (H07 was the only one, in two plain-prompt runs, until it became not expressible). In 14 cases the models with the rules skip where the converter only approximates; the harness counts that as right, but those are the converter's documented DRIFT, so it is a tie in practice.
5. **Errors.** Sonnet and opus: none. Haiku: the same `$…$`-in-backticks mistake in four cases (INVALID), and one new WRONG (L129, the type test dropped). Haiku / medium still cannot be used without the harness or a device check.
6. **What is left that the converter does and the models do not do reliably:** `self::` (X07), partial `@type` names (C10, the model skips; the converter converts), `descendant::`/`/./` in the main path, per-parent positions (A08), the parenthesised path with an inner index (L012). Haiku also needs a clearer `$…$` rule if it is to be used.
7. **Cost of one run:** $0.27, $1.58, $1.72 (total $3.57).

**Rules that were unverified in "Rule check"** (a model ran the rule; the verdict is mini-WDA only, the device was not used and is not planned): `/XCUIElementTypeApplication/A/B` → `A/B` (A07 CORRECT in all three; A08 skipped by all three in v4, right in two of three in v3); `ENDSWITH` (H01 CORRECT in all three); `hittable` / `accessible` with `== true` (B14, B17 CORRECT in all three); the doubled backtick (G04 CORRECT in all three); unions with OR (X04, L355, L455, L458, L461 CORRECT in all three; X05 in two of three, opus skipped it in v4). All of this is for the v4 run. No rule was refuted by a wrong chain. "Other `true()` / `false()` uses SKIP" has no case.

### Limits of these measurements

- One run per cell. Run-to-run variation is not measured (Stage 2 was not run), so differences of a few cases between cells, such as sonnet low vs medium on R, may be noise.
- `xhigh` was not run; opus / `max` did not complete (see Excluded above).
- The oracle is mini-WDA, not a device. The converter's outputs were checked on a simulator and an iPhone in Phase 2; the models use forms the converter does not (`MATCHES`, `[c]`, `.length`, `rect.x`, `$…$` with `ancestor::`), and those were not.
- Times are from parallel runs on one account and include its rate limiting. The scoring ran on a Mac on AC with Low Power Mode off.
- The input is the audit's own corpus and spec matrix. Many spec cases are deliberately unusual, and the models saw no examples of class chain beyond the one in the prompt.

### Conclusions

1. On real-world locators, a plain model converts 75–84 % of the input against the converter's 85.7 % and scores the same at best (R 95.0 for opus at every level and sonnet / max, the converter 96.0, which is also its ceiling). It never scores higher.
2. Every model run emits wrong chains: 3–39 per run (precision 93–99.5 %), against none from the converter. The two most common errors are a raw line break in a literal (INVALID in every Sonnet and Opus run) and positions that have no exact form (`last()`, `position()`), which the models convert instead of skipping.
3. The models were clearly better on edge cases than the converter was at the time of Phase 4 (S up to 82 against 62; 25 GAPs, 4 corpus and 21 spec, where some run found the exact chain, and 5 DRIFTs with an exact form: A07, A14–A16, B16). Phase 5 closed that gap: the converter now has S 93.6 (its ceiling) and no GAP, and the best model run reaches S 82.9 (opus / high), so no model is ahead of it.
4. A higher effort does not pay: Opus is flat from `low`, Sonnet gains most from `low` to `medium` and Haiku gets worse above `medium`. `max` costs 2–4× and up to 6× the time of the level below for at most +3.3 S (Sonnet), and it spends 80–90 % of its tokens on thinking. Opus `max` did not finish (see Excluded above).
5. Recommendation: convert with the converter, which never emits a wrong chain. For the locators it skips, a model helps (opus / low or sonnet / low), but its chains need the harness or a device check before they replace the XPath.

## Device check (Phase 5, C1)

Phase 4 left two kinds of candidate. The first are forms that only the models emit (`MATCHES`, `[c]`, `.length`, `$…$` for `descendant::` / `ancestor::`, B16 without a predicate). The second are forms the converter already emits but that Phase 4 marked as doubtful (`value.doubleValue`, `rect.x`, `index`, `hittable`). C1 runs both against the XPath on LocatorLab, on the simulator and on the iPhone, and also checks two XPath behaviours of WDA (`XCUIElementTypeAny`, `[-1]` for `last()`). The converter and the harness were not changed, so R and S are unchanged (no row in "Progress since Phase 1"). Results: `device/results-c1.json` (simulator), `device/results-c1-device.json` (iPhone); cases: `device/cases-c1.json`.

### Setup

| | Simulator | iPhone |
|---|---|---|
| Device | `LocatorLab iPhone 17`, iOS 27.0 (24A434) | iPhone 13 Pro Max, iOS 26.6 (23G71) |
| Appium / driver / WDA | 3.8.0 / 12.16.0 / 16.14.1 | same |
| Xcode | 27.0 (27A266a) | same |
| Mac power | AC, Low Power Mode off | AC, Low Power Mode off |
| Run | 39 cases, 280 s | 39 cases, 560 s |

- Each case is an XPath from the spec matrix or the corpus (adapted values as in Phase 2), run against its **candidate chains**: the spec label's hand-written chain (`expectedChain`) and the chain the models wrote (`llm/analysis/cross.md`; for C06 also the `[ \t\r\n]` form from the improved prompt in `llm/analysis/analysis.md`). The comparison is the one from Phase 2: same set, same first element. `run.js` gained `--cases <file>` and a `candidates` list per case. Phase 2's `cases.json` / `results.json` are unchanged.
- The Phase 2 screens rarely tell the forms apart: Phase 2 had already run most of these chains as `expected`, and all were EQUAL. A new screen, **`c1`**, adds values on which XPath and chain can disagree. These are identifiers with a newline (`abc\n`, `a\nc`, `x\nb`), labels with a no-break space and a tab between `a` and `b`, a button labelled `😀😀` (2 code points, 4 UTF-16 units), `Qty` buttons with the values `10abc` and `1e3`, and buttons at a fractional x (two in SwiftUI, one UIKit button at x = 60.5, width 30.5). It is a separate screen, so the Phase 2 layouts did not move.
- One chain is not from the models: `(?s:.*)(?-s:^a.c$)(?s:.*)` for H02. Ad hoc probes on `c1` (listed below) showed why the models' form fails, and this one was then added as a candidate.

### Verdicts

CONFIRMED = equal to the XPath on every screen tried, on the simulator and on the iPhone, so it goes into C2. REFUTED = differs, and stays a skip (or must become one). No case was DEVICE-DEPENDENT: the iPhone gave the same outcome as the simulator for every case and every candidate. Some hits differ only because the iPhone's screen is larger (B11, B11~lists, B14~lists: both sides find the same extra elements).

| Case | XPath | Chain checked | Screens | Result | Verdict |
|---|---|---|---|---|---|
| H03 | `//*[matches(@name,"b")]` | ``name CONTAINS "b"``, ``name MATCHES "(?s).*(?:b).*"`` | functions, c1 | EQUAL, also on `x\nb` | CONFIRMED |
| H04 | `//*[matches(@name,"ab","i")]` | ``name CONTAINS[c] "ab"``, ``name MATCHES "(?si).*(?:ab).*"`` | functions, c1 | EQUAL | CONFIRMED |
| H02 | `//*[matches(@name,"^a.c$")]` | ``name MATCHES "a.c"`` (models, spec label) | functions, c1 | SET_DIFFERS: the XPath also finds `abc\n`, the chain also finds `a\nc` | REFUTED |
| H02 | same | ``name MATCHES "(?s:.*)(?-s:^a.c$)(?s:.*)"`` | functions, c1 | EQUAL | CONFIRMED (this form) |
| H05 | `//*[lower-case(@label)="ab"]` | ``label ==[c] "ab"`` | functions, c1 | EQUAL | CONFIRMED |
| H06 | `//*[contains(upper-case(@label),"AB")]` | ``label CONTAINS[c] "AB"`` | functions, c1 | EQUAL | CONFIRMED |
| C08 | `contains(translate(@label, A–Z, a–z),"ab")` | ``label CONTAINS[c] "ab"`` | functions, c1 | EQUAL | CONFIRMED (ASCII literal) |
| C06 | `//*[normalize-space(@label)="a b"]` | ``label MATCHES "\\s*a\\s+b\\s*"``, ``label MATCHES "[ \\t\\r\\n]*a[ \\t\\r\\n]+b[ \\t\\r\\n]*"`` | functions, c1 | SET_DIFFERS: both chains also find `a`U+00A0`b` | REFUTED |
| C07 | `//Button[string-length(@label)>3]` | ``label.length > 3`` | functions, c1 | SET_DIFFERS: the chain also finds `😀😀` (`.length` 4, `string-length` 2) | REFUTED |
| F04 | `//Cell[descendant::Button]` | ``**/Cell[$type == "XCUIElementTypeButton"$]`` | lists | EQUAL | CONFIRMED (types differ, RC-D2 rule) |
| R01 | `//Button[@name="sib.remove"]/ancestor::Cell` | ``**/Cell[$type == "XCUIElementTypeButton" AND name == "sib.remove"$]`` | siblings | EQUAL (cell with the button nested one level deeper included) | CONFIRMED (types differ) |
| B16 | `//Button[@enabled=true()]` | `**/XCUIElementTypeButton` | states | EQUAL (the converter's ``enabled == true`` is SET_DIFFERS, as in Phase 2) | CONFIRMED |
| B03 | `//Button[@value>5]` | ``value.doubleValue > 5`` (**converter**) | states, c1 | states EQUAL; c1 SET_DIFFERS: the chain also finds value `10abc` | REFUTED (new defect, below) |
| B04 | `//Button[@x>60]` | ``rect.x > 60`` (converter) | states, c1 | EQUAL, including x = 60.5 | CONFIRMED |
| B11 | `//*[@index="1"]` | ``index == 1`` (converter) | functions, lists, states, c1 | EQUAL | CONFIRMED |
| B14 | `//Button[@hittable="true"]` | ``hittable == true`` (converter) | states, lists | EQUAL | CONFIRMED |
| A04 | `//XCUIElementTypeAny[@name="a"]` | ``**/*[`name == "a"`]`` (converter) | functions | EQUAL | CONFIRMED |
| E05, E06, L270, L271, L272 | `(…)[last()]`, `(…)[last()-1]` | `…[-1]`, `…[-2]` | lists | SET_DIFFERS against the XPath, but `[-1]` / `[-2]` is always the last / second-to-last element of the ungrouped lookup's result | CONFIRMED as DRIFT (RC-D1) |

### Platform facts found in C1

All of these hold on the simulator (iOS 27.0) and on the iPhone (iOS 26.6). They came from the cases above and from ad hoc probes on `c1`, which are not in the case files.
- **`MATCHES` in a class chain treats `.` as dot-all.** ``name MATCHES "a.c"`` matches `a\nc`. The XPath `matches()` that WDA registers does not, and its `$` also matches before a final newline (`abc\n` matches `^a.c$`), as ICU does without the `m` flag. Inline flags work: `(?-s)a.c` and `a[^\n]c` exclude `a\nc`, and `(?s:.*)(?-s:p)(?s:.*)` reproduces XPath's search semantics, anchors included.
- **`MATCHES` treats a no-break space (U+00A0) like a plain space.** ``label MATCHES "a b"``, ``"a[ ]b"`` and ``"a\\x{20}b"`` all match the label `a`U+00A0`b`, and ``"a\\x{a0}b"`` matches nothing. ``label == "a b"`` and ``label CONTAINS " "`` do not match it, and neither does the XPath. So no `MATCHES` form of `normalize-space()` is exact, and any `MATCHES` pattern with a literal space also matches no-break spaces.
- **`.length` counts UTF-16 units**, and the XPath's `string-length()` counts code points.
- **WDA's XPath reads `1e3` as 1000** (libxml2 accepts exponents), as `doubleValue` does. It reads `10abc` as NaN, while `doubleValue` reads it as 10.
- **Frames are whole points on both sides.** The UIKit button at x = 60.5, width 30.5 is x = 60, width = 31 in the page source *and* in the predicate (``rect.x == 60.5`` finds nothing, ``rect.x > 60`` excludes it). SwiftUI already places its accessibility frames on whole points. So `@x` and `rect.x` see the same number, and the rounding Phase 4 worried about does not happen.
- **`[-n]` counts from the end of the same list that `findElements` returns.** WDA returns an XPath's matches in the same order as the class chain's (breadth-first, RC-D1), so `(//X)[last()]` (document order) and `**/X[-1]` differ exactly as `(//X)[n]` and `**/X[n]` do.

### mini-WDA against the device

The `c1` page source was run through `harness/check.js` with the same XPaths and chains (H02 both forms, C06 both forms, C07, B03, H05, H03, B04). mini-WDA gives the same sets as the simulator in all 9: it reproduces dot-all `MATCHES`, the no-break space, `.length` and `doubleValue`, because Foundation's `NSPredicate` on macOS behaves like XCTest's here. **No divergence** of the RC-D1 / RC-D2 kind, so mini-WDA needs no change. Its random page sources have never contained `10abc`-like values, newlines in identifiers or no-break spaces, which is why the harness has B03 as CORRECT.

### New defect

| Id | Severity | What | Where |
|---|---|---|---|
| RC-D3 | major (**fixed** in `fix/c2-attributes`: skipped) | `@value>5` → ``value.doubleValue > 5`` also matches values with a numeric prefix (`10abc`, and likely `50%` on a slider or `5 items`): `doubleValue` reads the prefix, while XPath `number()` gives NaN, so the comparison is false. RC14 assumed the two agree whenever XPath gives NaN and the predicate gives 0. They do not when the text starts with a number. | RC14 rule (`>` / `>=` on a text attribute) |

The harness still scores B03 CORRECT, so R and S are unchanged in this branch. C2 decides between skipping the rule and documenting it as DRIFT. C2 skipped it in `fix/c2-attributes`, and a harness fixture now covers it.

### For C2 (one branch per group)

1. **`fix/c2-functions`.** `matches()`: a pattern without regex metacharacters → `CONTAINS` (with `[c]` for the `i` flag) (H03, H04); any other pattern → ``MATCHES "(?s:.*)(?-s:p)(?s:.*)"`` (H02), with `(?i)` for `i`; skip other flags and any pattern with a literal space (no-break-space fact above). `lower-case(x)="v"` → ``x ==[c] "v"`` (H05), `contains(upper-case(x),"V")` / `contains(translate(x, A–Z, a–z),"v")` → ``CONTAINS[c]`` (H06, C08), for ASCII literals only. Keep C06 (`normalize-space`) and C07 (`string-length`) skipped, and put the reason in the skip message. Done in `fix/c2-functions` (see Progress since Phase 1).
2. **`fix/c2-axes`.** `[descendant::T]` → `[$type == "T"$]` (F04) and `//T1[cond]/ancestor::T2` → `**/T2[$type == "T1" AND cond$]` (R01), only when both steps name a type and the types differ (the RC-D2 rule). Done in `fix/c2-axes` (see Progress since Phase 1).
3. **`fix/c2-attributes`.** `@attr=true()` on a boolean attribute WDA always writes → no predicate (B16, DRIFT → CORRECT). RC-D3: stop emitting `value.doubleValue` for `>` / `>=` on a text attribute, or document it, plus a harness fixture with a `10abc`-like value (B03 becomes WRONG/DRIFT until then). Done in `fix/c2-attributes` (see Progress since Phase 1).
4. **`fix/c2-last`.** `(…)[last()]` → `[-1]`, `(…)[last()-n]` → `[-(n+1)]` as documented DRIFT, under the same README note as RC-D1 (E05, E06, L270–L272; harness verdict CORRECT-SKIP → DRIFT). Done in `fix/c2-last` (see Progress since Phase 1).

No change needed: B04 `rect.x`, B11 `index`, B14 `hittable`, A04 `XCUIElementTypeAny`.

### Not verified in C1

- One run per platform, no repeat. The outcomes are deterministic on a static screen, and the simulator was run twice while the case file grew; the overlapping cases agreed.
- Unicode case mapping (`[c]` against `lower-case()` on non-ASCII letters, e.g. `ß`, `İ`) was not tried. That is why C2's `[c]` rules are limited to ASCII literals.
- Other Unicode spaces (U+2007, U+202F, …) under `MATCHES`, and `.length` on combining characters, were not tried.

## Device check (Phase 5, D0)

C2 found on mini-WDA (macOS) that NSPredicate compares normalized text while XPath compares code points, and only the U+00A0 result from C1 had been confirmed on the device. D0 runs the other characters on the simulator and corrects the README note and the limit above to what the device does. The converter and the harness were not changed, so R and S are unchanged (no row in "Progress since Phase 1").

### Setup

| | Simulator |
|---|---|
| Device | `LocatorLab iPhone 17`, iOS 27.0 (24A434) |
| Appium / driver / WDA | 3.8.0 / 12.16.0 / 16.14.1 |
| Xcode | 27.0 (27A266a) |
| Mac power | AC (battery 80 %, not charging), Low Power Mode off |
| Run | 126 cases, 140 s (single cold lookup per side, so timings are not a benchmark) |

- The `c1` screen gained three rows (LocatorLab rebuilt and reinstalled): the characters `Ｑ` (U+FF31), `ｑ` (U+FF51), `ﬁ` (U+FB01), `①` (U+2460), `ſ` (U+017F), `ß` (U+00DF), the Kelvin sign (U+212A); decomposed `é` (e + U+0301) and `Å` (A + U+030A) next to their composed forms; and their ASCII twins `Q q fi 1 s ss SS K k e A`. Each is a label of its own.
- `cases-d0.json` (made by `make-cases-d0.js`) has 21 probe strings × 6 operators. The probes are every character above and every twin. The reference is always an XPath that compares code points: `contains()`, `starts-with()`, `=` for `CONTAINS`, `BEGINSWITH`, `==` (and for `MATCHES`, written `(?s:.*)(?-s:p)(?s:.*)`); `translate(@label, A–Z, a–z)` with a lower-cased literal for `CONTAINS[c]` and `==[c]`, the ASCII rule that C2 converts. `d0-table.js` prints the per-probe summary from `results-d0.json`.
- mini-WDA was run on the same page source with the same 126 XPath / chain pairs: **the same sets in all 126**, so it needs no change.

### What the chain does against the XPath

Cell = outcome against the XPath. `=` is EQUAL; `+X` means the chain also finds label X; `−X` means the chain misses a label the XPath finds. `Qty` is the unrelated `Qty` buttons that contain a `Q`. `e◌́` is the decomposed `é`, `A◌̊` the decomposed `Å`.

| Probe | `CONTAINS` | `BEGINSWITH` | `==` | `CONTAINS[c]` | `==[c]` | `MATCHES` |
|---|---|---|---|---|---|---|
| `Q` | = | = | = | +`Ｑ` `ｑ` | +`Ｑ` `ｑ` | +`Ｑ` |
| `q` | = | = | = | +`Ｑ` `ｑ` | +`Ｑ` `ｑ` | +`ｑ` |
| `Ｑ` | = | = | = | +`Qty` `Q` `q` `ｑ` | +`Q` `q` `ｑ` | +`Qty` `Q` |
| `ｑ` | = | = | = | +`Qty` `Q` `q` `Ｑ` | +`Q` `q` `Ｑ` | +`q` |
| `fi` | = | = | = | +`ﬁ` | +`ﬁ` | +`ﬁ` |
| `ﬁ` | = | = | = | +`fi` | +`fi` | +`fi` |
| `1` | = | = | = | +`①` | = | +`①` |
| `①` | = | = | = | = | = | +`1` |
| `s` | = | = | = | +`ſ` | +`ſ` | +`ſ` |
| `ſ` | = | = | = | +`s` `ss` `SS` | +`s` | +`s` `ss` |
| `ss` | = | = | = | +`ß` | +`ß` | = |
| `ß` | = | = | = | +`ss` `SS` | +`ss` `SS` | = |
| `k` | = | = | = | +Kelvin | +Kelvin | = |
| `K` | +Kelvin | +Kelvin | = | +Kelvin | +Kelvin | +Kelvin |
| Kelvin | +`K` | +`K` | = | +`K` `k` | +`K` `k` | +`K` |
| `e` | −`e◌́` | −`e◌́` | = | −`e◌́` | = | −`e◌́` |
| `é` | +`e◌́` | +`e◌́` | = | +`e◌́` | = | +`e◌́` |
| `e◌́` | +`é` | +`é` | = | +`é` | = | +`é` |
| `A` | −`A◌̊` | −`A◌̊` | = | −`A◌̊` | = | −`A◌̊` |
| `Å` | +`A◌̊` | +`A◌̊` | = | +`A◌̊` | = | +`A◌̊` |
| `A◌̊` | +`Å` | +`Å` | = | +`Å` | = | +`Å` |

(In the `Q`, `q` and `A` rows the `[c]` columns also list the ASCII case twins on both sides, since the XPath reference lower-cases them too; only the differences are shown.)

### What follows

The device folds more than the mini-WDA note said in some places and less in others, and it matches mini-WDA everywhere it was tried:

- **`==` is exact.** Not one of the 21 probes differs from the XPath. This also holds for `==[c]` apart from case: it folds compatibility and case, never canonical equivalence (`é` stays different from `e◌́`).
- **`CONTAINS` and `BEGINSWITH` use canonical equivalence only.** The Kelvin sign equals `K`, composed equals decomposed `é` / `Å`. Fullwidth, ligatures, `①`, `ſ`, `ß` are not folded. Matching is by character, not by code point: a pattern ending in a base letter (`e`, `A`) does **not** match the same letter followed by a combining mark, which the XPath does.
- **`MATCHES` compares NFKC-normalized text, case-sensitively.** It folds `Ｑ`→`Q`, `ｑ`→`q`, `ﬁ`→`fi`, `①`→`1`, `ſ`→`s`, Kelvin→`K`, decomposed→composed, and does not fold `ß`→`ss` or `K`→`k`. As with `CONTAINS`, a base-letter pattern misses the decomposed letter.
- **`[c]` adds full case folding on top of that.** `ß` = `ss`, `ſ` = `s` = `S`, Kelvin = `k`, `Ｑ` = `q`, `ﬁ` = `fi`. `CONTAINS[c]` also folds canonical equivalence; `==[c]` does not. `①` is folded in one direction only: ``CONTAINS[c] "1"`` finds `①`, ``CONTAINS[c] "①"`` does not find `1`, and ``==[c]`` folds it neither way.
- **Every ASCII letter has a fullwidth twin, so `[c]` and `MATCHES` select labels that XPath does not on any text that contains fullwidth letters** (Japanese, Chinese and Korean UIs mix them in). A literal that is plain ASCII is exact only against text without these characters.
- **The U+00A0 result from C1 is the same family.** U+00A0 normalizes to a plain space under NFKC, which is what `MATCHES` does with it; `CONTAINS " "` and `==` do not fold it.
- The probes for `ß` / `ſ` / Kelvin show that the converter's `CONTAINS[c]` (C2: `translate()`, `lower-case()`, `upper-case()`, `matches(…, "i")`, ASCII literals) is not an ASCII-only comparison on the device. It matches `ß` for `ss` and `ſ` for `s`.

### Divergence the converter does not handle (not fixed)

| Id | Severity | What | Where |
|---|---|---|---|
| RC-D4 | minor (documented, no fix) | A chain built from `contains()`, `starts-with()`, `matches()`, `lower-case()`, `upper-case()` or `translate()` selects a different set than the XPath on text that holds combining marks, fullwidth letters, ligatures or `ß` / `ſ` / Kelvin. Worst case for plain `contains(@label, "Cafe")` → ``label CONTAINS "Cafe"``: a label `Café` with a decomposed `é` is matched by the XPath and **missed** by the chain (the other cases add elements). | RC8–RC10 `contains` / `starts-with` rules; C2 `matches()` and `[c]` rules |

Proposal (a separate task, not part of D0): leave the conversions as they are and keep the README limit. A literal cannot tell whether the screen holds such text, and the alternatives (skipping every `contains()`, or warning on every conversion) lose the common case. If a guard is wanted, a `warning` only for literals that contain non-ASCII characters is cheap, but it would not cover the worst case above (an ASCII literal against decomposed text).

### Facts for D3a (what the prompt may say)

- May: `==` is exact for any text. `CONTAINS` / `BEGINSWITH` equal the XPath on text without combining marks, and on non-ASCII literals they additionally treat composed and decomposed forms as equal.
- May: `MATCHES` and `[c]` are an approximation for text with compatibility characters (fullwidth, ligatures, `①`, `ſ`, `ß`, Kelvin); they are exact for ordinary text. `[c]` is case folding, not ASCII-only.
- Must not: call `[c]` "ASCII case-insensitive", call `MATCHES` "exact" or "case-insensitive", or offer a `MATCHES` form as a workaround for whitespace or normalization (`MATCHES` folds the most).
- Must not: promise that a literal with an ASCII letter is exact under `[c]` or `MATCHES`; say "same on ordinary text".
- Case rules stay as in C2: `lower-case` / `upper-case` / `translate(A–Z, a–z)` → `==[c]` / `CONTAINS[c]` for ASCII literals only; no advice on `İ`, `ß`, Kelvin literals.
- The no-break space rule is unchanged: `MATCHES` treats U+00A0 as a space, so no `MATCHES` form of `normalize-space()`.

### Not verified in D0

- Simulator only (as agreed); the iPhone was not run, so iOS 26.6 behaviour is assumed to match, as it did for every C1 case.
- `MATCHES` with `(?i)` (the converter's `matches(…, "i")` form) and `BEGINSWITH[c]` were not run.
- Other compatibility characters (halfwidth katakana, roman numerals, superscripts) and other combining marks were not tried.

## GitHub corpus (Phase 7)

Until Phase 7 the R corpus came from one production CodeceptJS suite: one team, one language, one way of writing locators. Phase 7 adds iOS XPath literals from 22 open-source projects in 7 languages, to check the published converter (npm 1.0.2) against other teams' code. The plan, the stages and the decisions are in `PLAN.md`, "Phase 7 — GitHub corpus".

### Setup

- **Sources.** 22 GitHub projects pinned at a commit, with licenses, profiles and the code-search counts in [`corpus/sources.md`](corpus/sources.md). 6 of them were already harvested for the Android sibling project and were downloaded again at the same commit without the Android filter. Large organizational suites (dotnet/maui, klarna, MetaMask) are mixed with courses, samples and practice repos. The locators were not run on the real apps: that would test each project's suite, not the converter.
- **Harvest.** [`corpus/harvest.js`](corpus/harvest.js) runs the scanner in dry-run mode over the downloaded files ([`corpus/harvest-files.json`](corpus/harvest-files.json) lists them) and anonymizes the values as in the Android corpus. Quoted strings with an `XCUIElementType` that the scanner did not pick up go to [`corpus/scanner-misses.json`](corpus/scanner-misses.json) with a reason (125: class chains 43, concatenation or format pieces 44, path pieces starting with one `/` 26, unbalanced brackets 9, and 3 whole literals the scanner rightly leaves: a bare `//XCUIElementType` and two Android-first unions).
- **One corpus.** The literals joined `corpus/ios-locators.json`. Production entries keep their ids (`L001`–`L573`) and got `project: "production-codeceptjs"` and `lang: "JavaScript"`. GitHub entries are `G0001…` with `project`, `lang` and `strategy`. A literal repeated in one project is one entry with a `count`; the same literal in two projects is two entries. The LLM input (`audit/llm/build-input.js`) keeps the 573 production entries, so the Phase 4 tables stay comparable.

Scored literals (kinds `xpath`, `xpath-dynamic`, `xpath-mixed-classchain`):

| Source | Projects | Languages | Literals | Occurrences | Other kinds kept (not scored) |
|---|---:|---:|---:|---:|---|
| Production | 1 | 1 | 563 | 563 | class chain 5, composed 3, not a locator 2 |
| GitHub | 22 | 7 | 824 | 1390 | Android 1053, web 75, UIAutomation 23, other 19, class chain 26 |
| **Total** | 23 | 7 | **1387** | 1953 | |

| Language (GitHub) | Projects | Literals | Occurrences |
|---|---:|---:|---:|
| Java | 7 | 234 | 311 |
| Python | 4 | 208 | 308 |
| TypeScript | 4 | 194 | 294 |
| Ruby | 2 | 60 | 69 |
| JavaScript | 3 | 51 | 57 |
| Kotlin | 1 | 45 | 109 |
| C# | 3 | 32 | 242 |

kobiton/samples counts in JavaScript, C# and Java, so the project column adds up to 24.

### Results

Computed from `coverage-cases.json` joined with `corpus/ios-locators.json` by id. Converter at `e3eb568`, scoring v2 (equal to v1 here: 0 WRONG). In scope is every scored literal except L157 (EXCLUDED, not an XPath); expressible is in scope minus the correct skips; C = expressible / in scope.

| | In scope | Expressible | C | CORRECT | DRIFT | Skips | R |
|---|---:|---:|---:|---:|---:|---:|---:|
| Production | 562 | 489 | 87.0 % | 450 | 39 | 73 | 96.0 |
| GitHub | 824 | 691 | 83.9 % | 540 | 151 | 133 | 89.1 |
| **Total** | **1386** | **1180** | **85.1 %** | 990 | 190 | 206 | **91.9** |

| Language (GitHub) | In scope | Expressible | C | CORRECT | DRIFT | Skips | R |
|---|---:|---:|---:|---:|---:|---:|---:|
| Java | 234 | 186 | 79.5 % | 150 | 36 | 48 | 90.3 |
| Python | 208 | 193 | 92.8 % | 121 | 72 | 15 | 81.3 |
| TypeScript | 194 | 142 | 73.2 % | 131 | 11 | 52 | 96.1 |
| Ruby | 60 | 54 | 90.0 % | 33 | 21 | 6 | 80.6 |
| JavaScript | 51 | 43 | 84.3 % | 33 | 10 | 8 | 88.4 |
| Kotlin | 45 | 43 | 95.6 % | 43 | 0 | 2 | 100.0 |
| C# | 32 | 30 | 93.8 % | 29 | 1 | 2 | 98.3 |

S stays 93.6 (the spec matrix did not change), WRONG 0, GAP 0.

- **R = R_max and C = C_max on these data.** Every expressible entry is CORRECT or documented DRIFT, and a DRIFT has no exact class chain, so its 0.5 is the most any converter can earn. Every skip is a form with no exact chain (no GAP: the harness proves no better chain for any of them). A higher R would need a chain the harness cannot find; if a model ever produces one, the converter needs work.
- **Why R fell from 96.0.** R = 100 − 50 × (DRIFT share of the expressible). The share is 8.0 % in production (39 of 489) and 21.9 % on GitHub (151 of 691). GitHub code has many more positions: 124 per-parent `[n]` steps from recorded paths (`…/XCUIElementTypeOther[2]/XCUIElementTypeOther[3]/…`; 68 of them in Python, 22 in Java, 16 in Ruby) and 27 grouped `(…)[n]` (RC-D1). A chain's `[n]` counts among all matches, not per parent, so the README documents both as approximations with half credit. 109 of the 151 were found by fuzz and confirmed with `positional.js` (the same XPath without its positions is EQUAL), 42 by `planted.js` (entries that never matched a random tree, fuzzed again with their path planted).
- **Skips.** 206 in total (production 73, GitHub 133): sibling axis 82, `ancestor::` with an index, a further path or inside `not()` 26, unions of different paths and page-level `not()` 21, non-iOS types or attributes (`//button`, `@text`, `@class`) 21, a predicate on the Application root 14, incomplete XPaths (concatenation pieces, an unclosed quote, a raw line break) 12, a path in a predicate or a same-element descendant predicate 8, following axis 7, parent axis 6, a grouped `(…)[n]` followed by a path 4, a `%s` format placeholder as an index 3, built at runtime 2. All skips carry a reason.

### Fixes found

| Form | What was wrong | How found | Regression rows (`xpath-to-class-chain.test.js`) |
|---|---|---|---|
| `//XCUIElementTypeApplication/…` (42 literals, 7 projects) | became `**/XCUIElementTypeApplication/…`, which never matches the root (WRONG); now read as the absolute path. A predicate on the root (`//XCUIElementTypeApplication[@name="…"]/…`) is skipped with its own reason | offline fuzz (mini-WDA), confirmed on the device | 3 conversion rows, 2 skip rows |
| trailing `/` (`"…/XCUIElementTypeScrollView/"`, a Python concatenation piece) | a chain WDA cannot parse; now skipped | offline fuzz (mini-WDA parse error) | 2 skip rows |
| raw line break inside a value (source-escaped Java quotes) | the line break was kept in the chain; now skipped | offline fuzz (mini-WDA parse error) | 1 skip row |
| absolute `/XCUIElementTypeApplication/…` literals (dotnet/maui, Ruby page objects) | the scanner did not pick them up | harvest (scanner misses) | 4 detection rows, 1 scanner row |
| `(//X)[last()]`, `(//X)[last()-1]` (PerfectoCode) | the scanner gate took the last `)` as the group close, so grouped `last()` literals were never scanned | harvest (scanner misses) | 5 detection rows |
| `android:id/…` inside a string value on the line above (eliasnogueira) | read as an Android platform key, so the iOS locator was counted as Android | harvest (strategy check) | 1 scanner row |
| `contains(x, "")`, `starts-with(x, "")` (outside the corpus) | always true in XPath, but `CONTAINS ""` / `BEGINSWITH ""` never match (WRONG); now skipped with a reason. `ends-with(x, "")` keeps its chain: WDA's `ends-with()` is false for `""` too | device (stage 3) | 2 conversion rows, 5 skip rows |
| function text inside a string value, `//*[@name='contains(@a,"b")']` (P2, outside the corpus) | rewritten to `name == 'a CONTAINS "b"'`; `rewriteStringFunctions` now skips a match inside a quoted literal | code reading in stage 3 | 5 conversion rows |

The corpus had no empty needle and no function text inside a value, so the last two do not change R. Harness changes: fuzz runs in batches (mini-WDA gives up on a 359 MB input), values are sliced by code point (emoji), and `positional.js` and `planted.js` were added (`run.sh` runs both).

### Device check (stage 3)

22 cases on the `states` screen of LocatorLab, fixed simulator (`LocatorLab iPhone 17`, iOS 27.0), Appium 3.8.0 / xcuitest 12.16.0 / WDA 16.14.1, Xcode 27.1 (`env.json` pins 27.0). Mac on AC power, Low Power Mode off; 73 s. `device/cases-p7.json` → `device/results-p7.json`.

| Group | Cases | Outcome |
|---|---|---|
| Application root (G0648, G0674, G0662 `[1]`, `//Application//Button[@name]`, G1879 absolute) | 5 | EQUAL, 1–25 matches. The chains from before the fix (`e4002f9`) find 0 elements in all 5 |
| Predicate on the root (G1949 form) | 1 | skipped (XPATH_ONLY), as designed |
| `@height > n` (G1817, G1816 with a descendant predicate), `@y > n` in a union (G1475) | 3 + 3 near misses | EQUAL; near misses empty on both sides (DEAD) |
| `contains(@traits, …)` (G0235) on a Button and a Switch, `@placeholderValue` (G1825) | 3 + 2 near misses | EQUAL; near misses DEAD |
| empty needle: `contains()` / `starts-with()` on `@traits`, `@name`, `@value`, `text()`; `ends-with()` | 5 | before the fix WRONG (XPath 5–36, chain 0); now 4 skipped (XPATH_ONLY), `ends-with` DEAD on both sides |

Final run: 11 EQUAL, 6 DEAD, 5 XPATH_ONLY, 0 differences. `build.js` notes the attribute entries as "device: EQUAL (Phase 7 stage 3)". The iPhone was not run.

### Scoring v2 and Q

From Phase 7 on, every new result is scored with v2: CORRECT 1, documented DRIFT 0.5, skip 0, WRONG / INVALID −1 (a chain that silently breaks a test is worse than a skip). Model comparisons add Q = 100 × (0.4 × R / R_converter + 0.6 × S / S_converter), the share of the converter's score. `SCORING=v1` reproduces the old scheme (`build.js`, `llm/score.js`, `llm/compare-v2.js`). Past and published results are not rescored: the Phase 4 / D3 tables, the charts, `docs/results.md` and the articles keep their v1 numbers, so differences from the articles are expected. The converter has 0 WRONG, so its R and S are the same under both schemes.

### Not verified in Phase 7

- The locators on their real apps (out of scope, see Setup).
- The real iPhone (simulator only, as in D0).
- The models on the GitHub corpus (optional, a separate session per model, scored with v2 and Q).

## 1. Headline

> **The converter handles 72% of what is possible. 87% of real locators can be expressed as a class chain at all; the rest stay XPath by design.**
> Before penalties it gets 96% of the expressible real-world locators exactly right. The score drops because a handful of bug classes produce locators that are reported as converted but fail or misbehave on the device. The worst case: in Java and Python projects it rewrites locators inside `xpath` calls, which breaks every one of them.

| Score | Value | One-line meaning |
|---|---|---|
| **R** (real corpus, headline) | **72.2 / 100** | 96.2 before the −24 penalty for 8 distinct root causes (5 in converter output, 3 in scanner contexts) |
| **C** (ceiling) | **86.9 %** | 489 of 563 scored corpus locators are expressible as a class chain |
| **S** (spec matrix, secondary) | **7.7 / 100** | 37.7 before penalties; 17 distinct WRONG root causes hit the −30 cap (uncapped −51) |

**Top 3 risks**
1. **The scanner rewrites strings inside XPath-strategy calls** (Java `AppiumBy.xpath(…)`, `By.xpath`, `MobileBy.xpath`, `@iOSXCUITFindBy(xpath=…)`; Python `AppiumBy.XPATH`, `By.XPATH`). All 16 of 16 context locators were rewritten and every one is broken at runtime. *Critical.*
2. **"success" that WDA rejects.** The validator's leftover-XPath guard (`lib/validator.js:83`) deletes the whole backtick block before looking for `(` and `@`, so it never fires. Unconverted XPath therefore ships as a "valid" chain:
   - functions such as `matches`, `lower-case`, `normalize-space`, `concat`, `contains(.)`, and `contains(\"…\")` in JSON or Java;
   - `[@name]`;
   - `//A//B` (`]**/` has no separator);
   - `contains(@enabled,"false")`, `@text`, and raw newlines.

   Nine corpus entries and 9 of 22 Java, Python and JSON context rewrites are affected. *Critical.*
3. **Silent wrong selection**: a valid chain that finds a different element.
   - `[.//Button[@name="x"]]` is flattened onto the outer element.
   - `[a or b][c]` loses its parentheses.
   - A literal `*` becomes a `LIKE` wildcard.
   - `contains(@type,"XCUIElementTypeText")` and unknown `XCUIElementTypeFoo` collapse to a type WDA maps to `Other`.
   - `//Cell[2][@name="a"]` is reordered.

   Mostly absent from this corpus, but each is a silent failure. *Critical/major.*

**XPath 1.0 vs 2.0 on the pinned platform.**
- **What runs.** WDA ≥ 13.2.0 registers `matches` (optional flags, incl. `i`), `ends-with`, `lower-case`, `upper-case`, `replace`, `tokenize` and `string-join` in libxml2 (`FBXPathExtensions.m:409-417` at v16.14.1). So XPath 1.0 plus these seven functions works in Appium XPath. Real XPath 2.0 does not: sequences, `if`, `for` and typed comparisons are absent, and `tokenize(...)[2]` fails as invalid XPath (verified).
- **What the converter supports.** Only `ends-with` (→ `ENDSWITH`).
- **What maps cleanly.**
  - `matches(x,p)` → `x MATCHES "(?s).*(?:p).*"`. XPath `matches` is a search; NSPredicate `MATCHES` is a full match.
  - The `i` flag → `(?i)` or `[c]`.
  - `lower-case(x)="v"` → `x ==[c] "v"`.
  - `contains(upper-case(x),"V")` → `x CONTAINS[c] "V"`.

  All proven equal in the harness: H02–H06.
- **Inexpressible.** `replace`, `tokenize` and `string-join`: NSPredicate has no string transformation. Today all of them, and every other function except `ends-with`, come out as "success" chains that WDA rejects (RC6).

**Hypotheses (Step 4) — results**

| # | Hypothesis | Result | Evidence |
|---|---|---|---|
| 1 | `[a or b][c]` merged without parentheses | **Confirmed, WRONG** (RC7) | D06 fixture: XPath `[b2]`, chain `[b1,b2]` |
| 2 | Rule 9 reordering with OR | **Refuted**: rule 9 skips blocks containing OR (`optimizer.js:291`); output order unchanged and equal (D09, corpus L019) | D03/D04/D09 EQUAL; NSPredicate gives AND higher precedence than OR |
| 3 | Validator rejects any `(`, so `(…)` and `NOT(...)` never pass | **Refuted, and worse**: the check never fires on backtick blocks, so parentheses pass (D05 CORRECT), and so does everything else (RC6) | `validator.js:83` strips `` `…` `` as a "string" |
| 4 | `not()`, `[last()]`, `[position()<=n]` skipped although expressible | `not()` → **GAP** (D07, D08, L458); grouped `(…)[last()]` → **GAP** `[-1]` (L270–L272, E05/E06); per-parent `//X[last()]` and `[position()<=n]` → correctly skipped (inexpressible) | harness equal for the expected chains |
| 5 | `contains(@enabled,"false")` invalid on device | **Confirmed, WRONG** (RC2): `Can't use in/contains operator with collection 0`. It raises whenever another clause matches | L278/L520/L521, B18 |
| 6 | `contains(@text,…)` should be a skip | **Confirmed, WRONG** (RC3): FBUnknownAttributeException; the XPath itself never matches (no `text` attribute in WDA XML) | L306, B13 |
| 7 | Outer index moved to the parent | **DRIFT** (undocumented). Equal only when every matched parent has ≥ n children and matches don't nest. Minimal counter-example: rows r1(2 kids), r2(1 kid), r3(2 kids); `(…/child::*[2])[2]` → XPath `r3b`, chain `[]` | L174, E13 |
| 8 | Leading `/` + Application step | **WRONG** (RC9): WDA's parser rejects a chain that starts with `/` (position 1). Rule 5 also turns `/Application/Window/Button` into `/XCUIElementTypeApplication/**/…`. Appium Inspector's fallback XPath has exactly this form | A07, A08 |
| 9 | `[@name]` and `@index` pass lint, fail at runtime | **Confirmed**: `[@name]` → `` [`name`] `` parse error; `@index="1"` → `index == "1"` never true (NSNumber vs string) | B10, B11 |
| 10 | `//X[2]` vs `**/X[2]` | **Confirmed different**: WDA 16.14.1 applies the position to the whole match set (`fb_matchingElementsWithItem`/`fb_matchingSnapshotsWithItem`), XPath per parent. README documents it | E01 fixture: XPath `[p1b2,p2b2]`, chain `[p1b2]` |
| 11 | Rule 5 / rule 7 | Rule 5: **DRIFT**, broadens matches (`Window/Other/Button` → `**/Button` also finds buttons in a NavigationBar). Not documented as a semantic change. **WRONG** when it hits the Application path (A07). Rule 7: **DRIFT**, documented in README (A16: hidden Cell, visible Button → XPath `[]`, chain `[b]`) | A14/A15/A16 fixtures |

## 2. Corpus results by shape

573 entries in total; 563 are in the score (`xpath` 460, `xpath-dynamic` 102, `xpath-mixed-classchain` 1).

**Per-entry verdicts over the 563 scored entries**

| Verdict | Entries | Notes |
|---|---|---|
| CORRECT | 468 | |
| DRIFT | 7 | 5 documented in README |
| WRONG | 9 | 7 expressible + 2 excluded from the denominator |
| GAP | 7 | |
| CORRECT-SKIP | 72 | incl. 2 excluded as undeterminable |
| CRASH | 0 | max conversion time 2.4 ms; linear on 16 pathological generators up to n=2000 |

**Shapes.** 155 shape/verdict groups. Every non-CORRECT shape is listed below; CORRECT shapes with n ≥ 3 are listed and the rest are summarised. The full per-entry list (with the `shape` field) is in `audit/coverage-cases.json`.

**Assumption A1 (applies to every `//*` shape).** XPath `//*` also matches the `XCUIElementTypeApplication` root; class chain `**/*` never can (WDA excludes the root). The corpus is judged with an Application element whose name and label do not match the locator. With a random root identity, 104 variants diverged *only* because of the root.

| # | Shape (values → `s`, `${}` → `$`) | n | Verdict | Rep. | Representative output | Other ids |
|---|---|---|---|---|---|---|
| S058 | ` //*[contains(@label, "s$")]//*[contains(@label, "s$")] ` | 2 | WRONG RC1 | L483 | `` **/*[`label CONTAINS "Tete ${line}"`]**/*[`label CONTAINS "${match}"`] `` | L484 |
| S059 | ` //*[contains(@name,"s") and contains(@enabled,"false")] ` | 2 | WRONG RC2 | L520 | `` **/*[`name CONTAINS "LofInipaSazAzuwiJuzovUsah.fufikuJugehOvuca" AND enabled CONTAINS "fa… `` | L521 |
| S001 | ` //T[@name="s"] ` | 1 | WRONG RC4 | L119 | `` **/XCUIElementTypeStaticText[`name == "19, Juzo Kabih\nJomojab, FI16 7TE"`] `` | — |
| S006 | ` (//T[@name="s"])[N] ` | 1 | WRONG RC4 | L162 | `` **/XCUIElementTypeStaticText[`name == "Romor wepes je robo\n7393"`][1] `` | — |
| S112 | ` //T[contains(@name, "s") and contains(@enabled,"false")] ` | 1 | WRONG RC2 | L278 | `` **/XCUIElementTypeButton[`name CONTAINS "Dobe monuw teg " AND enabled CONTAINS "false"`] `` | — |
| S120 | ` //T[contains(@text, "s")] ` | 1 | WRONG RC3 | L306 | `` **/XCUIElementTypeStaticText[`text CONTAINS "Tazeviz"`] `` | — |
| S144 | ` //*[$] ` | 1 | WRONG RC5 | L476 | `` **/*[`${condition('label')}`] `` | — |
| S054 | ` //T[N] ` | 2 | DRIFT (doc.) | L349 | ` **/XCUIElementTypeTextField[1] ` | L350 |
| S040 | ` (//T/child::T[N])[N] ` | 1 | DRIFT (doc.) | L013 | ` **/XCUIElementTypeStaticText/XCUIElementTypeStaticText[2] ` | — |
| S077 | ` //T[contains(@name, "s")][N] ` | 1 | DRIFT (doc.) | L120 | `` **/XCUIElementTypeButton[`name CONTAINS "HosidoLitokazajiCimo.noraSefili"`][1] `` | — |
| S087 | ` (//*[contains(@name, "s")]/child::*[N])[$] ` | 1 | DRIFT (undoc.) | L174 | `` **/*[`name CONTAINS "Vilokor,"`][${transaction}]/*[2] `` | — |
| S099 | ` (//*[contains(@label, "s")]/child::*[contains(@label, "s")])[$] ` | 1 | DRIFT (undoc.) | L225 | `` **/*[`label CONTAINS "Nepureze"`]/*[`label CONTAINS "Nepureze"`][${value}] `` | — |
| S159 | ` //*[@name="s$"]/child::*[N] ` | 1 | DRIFT (doc.) | L556 | `` **/*[`name == "VavepaGomudatepUvepajImar.lawupe(${value - 1})"`]/*[1] `` | — |
| S051 | ` (//T[@name="s"])[last()] ` | 2 | GAP | L270 | `` skipped → expected **/XCUIElementTypeStaticText[`name == "jila_zugo"`][-1] `` | L271 |
| S111 | ` (//Other[contains(@label, "s")]/T)[last()] ` | 1 | GAP | L272 | `` skipped → expected **/XCUIElementTypeOther[`label CONTAINS "Lenapa gusuri"`]/XCUIElementT… `` | — |
| S127 | ` //*[@name="s"] \| //*[@name="s"] ` | 1 | GAP | L355 | `` skipped → expected **/*[`name == "Veg monuw" OR name == "LipohUgicolu.codid"`] `` | — |
| S137 | ` //*[@name="s$" and @accessible="true"]\|//*[@name="s$" and @accessible="true"] ` | 1 | GAP | L455 | `` skipped → expected **/*[`(name == "Fej bihi tete ${codeNumber}, jeb t fej bihi" AND acces… `` | — |
| S139 | ` //*[contains(@label, "s") and not (contains(@label, "s"))] ` | 1 | GAP | L458 | `` skipped → expected **/*[`label CONTAINS "NE Cisibosogoz Jufoz bihi" AND NOT (label CONTAI… `` | — |
| S141 | ` //*[@label="s$"] \| //*[@label="s$"] ` | 1 | GAP | L461 | `` skipped → expected **/*[`label == "${count} ${count == 1 ? 'winner' : 'winners'}" OR labe… `` | — |
| S001 | ` //T[@name="s"] ` | 112 | CORRECT | L014 | `` **/XCUIElementTypeStaticText[`name == "Dozur, ti hibimaw rorefek fojo dosu"`] `` | L055, L056, L057, L058, L059, L060, L061, L063, L064, L065, L066, L06… |
| S002 | ` //T[contains(@name, "s")] ` | 33 | CORRECT | L107 | `` **/XCUIElementTypeStaticText[`name CONTAINS "Zov hat wikop bika pelu colusegoma gatejese … `` | L108, L183, L186, L187, L259, L260, L273, L279, L280, L281, L284, L28… |
| S003 | ` //*[contains(@type,"s") and contains(@label,"s")] ` | 30 | CORRECT | L045 | `` **/XCUIElementTypeButton[`label CONTAINS "Bowep ge mipunaco"`] `` | L046, L047, L052, L053, L071, L072, L074, L077, L078, L129, L130, L13… |
| S004 | ` //*[contains(@type,"s") and contains(@name,"s")] ` | 28 | CORRECT | L076 | `` **/XCUIElementTypeStaticText[`name CONTAINS "Pi cog rufosi je sadobu dom laciwuj zov cuba… `` | L136, L137, L138, L156, L164, L181, L314, L343, L386, L392, L394, L39… |
| S005 | ` //T[@label="s"] ` | 21 | CORRECT | L024 | `` **/XCUIElementTypeButton[`label == "Namatir wepes je dobe"`] `` | L025, L035, L036, L039, L084, L144, L219, L235, L236, L302, L308, L34… |
| S007 | ` //T[contains(@label,"s")] ` | 14 | CORRECT | L110 | `` **/XCUIElementTypeButton[`label CONTAINS "Giji Navecuhu laciwuj"`] `` | L111, L112, L113, L114, L307, L324, L505, L524, L525, L526, L527, L52… |
| S006 | ` (//T[@name="s"])[N] ` | 13 | CORRECT | L062 | `` **/XCUIElementTypeButton[`name == "HosidoLitokazajiCimo.noraSefili"`][1] `` | L070, L082, L177, L234, L310, L382, L396, L397, L471, L498, L572, L573 |
| S008 | ` //Other[@label="s"] ` | 13 | CORRECT | L097 | `` **/XCUIElementTypeOther[`label == "Pejun, Lenapa gusuri, RI"`] `` | L098, L099, L100, L101, L102, L103, L104, L105, L106, L167, L168, L169 |
| S009 | ` //*[contains(@name,"s") and contains(@label,"s")] ` | 12 | CORRECT | L444 | `` **/*[`name CONTAINS "FetuwozaNihelavAvuv.mipunaco" AND label CONTAINS "Kuki mipunaco"`] `` | L445, L446, L534, L535, L536, L537, L538, L541, L542, L547, L548 |
| S010 | ` //*[contains(@name, "s")] ` | 11 | CORRECT | L002 | `` **/*[`name CONTAINS "Bika Fabis tuve so liv je mefizo mi "`] `` | L150, L204, L222, L339, L441, L442, L492, L493, L502, L512 |
| S011 | ` //*[@name="s" and @label="s"] ` | 10 | CORRECT | L022 | `` **/*[`name == "WefaniBedufeDanu.zuzavilEgawiv" AND label == "Jif sefasi"`] `` | L023, L026, L027, L028, L029, L030, L033, L034, L546 |
| S012 | ` //T[contains(@name,"s")] ` | 9 | CORRECT | L109 | `` **/XCUIElementTypeStaticText[`name CONTAINS "Dom colusegoma goz kijical hu dewusines pelu… `` | L115, L289, L325, L326, L327, L328, L329, L399 |
| S013 | ` //*[@label="s"] ` | 8 | CORRECT | L006 | `` **/*[`label == "Picama rajer t bevad motezef rari 0."`] `` | L038, L205, L247, L248, L249, L510, L543 |
| S015 | ` //T[@name="s$"] ` | 7 | CORRECT | L194 | `` **/XCUIElementTypeStaticText[`name == "${day}"`] `` | L195, L283, L291, L292, L293, L506 |
| S016 | ` //T[@label="s$"] ` | 6 | CORRECT | L016 | `` **/XCUIElementTypeStaticText[`label == "${message}"`] `` | L191, L381, L415, L495, L508 |
| S017 | ` //T[@name="s" and @label="s"] ` | 6 | CORRECT | L054 | `` **/XCUIElementTypeButton[`name == "WefaniBedufeDanu.gotePebazoh" AND label == "Doso mi"`] `` | L264, L265, L277, L427, L540 |
| S018 | ` (//Other[@name="s"])[N] ` | 6 | CORRECT | L182 | `` **/XCUIElementTypeOther[`name == "Luvuce tuve nowam"`][2] `` | L428, L564, L565, L566, L571 |
| S019 | ` //T[@value="s"] ` | 6 | CORRECT | L223 | `` **/XCUIElementTypeStaticText[`value == "Kajepazagopotev, zov cuba jizorawohuni posetog bi… `` | L224, L344, L345, L351, L352 |
| S020 | ` //*[contains(@type,"s") and contains(@label, "s")] ` | 5 | CORRECT | L048 | `` **/XCUIElementTypeStaticText[`label CONTAINS "Busu camenup kon zov cog rufosi je farowos … `` | L049, L050, L051, L073 |
| S021 | ` //*[contains(@label, "s$")] ` | 5 | CORRECT | L147 | `` **/*[`label CONTAINS "Hicepe Wacisugik mazejuz ${number}"`] `` | L196, L402, L462, L486 |
| S022 | ` //T[contains(@label, "s")] ` | 5 | CORRECT | L163 | `` **/XCUIElementTypeStaticText[`label CONTAINS "£"`] `` | L206, L243, L244, L408 |
| S024 | ` //*[@label="s" and @enabled="s$"] ` | 4 | CORRECT | L032 | `` **/*[`label == "Leba" AND enabled == ${isEnabled}`] `` | L040, L041, L276 |
| S025 | ` //*[contains(@label, "s") and @enabled="s$"] ` | 4 | CORRECT | L042 | `` **/*[`enabled == ${isEnabled} AND label CONTAINS "Nozod hom"`] `` | L274, L275, L286 |
| S026 | ` //*[contains(@name, "s$")] ` | 4 | CORRECT | L151 | `` **/*[`name CONTAINS "Wacisugik mazejuz ${number}, mazejuz:"`] `` | L155, L497, L511 |
| S027 | ` //*[contains(@label, "s$") and contains(@label, "s")] ` | 4 | CORRECT | L152 | `` **/*[`label CONTAINS "Tete ${line}" AND label CONTAINS "Wacisugik mazejuz"`] `` | L200, L216, L481 |
| S028 | ` //*[contains(@type,"s") and contains(@value,"s")] ` | 4 | CORRECT | L180 | `` **/XCUIElementTypeStaticText[`value CONTAINS "Dikasod vilokor: £"`] `` | L342, L500, L501 |
| S029 | ` //*[contains(@label, "s")] ` | 4 | CORRECT | L188 | `` **/*[`label CONTAINS "rolafa desuz figuleni"`] `` | L242, L450, L494 |
| S032 | ` //*[contains(@name,"s")] ` | 4 | CORRECT | L437 | `` **/*[`name CONTAINS "Rigi gohaz gusuri"`] `` | L438, L459, L496 |
| S034 | ` //T[contains(@label, "s$")] ` | 3 | CORRECT | L190 | `` **/XCUIElementTypeButton[`label CONTAINS "Pako geviv: ${number}"`] `` | L414, L473 |
| S035 | ` //*[contains(@label,"s")] ` | 3 | CORRECT | L197 | `` **/*[`label CONTAINS "Ganam Zemori Jila"`] `` | L246, L504 |
| S036 | ` //*[contains(@name, "s$") and contains (@label, "s$")] ` | 3 | CORRECT | L201 | `` **/*[`name CONTAINS "tete(${line}" AND label CONTAINS "Petor ${round}, Bevef daw notupisa… `` | L202, L217 |
| S038 | ` //*[@label="s$"] ` | 3 | CORRECT | L453 | `` **/*[`label == "Hero bihi ${codeNumber}"`] `` | L454, L456 |
| … | 57 further CORRECT shapes with 1–2 entries each (68 entries): S041, S042, S043, S046, S047, S048, S052, S055, S057, S060, S062, S063, S040, S066, S069, S070, S071, S075, S076, S078, S079, S081, S082, S084, S088, S090, S091, S092, S093, S095, S096, S097, S100, S101, S102, S105, S106, S108, S117, S118, S119, S121, S124, S125, S126, S129, S133, S135, S136, S140, S143, S146, S150, S155, S156, S157, S160 | | CORRECT | | see coverage-cases.json | |

**CORRECT-SKIP (inexpressible or excluded), by reason:**

| Reason | n | Ids |
|---|---|---|
| sibling axis | 60 | L146, L165, L357, L358, L522, L523, L553, L003, L004, L005, L010, L356, L359, L361, L362, L368, L369, L370, L371, L011, L117, L118, L241, L533, L552, L007, L530, L153, L154, L175, L176, L226, L389, L463, L464, L539, L545, L008, L043, L044, L166, L172, L173, L221, L245, L336, L360, L384, L385, L388, L436, L457, L465, L479, L480, L487, L488, L489, L490, L544 |
| parent axis | 5 | L257, L290, L294, L295, L296 |
| union of different paths / page-level not() | 4 | L009, L017, L018, L189 |
| undetermined suffix | 1 | L068 |
| invalid XPath (mixed syntax) | 1 | L157 |
| following axis | 1 | L477 |


**What the tool does with the out-of-score kinds**

- **`class-chain` (5: L238, L332–L335).** Lint and optimizer leave all 5 unchanged and "valid". However, the raw source of L333 is `'…\n…'`, which becomes a real newline at runtime, and WDA's NSPredicate parser rejects it (same root cause as RC4). The linter does not catch it.
- **`non-locator` (2: L209, L482).** Not touched: `skipped_not_xpath`, and the scanner regex does not match them.
- **`xpath-composed` (3: L266, L268, L269, `${containerLocator_iOS}//…`).** Not touched, since they start with `${`. **Converting the base does break the composition.** A temp-dir `--write` run on `const containerLocator_iOS = '//XCUIElementTypeCell[@name="row_1"]'` rewrote the constant to `-ios class chain:**/XCUIElementTypeCell[…]`. The composed locator then becomes `-ios class chain:**/…Cell[…]//XCUIElementTypeStaticText[contains(@label, "…")]`, which is neither XPath nor class chain. Major, outside the score.

## 3. Scanner contexts

Setup (`audit/harness/contexts.js`): `audit/corpus/contexts/` was copied to `audit/harness/out/contexts/`. Runs: `xpath-to-class-chain <copy> --json` (dry run; report `mode: dry-run`, 66 found, 53 updated, 10 android, 1 unsupported, 2 no-change), then `--write`. Each rewritten chain was evaluated in the harness after the language-level unescaping.

| File | Expected | Actual | Verdict |
|---|---|---|---|
| `codecept-pairs.js` | convert ios, android untouched, parses | 10/10 ios converted, 10 android untouched; `node --check` OK. `m2` inherits RC2 (`enabled CONTAINS "false"`) | CORRECT (context) |
| `bare.js` | convert; parses | 10/10 converted (constants, `I.click`, `locate()`, object props, array, return, export); `node --check` OK. `last` inherits RC2 | CORRECT (context) |
| `wdio.ts` | convert incl. template literals; backticks must not break them | 11 converted; backticks escaped as `` \` `` in template literals; `d9` (following-sibling) skipped. Loads under Node 24 type stripping (`tsc` not installed). All 11 chains parse in WDA | CORRECT |
| `Strategy.java` | must not rewrite while the strategy is XPath | **all 8 rewritten** inside `AppiumBy.xpath`/`By.xpath`/`MobileBy.xpath`/`@iOSXCUITFindBy(xpath=…)`. In addition, 5/8 chains are unparseable (`contains(type,"…")` left over: RC-S3). Java syntax still fine by inspection (no JRE for `javac`) | **WRONG** (RC-S1) |
| `strategy.py` | must not rewrite while the strategy is XPath | **all 8 rewritten** while `AppiumBy.XPATH`/`By.XPATH` stays; `py_compile` OK; 1/8 also unparseable (RC-S3) | **WRONG** (RC-S2) |
| `store.json` | convert; JSON stays valid | `JSON.parse` OK, 6 converted, **3/6 rejected by WDA**: `` `contains(type,"XCUIElementTypeStaticText") AND contains(name,"…")` `` | **WRONG** (RC-S3) |

Side findings, minor and not scored:
- The two "no change" records are the text `"-ios class chain:"` inside **comments** (`wdio.ts:1`, `Strategy.java:2`). The scanner counts and lints comment text as locators.
- An empty chain `-ios class chain:` passes lint as valid.

## 4. Spec matrix

115 constructs. **†** = excluded from the category denominator: either no exact class chain exists, or the XPath itself never matches on WDA (e.g. `text()`, `@text`, `@selected` are not in WDA's XML). Excluded cases are still penalised when the tool emits a broken or wrong chain. Every "correct class chain" was run in the harness and is equal to the XPath, with one exception: E01's approximation is listed for reference. The `note` field of each case in `coverage-cases.json` holds the run evidence (trials equal / fixture hits / WDA error text).

| Id | Cat | XPath | Correct class chain (or why not) | Actual output | Verdict |
|---|---|---|---|---|---|
| A01 | A | ` //XCUIElementTypeButton ` | ` **/XCUIElementTypeButton ` | ` **/XCUIElementTypeButton ` | CORRECT |
| A02 | A | ` //XCUIElementTypeCell/XCUIElementTypeButton ` | ` **/XCUIElementTypeCell/XCUIElementTypeButton ` | ` **/XCUIElementTypeCell/XCUIElementTypeButton ` | CORRECT |
| A03 | A | ` //*[@name="a"] ` | `` **/*[`name == "a"`] `` | `` **/*[`name == "a"`] `` | CORRECT |
| A04 | A | ` //XCUIElementTypeAny[@name="a"] ` | `` **/*[`name == "a"`] `` | `` **/*[`name == "a"`] `` | CORRECT |
| A05 | A | ` //XCUIElementTypeCell/child::XCUIElementTypeButton ` | ` **/XCUIElementTypeCell/XCUIElementTypeButton ` | ` **/XCUIElementTypeCell/XCUIElementTypeButton ` | CORRECT |
| A06 | A | ` //XCUIElementTypeCell/descendant::XCUIElementTypeButton ` | ` **/XCUIElementTypeCell/**/XCUIElementTypeButton ` | ` **/XCUIElementTypeCell**/XCUIElementTypeButton ` | WRONG RC1 |
| A07 | A | ` /XCUIElementTypeApplication/XCUIElementTypeWindow/XCUIElementTypeButt… ` | ` XCUIElementTypeWindow/XCUIElementTypeButton ` | ` /XCUIElementTypeApplication/**/XCUIElementTypeButton ` | WRONG RC9 |
| A08 | A | ` /XCUIElementTypeApplication/XCUIElementTypeWindow[1]/XCUIElementTypeO… ` | ` XCUIElementTypeWindow[1]/XCUIElementTypeOther[1]/XCUIElementTypeButton[2] ` | ` /XCUIElementTypeApplication/XCUIElementTypeWindow[1]/XCUIElementTypeOther[1]/XC… ` | WRONG RC9 |
| A09 | A | ` //XCUIElementTypeCell//XCUIElementTypeButton ` | ` **/XCUIElementTypeCell/**/XCUIElementTypeButton ` | ` **/XCUIElementTypeCell**/XCUIElementTypeButton ` | WRONG RC1 |
| A10 | A | ` //XCUIElementTypeCell[@name="a"]//XCUIElementTypeButton[@label="b"] ` | `` **/XCUIElementTypeCell[`name == "a"`]/**/XCUIElementTypeButton[`label == "b"`] `` | `` **/XCUIElementTypeCell[`name == "a"`]**/XCUIElementTypeButton[`label == "b"`] `` | WRONG RC1 |
| A11 | A | ` //XCUIElementTypeCell/./XCUIElementTypeButton ` | ` **/XCUIElementTypeCell/XCUIElementTypeButton ` | ` **/XCUIElementTypeCell/./XCUIElementTypeButton ` | WRONG RC10 |
| A12 | A | ` .//XCUIElementTypeButton[@name="a"] ` | `` **/XCUIElementTypeButton[`name == "a"`] `` | skipped_not_xpath | GAP |
| A13 | A | ` //XCUIElementTypeLabel[@name="a"] ` | *SKIP: XCUIElementTypeLabel is not an iOS element type; WDA maps unkno…* | `` **/XCUIElementTypeLabel[`name == "a"`] `` | WRONG RC11 † |
| A14 | A | ` //XCUIElementTypeWindow/XCUIElementTypeOther/XCUIElementTypeButton[@n… ` | `` **/XCUIElementTypeWindow/XCUIElementTypeOther/XCUIElementTypeButton[`name == "a… `` | `` **/XCUIElementTypeButton[`name == "a"`] `` | DRIFT (undoc.) |
| A15 | A | ` //XCUIElementTypeOther/XCUIElementTypeButton[@name="a"] ` | `` **/XCUIElementTypeOther/XCUIElementTypeButton[`name == "a"`] `` | `` **/XCUIElementTypeButton[`name == "a"`] `` | DRIFT (undoc.) |
| A16 | A | ` //XCUIElementTypeCell[@visible="true"]/XCUIElementTypeButton ` | `` **/XCUIElementTypeCell[`visible == true`]/XCUIElementTypeButton `` | `` **/XCUIElementTypeCell/XCUIElementTypeButton[`visible == 1`] `` | DRIFT (doc.) |
| B01 | B | ` //XCUIElementTypeButton[@name="a"] ` | `` **/XCUIElementTypeButton[`name == "a"`] `` | `` **/XCUIElementTypeButton[`name == "a"`] `` | CORRECT |
| B02 | B | ` //XCUIElementTypeButton[@label!="a"] ` | `` **/XCUIElementTypeButton[`label != nil AND label != "a"`] `` | `` **/XCUIElementTypeButton[`label!="a"`] `` | DRIFT (undoc.) |
| B03 | B | ` //XCUIElementTypeButton[@value>5] ` | `` **/XCUIElementTypeButton[`value.doubleValue > 5`] `` | `` **/XCUIElementTypeButton[`value>5`] `` | WRONG RC14 |
| B04 | B | ` //XCUIElementTypeButton[@x>60] ` | `` **/XCUIElementTypeButton[`rect.x > 60`] `` | `` **/XCUIElementTypeButton[`x>60`] `` | WRONG RC3 |
| B05 | B | ` //XCUIElementTypeButton[@enabled="true"] ` | `` **/XCUIElementTypeButton[`enabled == true`] `` | `` **/XCUIElementTypeButton[`enabled == true`] `` | CORRECT |
| B06 | B | ` //XCUIElementTypeButton[@enabled="false"] ` | `` **/XCUIElementTypeButton[`enabled == false`] `` | `` **/XCUIElementTypeButton[`enabled == false`] `` | CORRECT |
| B07 | B | ` //XCUIElementTypeButton[@visible='true'] ` | `` **/XCUIElementTypeButton[`visible == true`] `` | `` **/XCUIElementTypeButton[`visible == true`] `` | CORRECT |
| B08 | B | ` //XCUIElementTypeButton[@selected="true"] ` | *SKIP: selected is not written to the WDA XML; XPath @selected never m…* | `` **/XCUIElementTypeButton[`selected == true`] `` | DRIFT (undoc.) † |
| B09 | B | ` //XCUIElementTypeStaticText[@name="true"] ` | `` **/XCUIElementTypeStaticText[`name == "true"`] `` | `` **/XCUIElementTypeStaticText[`name == "true"`] `` | CORRECT |
| B10 | B | ` //XCUIElementTypeButton[@name] ` | `` **/XCUIElementTypeButton[`name != nil`] `` | `` **/XCUIElementTypeButton[`name`] `` | WRONG RC6 |
| B11 | B | ` //*[@index="1"] ` | `` **/*[`index == 1`] `` | `` **/*[`index == "1"`] `` | WRONG RC14 |
| B12 | B | ` //*[@type="XCUIElementTypeButton" and @name="a"] ` | `` **/XCUIElementTypeButton[`name == "a"`] `` | `` **/XCUIElementTypeButton[`name == "a"`] `` | CORRECT |
| B13 | B | ` //XCUIElementTypeStaticText[@text="a"] ` | *SKIP: @text does not exist in the WDA XML or as a class chain attribu…* | `` **/XCUIElementTypeStaticText[`text == "a"`] `` | WRONG RC3 † |
| B14 | B | ` //XCUIElementTypeButton[@hittable="true"] ` | `` **/XCUIElementTypeButton[`hittable == true`] `` | `` **/XCUIElementTypeButton[`hittable == true`] `` | CORRECT |
| B15 | B | ` //XCUIElementTypeTextField[@placeholderValue="a"] ` | `` **/XCUIElementTypeTextField[`placeholderValue == "a"`] `` | `` **/XCUIElementTypeTextField[`placeholderValue == "a"`] `` | CORRECT |
| B16 | B | ` //XCUIElementTypeButton[@enabled=true()] ` | ` **/XCUIElementTypeButton ` | `` **/XCUIElementTypeButton[`enabled == true`] `` | DRIFT (undoc.) |
| B17 | B | ` //XCUIElementTypeButton[@accessible="true" and @enabled="false"] ` | `` **/XCUIElementTypeButton[`accessible == true AND enabled == false`] `` | `` **/XCUIElementTypeButton[`accessible == true AND enabled == false`] `` | CORRECT |
| B18 | B | ` //XCUIElementTypeButton[contains(@enabled,"false")] ` | `` **/XCUIElementTypeButton[`enabled == false`] `` | `` **/XCUIElementTypeButton[`enabled CONTAINS "false"`] `` | WRONG RC2 |
| C01 | C | ` //*[contains(@label,"ab")] ` | `` **/*[`label CONTAINS "ab"`] `` | `` **/*[`label CONTAINS "ab"`] `` | CORRECT |
| C02 | C | ` //*[starts-with(@name,"ab")] ` | `` **/*[`name BEGINSWITH "ab"`] `` | `` **/*[`name BEGINSWITH "ab"`] `` | CORRECT |
| C03 | C | ` //XCUIElementTypeButton[text()="a"] ` | *SKIP: WDA XML has no text nodes; text() never matches* | `` **/XCUIElementTypeButton[`label == "a" OR value == "a"`] `` | DRIFT (doc.) † |
| C04 | C | ` //XCUIElementTypeButton[contains(text(),"a")] ` | *SKIP: WDA XML has no text nodes; text() never matches* | `` **/XCUIElementTypeButton[`label CONTAINS "a" OR value CONTAINS "a"`] `` | DRIFT (doc.) † |
| C05 | C | ` //XCUIElementTypeButton[contains(., "a")] ` | *SKIP: string-value of a WDA XML element is always empty* | `` **/XCUIElementTypeButton[`contains(., "a")`] `` | WRONG RC6 † |
| C06 | C | ` //*[normalize-space(@label)="a b"] ` | `` **/*[`label MATCHES "\\s*a\\s+b\\s*"`] `` | `` **/*[`normalize-space(label)="a b"`] `` | WRONG RC6 |
| C07 | C | ` //XCUIElementTypeButton[string-length(@label)>3] ` | `` **/XCUIElementTypeButton[`label.length > 3`] `` | `` **/XCUIElementTypeButton[`string-length(label)>3`] `` | WRONG RC6 |
| C08 | C | ` //*[contains(translate(@label,"ABCDEFGHIJKLMNOPQRSTUVWXYZ","abcdefghi… ` | `` **/*[`label CONTAINS[c] "ab"`] `` | `` **/*[`contains(translate(label,"ABCDEFGHIJKLMNOPQRSTUVWXYZ","abcdefghijklmnopqr… `` | WRONG RC6 |
| C09 | C | ` //*[@label=concat("a","b")] ` | `` **/*[`label == "ab"`] `` | `` **/*[`label == concat("a","b")`] `` | WRONG RC6 |
| C10 | C | ` //*[contains(@type,"XCUIElementTypeText")] ` | `` **/*[`type CONTAINS "XCUIElementTypeText"`] `` | ` **/XCUIElementTypeText ` | WRONG RC11 |
| C11 | C | ` //*[starts-with(@type,"XCUIElementTypeButton")] ` | ` **/XCUIElementTypeButton ` | ` **/XCUIElementTypeButton ` | CORRECT |
| C12 | C | ` //*[contains(@name, 'ab')] ` | `` **/*[`name CONTAINS "ab"`] `` | `` **/*[`name CONTAINS 'ab'`] `` | CORRECT |
| D01 | D | ` //*[@name="a" and @label="b"] ` | `` **/*[`name == "a" AND label == "b"`] `` | `` **/*[`name == "a" AND label == "b"`] `` | CORRECT |
| D02 | D | ` //*[@name="a" or @label="b"] ` | `` **/*[`name == "a" OR label == "b"`] `` | `` **/*[`name == "a" OR label == "b"`] `` | CORRECT |
| D03 | D | ` //*[@name="a" and @label="b" or @value="c"] ` | `` **/*[`(name == "a" AND label == "b") OR value == "c"`] `` | `` **/*[`name == "a" AND label == "b" OR value == "c"`] `` | CORRECT |
| D04 | D | ` //*[@name="a" or @label="b" and @value="c"] ` | `` **/*[`name == "a" OR (label == "b" AND value == "c")`] `` | `` **/*[`name == "a" OR label == "b" AND value == "c"`] `` | CORRECT |
| D05 | D | ` //*[(@name="a" or @label="b") and @value="c"] ` | `` **/*[`(name == "a" OR label == "b") AND value == "c"`] `` | `` **/*[`(name == "a" OR label == "b") AND value == "c"`] `` | CORRECT |
| D06 | D | ` //*[@name="a" or @label="b"][@value="c"] ` | `` **/*[`(name == "a" OR label == "b") AND value == "c"`] `` | `` **/*[`name == "a" OR label == "b" AND value == "c"`] `` | WRONG RC7 |
| D07 | D | ` //XCUIElementTypeButton[not(@name="a")] ` | `` **/XCUIElementTypeButton[`NOT (name == "a")`] `` | skipped_unsupported_logic | GAP |
| D08 | D | ` //*[contains(@label,"a") and not(contains(@label,"b"))] ` | `` **/*[`label CONTAINS "a" AND NOT (label CONTAINS "b")`] `` | skipped_unsupported_logic | GAP |
| D09 | D | ` //*[contains(@label,"a") and @name="b" or @value="c"] ` | `` **/*[`(label CONTAINS "a" AND name == "b") OR value == "c"`] `` | `` **/*[`label CONTAINS "a" AND name == "b" OR value == "c"`] `` | CORRECT |
| D10 | D | ` //*[contains(@label,"a") and @name="b"] ` | `` **/*[`name == "b" AND label CONTAINS "a"`] `` | `` **/*[`name == "b" AND label CONTAINS "a"`] `` | CORRECT |
| D11 | D | ` //*[@name="a"][@label="b"] ` | `` **/*[`name == "a" AND label == "b"`] `` | `` **/*[`name == "a" AND label == "b"`] `` | CORRECT |
| D12 | D | ` //*[@name="a" or @name="b"][@label="c" or @label="d"] ` | `` **/*[`(name == "a" OR name == "b") AND (label == "c" OR label == "d")`] `` | `` **/*[`name == "a" OR name == "b" AND label == "c" OR label == "d"`] `` | WRONG RC7 |
| E01 | E | ` //XCUIElementTypeButton[2] ` | ` **/XCUIElementTypeButton[2] ` | ` **/XCUIElementTypeButton[2] ` | DRIFT (doc.) |
| E02 | E | ` (//XCUIElementTypeButton)[2] ` | ` **/XCUIElementTypeButton[2] ` | ` **/XCUIElementTypeButton[2] ` | CORRECT |
| E03 | E | ` (//XCUIElementTypeButton[@name="a"])[1] ` | `` **/XCUIElementTypeButton[`name == "a"`][1] `` | `` **/XCUIElementTypeButton[`name == "a"`][1] `` | CORRECT |
| E04 | E | ` //XCUIElementTypeButton[last()] ` | *INEXPRESSIBLE: per-parent last()* | skipped_unsupported_logic | CORRECT-SKIP † |
| E05 | E | ` (//XCUIElementTypeButton)[last()] ` | ` **/XCUIElementTypeButton[-1] ` | skipped_not_xpath | GAP |
| E06 | E | ` (//XCUIElementTypeButton)[last()-1] ` | ` **/XCUIElementTypeButton[-2] ` | skipped_not_xpath | GAP |
| E07 | E | ` (//XCUIElementTypeButton)[position()=2] ` | ` **/XCUIElementTypeButton[2] ` | skipped_not_xpath | GAP |
| E08 | E | ` (//XCUIElementTypeButton)[position() <= 2] ` | *INEXPRESSIBLE: class chain selects one position or all, never a range* | skipped_not_xpath | CORRECT-SKIP † |
| E09 | E | ` (//XCUIElementTypeButton[@name="a"])[${i}] ` | `` **/XCUIElementTypeButton[`name == "a"`][${i}] `` | `` **/XCUIElementTypeButton[`name == "a"`][${i}] `` | CORRECT |
| E10 | E | ` (//XCUIElementTypeButton[@name="a"])${suffix} ` | *INEXPRESSIBLE: suffix unknown statically* | skipped_not_xpath | CORRECT-SKIP † |
| E11 | E | ` (//XCUIElementTypeCell)[2]/XCUIElementTypeButton ` | ` **/XCUIElementTypeCell[2]/XCUIElementTypeButton ` | skipped_not_xpath | GAP |
| E12 | E | ` //XCUIElementTypeCell[2][@name="a"] ` | *INEXPRESSIBLE: per-parent index then filter* | `` **/XCUIElementTypeCell[`name == "a"`][2] `` | WRONG RC15 † |
| E13 | E | ` (//XCUIElementTypeCell[@name="a"]/XCUIElementTypeButton[2])[2] ` | *INEXPRESSIBLE: per-parent inner index + global outer index* | `` **/XCUIElementTypeCell[`name == "a"`][2]/XCUIElementTypeButton[2] `` | DRIFT (undoc.) |
| E14 | E | ` (//XCUIElementTypeCell)[1] ` | ` **/XCUIElementTypeCell[1] ` | ` **/XCUIElementTypeCell[1] ` | CORRECT |
| F01 | F | ` //XCUIElementTypeCell[.//XCUIElementTypeButton[@name="x"]] ` | ` **/XCUIElementTypeCell[$type == "XCUIElementTypeButton" AND name == "x"$] ` | `` **/XCUIElementTypeCell[`name == "x"`] `` | WRONG RC8 |
| F02 | F | ` //XCUIElementTypeCell[XCUIElementTypeButton] ` | *INEXPRESSIBLE: child-existence; $…$ tests any descendant* | `` **/XCUIElementTypeCell[`XCUIElementTypeButton`] `` | WRONG RC6 † |
| F03 | F | ` //XCUIElementTypeCell[.//*[@name="x"]] ` | ` **/XCUIElementTypeCell[$name == "x"$] ` | `` **/XCUIElementTypeCell[`name == "x"`] `` | WRONG RC8 |
| F04 | F | ` //XCUIElementTypeCell[descendant::XCUIElementTypeButton] ` | ` **/XCUIElementTypeCell[$type == "XCUIElementTypeButton"$] ` | skipped_unsupported_logic | GAP |
| F05 | F | ` //XCUIElementTypeCell[./XCUIElementTypeButton[@name="x"]] ` | *INEXPRESSIBLE: child-existence* | `` **/XCUIElementTypeCell[`name == "x"`] `` | WRONG RC8 † |
| F06 | F | ` //XCUIElementTypeCell[count(.//XCUIElementTypeButton)=2] ` | *INEXPRESSIBLE: count()* | skipped_unsupported_logic | CORRECT-SKIP † |
| F07 | F | ` //XCUIElementTypeTable/XCUIElementTypeCell[.//XCUIElementTypeStaticTe… ` | ` **/XCUIElementTypeTable/XCUIElementTypeCell[$type == "XCUIElementTypeStaticText… ` | `` **/XCUIElementTypeTable/XCUIElementTypeCell[`label == "x"`]/XCUIElementTypeButt… `` | WRONG RC8 |
| F08 | F | ` //XCUIElementTypeCell[@name="a"][.//XCUIElementTypeButton] ` | `` **/XCUIElementTypeCell[`name == "a"`][$type == "XCUIElementTypeButton"$] `` | `` **/XCUIElementTypeCell[`name == "a" AND .//XCUIElementTypeButton`] `` | WRONG RC6 |
| G01 | G | ` //*[@label="it's"] ` | `` **/*[`label == "it's"`] `` | `` **/*[`label == "it's"`] `` | CORRECT |
| G02 | G | ` //*[@label='say "hi"'] ` | `` **/*[`label == 'say "hi"'`] `` | `` **/*[`label == 'say "hi"'`] `` | CORRECT |
| G03 | G | ` //*[@label='a"b'] ` | `` **/*[`label == 'a"b'`] `` | skipped_validation_failed | GAP |
| G04 | G | `` //*[@label="a`b"] `` | ``` **/*[`label == "a``b"`] ``` | skipped_validation_failed | GAP |
| G05 | G | ` //*[@label="a\nb"] ` | `` **/*[`label == "a\nb"`] `` | `` **/*[`label == "a\nb"`] `` | WRONG RC4 |
| G06 | G | ` //*[@label="Zov’gi £5 • x"] ` | `` **/*[`label == "Zov’gi £5 • x"`] `` | `` **/*[`label == "Zov’gi £5 • x"`] `` | CORRECT |
| G07 | G | ` //*[@name="a*b"] ` | `` **/*[`name == "a*b"`] `` | `` **/*[`name LIKE "a*b"`] `` | WRONG RC13 |
| G08 | G | ` //*[@name="a?"] ` | `` **/*[`name == "a?"`] `` | `` **/*[`name == "a?"`] `` | CORRECT |
| G09 | G | ` //*[@name="a*?"] ` | `` **/*[`name == "a*?"`] `` | `` **/*[`name LIKE "a*?"`] `` | WRONG RC13 |
| G10 | G | ` //*[@label="a/b\|c(d)"] ` | `` **/*[`label == "a/b\|c(d)"`] `` | `` **/*[`label == "a/b\|c(d)"`] `` | CORRECT |
| G11 | G | ` (//*[@label="a)b"])[2] ` | `` **/*[`label == "a)b"`][2] `` | `` **/*[`label == "a)b"`][2] `` | CORRECT |
| G12 | G | ` //*[@label="C:\dir"] ` | `` **/*[`label == "C:\\dir"`] `` | `` **/*[`label == "C:\dir"`] `` | WRONG RC4 |
| G13 | G | ` //*[@label="$5 and @x"] ` | `` **/*[`label == "$5 and @x"`] `` | `` **/*[`label == "$5 and x"`] `` | WRONG RC12 |
| G14 | G | ` //*[contains(@label,"a]b")] ` | `` **/*[`label CONTAINS "a]b"`] `` | skipped_validation_failed | GAP |
| H01 | H | ` //*[ends-with(@name,"ab")] ` | `` **/*[`name ENDSWITH "ab"`] `` | `` **/*[`name ENDSWITH "ab"`] `` | CORRECT |
| H02 | H | ` //*[matches(@name,"^a.c$")] ` | `` **/*[`name MATCHES "a.c"`] `` | `` **/*[`matches(name,"^a.c$")`] `` | WRONG RC6 |
| H03 | H | ` //*[matches(@name,"b")] ` | `` **/*[`name MATCHES "(?s).*(?:b).*"`] `` | `` **/*[`matches(name,"b")`] `` | WRONG RC6 |
| H04 | H | ` //*[matches(@name,"ab","i")] ` | `` **/*[`name MATCHES "(?si).*(?:ab).*"`] `` | `` **/*[`matches(name,"ab","i")`] `` | WRONG RC6 |
| H05 | H | ` //*[lower-case(@label)="ab"] ` | `` **/*[`label ==[c] "ab"`] `` | `` **/*[`lower-case(label)="ab"`] `` | WRONG RC6 |
| H06 | H | ` //*[contains(upper-case(@label),"AB")] ` | `` **/*[`label CONTAINS[c] "AB"`] `` | `` **/*[`contains(upper-case(label),"AB")`] `` | WRONG RC6 |
| H07 | H | ` //*[replace(@label,"a","b")="bb"] ` | *INEXPRESSIBLE: NSPredicate has no string replacement* | `` **/*[`replace(label,"a","b")="bb"`] `` | WRONG RC6 † |
| H08 | H | ` //*[tokenize(@label," ")[2]="b"] ` | *INEXPRESSIBLE: no tokenization in NSPredicate* | ` **/*[2] ` | WRONG RC8 † |
| H09 | H | ` //*[string-join(tokenize(@label," "),"-")="a-b"] ` | *INEXPRESSIBLE: no string-join in NSPredicate* | `` **/*[`string-join(tokenize(label," "),"-")="a-b"`] `` | WRONG RC6 † |
| H10 | H | ` //*[ends-with(text(),"ab")] ` | *SKIP: text() never matches in WDA XML* | `` **/*[`label ENDSWITH "ab" OR value ENDSWITH "ab"`] `` | DRIFT (doc.) † |
| R01 | R | ` //XCUIElementTypeButton[@name="x"]/ancestor::XCUIElementTypeCell ` | ` **/XCUIElementTypeCell[$type == "XCUIElementTypeButton" AND name == "x"$] ` | skipped_unsupported_logic | GAP |
| R02 | R | ` //XCUIElementTypeButton/.. ` | *INEXPRESSIBLE: parent axis: no child-existence predicate* | ` **/XCUIElementTypeButton/.. ` | WRONG RC10 † |
| R03 | R | ` //XCUIElementTypeButton/parent::XCUIElementTypeCell ` | *INEXPRESSIBLE: parent axis* | skipped_unsupported_logic | CORRECT-SKIP † |
| R04 | R | ` //XCUIElementTypeButton[@name="x"]/ancestor::XCUIElementTypeCell[1] ` | *INEXPRESSIBLE: nearest ancestor (reverse-axis position)* | skipped_unsupported_logic | CORRECT-SKIP † |
| X01 | A | ` //*[@name="a"]/following-sibling::*[1] ` | *INEXPRESSIBLE: sibling axis* | skipped_unsupported_logic | CORRECT-SKIP † |
| X02 | A | ` //*[@name="a"]/preceding-sibling::* ` | *INEXPRESSIBLE: sibling axis* | skipped_unsupported_logic | CORRECT-SKIP † |
| X03 | A | ` //*[@name="a"]/following::XCUIElementTypeButton ` | *INEXPRESSIBLE: following axis* | skipped_unsupported_logic | CORRECT-SKIP † |
| X04 | D | ` //XCUIElementTypeButton[@name="a"] \| //XCUIElementTypeButton[@name="… ` | `` **/XCUIElementTypeButton[`name == "a" OR name == "b"`] `` | skipped_unsupported_logic | GAP |
| X05 | D | ` //XCUIElementTypeButton[@name="a"] \| //XCUIElementTypeStaticText[@na… ` | `` **/*[`(type == "XCUIElementTypeButton" AND name == "a") OR (type == "XCUIElemen… `` | skipped_unsupported_logic | GAP |
| X06 | D | ` //XCUIElementTypeCell/XCUIElementTypeButton \| //XCUIElementTypeTable… ` | *INEXPRESSIBLE: union of different paths* | skipped_unsupported_logic | CORRECT-SKIP † |
| X07 | D | ` //*[self::XCUIElementTypeButton or self::XCUIElementTypeStaticText] ` | `` **/*[`type == "XCUIElementTypeButton" OR type == "XCUIElementTypeStaticText"`] `` | skipped_unsupported_logic | GAP |


## 5. Defects

Severity: **critical** = silently breaks many locators or selects the wrong element; **major** = a broken or wrong chain for a common construct; **minor** = rare.

| Id | Sev. | Repro: input → output → expected | Location | Suggested fix |
|---|---|---|---|---|
| RC-S1 | critical | `driver.findElement(AppiumBy.xpath("//…Button[@name=\"x\"]"))` → string becomes `"-ios class chain:**/…"`, strategy stays XPath → expected: untouched + skip reason (or strategy rewritten to `AppiumBy.iOSClassChain`) | `lib/scanner.js:170` (match), `:210` (convert) | Before converting, inspect the call context: `By.xpath(`, `AppiumBy.xpath(`, `MobileBy.xpath(`, `xpath =` in `@iOSXCUITFindBy`/`@FindBy` → skip with reason `xpath-strategy` |
| RC-S2 | critical | `driver.find_element(AppiumBy.XPATH, '//…')`, `(By.XPATH, '…')` → rewritten → expected: skip | `lib/scanner.js:170` | same for `AppiumBy.XPATH,` / `By.XPATH,` (and Ruby `:xpath`, C# `MobileBy.XPath(`) |
| RC6 | critical | `//*[matches(@name,"b")]` → `` **/*[`matches(name,"b")`] `` "success" → expected `` **/*[`name MATCHES "(?s).*(?:b).*"`] `` (also `lower-case`, `normalize-space`, `concat`, `string-length`, `translate`, `contains(., …)`, `[@name]`, `[XCUIElementTypeButton]`, `[.//X]`) | `lib/validator.js:83` | Remove string literals *inside* the backtick block (tokenise NSPredicate), then reject any `identifier(`, `@`, `text()`, `.//`, `::`, bare-keypath predicates |
| RC1 | critical | `//*[@a="x"]//*[@b="y"]`, `//Cell/descendant::Button` → `` **/*[…]**/*[…] `` (WDA: unexpected character at 34) → `` **/*[…]/**/*[…] `` | `lib/converter.js:266` | emit `/**/` when `//` follows a step (`classChain !== ''`) |
| RC8 | critical | `//Cell[.//Button[@name="x"]]` → `` **/Cell[`name == "x"`] `` (selects a *different* Cell) → `` **/Cell[$type == "XCUIElementTypeButton" AND name == "x"$] ``; `//*[tokenize(@label," ")[2]="b"]` → `**/*[2]` | `lib/converter.js:292`, `lib/predicates.js:23` | nesting-aware predicate extraction; map `[.//X[p]]`, `[descendant::X]` → `$…$`; skip `[./X]`, `[X]` (child existence) |
| RC7 | critical | `//*[@name="a" or @label="b"][@value="c"]` → `` [`name == "a" OR label == "b" AND value == "c"`] `` → `` [`(name == "a" OR label == "b") AND value == "c"`] `` | `lib/converter.js:325` | parenthesise each predicate that contains `OR` before joining with ` AND ` |
| RC2 | major | `//*[contains(@name,"n") and contains(@enabled,"false")]` → `enabled CONTAINS "false"` (raises when `name` matches) → `enabled == false` | `lib/predicates.js:45` | for `BOOLEAN_ATTRS`, rewrite `contains/starts-with(@attr,"true"/"false")` to `== true/false`; otherwise skip |
| RC3 | major | `//X[contains(@text,"a")]` → `text CONTAINS "a"` (FBUnknownAttributeException) → skip with reason; `//X[@x>60]` → `x>60` → `` rect.x > 60 `` | `lib/converter.js:301` | whitelist WDA attribute aliases (`FBElement.h` `wd*` props: name, label, value, type, enabled, visible, accessible, selected, hittable, focused, index, placeholderValue, traits, rect, frame, minValue, maxValue, …); `x/y/width/height` → `rect.*`; skip the rest |
| RC4 | major | `//*[@name="a\nb"]` (newline) → raw newline in predicate (NSPredicate parse error); `@label="C:\dir"` → `"C:\dir"` (matches nothing) → `"a\\nb"`, `"C:\\\\dir"` | `lib/converter.js:301` | escape `\` and control characters when emitting NSPredicate literals (at source level for the scanner, accounting for the host literal's own escaping) |
| RC9 | major | `/XCUIElementTypeApplication/XCUIElementTypeWindow/XCUIElementTypeButton` → `/XCUIElementTypeApplication/**/XCUIElementTypeButton` (parse error at 1) → `XCUIElementTypeWindow/XCUIElementTypeButton` | `lib/converter.js:269` | drop a leading `/XCUIElementTypeApplication` step (the class chain root *is* the app) and the leading `/`; don't let rule 5 strip the first step of an anchored path |
| RC11 | major | `//*[contains(@type,"XCUIElementTypeText")]` → `**/XCUIElementTypeText` (WDA maps unknown names to `Other`) → `` **/*[`type CONTAINS "XCUIElementTypeText"`] ``; `//XCUIElementTypeLabel[...]` → matches every Other | `lib/validator.js:22`, `lib/converter.js:285` | collapse only `type ==` with a name from WDA's `FBElementTypeTransformer` table; reject unknown type names |
| RC13 | major | `//*[@name="a*b"]` → `` name LIKE "a*b" `` (also matches `aXYZb`) → `` name == "a*b" `` | `lib/optimizer.js:45`, `lib/validator.js:103` | delete the rule and the validator check: NSPredicate `==` compares literally; README rule 1 is wrong |
| RC14 | major | `//*[@index="1"]` → `index == "1"` (never true) → `index == 1`; `//X[@value>5]` → `value>5` (raises) → `value.doubleValue > 5` | `lib/converter.js:301` | type-aware literal emission for `index` and numeric comparisons |
| RC15 | major | `//Cell[2][@name="a"]` → `` Cell[`name == "a"`][2] `` (picks c3 instead of c2) → skip | `lib/converter.js:314` | if an index predicate precedes a logic predicate, skip |
| RC5 | major | `` //*[${condition('label')}] `` → `` **/*[`${condition('label')}`] `` → skip (body built at runtime) | `lib/converter.js:314` | skip predicates whose whole body is an interpolation |
| RC-S3 | major | JSON/Java `"//*[contains(@type,\"X\") and contains(@name,\"n\")]"` → `` contains(type,"X") AND contains(name,"n") `` | `lib/predicates.js:34` | let `QUOTED_VALUE` close on `\"`: `\\"(?:[^"\\]\|\\.)*?\\"`; RC6 fix catches the rest |
| RC10 | minor | `//Cell/./Button` → `**/Cell/./Button`; `//Button/..` → `**/Button/..` (parse errors) | `lib/converter.js:276` | drop `.` steps; skip `..` |
| RC12 | minor | `//*[@label="$5 and @x"]` → `"$5 and x"` | `lib/validator.js:68` | strip `@` only outside quoted strings |
| D-composed | major (not scored) | base constant converted → `${base}//X` composition broken (§2) | `lib/scanner.js:170` | skip constants that are interpolated as a prefix elsewhere, or report them |
| D-drift-ne | minor (DRIFT) | `@label!="a"` → `label!="a"` also matches elements with no label → `label != nil AND label != "a"` | `lib/converter.js:301` | as shown |
| D-rule5 | minor (DRIFT, undocumented) | `//Window/Other/Button[@name="a"]` → `**/Button[…]` also finds buttons outside Window/Other | `lib/optimizer.js:134` | document it as a semantic change (like rule 7), or apply only between two kept steps |
| D-lint | minor | comment text `"-ios class chain:"` counted and linted; empty chain valid; chain with raw newline (L333) valid | `lib/scanner.js:170`, `lib/validator.js:9` | require a non-empty body; reject control characters |


## 6. Ratings

Weights and penalties exactly as in the prompt.

### R — real corpus

- Expressible entries = 563 scored − 72 CORRECT-SKIP − 2 WRONG on inexpressible input (L306 `@text`, L476 runtime-built predicate) = **489**.
- CORRECT = 468; DRIFT documented in README = 5 (per-parent index: L013, L120, L349, L350, L556); DRIFT undocumented = 2 (L174, L225, scored 0); WRONG expressible = 7; GAP = 7.
- R_raw = 100 × (468 + 0.5 × 5) / 489 = 100 × 470.5 / 489 = **96.22**
- Distinct WRONG root causes: corpus RC1, RC2, RC3, RC4, RC5 (5) + scanner contexts RC-S1 (Java), RC-S2 (Python), RC-S3 (JSON) (3) = 8 → −3 × 8 = **−24** (cap −30 not reached). CRASH root causes: 0.
- **R = 96.22 − 24 = 72.2**
- **C = 489 / 563 = 86.9 %**

**Gap list.** Each expressible entry is worth 100/489 = 0.204 points.

| Change | Entries | Point gain |
|---|---|---|
| Skip strings inside XPath-strategy calls (Java) | contexts | +3.0 |
| Same for Python | contexts | +3.0 |
| Escaped-quote handling (`\"`) + working leftover guard (JSON/Java) | contexts | +3.0 |
| `contains(@enabled,"false")` → `enabled == false` (RC2) | L278, L520, L521 | +3.0 + 0.61 = **+3.6** |
| `//A//B` → `/**/` (RC1) | L483, L484 | +3.0 + 0.41 = **+3.4** |
| Escape newline/backslash in values (RC4) | L119, L162 | +3.0 + 0.41 = **+3.4** |
| Skip `@text` with a reason (RC3) | L306 | +3.0 |
| Skip runtime-built predicate bodies (RC5) | L476 | +3.0 |
| `(…)[last()]` → `[-1]` | L270, L271, L272 | +0.61 |
| Single-step unions → one `OR` predicate | L355, L455, L461 | +0.61 |
| `not(…)` → `NOT (…)` | L458 | +0.20 |
| Document (or skip) outer-index-to-parent and nested-match ordering | L174, L225 | +0.20 |
| **All of the above** | | **R ≈ 99.3** (the remaining 0.7 is the inherent per-parent-index DRIFT) |

### S — spec matrix

Category score = weight × (CORRECT + 0.5 × DRIFT documented) / expressible cases.

| Cat. | Weight | Calculation | Score | Notes |
|---|---|---|---|---|
| Steps, axes, absolute paths, Application root | 15 | 15 × (5 + 0.5·1) / 15 | 5.50 | 7 WRONG, 2 DRIFT undoc., 1 GAP |
| Attributes, comparisons, booleans | 15 | 15 × (9 + 0) / 16 | 8.44 | 6 WRONG, 3 DRIFT undoc. |
| XPath 1.0 string functions | 15 | 15 × (4 + 0) / 9 | 6.67 | 6 WRONG |
| Logic and precedence | 12 | 12 × (8 + 0) / 15 | 6.40 | 2 WRONG, 5 GAP |
| Positional | 12 | 12 × (4 + 0.5·1) / 10 | 5.40 | 1 WRONG, 4 GAP, 1 DRIFT undoc. |
| Nested / descendant predicates | 10 | 10 × (0 + 0) / 5 | 0.00 | 6 WRONG, 1 GAP |
| Literals and escaping | 10 | 10 × (6 + 0) / 14 | 4.29 | 5 WRONG, 3 GAP |
| WDA XPath extension functions | 6 | 6 × (1 + 0) / 6 | 1.00 | 8 WRONG |
| Rewritable reverse axes | 5 | 5 × (0 + 0) / 1 | 0.00 | `ancestor::X` → `$…$` is the only rewritable form (R01 GAP); `/..` emitted broken (R02) |
| **Sum** | 100 | | **37.69** | |

- Penalty: 14 distinct spec root causes (RC1–RC4, RC6–RC15) + 3 context root causes = 17 → −51, **capped at −30**.
- **S = 37.69 − 30 = 7.7**

*Separate note on weights (not applied):* with the −30 cap reached, S mostly counts how many bug classes exist and hides category progress until most of them are fixed. A per-category penalty, or a lower cap for S, would make S track progress better. The fixed weights themselves look reasonable. Reverse axes (5) has only one expressible construct, which makes that category binary.


## 7. Ecosystem changes (last 12 months) → required actions

Sources:
- WDA `CHANGELOG.md` at tag v16.14.1;
- appium-xcuitest-driver `CHANGELOG.md` and docs at tag v12.16.0;
- npm registry metadata, read 2026-10-09;
- Appium Inspector `main` at commit 2ceffdf (2026-10-09).

| Change (source, date) | Effect on locators | Converter action |
|---|---|---|
| WDA 13.2.0, XPath extensions (#1144), 2026-05-26; driver doc `docs/reference/xpath-extensions.md` | Seven XPath 2-style functions work in Appium XPath (§1) | **Required**: map `matches`/`lower-case`/`upper-case`; skip `replace`/`tokenize`/`string-join` with a reason. Today they come out as broken "success" (RC6) |
| WDA 16.1.2, "Optimize class chain lookup" (#1194), 2026-08-03 | Snapshot walk used only when an intermediate step has a position. Position = index into the whole match set. Root excluded from `**/` | None in code. README's index warning is accurate; add the nested-match ordering caveat (L225) |
| WDA 16.1.5, cached snapshots (#1198), 2026-08-05; 16.8.0, bounded snapshot requests (#1214), 2026-08-24; 16.13.4, native predicates for accessibility-id lookups (#1286), 2026-09-30 | Performance and robustness only | None |
| WDA 12.0.0, removed `includeNonModalElements` / `shouldUseTestManagerForVisibilityDetection`, 2026-04-14; driver 11.0.0, removed `appium:simpleIsVisibleCheck`, 2026-04-14 | Single `visible` computation; `visible` is still a queryable boolean | None in code. Rule 7 stays a semantic change; README caveat is sufficient |
| WDA 9.0.0 snapshot refactor, 2025-01-16; 9.7.0 `placeholderValue` (2025-05-20), 9.11.0 real `hittable` in source (2025-06-03), 9.12.0 `traits` (2025-06-04), 9.13.0 `nativeFrame` (2025-06-05), 9.14.0 min/max value (2025-06-09) | All are FBElement properties, so all are queryable in class chain. `x/y/width/height` exist only in XML (`rect.x` in predicates). `selected` is queryable but **not** in the XML | Partly done: `placeholderValue`, `traits`, `hittable` convert correctly (B14, B15). **Required**: `@x` etc. → `rect.*` (RC3) |
| driver 12.0.0: ESM only, 2026-07-23; driver 12.16.0 requires Appium ^3 and Node ^20.19 / ^22.12 / ≥24 (npm `engines`/`peerDependencies`); Appium 3.8.0 released 2026-09-24 | No locator syntax change | None. The converter runs standalone; Node ≥ 20 is fine |
| Driver docs (v12.16.0) `locator-strategies.md`: predicate ⭐⭐⭐⭐⭐, class chain ⭐⭐⭐⭐, XPath ⭐⭐; xpath-extensions doc: "Prefer predicate string or class chain … XPath remains the slowest" | Confirms the tool's purpose | The driver docs still link the archived facebook wiki for class chain rules, which predates #1194. The README should cite WDA source and tests instead |
| Appium Inspector (2ceffdf): generates `-ios class chain` and `-ios predicate string` itself (`locator-generation/class-chain.js`, `common.js:46-47`); its XPath fallback is a hierarchical absolute path (`xpath.js` `_buildHierarchicalXPath`) | Users copying Inspector's fallback XPath get `/XCUIElementTypeApplication/…[n]` | **Required**: handle absolute Application paths (RC9) |
| Newer than the pin (not evaluated; pin kept): WDA 16.14.2 (2026-10-08: W3C actions/scrolling fix only, per its CHANGELOG), Appium 4.0.0-beta.4 and driver 13.0.0-beta.1 (npm dist-tags) | WDA 16.14.2 has no locator change according to its changelog | Re-check when a stable major lands |
| iOS / Xcode hierarchy and element-type changes | **UNVERIFIED**: no full Xcode on this machine; WDA's type table (`FBElementTypeTransformer.m`) was used as the authority | Phase 2 |


## 8. What was NOT verified, and why

- **No device or simulator run (Phase 1).** All runtime claims come from WDA v16.14.1 source compiled and run on macOS with stand-ins for XCTest. Specifically:
  - `descendantsByFilteringWithBlock` is emulated as a pre-order walk that includes the receiver, which is what WDA's comment states.
  - The query-based class chain strategy, the one WDA actually uses when no intermediate step has a position, was **not** emulated. Its result order is assumed to be document order, and the snapshot-walk algorithm was used for every chain. This matters only for nested matching containers: L225 and L272 are marked UNVERIFIED for ordering.
  - The system libxml2 2.9.13 stands in for WDA's iOS libxml2.
- **Attribute derivation is not emulated.** WDA's derivations (name falls back to label, StaticText value = label, Switch value → bool, empty → nil) are not modelled. Fixtures specify final values, and XPath and class chain read the same values, so the comparison holds. Which elements carry `nil` vs `""` (relevant to B02 `!=`) is UNVERIFIED on a device.
- **Assumption A1.** The Application root never matches a `//*[…]` locator (app name/label differ from the locator's values). With a matching root, every `//*` shape diverges, and no class chain can fix that.
- **Template literals.** `${…}` values are plain text; `@enabled="${…}"` is `true`/`false` (both variants run); `[${…}]` indexes are 1 and 2.
  - `${condition('label')}` (L476, L477) is assumed to return XPath text. If it returns NSPredicate text instead, L476 would be CORRECT, R would rise by 3, and RC5 would be dropped.
  - L068 `(…)${value}` has an unknown suffix: excluded.
- **L157** (mixed backtick syntax) is invalid XPath on WDA (libxml2 "Invalid expression"), so it is excluded rather than called a GAP.
- **Fuzzing is randomised (seeded), not exhaustive.** 200 page sources per corpus variant and 300 per spec case, ≤ 20 nodes.
  - L397 (`[10]`) never reached 10 matches; its shape is verified on its siblings.
  - The per-shape verdict for CORRECT assumes that values not seen in the corpus (other escapes, unicode) behave like the tested ones. G-category cases cover the risky ones.
- **Language checks.** Java syntax by inspection only (`javac` present but no JRE). TypeScript checked by loading under Node 24 type stripping, not `tsc`.
- **Expressibility judgements.** E12 (`[n][pred]`), F02/F05 (child existence) and `parent::` are treated as inexpressible. They are approximable with `$…$` at the cost of a depth change, which is not exact.
- **Disagreements with the prompt.**
  - The prompt lists `self::` inside a predicate as inexpressible. X07 shows `//*[self::A or self::B]` is exactly `` **/*[`type == "A" OR type == "B"`] `` (300/300 equal), so it is scored as a GAP.
  - Single-step unions (X04, X05; corpus L355, L455, L461) are likewise expressible.
- **Scope of the DRIFT credit.** "DRIFT documented in README" credit was given only to the per-parent index warning (README "What gets converted"), rule 7 (README optimizer note) and `text()` → label/value (README table). Rule 5, `!=`, and the outer-index move are not documented as semantic changes.
- **Ecosystem.** Appium 3.0's own release notes and iOS/Xcode element-type changes were not checked. Appium Inspector was read, not run.
