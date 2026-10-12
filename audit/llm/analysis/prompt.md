The files in the current folder are the scored results of an experiment: language models were asked to convert 678 XPath locators (Appium, iOS, XCUITest driver) to iOS class chain locators, and a deterministic converter did the same. Every answer was already judged by running it: the chain and the XPath were evaluated on the same 200–300 page sources in a build of WebDriverAgent 16.14.1 code, and their results compared. The verdicts are final; do not re-grade them.

- `table.md`: one row per run (model / effort level) and the converter. R and S are scores from 0 to 100 (R: 563 real-world locators, S: a weighted matrix of 115 edge cases); `R=` and `S=` use the converter's denominator for every row, so skipping more cannot raise them. Precision is the share of emitted chains that are right.
- `cross.md`: cases where a model is right and the converter is not, where the converter is right and a model is not, and wrong chains where neither has a right chain.
- `errors.json`: every case where any run or the converter is not right, with each run's verdict, chain or skip reason, the WDA error for INVALID, and a counter-example page for WRONG (element ids are the `k` attributes).

Verdicts: CORRECT (finds the same as the XPath), CORRECT-SKIP (skipped a locator with no exact class chain), GAP (skipped although an exact chain exists), DRIFT (differs in documented edge cases such as positions; half credit), WRONG (finds something else), INVALID (WDA rejects the chain or it throws).

Write `analysis.md` in English with these sections:

1. **Error types.** Group the WRONG, INVALID and GAP answers of the models into types by their cause (for example: escaping in string literals, attribute semantics, positions, descendant predicates, unsupported functions). For each type: what goes wrong and why in class chain / NSPredicate terms, the case ids, and how many runs of each model and effort level make it. Keep the converter's own GAPs and DRIFTs as a separate type list.
2. **Per model and effort.** For each model, how its errors change from effort to effort, and which effort is optimal when results, time and cost are weighed. Say plainly where a higher effort is not better.
3. **Where the converter or the expected labels look wrong.** Cases where models found an exact chain the converter misses (candidates for improving the converter), and cases where the expected label itself looks doubtful (for example a locator marked inexpressible for which a run produced an equal chain). Mark which of these need a check on a real device because the result depends on how XCTest evaluates the predicate.
4. **Top 3.** The three best model / effort pairs for someone converting a real test suite, with the reasons (R=, S=, precision, share converted, time, cost). Also say when the converter alone is the better choice.
5. **An improved prompt.** A prompt for users who convert locators with a model, written to raise precision and the share converted, based on the error types you found. Give general rules (how to escape, what to skip, what has no exact form), not answers for particular cases. Keep it under 300 words.

Base every claim on the files; cite case ids. Be concise: tables and short paragraphs.
