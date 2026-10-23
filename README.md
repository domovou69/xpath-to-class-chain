# xpath-to-class-chain

[![CI](https://github.com/domovou69/xpath-to-class-chain/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/domovou69/xpath-to-class-chain/actions/workflows/test.yml)
[![npm](https://img.shields.io/npm/v/xpath-to-class-chain)](https://www.npmjs.com/package/xpath-to-class-chain)

Converts Appium XPath locators in your iOS tests to `-ios class chain` selectors, and refuses to convert the ones that have no exact class chain.

## Try it

Nothing to install. The bare command only previews; review the diff, then add `--write`.

```bash
npx xpath-to-class-chain ./tests            # preview
npx xpath-to-class-chain ./tests --write    # save it
npx xpath-to-class-chain ./tests --json     # report with every skip and warning
```

Point `./tests` at the folder with your Appium/XCUITest code (JS/TS, Java, Kotlin, Python, Ruby, C#, PHP, JSON, YAML…). Requires Node.js 20 or newer; no dependencies.

Or try single XPaths in the [playground](https://domovou69.github.io/xpath-to-class-chain/), in the browser.

```text
- //XCUIElementTypeStaticText[@name="Order total"]
+ -ios class chain:**/XCUIElementTypeStaticText[`name == "Order total"`]

- //*[contains(@type,"XCUIElementTypeButton") and contains(@label,"Add to cart")]
+ -ios class chain:**/XCUIElementTypeButton[`label CONTAINS "Add to cart"`]

- (//XCUIElementTypeButton[@name="product.addToCart"])[2]
+ -ios class chain:**/XCUIElementTypeButton[`name == "product.addToCart"`][2]
! grouped position: WDA counts class chain matches breadth-first, XPath in document order,
  so the element can differ when matches sit at different depths

[skip] skipped_unsupported_logic: //*[@name="Total:"]/following-sibling::*[1]
```

## What it does

- **Converts** each XPath it can express exactly and validates every chain it emits.
- **Skips** what has no exact class chain, with a reason: sibling, parent and following axes, unions of different paths, `normalize-space()`, numeric comparison on text, and more.
- **Warns** where only an approximation exists, such as grouped positions `(//X)[n]`.
- **Leaves alone** strings passed to an explicit XPath strategy (`AppiumBy.xpath("…")`, `@iOSXCUITFindBy(xpath = …)`, `find_element(AppiumBy.XPATH, …)`), because rewriting them would break the locator.
- **Optimizes** the chain: merges predicates, folds `concat()`, turns `lower-case(@label)="ok"` into `label ==[c] "ok"`.

## Results

Checked on 1502 locators (1387 from 23 real test suites in 7 languages, 115 edge cases) against WebDriverAgent's own code, then on an iOS simulator and an iPhone.

- **0 wrong chains.** 85 % of the real locators have a class chain, and the converter gets the maximum score on them.
- **Faster lookups:** class chain is 22–29 % faster than XPath at 100–2000 elements in the tree. Exception: `visible` on the last step can be much slower as a chain.
- **Checked with** Appium 3.8.0, appium-xcuitest-driver 12.16.0, WDA 16.14.1, iOS 26.6 and 27.0. Older versions were not checked.

Full numbers, the LLM comparison and charts: [docs/results.md](docs/results.md).

## Use it as a library

```js
const { convertXpathToClassChain, STATUS } = require("xpath-to-class-chain");

const { locator, status } = convertXpathToClassChain(
  '//XCUIElementTypeButton[@name="a" and @enabled="true"]',
  { optimize: true },
);
// status === STATUS.SUCCESS
// locator === '-ios class chain:**/XCUIElementTypeButton[`name == "a" AND enabled == true`]'
```

Install globally to run it without `npx`: `npm install -g xpath-to-class-chain`.

## Documentation

- [Reference](docs/reference.md): flags, what gets converted and skipped, the optimizer, the JSON report, device findings, library API, the Claude Code skill, tests
- [Results](docs/results.md): scores by source, LLM comparison, lookup speed, versions checked
- [Audit](audit/README.md): how correctness was proven, with all data and scripts
- [Articles](docs/articles/README.md): two dev.to articles on the checks and on Claude against the converter

## License

MIT
