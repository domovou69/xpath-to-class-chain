# Upstream schedule (Phase 6)

Once a quarter (the 3rd of January, April, July and October), `.github/workflows/upstream-schedule.yml` checks whether a new Appium, appium-xcuitest-driver or WebDriverAgent release changed a file the converter depends on. When Claude judges a change important, the job opens an issue with the label `upstream`, and GitHub emails it. Nothing important means no email. A failure (token, API, missing or invalid report) fails the job, and GitHub emails the failure.

## What it watches

[`audit/upstream.json`](../upstream.json) is the single source of truth:

- `checked`: the versions last verified on a device. The job always compares `checked` → the *installable pair* below.
- The pair is what a user can actually install, not each package'"'"'s npm `latest`: the latest stable Appium; the newest stable appium-xcuitest-driver whose `peerDependencies.appium` accepts it; and the WebDriverAgent that driver depends on. A driver `latest` that needs a newer Appium (13.x needs Appium 4 beta while 3.x is stable) is ignored and named in the log. If a pair version has no GitHub tag yet, the job compares against the newest tagged version instead (WDA 16.17.7 had no tag).
- Why quarterly: Sauce Labs "Appium on Real Devices" (docs, section "Versioning Scheme and Release Cycle", images named `appiumX-YYYY-MM`) releases an Appium image every quarter (January, April, July, October), each with the latest drivers of that moment. Our check follows the same cycle, on the 3rd so the image is out. Change the schedule only if Sauce Labs changes theirs; use "Run workflow" for an off-cycle release (for example Appium 4).
- `watch`: per component, the repository, the tag format and the watched files (`*` matches within one path segment; `match` keeps a file only when its patch matches the regex, used for the large `driver.ts` and `core.ts`).
  - WDA: the 12 files that mini-WDA compiles (`audit/harness/wda/fetch-wda.sh`), plus class chain and XPath lookup, find commands and the attribute getters.
  - Driver: `lib/commands/find.*`, `lib/commands/source.*`, the locator strategy list in `lib/driver.*`, `docs/reference/settings.md`.
  - Appium: `base-driver` find command and locator strategy validation (`core.*`).

## How it works

1. [`check.js`](check.js) (Node 20+, no dependencies) resolves the installable pair from npm, compares the git trees of both tags to find changed watched files, and collects the commits and patches. The compare API lists at most 300 files; for files beyond that, the patch is taken from each commit. It writes `out/upstream-meta.json` and, only when a watched file changed, `out/upstream-input.md`.
2. If there is input, Claude (`claude-sonnet-5-5`, effort `medium`, through `anthropics/claude-code-action` with the `CLAUDE_CODE_OAUTH_TOKEN` secret; tools Read, Grep, Glob, Write) follows [`prompt.md`](prompt.md) and writes `out/upstream-report.json`. When unsure, it must answer "important".
3. [`report.js`](report.js) validates the report, writes the job summary and, when important, creates the issue. It skips an issue when an open `upstream` issue already names the same latest versions. The issue names the model and effort.

## Where the results are

- Important: an issue with the label `upstream`, and GitHub's email about it.
- Every run: the job summary on the run page (Actions → Upstream schedule) with the verdict and the table, and the `out/` folder as the run artifact `upstream-schedule` (`upstream-report.json`, the input; GitHub keeps it 90 days).
- Failure: GitHub's email about the failed scheduled run.
- Nothing is committed to the repository.

If `checked` is not updated, the next quarter compares the same `checked` with the newer latest again, so an unhandled change is reported again. No second issue while an open one names the same latest versions; a newer release opens a new issue for the whole range.

## After an issue

Re-check the items marked "yes" (`audit/device` on the simulator or iPhone, `audit/harness/wda` for the mini-WDA self-test). When the converter still behaves the same, update `checked` in `audit/upstream.json` first through a PR, then README "Checked with", `docs/results.md` and `audit/harness/wda/VERSION`. Close the issue.

## Test

Locally (no LLM):

```sh
GH_TOKEN=$(gh auth token) node audit/upstream/check.js                    # real versions
GH_TOKEN=$(gh auth token) node audit/upstream/check.js --wda-base 13.0.0  # an old base: many WDA changes
node audit/upstream/report.js --dry-run                                   # after writing out/upstream-report.json
```

In GitHub: Actions → Upstream schedule → Run workflow, with `wda_base`, `driver_base`, `appium_base` (override `checked`) and `dry_run` (print the issue body in the log instead of creating it). Or `gh workflow run upstream-schedule.yml -f wda_base=13.0.0 -f dry_run=true`.

Measured on 2026-10-17 (local CLI, same model and effort): the real pair (driver 12.16.0 → 12.18.1, only `settings.md` changed) took 25 s and $0.05, verdict not important; WDA 13.0.0 → 16.15.3 (9 files, 69 KB input) took 43 s and $0.21, verdict important.
