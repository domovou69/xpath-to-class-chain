---
title: "XPath to iOS Class Chain: 25 % faster lookups, checked against the real WebDriverAgent"
published: false
description: "I built a converter from Appium XPath locators to iOS Class Chain, audited it on 676 locators against WDA's own code, a simulator and an iPhone, and measured how lookup time grows with the size of the screen."
tags: ios, appium, testing, automation
# cover_image: upload img/scale-chart.png (or a separate cover) in the dev.to editor
---

<!--
Images: dev.to does not take relative paths. Upload the PNGs from docs/articles/img/
in the editor (or use their raw GitHub URLs) and replace the paths below.
All numbers come from audit/coverage-report.md and audit/device/results-scale-*.json.
-->

If you run Appium tests on iOS, you have probably heard that XPath is slow and that `-ios class chain` is the faster alternative. I wanted two things that I could not find written down anywhere:

1. a tool that converts existing XPath locators to class chain **without silently changing which element they find**, and
2. a number: how much faster is it, really, and does that change with the size of the screen?

This post is about both. The tool is open source: [xpath-to-class-chain](https://github.com/domovou69/xpath-to-class-chain).

## TL;DR

- On a synthetic checkout screen, a class chain lookup was **22–29 % faster** than the same XPath lookup, at every tree size from 100 to 2000 elements, on a simulator and on an iPhone. It was faster in **all 240** timed lookups.
- In absolute terms the saving grows with the tree: **70 ms → 676 ms per lookup** on an iPhone 13 Pro Max.
- About **87 %** of real-world XPath locators can be expressed as a class chain at all. The rest should stay XPath.
- The converter was audited against code compiled from WebDriverAgent itself and then on devices. It currently sends **no wrong chains**; the locators it cannot convert exactly are either skipped with a reason or flagged with a warning.

```bash
npx github:domovou69/xpath-to-class-chain ./tests          # preview the diff
npx github:domovou69/xpath-to-class-chain ./tests --write  # apply it
```

## Why converting by hand goes wrong

A class chain looks like XPath with different punctuation:

```text
//XCUIElementTypeCell[@name="Total"]/XCUIElementTypeButton
**/XCUIElementTypeCell[`name == "Total"`]/XCUIElementTypeButton
```

But the two languages disagree in ways that are easy to miss:

- **Positions mean different things.** In XPath, `//Button[2]` is "every Button that is the 2nd Button child of its parent" and can match many elements. In a class chain, `**/Button[2]` is "the 2nd element of the matched set", one element at most.
- **Grouped positions count in a different order.** `(//Button)[2]` counts matches in document order. WDA returns class chain matches in XCTest query order, which is breadth-first. A shallower button further down the screen can win. No class chain counts in document order, so there is no exact conversion.
- **Text comparison is not the same.** `==` compares code points like XPath, but `CONTAINS`, `BEGINSWITH`, `MATCHES` and `[c]` compare normalized text (on iOS 27, `MATCHES` treats a fullwidth `Ｑ` as `Q`).
- **A broken chain looks like a missing element.** appium-xcuitest-driver catches WDA's `invalid selector` error, so `findElements` returns `[]` and `findElement` fails with "no such element". A typo in a hand-written chain shows up as a flaky test, not as a syntax error.

That last point is why I did not want a converter that "mostly works". A wrong chain does not fail loudly.

## What the tool does

It scans a folder (JS/TS, Java, Kotlin, Python, Ruby, C#, PHP, JSON…), finds XPath locators, converts each one and prints a `- old / + new` diff. With `--write` it saves the files.

- It **validates** every chain it emits and **skips** what it cannot convert exactly, with a reason in the report (sibling/parent/following axes, unions of different paths, `normalize-space()`, numeric comparison on text, and so on).
- It **warns** where the only possible chain is an approximation, e.g. grouped positions.
- It **does not touch** strings passed to an explicit XPath strategy (`AppiumBy.xpath("…")`, `@iOSXCUITFindBy(xpath = …)`, `find_element(AppiumBy.XPATH, …)`): rewriting the string while the strategy stays XPath would break every such locator.
- An optimizer pass merges predicate blocks, folds `concat()` of literals, turns `lower-case(@label)="ok"` into `label ==[c] "ok"` and `contains(upper-case(@label),"OK")` into `label CONTAINS[c] "OK"`, etc.

## How I checked that it is right

I did not want verdicts based on reading my own code. Every verdict comes from running both locators and comparing what they find.

**1. A WDA-in-a-box ("mini-WDA").** I compiled WebDriverAgent's class chain parser, predicate mapping and XPath code from the `v16.14.1` tag and ran them on macOS with libxml2, the same library WDA uses. It passes all 43 queries from WDA's own `FBClassChainTests`.

**2. Two test sets.**

- 563 real locators from production test suites (anonymized), each run against 200 random page sources built from its own literals and element types.
- 115 hand-made edge cases (positions, axes, functions, quoting, booleans, unicode), each with fixtures and a hand-written "correct" chain.

XPath and class chain had to return the same set of elements and the same first element.

**3. Devices.** 246 selected cases ran on a purpose-built SwiftUI app under real Appium 3.8.0, appium-xcuitest-driver 12.16.0 and WDA 16.14.1, first on an iOS 27 simulator, then on an iPhone 13 Pro Max (iOS 26.6). Where the device disagreed with mini-WDA, the device won, and the emulator was corrected. That is how the breadth-first ordering above was found.

**Scores.** R is the share of real locators that got a correct chain, out of those that have one; S is the same on the edge cases, weighted by group. A documented approximation (a case with no exact class chain) counts half.

|                                           | First audit | Now      |
| ----------------------------------------- | ----------- | -------- |
| R, real locators                          | 72.2        | **96.0** |
| S, edge cases                             | 7.7         | **93.6** |
| Root causes of wrong chains (real / edge) | 9 / 42      | 0 / 0    |

96.0 and 93.6 are the ceiling of the scoring, not a gap: the remaining points are grouped and per-parent positions that have no exact class chain. They are converted with a warning and earn half credit.

The first audit found 15+ bug classes. The worst one: in Java and Python projects the scanner rewrote strings inside `By.xpath(...)` calls, which broke every one of them. Others were silent: `[a or b][c]` lost its parentheses, `[.//Button[@name="x"]]` was flattened onto the outer element, a literal `*` became a wildcard. Each was fixed with a test and rechecked on the harness.

## How much faster is it?

Small test screens (36–275 elements) showed the chain about 20 % faster on the median lookup, but only by tens of milliseconds. So I measured what happens when the screen grows.

**Setup.** One synthetic Checkout page with 100 target elements, plus extra elements around it: stacked screens underneath, a long feed below the fold, an off-screen drawer and kept-alive tabs, for 100, 500, 1000 and 2000 elements in total. Ten of the most common locator shapes from the real corpus (about 340 of its 460 XPath locators), each on three targets: top of the page, depth 39, end of the page. Every lookup is one cold `findElement`, XPath and chain alternate, median of three passes. Before timing, both had to return the same single element.

![Time per element lookup vs. elements in the tree, XPath and class chain, simulator and iPhone](img/scale-chart.png)

| Elements in the tree | Simulator, XPath → chain | Saved  | iPhone, XPath → chain | Saved  |
| -------------------- | ------------------------ | ------ | --------------------- | ------ |
| ~100                 | 115 → 90 ms              | 21.9 % | 295 → 225 ms          | 23.8 % |
| ~500                 | 453 → 344 ms             | 24.1 % | 760 → 582 ms          | 23.4 % |
| ~1000                | 912 → 677 ms             | 25.8 % | 1.40 s → 997 ms       | 28.9 % |
| ~2000                | 1.75 → 1.31 s            | 25.4 % | 2.72 → 2.04 s         | 24.9 % |

What I took from it:

1. **The saving in percent does not depend on the tree size** (22–29 %). The saving in time grows linearly with it, because both strategies pay for the whole tree on every lookup.
2. **The shape of the locator and the position of the target did not matter.** A button at the top of the page cost as much as one at depth 39.
3. **`[1]` and `useFirstMatch` do not help.** An explicit `[1]` goes through the same code path in WDA 16.14.1. `useFirstMatch` was 2.7 % faster at 100 elements and 5.7 % slower at 2000 (15 % slower for deep targets).
4. **Nothing deeper than 50 levels is found** by either strategy (WDA's default `snapshotMaxDepth`), and the error is a plain "no such element".
5. **A real iPhone is 1.5–2.6× slower than the simulator**, mostly a fixed per-request cost over USB. The ratio between XPath and chain stays the same.

## Where the chain is slower

Not everything got faster. On the small test screens four shapes were slower as a chain:

| Locator                                                                   | XPath  | Chain  |
| ------------------------------------------------------------------------- | ------ | ------ |
| `//XCUIElementTypeButton[@visible='true']`, 32 matches                    | 2.05 s | 12.6 s |
| `//XCUIElementTypeCell[@visible="true"]/XCUIElementTypeButton`            | 3.46 s | 5.14 s |
| `//XCUIElementTypeButton[@name]`, 36 matches                              | 1.15 s | 1.78 s |
| `/XCUIElementTypeApplication/XCUIElementTypeWindow/XCUIElementTypeButton` | 0.12 s | 0.75 s |

(simulator; the iPhone showed the same pattern)

`visible` is the main trap: WDA reads visibility for each candidate. My rule of thumb now: **convert lookups of one element by name, label, value or type; check `visible` predicates, list lookups with dozens of matches and absolute paths before converting them.**

## Limits

- Only the lookup is timed. With implicit waits or retry loops, a lookup that misses repeats the whole search, so the real saving per test is the per-lookup number times the number of attempts. I did not measure whole tests.
- The big screen is synthetic; no production app was measured.
- One WDA version (16.14.1). Its class chain lookup was changed recently (appium/WebDriverAgent PR #1194), so other versions may give other numbers.
- One phone and one Mac (M1 Pro). Absolute times will differ on yours; the ratio should not.

## Try it

```bash
npx github:domovou69/xpath-to-class-chain ./tests          # preview
npx github:domovou69/xpath-to-class-chain ./tests --write  # save
npx github:domovou69/xpath-to-class-chain ./tests --json   # report with every skip and warning
```

Review the warnings, run your suite, and check anything with a grouped position or `visible` on the screen it is used on. The full audit, the harness and the device app are in the repo, with every number in this post reproducible from [`audit/`](https://github.com/domovou69/xpath-to-class-chain/tree/main/audit).

## Next: can an LLM do this instead?

Converting locators looks like a perfect job for an LLM, so in the next post I gave the same 678 locators to Claude models and scored their answers with the same harness:

- Opus, Sonnet and Haiku 5.5 at every effort level from `low` to `max`, plus the previous generations (Opus 5, Sonnet 5, Opus 4.6, Sonnet 4.6, Haiku 4.5);
- a plain "convert these" request against a prompt with the rules from this post;
- quality against cost and time per run.

Short version: no model beat the converter on real locators, higher effort did not buy what it cost, and the rules prompt mattered more than the model. The details, and where the models were actually useful, are in part 2.

---

*I'm [Mikhail Yesipchuk](<YOUR-LINKEDIN-URL>) and I work on mobile test automation. If you try the converter on your suite, I'd like to hear what it skipped and why: open an issue on [GitHub](https://github.com/domovou69/xpath-to-class-chain/issues) or message me on [LinkedIn](<YOUR-LINKEDIN-URL>).*
