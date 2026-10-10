# Coverage audit: XPath → iOS class chain (Phase 1, static)

Audit date 2026-10-09/10. Target platform pinned per `audit/prompts/coverage.md`: Appium 3.8.0, appium-xcuitest-driver 12.16.0, WebDriverAgent (WDA) 16.14.1. The npm registry confirms that driver 12.16.0 depends on `appium-webdriveragent` 16.14.1.

**How verdicts were produced.** No verdict here comes from reading the converter and reasoning about it. Each comes from a run:

- **mini-WDA harness.** The class chain parser, the predicate→attribute mapping, the FBElement protocol and the XPath extension functions were compiled from WDA tag `v16.14.1` (commit 2e98ac0): ten files unchanged, two with small patches that only remove or stub device-only code: snapshot wrappers and accessibility-element ids (`audit/harness/wda/patches/`). They run on macOS Foundation with libxml2. Around them sit two thin stand-ins: the XML writer (attribute order, query-driven attribute inclusion, `"true"`/`"false"` booleans, as in `FBXPath.m`) and the snapshot-walk lookup, adapted line by line from `XCUIElement+FBClassChain.m`.
  - Self-test: all 43 valid and invalid queries from WDA's `FBClassChainTests.m` parse or fail exactly as the tests expect.
- **Corpus.** Every converted entry ran against 200 random page sources built from its own literals and types. XPath and class chain were compared on the result set and the first element. Values went through the same runtime unescaping and `${…}` substitution on both sides.
- **Spec matrix.** The same comparison, plus hand-built fixtures. A hand-written "correct" chain was run as well; a skip counts as a GAP only after that chain is shown equal to the XPath.

The harness and all scripts are in `audit/harness/`; `./run.sh` reproduces this report's numbers and `coverage-cases.json` byte for byte (see its README). Project code was not modified.

## Progress since Phase 1

Sections 1–8 below are the Phase 1 baseline and stay as they were. Each fix branch adds a row here. The numbers come from `audit/harness/run.sh`, and `coverage-cases.json` holds the current verdicts.

| Branch | Root causes fixed | R | C | S (raw) | Corpus WRONG | Spec WRONG |
|---|---|---|---|---|---|---|
| Phase 1 baseline | — | 72.2 | 86.9 % | 7.7 (37.7) | 9 | 42 |
| `fix/class-chain-parse-errors` | RC1, RC6, RC9; RC5 and RC-S3 no longer ship broken chains | 81.6 | 86.9 % | 11.7 (41.7) | 6 | 22 |

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
