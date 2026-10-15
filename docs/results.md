# Results

Measured on 676 real and hand-made XPath locators (562 from real test suites, 114 edge cases) against a WebDriverAgent-compatible oracle, and on a simulator and an iPhone. Full method and numbers: [`audit/coverage-report.md`](../audit/coverage-report.md).

**Two ways to convert**

|                | This converter                                                                                        | An LLM with the rules prompt (prompt-v4)                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Cost and speed | free, offline, seconds                                                                                | Opus at `low` effort, about $1.7 and 5 minutes for the whole list (one batch run)                            |
| How            | `npx xpath-to-class-chain ./tests`                                                                    | give the model [`audit/llm/prompt-v4-run.md`](../audit/llm/prompt-v4-run.md) and your locator list              |
| Wrong chains   | none                                                                                                  | none for Opus 5.5 and Sonnet 5.5; Haiku 5.5 sent 5                                                           |
| Best result    | **The converter is the maximum**: it converted 579 of 676 locators and skipped the rest with a reason | 560 of 676, i.e. 96.7 % of what the converter converted; nothing the converter misses was found by the model |

**Recommendation:** use the converter. It is free, deterministic, and no model beat it on any case. Use an LLM only for the locators the converter skips on purpose, and check each chain it returns (with the harness in [`audit/harness`](../audit/harness) or on a device) before replacing the XPath: the model's answers were judged by an emulator, not by a device.

**Final results** (one run per model; "plain" is a plain request to convert the locators, "with rules" adds the rules prompt `prompt-v4`; R and S defined below the table):

|                                                | R, real locators | S, edge cases | Converted vs the converter | Wrong or invalid chains | Time, min | Output tokens (thinking) | Cost per run (678 locators) |
| ---------------------------------------------- | ---------------- | ------------- | -------------------------- | ----------------------- | --------- | ------------------------ | --------------------------- |
| **Converter (maximum)**                        | **96.0**         | **93.6**      | 100 %                      | 0                       | —         | —                        | free                        |
| Opus 5.5 low, plain                            | 95.1             | 81.9          | 96.7 %                     | 4                       | 7.1       | 57k (14k)                | $2.04                       |
| Opus 5.5 low, with rules                       | 95.0 (−0.1)      | 86.9 (+5.0)   | 96.7 % (±0)                | 0 (−4)                  | 5.1 (−2.0) | 45k (4k), −12k           | $1.72 (−$0.32)              |
| Sonnet 5.5 low, plain                          | 94.8             | 68.5          | 95.9 %                     | 7                       | 5.2       | 58k (15k)                | $1.03                       |
| Sonnet 5.5 low, with rules                     | 95.0 (+0.2)      | 84.7 (+16.2)  | 96.4 % (+0.5)              | 0 (−7)                  | 8.9 (+3.7) | 93k (32k), +35k          | $1.58 (+$0.55)              |
| Haiku 5.5 medium, plain                        | 94.1             | 63.6          | 93.8 %                     | 4                       | 6.0       | 99k (45k)                | $0.28                       |
| Haiku 5.5 medium, with rules                   | 94.8 (+0.7)      | 72.0 (+8.4)   | 95.7 % (+1.9)              | 5 (+1)                  | 5.7 (−0.3) | 102k (45k), +3k          | $0.27 (−$0.01)              |
| Sonnet 5 low, plain ¹                          | 95.2             | 56.5          | 94.5 %                     | 12                      | 21.8      | 140k (81k)               | $2.27                       |
| Sonnet 4.6 low, plain, in chunks ²             | 89.1            | 48.9          | 86.5 %                     | 39                      | 23.1      | ≈100k (51k)              | $2.58                       |
| Haiku 4.5 medium, plain ³                      | 59.6             | 18.1          | 53.7 %                     | 59                      | 6.0       | 44k (3k)                 | $0.61                       |

In brackets on the "with rules" rows: the difference from the same model's "plain" row. For wrong chains, time, tokens and cost, a minus is better.

¹ Sonnet 5: took 21.8 min and 140k output tokens (81k thinking) against 5.2 min and 58k / 15k for Sonnet 5.5 in the same plain request.

² Sonnet 4.6: not the same conditions. It got seven separate runs of 100 locators (the other models get the whole file at once), because the single full-file run wrote nothing in 20 minutes and was stopped. Time and cost are the sum of the seven runs.

³ Haiku 4.5: in all three runs it wrote a Python converter instead of converting the locators itself. Only one run (shown) ran its script and returned all 678 answers; the other two answered 100 of 678 and none, and asked to run the script themselves.

**R** is the share of real-world locators that got a correct chain, out of those that have one (a documented approximation counts half; a skipped, wrong or invalid one counts 0). **S** is the same score on the 114 edge cases, weighted by group. Both are out of 100. "Converted vs the converter" counts usable chains against the 579 the converter produces. One run per model, so differences of about 3 points in S are noise. The converter's 96.0 and 93.6 are the ceiling of this scheme, not a shortfall: the locators it cannot convert exactly (grouped and per-parent positions, `(…/child::*[2])[n]`, nested matching containers) have no exact class chain, so a documented approximation earns half credit.

The same results as a chart: S against cost per run for the plain request (dots) and for the rules prompt (rings, joined to the same model by a dashed line).

![Quality vs cost, plain request and rules prompt](../audit/llm-chart-plain.svg)

Effort levels of the three 5.5 models on the plain request: a higher effort does not pay. Opus is flat from `low`, Sonnet gains most from `low` to `medium` and only 2.7 more at `max` for 4.6× the cost, Haiku is best at `medium`.

![Quality vs cost by effort level, plain request](../audit/llm-chart-efforts.svg)

**Lookup speed.** A class chain is faster than the XPath it replaces, and the gain grows with the page: on a simulator and an iPhone 13 Pro Max it saved 22–29 % per lookup at every size from 100 to 2000 elements in the tree, which is 25 ms at 100 elements on the simulator and 676 ms at 2000 on the iPhone. The chain was faster in all 240 timed lookups.

![Time per element lookup vs. elements in the tree, XPath and class chain, simulator and iPhone](../audit/scale-chart.svg)

Caveat: `visible` on the last step can be much slower as a chain; see [On the device](reference.md#on-the-device).

**What this state was checked on** (October 2026; re-check when any of it changes):

|                        | Version                                                                 |
| ---------------------- | ----------------------------------------------------------------------- |
| Appium                 | 3.8.0                                                                   |
| appium-xcuitest-driver | 12.16.0                                                                 |
| WebDriverAgent         | 16.14.1                                                                 |
| iOS                    | 27.0 simulator (iPhone 17) and iOS 26.6 iPhone 13 Pro Max; same results |
| Xcode                  | 27.0                                                                    |
| Node.js                | 20 or later (run on 24)                                                 |
| Models with rules      | `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`              |
