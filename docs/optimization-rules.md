# Optimization rules — design notes

This is the **full research spec** of 14 candidate rules, kept as background for
why the optimizer does what it does. It is **not** a description of what the
optimizer currently does: 6 of the 14 rules are deliberately not implemented
because they need knowledge of the running app's element hierarchy, which a
static source-code rewrite cannot have.

For what actually ships, see [the optimizer section of the README](../README.md#the-optimizer).

| Spec rule | Status | Implementation |
|---|---|---|
| 1. Remove meaningless `XCUIElementTypeOther` chains | ✅ Implemented | `stripMeaninglessIntermediates()` |
| 2. Never index an intermediate step | ❌ Not implemented | Needs app hierarchy knowledge |
| 3. `**/` → `/` for direct-child relationships | ❌ Not implemented | Needs app hierarchy knowledge |
| 4. Collapse `**/**/` → `**/` | ✅ Implemented | `collapseDoublestar()` |
| 5. `XCUIElementTypeAny` → `*` | ✅ Implemented | `normalizeXCUIElementTypeAny()` |
| 6. Merge sibling predicate blocks | ✅ Implemented | `mergeSiblingPredicates()` |
| 7. Defer `visible == 1` to the final step | ✅ Implemented | `deferVisibleToFinalStep()` — see the README caveat, this can change which element matches |
| 8. Strip redundant `type ==` | ✅ Implemented | `stripRedundantTypePredicates()` |
| 9. Parent-contains transform | ❌ Not implemented | Lossy — changes the returned element |
| 10. Tighten string operator (`CONTAINS` → `==`) | ❌ Not implemented | Needs to know if the value is a full match |
| 11. Reorder AND conditions cheapest-first | ✅ Implemented | `reorderAndConditions()` |
| 12. Anchor on nearest stable ancestor | ❌ Not implemented | Needs runtime app structure |
| 13. Drop `[cd]` case modifier | ❌ Not implemented | Needs to know if casing is stable |
| 14. `attr IN {"x"}` → `attr == "x"` | ✅ Implemented | `simplifyInSets()` |

The optimizer also applies one rule that is **not** in this spec: rewriting
wildcard equality (`name == "abc*"`) to `name LIKE "abc*"`, which recovers
chains that would otherwise fail NSPredicate validation outright.

---

HIGH IMPACT

1. Remove meaningless XCUIElementTypeOther ancestor chains
Naive XPath→class chain conversion preserves every intermediate layout wrapper. XCUIElementTypeOther nodes carry no semantic meaning and force XCTest to materialise an intermediate result set at each step.
Before:
**/XCUIElementTypeWindow/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeButton[`name == "Submit"`]
After:
**/XCUIElementTypeButton[`name == "Submit"`]
Keep an intermediate node only when it is a meaningful semantic type (Cell, Table, NavigationBar, ScrollView) with a predicate that genuinely narrows the search space.

2. Never index an intermediate chain step
The official WDA construction rules state explicitly: indexing non-terminal steps forces XCTest to materialise ALL elements of that type before continuing. Only the final step may carry an index.
Before:
**/XCUIElementTypeWindow[1]/XCUIElementTypeScrollView[1]/XCUIElementTypeButton[`name == "Done"`]
After:
**/XCUIElementTypeButton[`name == "Done"`]
Before — index only valid at terminal:
**/XCUIElementTypeTable[1]/XCUIElementTypeCell[2]/XCUIElementTypeStaticText[1]
After:
**/XCUIElementTypeTable/XCUIElementTypeCell[`visible == 1`]/XCUIElementTypeStaticText[1]

3. Replace **/ with / for known direct-child relationships
**/ triggers a full recursive subtree scan. / evaluates only direct children. If the parent→child relationship is structurally guaranteed, use /.
Before:
**/XCUIElementTypeTable/**/XCUIElementTypeCell/**/XCUIElementTypeButton[`name == "Edit"`]
After:
**/XCUIElementTypeTable/XCUIElementTypeCell/XCUIElementTypeButton[`name == "Edit"`]
Use **/ only for the root anchor or when the depth is genuinely unknown.

4. Collapse **/**/ into **/
**/**/ is equivalent to **/. The second double-star adds nothing but still triggers a second recursive scan.
Before:
**/**/XCUIElementTypeButton[`name == "OK"`]
After:
**/XCUIElementTypeButton[`name == "OK"`]
Before — double-star mid-chain:
**/XCUIElementTypeCell[`name == "Row"`]/**/XCUIElementTypeOther/**/XCUIElementTypeLabel
After:
**/XCUIElementTypeCell[`name == "Row"`]/**/XCUIElementTypeLabel

5. Replace * / XCUIElementTypeAny with the concrete type
A wildcard without a predicate returns every element at that level and continues the chain against all of them. Always specify the concrete XCUIElement type as the chain node.
Before:
**/XCUIElementTypeCell/**/*/XCUIElementTypeButton[`name == "x"`]
After:
**/XCUIElementTypeCell/XCUIElementTypeButton[`name == "x"`]
Before — type specified only inside predicate:
**/XCUIElementTypeAny[`type == "XCUIElementTypeButton" AND name == "OK"`]
After:
**/XCUIElementTypeButton[`name == "OK"`]

MEDIUM IMPACT

6. Collapse multiple predicate blocks on the same step into one
Two consecutive [...] blocks on a single step are not treated as two AND conditions. The engine can interpret the second bracket as an index, silently changing which element is selected. It also runs two separate evaluation passes.
Before:
**/XCUIElementTypeCell[`name == "Account"`][`visible == 1`]
After:
**/XCUIElementTypeCell[`name == "Account" AND visible == 1`]
Always merge multiple conditions on the same step into a single predicate block.

7. Defer visible == 1 to the final target step only
Evaluating visibility triggers a layout pass per element. On intermediate steps this means a layout pass for every candidate before the chain continues. Intermediate ancestors being present in the tree is sufficient — only the target element needs to be visible.
Before:
**/XCUIElementTypeTable[`visible == 1`]/XCUIElementTypeCell[`visible == 1`]/XCUIElementTypeButton[`name == "Submit"`]
After:
**/XCUIElementTypeTable/XCUIElementTypeCell/XCUIElementTypeButton[`name == "Submit" AND visible == 1`]

8. Remove type == inside the predicate when the chain node already specifies that type
XCTest pre-filters by type at the chain node level before evaluating the predicate. Adding type == '...' inside backticks on the same node is a redundant check run against every candidate that already passed the type filter.
Before:
**/XCUIElementTypeButton[`type == "XCUIElementTypeButton" AND name == "OK"`]
After:
**/XCUIElementTypeButton[`name == "OK"`]

9. Use $...$ containing predicate instead of appending a child step for existence checks
Appending a child step to check for a child's presence creates two separate XCTest queries. $...$ performs the child existence check as part of the parent query in one native call.
Before — two queries, returns the image not the cell:
**/XCUIElementTypeCell/XCUIElementTypeImage[`name == "checkmark"`]
After — one query, returns the cell directly:
**/XCUIElementTypeCell[$name == "checkmark" AND type == "XCUIElementTypeImage"$]
Use $...$ whenever the goal is to find a parent that contains a specific descendant.

10. Use the tightest string operator that works
String operators evaluate in cost order. Use the most restrictive operator that still matches your element.
Order fastest to slowest: == → BEGINSWITH → ENDSWITH → CONTAINS → LIKE → MATCHES
Before — substring scan for a full known string:
**/XCUIElementTypeButton[`name CONTAINS "Settings"`]
After:
**/XCUIElementTypeButton[`name == "Settings"`]
Before — CONTAINS for a stable prefix:
**/XCUIElementTypeCell[`label CONTAINS "Profile"`]
After:
**/XCUIElementTypeCell[`label BEGINSWITH "Profile"`]

11. Order AND conditions cheapest-first inside predicate blocks
Compound AND predicates short-circuit on the first false condition, evaluated left to right. Put the cheapest, most selective check first.
Order: == / != → BEGINSWITH → ENDSWITH → CONTAINS → LIKE → MATCHES
Before:
**/XCUIElementTypeCell[`label CONTAINS "due" AND name == "task_42"`]
After:
**/XCUIElementTypeCell[`name == "task_42" AND label CONTAINS "due"`]

12. Anchor on the nearest stable ancestor; do not scan from tree root
Both the full absolute path from XCUIElementTypeWindow and an unconstrained **/ from the driver root scan the entire application hierarchy. Use the nearest semantically meaningful ancestor as the anchor.
Before — full absolute path from root:
XCUIElementTypeWindow/XCUIElementTypeOther/XCUIElementTypeScrollView/XCUIElementTypeOther/XCUIElementTypeTable/XCUIElementTypeCell[3]/XCUIElementTypeStaticText
After:
**/XCUIElementTypeTable/XCUIElementTypeCell[3]/XCUIElementTypeStaticText
Before — unconstrained root scan for a button that always lives in a NavigationBar:
**/XCUIElementTypeButton[`name == "Save"`]
After:
**/XCUIElementTypeNavigationBar/XCUIElementTypeButton[`name == "Save"`]

LOW IMPACT

13. Drop [cd] case-insensitive modifier when casing is known and stable
[cd] forces Unicode normalization on every candidate string before comparison. Remove it when the value being matched has a guaranteed, stable casing.
Before:
**/XCUIElementTypeStaticText[`label CONTAINS[cd] "settings"`]
After:
**/XCUIElementTypeStaticText[`label CONTAINS "Settings"`]
Keep [cd] only for genuinely unpredictable casing — user-generated content or locale-dependent strings.

14. Replace IN with a single-element set with ==
IN {'XCUIElementTypeButton'} with one element is a set iteration where a direct equality check is both cheaper and clearer.
Before:
**/XCUIElementTypeAny[`type IN {"XCUIElementTypeButton"} AND name == "Done"`]
After:
**/XCUIElementTypeButton[`name == "Done"`]
Note: this also eliminates the wildcard type — move the type to the chain node per rule 5. Keep IN only when the set genuinely has two or more values.
