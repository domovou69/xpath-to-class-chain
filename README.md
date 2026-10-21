# xpath-to-class-chain

[![CI](https://github.com/domovou69/xpath-to-class-chain/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/domovou69/xpath-to-class-chain/actions/workflows/test.yml)
[![npm](https://img.shields.io/npm/v/xpath-to-class-chain)](https://www.npmjs.com/package/xpath-to-class-chain)

Converts Appium XPath locators in your iOS tests to `-ios class chain` selectors, and refuses to convert the ones that have no exact class chain.

**Articles on dev.to:**

- [XPath to iOS Class Chain: a converter you can trust, and when it is actually faster](https://dev.to/mikhail_yesipchuk/xpath-to-ios-class-chain-a-converter-you-can-trust-and-when-it-is-actually-faster-c6o): how the converter is checked, and how much faster class chain is on big screens
- [XPath to iOS Class Chain: can Claude do it instead of a converter?](https://dev.to/mikhail_yesipchuk/xpath-to-ios-class-chain-can-claude-do-it-instead-of-a-converter-17m9): Claude models of three generations (5.5 > 5 > 4.X) against the converter on the same locators

## Try it

Nothing to install. The bare command only previews; review the diff, then add `--write`.

```bash
npx xpath-to-class-chain ./tests            # preview
npx xpath-to-class-chain ./tests --write    # save it
npx xpath-to-class-chain ./tests --json     # report with every skip and warning
```

Point `./tests` at the folder with your Appium/XCUITest code (JS/TS, Java, Kotlin, Python, Ruby, C#, PHP, JSON, YAML…). Requires Node.js 20 or newer; no dependencies.

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

|                                       |                                                                                                            |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Real locators that have a class chain | 1180 of 1387 (85 %)                                                                                        |
| Score on real locators / edge cases   | 91.9 / 93.6 of 100, the maximum: positions like `(//X)[2]` only have an approximation (one production suite 96.0, 22 GitHub projects 89.1) |
| Wrong chains                          | 0                                                                                                          |
| Lookup time                           | class chain 22–29 % faster than XPath at 100–2000 elements in the tree; on small screens only milliseconds |
| LLMs (Claude 5.5, 5, 4.x)             | none beat the converter on real locators (the 563 of the production suite)                                 |
| Checked with                          | Appium 3.8.0, appium-xcuitest-driver 12.16.0, WDA 16.14.1 (latest in October 2026); iOS 26.6 and 27.0      |

Older versions were not checked: WDA's class chain and predicate handling may behave differently there. Before converting, check `visible` predicates and lookups of dozens of elements: they can be slower as a chain. Full results, charts and the LLM comparison: [docs/results.md](docs/results.md). Method and evidence: [audit/](audit/README.md).

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

## Claude Code skill

[`.claude/skills/xpath-to-class-chain/`](.claude/skills/xpath-to-class-chain/SKILL.md) wraps the converter for Claude Code: it runs the converter first, then explains each skipped locator and suggests a fix that stays within class chain. Copy the folder to `~/.claude/skills/` and install the package to use it in another project.

## Documentation

- [Reference](docs/reference.md): flags, what gets converted and skipped, the optimizer, the JSON report, device findings, library API, tests
- [Results](docs/results.md): scores, LLM comparison, lookup speed, versions checked
- [Audit](audit/README.md): how correctness was proven, with all data and scripts

## License

MIT
