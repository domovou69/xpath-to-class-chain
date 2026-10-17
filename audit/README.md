# Audit

Evidence that the converter is correct and measurements of what it gains. Nothing here is part of the npm package; the tool itself is `xpath-to-class-chain.js` and `lib/` in the repository root.

**Start with [`coverage-report.md`](coverage-report.md).** It has the method, every result and the conclusions. Everything else in this folder is the data and the scripts behind it.

## Results

| | |
| --- | --- |
| Real locators (R) | 96.0 of 100, the maximum of the scoring: 39 positions have only an approximation |
| Edge cases (S) | 93.6 of 100, also the maximum |
| Wrong chains | 0, on the WDA emulator and on a simulator and an iPhone |
| Lookup time | class chain 22–29 % faster at 100–2000 elements in the tree |

## What is where

| Path | What it is |
| --- | --- |
| [`coverage-report.md`](coverage-report.md) | The report: method, results, device checks, speed, LLM comparison |
| [`coverage-cases.json`](coverage-cases.json) | All 678 locators with the converter's chain and the verdict for each |
| [`corpus/`](corpus) | The 563 real locators (anonymized) and the scanner test files (Java, Python, JS, TS) |
| [`harness/`](harness) | mini-WDA: WebDriverAgent's own class chain and XPath code compiled for macOS, the edge cases (`speccases.js`) and the scripts that score the converter. `./run.sh` reproduces the report's numbers ([README](harness/README.md)) |
| [`device/`](device) | The LocatorLab test app and the runs on an iOS simulator and an iPhone: correctness and lookup time ([README](device/README.md)) |
| [`llm/`](llm) | Claude models converting the same locators, scored the same way: prompts, raw answers, scores ([README](llm/README.md)) |
| [`upstream/`](upstream), [`upstream.json`](upstream.json) | The monthly upstream watch: which Appium, driver and WDA files are watched, the checked versions, and the GitHub Action that emails an issue when a release may affect the converter ([README](upstream/README.md)) |
| `*.svg` | Charts used in the main README and the report |
| [`prompts/`](prompts), [`PLAN.md`](PLAN.md) | The audit brief and the work plan, kept for history |

Versions used throughout: Appium 3.8.0, appium-xcuitest-driver 12.16.0, WebDriverAgent 16.14.1 (kept in [`upstream.json`](upstream.json) `checked`).
