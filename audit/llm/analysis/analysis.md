# XPath → iOS class chain: error analysis

Sources: `table.md`, `cross.md`, `errors.json`. Cell abbreviations: hl/hm/hh/hx = haiku low/medium/high/max, sl/sm/sh/sx = sonnet low…max, ol/om/oh = opus low/medium/high. W = WRONG, I = INVALID, G = GAP. Every per-cell total below matches the WRONG / INVALID / GAP columns in `table.md`.

## 1. Error types

### 1.1 Model errors, by type and cell

| # | Type | hl | hm | hh | hx | sl | sm | sh | sx | ol | om | oh |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| T1 | Raw newline in a string literal | 3I | 2G | 3I | 2I | 3I | 3I | 3I | 3I | 3I | 3I | 3I |
| T2 | Backtick / backslash in a literal | 1G | 1G | 2G | 2G | 1I 1G | 1G | 1I 1G | 1G | — | — | — |
| T3 | Zero-based positions | 21W 14I | — | — | — | — | — | — | — | — | — | — |
| T4 | Positions emitted that have no exact form | 3W | 6W | 6W | — | 6W | 6W | 6W | 7W | 7W | 7W | 7W |
| T5 | Positions with an exact form skipped | 2G | 2G | 2G | 3G | 2G | 2G | 2G | 1G | 1G | 1G | 1G |
| T6 | Missing-attribute semantics | 1W 1G | 1W 1G | 1W | 2W | 1W 1G | 1W | 1W | — | — | — | — |
| T7 | Descendant / ancestor predicates | 5G | 5G | 5G | 5G | 5G | 1W 1G | 1W 1G | 1W 1G | 1W | 1W | 1W |
| T8 | Element type names | 1W | 1W 1G | 1W 1G | 1G | 1G | 1G | 1G | 1G | 1G | 1G | 1G |
| T9 | Unions and `self::` | 6G | 5G | — | — | — | 5G | 5G | — | — | — | — |
| T10 | XPath 2.0 functions | 5G | — | 6G | 6G | — | — | — | — | 6G | 6G | 6G |
| T11 | XPath 1.0 string functions | 3G | 2G | 2G | 1G | 1W | 1W 1G | 1G | 2G | — | — | — |
| T12 | Attribute keys and typed comparisons | 7G | 6G | 7G | 4G | 3G | 4G | 3G | 2G | 3G | 3G | 2G |
| T13 | Path anchoring | 1G | 1W | — | — | — | — | — | — | — | — | — |
| | **Total W / I / G** | 26/17/31 | 9/0/25 | 8/3/25 | 2/2/22 | 8/4/13 | 9/3/15 | 8/4/14 | 8/3/8 | 8/3/11 | 8/3/11 | 8/3/10 |

### 1.2 What goes wrong in each type

**T1. Raw newline in a string literal (G05, L119, L162).** The XPath literal holds a real line break, and the models copied it into the NSPredicate string as is. NSPredicate's format parser cannot read a literal that spans lines, so WDA throws `Unable to parse the format string "label == "a`. The converter writes the escape `\n` and is CORRECT on G05 and L119. This one type causes every INVALID from sonnet and opus (3 per run). hm avoided the INVALIDs only by skipping G05 and L119 (2 GAPs).

**T2. Backtick and backslash (G04, G12).** A backtick closes a class-chain predicate. WDA accepts a doubled backtick (``label == "a``b"``, CORRECT at ol/om/oh), but `\`` is rejected with "Unexpected character detected at position 20" (sl, sh). Six runs skipped G04 instead. On G12 (`C:\dir`), `"C:\\dir"` is CORRECT (converter, hl, hm, sm, sx, opus), but hh, hx, sl and sh skipped it because they were unsure how a backslash is escaped.

**T3. Zero-based positions (haiku/low only).** Class-chain indexes start at 1. `[0]` is rejected ("Position value '0' is expected to be … not equal to zero"): E03, E14, A08, L062, L081, L082, L258, L262, L382, L428, L471, L556, L564, L572 (14 I). A shifted `[n-1]` picks the wrong match, and each counter-example has the form "XPath [] vs chain [n1]": E02, E09, E10, G11, L070, L171, L177, L182, L207, L208, L234, L310, L396, L407, L451, L498, L565–L567, L571, L573 (21 W). L397 (`[9]` for `[10]`) received DRIFT, not WRONG (see §3).

**T4. Positions that have no exact form, emitted anyway (E05, E06, E07, E11, L270, L271, L272).** The answers were `last()` → `[-1]`, `last()-1` → `[-2]`, `position()=2` → `[2]`, and `(//Cell)[2]/Button` → `**/XCUIElementTypeCell[2]/XCUIElementTypeButton`. A class-chain index counts within the matches of its own step. It does not carry XPath's document-order index over a parenthesised node-set, and the label marks these locators as inexpressible. Stronger models emit more of these, not fewer: hx emits none, hl 3, sonnet low–high 6, and sx and every opus run 7 (they add L272, `…/XCUIElementTypeStaticText[-1]`).

**T5. Positions with an exact form, skipped (L012, E13, A08).** L012 `(//ST/child::ST[1])[1]` has the exact chain `**/XCUIElementTypeStaticText/XCUIElementTypeStaticText[1]`. The first per-parent-first child in document order is also the first child overall. Only sx and opus found it. E13 is a GAP for all 11 runs (but see §3). hx skipped A08 because it was unsure whether indexes are 0- or 1-based.

**T6. Missing-attribute semantics (B02, B10).** In XPath, `@label!="a"` is false when the attribute is absent. In NSPredicate, `label != "a"` is true for nil, so the bare form matches unlabeled buttons (counter-example: `<Button k="n1"/>`). The exact form is ``label != nil AND label != "a"``. Seven runs (hl–sh) got this wrong; sx and opus did not. On B10 `[@name]`, the correct chain is `name != nil`. hx dropped the predicate (W), and hl, hm and sl skipped.

**T7. Descendant and ancestor predicates (F01, F03, F04, F07, F08, R01).** Class chain tests descendants with `[$…$]`. Every haiku run and sl believed it cannot ("class chain predicates can only test the element's own attributes"), which gave 4 GAPs on F01/F04/F07/F08. Only opus maps `ancestor::` (R01 → ``**/XCUIElementTypeCell[$type == "XCUIElementTypeButton" AND name == "x"$]``). The runs that do use `$…$` overgeneralise it. F03 `[.//*[@name="x"]]` → `[$name == "x"$]` is WRONG at sm, sh, sx and all opus runs. With a concrete type inside `$…$` (F01, F07, F08) the same pattern is CORRECT; with `*` it is not.

**T8. Element type names (A13, A04).** `XCUIElementTypeLabel` is not an XCUITest type, so the XPath matches nothing. hl, hm and hh emitted the chain anyway, and WDA matched an `XCUIElementTypeOther` (o1). On A04 (`//XCUIElementTypeAny`), the label expects the wildcard ``**/*[`name == "a"`]``. Ten runs skipped it, arguing that the XPath matches nothing (see §3).

**T9. Unions and `self::` (X04, X05, X07, L355, L461, L455).** A union of same-shaped `//T[p]` steps can be written as one predicate joined with `OR`, adding `type == "T"` when the types differ. hl, hm, sm and sh skipped these because "class chain has no union". L355, L461 and L455 are real-world locators, so this type lowers R=. hl also skipped X07 (`self::`).

**T10. XPath 2.0 functions (H01 ends-with, H02–H04 matches, H05 lower-case, H06 upper-case).** The exact forms are `ENDSWITH`, `MATCHES` (which tests the whole string, so `^a.c$` becomes `"a.c"`), `CONTAINS` / `CONTAINS[c]`, and `==[c]`. hh, hx and every opus run skipped all six because "Appium's XPath 1.0 engine rejects this locator". hl skipped five, arguing there is no equivalent. hm and every sonnet run converted them (see §3).

**T11. XPath 1.0 string functions (C06, C07, C09, H09).** C06 `normalize-space` → ``label MATCHES "\\s*a\\s+b\\s*"`` (correct at sl and opus); C07 `string-length` → `label.length > 3`; C09 `concat` of literals → one literal. These were skipped by the runs listed in the table. Over-translation: H09 `string-join(tokenize())` → `label IN {"a b", "a-b"}` is WRONG at sl and sm (see §3).

**T12. Attribute keys and typed comparisons (B03, B04, B11, B14–B17, L455@hh).** Every run skipped B03 `@value>5` (the converter uses `value.doubleValue > 5`). Only oh converted B04 (`rect.x > 60`), and only sx converted B11 (`index == 1`). Haiku skipped `hittable`, `placeholderValue` and `accessible` as "not documented" (B14, B15, B17, and L455 at hh). On B16 `@enabled=true()`, XPath 1.0 tests only that the attribute exists, so the answer is `**/XCUIElementTypeButton`; hl and sm skipped it.

**T13. Path anchoring (A07, A12).** hm wrote `**/XCUIElementTypeWindow/XCUIElementTypeButton` for an absolute path. The `**` lets the Window sit at any depth, and the counter-example nests one inside a TextField. The exact form has no `**`: `XCUIElementTypeWindow/XCUIElementTypeButton`. hl skipped `.//X` (A12), which is simply `**/X`.

### 1.3 The converter's own GAPs (24) and DRIFTs (53)

| Type | Cases |
|---|---|
| GAP: escaping in literals | G03 (`"` inside `'…'`), G04 (backtick), G14 (`]`) |
| GAP: boolean operators | D07 `not()`, D08 `and not()`, L458 (`not (` with a space) |
| GAP: unions and `self::` | X04, X05, X07, L355, L461, L455 |
| GAP: relative path | A12 |
| GAP: XPath 1.0 functions | C06, C07, C08 (translate), C09 |
| GAP: XPath 2.0 functions | H02, H03, H04, H05, H06 |
| GAP: axes | F04 (`descendant::`), R01 (`ancestor::`) |
| DRIFT: global index `(…)[n]` (35) | E02, E03, E09, E10, E14, G11, L062, L070, L081, L082, L162, L171, L177, L182, L207, L208, L234, L258, L262, L310, L382, L396, L397, L407, L428, L451, L471, L498, L564–L567, L571–L573 |
| DRIFT: per-parent or nested index (9) | E01, E13, L013, L120, L174, L225, L349, L350, L556 |
| DRIFT: `text()` → `label OR value` | C03, C04, H10 (every model skips; all CORRECT-SKIP) |
| DRIFT: booleans | B08 (`selected == true`), B16 (`enabled == true`) |
| DRIFT: path shortcuts | A07, A14, A15 (the path is collapsed to `**/XCUIElementTypeButton…`); A16 (moves `visible == 1` from the Cell step to the Button step: a bug) |

## 2. Per model and effort

| Cell | W | I | G | R= | S= | Prec. | Conv. | min | $ |
|---|---|---|---|---|---|---|---|---|---|
| haiku/low | 26 | 17 | 31 | 91.7 | 48.0 | 91.9 | 79.8 | 8.6 | 0.39 |
| haiku/medium | 9 | 0 | 25 | 94.5 | **61.1** | 98.4 | 80.8 | **6.0** | **0.28** |
| haiku/high | 8 | 3 | 25 | **94.9** | 57.9 | 97.8 | 81.0 | 7.6 | 0.36 |
| haiku/max | 2 | 2 | 22 | 92.2 | 54.9 | **99.2** | 75.2 | 13.5 | 0.64 |
| sonnet/low | 8 | 4 | 13 | 95.2 | 69.1 | 97.7 | 83.2 | 5.2 | 1.03 |
| sonnet/medium | 9 | 3 | 15 | 94.5 | 76.5 | 97.9 | 82.7 | 5.3 | 1.05 |
| sonnet/high | 8 | 4 | 14 | 94.6 | 76.8 | 97.9 | 82.7 | 6.0 | 1.14 |
| sonnet/max | 8 | 3 | 8 | 95.3 | 78.4 | 98.1 | 83.8 | 36.0 | 4.85 |
| opus/low | 8 | 3 | 11 | 95.3 | 81.4 | 98.1 | 83.3 | 7.1 | 2.04 |
| opus/medium | 8 | 3 | 11 | 95.3 | 81.4 | 98.1 | 83.3 | 8.5 | 2.33 |
| opus/high | 8 | 3 | 10 | 95.3 | 82.3 | 98.1 | 83.5 | 10.7 | 2.83 |

**Haiku.** 35 of the 43 W+I at low come from 0-based indexing (T3). Medium removes T3 entirely, has no INVALIDs (it skips the newline cases), and is the only haiku run to convert H01–H06. **High is worse than medium on S=** (57.9 against 61.1): the newline INVALIDs return (G05, L119, L162), it skips H01–H06 and G12, and it gains only the unions and B10. **Max** stops emitting positional chains, so T4 drops to 0 and precision rises to 99.2. But it also skips every `(…)[n]` locator, which the converter can only approximate (a DRIFT) and which therefore count as CORRECT-SKIP. That lowers the converted share to 75.2 % and R= to 92.2. Raw R (99.6) looks better only because the skipped cases leave its denominator. Max adds new WRONGs on B02 and B10 and costs 2.3× medium. **Best effort: medium.**

**Sonnet.** Medium gains 7.4 S= points over low by using `$…$` (F01, F04, F07, F08, B10). But it starts skipping unions (X04, X05, L355, L461, L455), so **R= falls from 95.2 to 94.5**, and it adds F03 WRONG. High is medium again (+0.3 S=), and the G04 INVALID and G12 GAP come back. Max brings unions back and fixes B02, B11 and L012, but adds L272 WRONG. It costs 4.3× high and takes 6× the time; the 36 min may include waiting on the account limit it shared with opus/max. **Best effort: low for real suites; medium if edge cases matter** (same cost, +7.4 S=, −0.7 R=). High and max are not better than medium in proportion to their cost.

**Opus.** Low and medium have identical case lists; medium costs $0.29 more. High converts only B04 (+0.9 S=, +39 % cost). The errors do not change with effort: T4 (7 W), F03, T1 (3 I), H01–H06 skipped on the "XPath 1.0" belief, plus A04, B03, B11 and E13. More effort does not fix any of them. **Best effort: low.** opus/max is excluded because the run was cut off.

## 3. Where the converter or the expected labels look wrong

### 3.1 Exact chains the converter misses (candidates for the converter)

| Cases | What the models do | Right cells | Device check |
|---|---|---|---|
| G03, G14 | `\"` escape; `]` inside a quoted literal | 11/11 | no (parser) |
| G04 | doubled backtick ``"a``b"`` | 3/11 (opus) | no (parser) |
| D07, D08, L458 | `NOT (…)`; L458 only differs by the space in `not (` | 11/11 | no |
| X04, X05, X07, L355, L461, L455 | one predicate with OR (`type ==` for `self::`) | 6–10/11 | no |
| A12 | `.//X` → `**/X` | 10/11 | no |
| A07, A14, A15 | keep the anchored or intermediate steps instead of collapsing to `**/Button` | 10–11/11 | no |
| A16 | keep `visible == 1` on the Cell step (the converter moves it to Button) | 11/11 | no |
| B16 | `@enabled=true()` → no predicate | 8/11 | yes: assumes the source always writes `enabled` |
| C08, C09 | `CONTAINS[c]`; folded `concat` | 10–11/11 | no |
| F04, R01 | `[$type == "T" …$]` for `descendant::` / `ancestor::` | 6/11, 3/11 | **yes**: `$…$` scope (see F03) |
| H02–H06 | `MATCHES`, `CONTAINS[c]`, `==[c]` | 5/11 | **yes**: XPath engine (see below) |
| C06 | `MATCHES "\\s*a\\s+b\\s*"` | 4/11 | ICU `\s` also matches NBSP and other Unicode spaces; normalize-space strips only space, tab, CR and LF. `[ \t\r\n]` would be exact |
| C07 | `label.length > 3` | 7/11 | `.length` counts UTF-16 units, XPath counts code points (an emoji label differs) |

### 3.2 Labels that look doubtful

| Case | Issue | Device check |
|---|---|---|
| **H07** | Labeled inexpressible, but hm, sl and sm produced ``label MATCHES "[ab]{2}"``, graded CORRECT. The chain is exact: any two characters from {a, b} become "bb". The label should be "expressible" | no |
| **H09** | ``label IN {"a b", "a-b"}`` is graded WRONG, yet under the F&O definition of `tokenize` only those two labels give "a-b". The truncated counter-example contains `label=" a  b "`, which F&O tokenizes to "-a--b-". Check the grader's `tokenize` | no (grader) |
| H08 | sonnet/low gave ``label MATCHES "(?s)[^ ]* b( .*)?"``, which looks exact, but it was not graded (N/A) | no |
| **E07 vs E02** | The same chain `**/XCUIElementTypeButton[2]` is DRIFT for `(//Button)[2]` (E02) and WRONG for the equivalent `(//Button)[position()=2]` (E07). 9 runs were penalised. E11 `(//Cell)[2]/Button` probably belongs in the DRIFT class too | yes (index order) |
| E05, E06, L270–L272 | A positive index is DRIFT but `[-1]` / `[-2]` is WRONG. WDA documents negative indexes as counting from the end, so they may deserve DRIFT | **yes** |
| **E13** | GAP for all 11 runs, which implies an exact chain exists. The converter only has a DRIFT chain, and the runs' reason (a per-parent `Button[2]` inside a global `[2]`) holds. Likely CORRECT-SKIP | no |
| **A04** | The label treats XPath `//XCUIElementTypeAny` as a wildcard. A13 treats another unknown tag (`XCUIElementTypeLabel`) as matching nothing. Ten runs argue A04 matches nothing too | **yes** (WDA XPath) |
| **H01–H06** | The labels assume `matches`, `lower-case`, `upper-case` and `ends-with` evaluate. If the real driver's XPath is libxml2 XPath 1.0, these locators throw, and the opus/hh/hx skips are right | **yes** |
| B03 | `value.doubleValue > 5` is labeled CORRECT, but `"10abc".doubleValue` = 10 while XPath `number()` gives NaN; `"1e3"` differs the same way. On a device, `value` can also be an NSNumber | **yes** |
| B04 | `rect.x > 60`: opus/medium notes that the source rounds `x` to an integer, so a frame at x = 60.4 gives "60" in XPath (false) but 60.4 in the chain (true) | **yes** |
| B11, B14 | `index == 1`, `hittable == true`: these depend on whether the predicate key equals the source attribute. `hittable` may be computed live rather than read from the snapshot | **yes** |
| F03 | `$name == "x"$` is WRONG, but the same pattern with a concrete `type ==` is CORRECT (F01, F07). This is consistent with `$…$` also matching the element itself in this build. The counter-example is truncated | **yes** (XCTest `descendantsMatchingType`) |
| L397 | hl's off-by-one `[9]` for `[10]` was graded DRIFT, apparently because no page has 10 matches. The page set does not separate the two | no |
| L157 | The input is already a class chain (`//XCUIElementTypeButton[`label == …`]`), not an XPath. It should be dropped from the corpus | no |

## 4. Top 3

| Rank | Cell | R= | S= | Precision | Converted | W+I | Time | Cost |
|---|---|---|---|---|---|---|---|---|
| 1 | **opus/low** | 95.3 | 81.4 | 98.1 % | 83.3 % | 11 | 7.1 min | $2.04 |
| 2 | **sonnet/low** | 95.2 | 69.1 | 97.7 % | 83.2 % | 12 | 5.2 min | $1.03 |
| 3 | **haiku/medium** | 94.5 | 61.1 | 98.4 % | 80.8 % | 9 | 6.0 min | $0.28 |
| ref | converter | 95.3 | 62.0 | 100 % | 81.7 % | 0 | — | — |

1. **opus/low** ties the best R= and has the second-best S= (opus/high adds only 0.9 S= for +39 % cost). It handles unions, `$…$`, `ancestor::` and backticks.
2. **sonnet/low** gives nearly the same R= at half the cost and is the fastest run. It is weaker on edge cases (no `$…$`).
3. **haiku/medium** is the cheapest by 3–7×, has no INVALIDs, and has the highest precision of the runs that convert positional locators.

**When the converter alone is better.** On real-world locators, no model beats it: the best R= is a tie at 95.3. The converter has 100 % precision, while every run emits 9–43 WRONG/INVALID chains, and it has no cost. Models add value only on edge cases (S= +19 for opus). Going by the per-case verdicts (no such pipeline was run), the best setup is the converter first, then a model only on its 24 GAPs. On those, opus/low is right on 19 (all but H02–H06) and wrong on none. Sending all of the converter's skips would also send the `last()` and `$*$` cases, where opus emits 8 WRONG (E05, E06, E07, E11, L270–L272, F03).

## 5. An improved prompt

```
Convert each Appium XCUITest XPath into an iOS class chain that finds exactly
the same elements. Reply with the chain, or "SKIP: <reason>" if no exact chain
exists. Do not skip what these rules cover.

Structure
- **/X any depth, /X child, * any type. /XCUIElementTypeApplication/A/B -> A/B;
  .//X -> **/X. Keep every intermediate step.
- Predicate [`NSPredicate`]; descendant test [$NSPredicate$].

String literals
- Double quotes. Escape " as \" and \ as \\. Write line breaks as \n, tabs as
  \t, never raw. Write a backtick as two backticks.

Attributes
- Keys: name, label, value, type, enabled, visible, accessible, hittable,
  selected, placeholderValue, index; @x/@y/@width/@height -> rect.x etc.
- Missing attributes fail XPath comparisons but are nil in NSPredicate:
  @a!="v" -> a != nil AND a != "v"; [@a] -> a != nil;
  not(@a="v") -> NOT (a == "v"). @a=true() only tests that @a exists.
- @value>5 -> value.doubleValue > 5.

Functions
- contains / starts-with / ends-with -> CONTAINS / BEGINSWITH / ENDSWITH.
  matches() -> MATCHES (whole string). translate / lower-case / upper-case ->
  [c]. Fold concat() of literals. string-length -> .length. normalize-space ->
  MATCHES with [ \t\r\n]. Convert XPath 2.0 functions too.
- Unions of //T[p] and self:: tests -> one predicate joined by OR
  (add type == "T" when types differ).
- [.//T[p]] or [descendant::T] -> [$type == "T" AND p$];
  //T[p]/ancestor::A -> **/A[$type == "T" AND p$].
  Always put a concrete type inside $...$; if it is *, SKIP.

Positions (1-based, never 0)
- (//X[p])[n] -> **/X[`p`][n].
- SKIP last(), last()-n, position() tests, and any index on a parenthesised
  path that has a further step or an inner index.

Also SKIP text(), parent/sibling/preceding/following axes, and type names
that do not exist in XCUITest.
```

The rules target T1–T3 (escaping and 1-based indexes), T4 and F03 (what to skip), and T6–T13 (the forms that weaker runs skipped). Where a rule rests on a label that §3.2 marks for a device check (`rect.x`, `doubleValue`, XPath 2.0, `$…$`), verify a few converted locators on a real device before converting a whole suite.
