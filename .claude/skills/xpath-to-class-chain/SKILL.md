---
name: xpath-to-class-chain
description: Deterministic XPath to iOS Class Chain converter with AI-powered fallback and review for WDA edge cases and unsupported constructions. Use when the user asks to "convert xpath to class chain", "migrate locators to ios class chain", "refactor page object locators for ios", or otherwise wants Appium/XCUITest XPath locators replaced by -ios class chain selectors.
---

# XPath → iOS Class Chain

Converts Appium XCUITest XPath locators to `-ios class chain` selectors. A deterministic engine converts first; you review only what it cannot convert exactly.

## Scope

- Output **only** iOS Class Chain locators (`-ios class chain:` or the client's class chain strategy).
- Never convert to or suggest `-ios predicate string`, even when it would be shorter.
- Android locators and non-XPath strategies (`id=`, `accessibility id`) are out of scope: list them as untouched.

## STEP 1: Run the deterministic engine

Always run `scripts/convert.js` (Node ≥ 20) before writing any chain yourself. It is read-only and prints one JSON report on stdout.

| Input | Command |
|---|---|
| One or two simple locators | `node <skill-dir>/scripts/convert.js '<xpath>'` |
| A pasted list (anything with quotes or backticks) | write the locators one per line to a temp file, then `node <skill-dir>/scripts/convert.js --file <tmp>` |
| Source files or a folder (page objects, tests) | `node <skill-dir>/scripts/convert.js --scan <file-or-dir>` |

Prefer `--file` over arguments whenever a locator holds a quote or backtick: shell quoting changes locators silently.

The report has `engine` (where the engine was found), `summary`, and `results[]` with `input`, `status`, and `chain`, `reason`, `warning`, `file` when present.

Exit code 3 means the engine was not found. Go to **Fallback** below.

## STEP 2: Inspect each result

| Status | What to do |
|---|---|
| `success`, no `warning` | Use `chain` **exactly as returned**. Do not reformat, reorder or "improve" it. |
| `success` with `warning` (grouped position `(//X)[n]`, `[last()]`) | Use `chain`, but list it under edge cases: WDA counts matches breadth-first and XPath in document order, so the user must check it on the screen. |
| `skipped_no_change` | Already a valid class chain, or nothing to change. |
| `skipped_android`, `skipped_not_xpath` | Out of scope: list as untouched. |
| `skipped_unsupported_logic`, `skipped_validation_failed`, `skipped_xpath_strategy` | Go to STEP 3. |

In the audit the engine converted 579 of 676 real and hand-made locators and produced no wrong chains. A skip means no exact class chain exists or none has been verified on a device. Do not override it with a chain of your own and present that chain as a conversion.

## STEP 3: Expert review of skipped locators

For each locator from STEP 2 that needs review:

1. **Explain why** in one or two sentences, from the engine's `reason` and `references/class-chain-rules.md` ("No exact class chain"). Name the construct (`following-sibling::`, `normalize-space()`, an index before a filter, …) and the WDA limitation behind it.
2. **Recommend a fix** from `references/refactoring-playbook.md`, in this order of preference: an accessibility identifier in the app, a different single chain (only with the page source), two lookups in test code, or keeping the XPath. Write sample code in the user's language and framework.
3. **A candidate chain is optional.** Write one only if the rules give an exact form the engine has not been checked on. Mark it **unverified** and say how to check it: on the device, or with `audit/harness/check.js` when working in this repository. Never mark a hand-written chain as converted.
4. For `skipped_xpath_strategy`: the string sits in an explicit XPath call (`AppiumBy.xpath(...)`). Give the chain *and* the strategy change together, e.g. `AppiumBy.iOSClassChain("**/…")` without the `-ios class chain:` prefix.

Ask for the page source (`driver.getPageSource()`) when a recommendation depends on the screen's structure. Do not guess the hierarchy.

## Applying the changes

`convert.js` never writes files. When the user asks to apply:

- **Folder or files:** run the main CLI from the engine root printed in the report: `node <engine.root>/xpath-to-class-chain.js <dir>` (preview), then add `--write` after the user agrees. Recommend a clean git working tree so `git diff` is the undo. The CLI skips strings passed to an explicit XPath strategy; edit those by hand together with the strategy call.
- **A few locators:** edit them directly with the chains from the report.
- Never apply STEP 3 candidates without the user's explicit agreement.

## Fallback: engine not available

If `convert.js` exits with code 3:

1. Tell the user and offer the options: clone `github.com/domovou69/xpath-to-class-chain` and set `XPATH_TO_CLASS_CHAIN_HOME`, or `npm i -g github:domovou69/xpath-to-class-chain`. Do not install anything without their agreement.
2. If they want to continue without it, convert using `references/class-chain-rules.md` only. Label every chain as **rules-only, unverified**. Say that in the audit this approach reached about 96 % of the engine's usable chains, and that weaker models also produced some wrong chains. Skip whatever the rules do not cover.

## Report format

Structure the answer exactly like this:

### Converted automatically by script

| # | Original XPath | Class Chain | Note |
|---|---|---|---|

One row per `success` result, with `file` in the note for `--scan`. A `warning` goes in the note as "check position on screen".

### Requires refactoring / Edge-cases

For each locator:

- **Original:** the XPath (and file, if known)
- **Why:** the construct and the WDA limitation
- **Recommendation:** the fix, with test-code sample when useful
- **Candidate chain (unverified):** only if step 3.3 applies

End with the untouched out-of-scope locators (Android, non-XPath) as one short list, and the totals from `summary`.

## Reference files

- `references/class-chain-rules.md`: syntax, attribute and function rules, what has no exact chain, device facts, measured numbers.
- `references/refactoring-playbook.md`: advice per skip reason, with code samples for WebdriverIO, Java and Python.
