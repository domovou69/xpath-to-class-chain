# Refactoring playbook for skipped locators

Use this when `scripts/convert.js` reports a status other than `success`. Every suggestion stays within iOS Class Chain; do not suggest `-ios predicate string`. Code samples are illustrative. Write them in the language and framework of the user's test code.

## Order of preference

1. **An accessibility identifier.** If the app team can add `accessibilityIdentifier` (UIKit) or `.accessibilityIdentifier(...)` (SwiftUI) to the target, the locator becomes ``**/XCUIElementTypeButton[`name == "checkout.pay"`]`` or the `accessibility id` strategy. This is the most stable fix and removes the structural XPath entirely. Say who has to make the change (the app code, not the test code).
2. **A rewritten single chain** that selects the same element by a different path. This is valid only when the user confirms the screen structure (page source), because the new path is not equivalent in general.
3. **Two lookups in the test code**: find an anchor element with one chain, then search inside it. A class chain lookup from an element is scoped to its descendants.
4. **Keep the XPath** and say so, when none of the above is exact. A correct XPath is better than a fast chain that finds the wrong element.

## By construct

| Skip reason (engine) | Advice |
|---|---|
| `following-sibling::` / `preceding-sibling::` (label next to a field, button after a title) | Find the common container that holds both elements and select the target inside it: `**/XCUIElementTypeCell[$type == "XCUIElementTypeStaticText" AND name == "Title"$]/XCUIElementTypeButton`. Only if the user confirms the target is a direct child of that container. Better: give the target its own identifier. |
| `parent::` / `..` / `ancestor::` with an index | Select the container directly by its own attributes, or use `[$…$]` on the container with a *different* inner type: `**/XCUIElementTypeCell[$type == "XCUIElementTypeStaticText" AND name == "Item 3"$]`. |
| Descendant predicate that would match the element itself (`//Cell[.//*[@name="x"]]`) | Name the inner type so that it differs from the outer one: `**/XCUIElementTypeCell[$type == "XCUIElementTypeStaticText" AND name == "x"$]`. Confirm the inner type on the page source. |
| `last()` / `position()` inside a step, index before a filter | Filter first, then index the filtered list: ``**/XCUIElementTypeCell[`name BEGINSWITH "row"`][-1]``. Explain that this counts the filtered matches breadth-first, not per parent; it is a different locator, not a conversion. Or find all matches in test code and pick by index there. |
| Grouped position with a warning (`(//X)[n]`) | Converted, but check on the screen. If the matches sit at different depths, anchor the index to their common parent: `**/XCUIElementTypeTable/XCUIElementTypeCell[3]`. |
| Union `a \| b` | Look up both chains in test code and take the first found, or split into two locators with their own names. |
| `normalize-space()` | Ask whether the label really holds extra whitespace. If not, use `==`. If it does, fix the label in the app or keep the XPath. |
| `string-length()` | No chain form. Keep the XPath or test the length in code after the lookup. |
| `matches()` beyond the converted forms | Keep the XPath, or replace the regex with `BEGINSWITH` / `CONTAINS` if the user accepts a looser match. |
| Numeric comparison on text (`@value>5`) | Read the value in test code and compare there. |
| Unknown attribute (`@text`, `@selected`) | `@text` is `label` or `value` on iOS. `@selected` is not in WDA's page source; use `value` if the control reports state there (switches report `"1"` / `"0"`). Confirm on the page source. |
| Unknown element type (`XCUIElementTypeLabel`) | Use the real type (`XCUIElementTypeStaticText`). Confirm on the page source. |
| `skipped_xpath_strategy` (`AppiumBy.xpath("…")`) | Convert the string with the script, then change the call to the class chain strategy in the same edit: Java `AppiumBy.iOSClassChain("**/…")`, Python `AppiumBy.IOS_CLASS_CHAIN`, WebdriverIO `$('-ios class chain:**/…')`. Note the prefix: the strategy call takes the chain without `-ios class chain:`. |
| `skipped_validation_failed` on an existing chain | Show the validator's reason and the fixed chain if one is obvious; otherwise ask for the page source. |

## Two lookups in test code

WebdriverIO:

```js
const cell = await $('-ios class chain:**/XCUIElementTypeCell[`name == "Order 42"`]');
const pay = await cell.$('-ios class chain:**/XCUIElementTypeButton[`label == "Pay"`]');
```

Java (java-client):

```java
WebElement cell = driver.findElement(AppiumBy.iOSClassChain("**/XCUIElementTypeCell[`name == \"Order 42\"`]"));
WebElement pay = cell.findElement(AppiumBy.iOSClassChain("**/XCUIElementTypeButton[`label == \"Pay\"`]"));
```

Python (Appium-Python-Client):

```python
cell = driver.find_element(AppiumBy.IOS_CLASS_CHAIN, '**/XCUIElementTypeCell[`name == "Order 42"`]')
pay = cell.find_element(AppiumBy.IOS_CLASS_CHAIN, '**/XCUIElementTypeButton[`label == "Pay"`]')
```

This replaces sibling and parent navigation when the target and its anchor share a container. It costs one more round trip.
