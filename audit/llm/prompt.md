`input.json` in the current folder has 678 XPath locators from iOS UI tests (Appium, XCUITest driver). Convert each one to an iOS class chain locator (`-ios class chain`) that finds the same elements. If a locator cannot be expressed as a class chain that finds the same elements, skip it and give the reason.

Write the result to `output.json` in the current folder: a JSON array with one entry per input `id`, either

```json
{ "id": "x001", "chain": "-ios class chain:**/XCUIElementTypeButton[`name == \"OK\"`]" }
```

or

```json
{ "id": "x002", "skip": true, "reason": "..." }
```

Write each chain as the full locator string, with the `-ios class chain:` prefix. If the result is too large for one file, write it in parts as `output-1.json`, `output-2.json`, …; the parts are merged after you finish. Every id must be present in the end.
