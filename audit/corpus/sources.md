# R corpus: sources

`ios-locators.json` has two parts.

- **Production (`L001`–`L573`, `project: "production-codeceptjs"`).** 573 anonymized literals from one production CodeceptJS iOS suite (Phase 1). Not public, so no commit or license.
- **GitHub (`G0001…`, Phase 7, 2026-10-21).** Literals from 22 open-source projects with Appium tests, chosen by iOS and mixing careful and sloppy suites, listed below. 6 projects were already harvested for the Android sibling project ([xpath-to-uiselector](https://github.com/domovou69/xpath-to-uiselector)); they are re-downloaded at the same commit without the Android filter.

The harness scores the kinds `xpath`, `xpath-dynamic` and `xpath-mixed-classchain` only. The other GitHub kinds are literals the scanner picks up but that are not iOS XPaths: `xpath-android` (Android attributes or classes without an `android:` key), `xpath-web` (WebView / browser), `xpath-uia` (UIAutomation types, iOS 9 and older) and `xpath-other` (no iOS signal: `text()`, report XML). They are kept so that the scanner's behavior on them can be checked.

## GitHub projects

Pinned at the commit below. "Downloaded" counts the files that passed the filter, "With locator" those where the scanner found a locator, "Scored" the unique iOS XPath literals per project.

| Project | Commit | License | Languages | Profile | Downloaded | With locator | Scored (unique) | Occurrences | Other kinds |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| [MetaMask/metamask-sdk](https://github.com/MetaMask/metamask-sdk/tree/99d9172e8c436c51f719eb68c3df119989279973) | `99d9172e8c` | NOASSERTION | TypeScript | large, WebdriverIO e2e (reused) | 52 | 19 | 4 | 4 | android 26, web 8, class-chain 1 |
| [session-foundation/session-appium](https://github.com/session-foundation/session-appium/tree/4581c520a09a33c58774e310a5b955dd42231594) | `4581c520a0` | none | TypeScript | large, cross-platform (reused) | 343 | 11 | 31 | 43 | android 3 |
| [sora-xor/sora2-passport-appium-tests](https://github.com/sora-xor/sora2-passport-appium-tests/tree/b5e89407373a01b798249160ffa471a124a30449) | `b5e8940737` | none | Java | organizational, cross-platform (reused) | 45 | 22 | 27 | 29 | android 61 |
| [NetherlandsForensicInstitute/puma](https://github.com/NetherlandsForensicInstitute/puma/tree/10446a5bd75f15a8325483021d10b6b88ec32449) | `10446a5bd7` | EUPL-1.2 | Python | organizational, app drivers (reused) | 132 | 16 | 17 | 17 | android 61 |
| [TypeLife/appium-unittest](https://github.com/TypeLife/appium-unittest/tree/543d8e81b086376944bd64ccad7a7b7da48e794d) | `543d8e81b0` | none | Python | weak, unittest suite (reused) | 212 | 65 | 2 | 4 | android 221, other 1 |
| [PerfectoCode/Community-Samples](https://github.com/PerfectoCode/Community-Samples/tree/96ca48c011dfbc0ea6e86a967352e5d3021986d1) | `96ca48c011` | none | Java | vendor samples, iOS samples included (reused) | 173 | 67 | 61 | 125 | web 33, android 67, other 12, uia 2 |
| [tyokyo/SioeyeIOSAppium](https://github.com/tyokyo/SioeyeIOSAppium/tree/9481ae5cfddb8acd43cbeab917dbec55eccf03cc) | `9481ae5cfd` | none | Java | iOS only, old (2017), weak | 122 | 16 | 28 | 35 | uia 12 |
| [rajatt95/MasterAppiumFramework](https://github.com/rajatt95/MasterAppiumFramework/tree/a2c0e0927c4f595a3e940ab90b07717f70e427bd) | `a2c0e0927c` | none | Java | course framework | 43 | 4 | 7 | 7 | – |
| [eliasnogueira/appium-cross-platform-example](https://github.com/eliasnogueira/appium-cross-platform-example/tree/e94cb564d82ce517b904b38c4ee614032c0805a4) | `e94cb564d8` | MIT | Java | small example | 8 | 2 | 1 | 2 | – |
| [zademaxfield/LDSToolsAppium](https://github.com/zademaxfield/LDSToolsAppium/tree/d33be069ea8b26ad101b4148cd176b541d213fb3) | `d33be069ea` | none | Java | real app suite | 111 | 24 | 114 | 122 | android 132, web 4, uia 3, other 1 |
| [kobiton/samples](https://github.com/kobiton/samples/tree/9f3ae474e497805496f616ec20dcf375e099c607) | `9f3ae474e4` | MIT | JavaScript, C#, Java | vendor samples | 170 | 58 | 22 | 225 | android 21, web 3 |
| [0xfff0800/Bot-Snapchat](https://github.com/0xfff0800/Bot-Snapchat/tree/ff526d9045c17606dcab89059b2fa312004cae09) | `ff526d9045` | none | Python | iOS-only automation | 19 | 5 | 39 | 41 | – |
| [maiyajj/AutoTest_script-Appium_Connect](https://github.com/maiyajj/AutoTest_script-Appium_Connect/tree/f9c2c42c281a9e2f984acb4a72dda0694b053f22) | `f9c2c42c28` | Apache-2.0 | Python | IoT app suite | 419 | 4 | 150 | 246 | – |
| [Esmorga-E2E/E2E-APP-Tests](https://github.com/Esmorga-E2E/E2E-APP-Tests/tree/84b3b811b98119c4dc676a386b8c691c67b49b55) | `84b3b811b9` | Apache-2.0 | JavaScript | organizational, screen objects | 21 | 8 | 29 | 33 | android 1 |
| [lynix28/ios-mobileui-appium-wdio-example](https://github.com/lynix28/ios-mobileui-appium-wdio-example/tree/3d2476931f9733f679c57bd793548cfc91297bc9) | `3d2476931f` | none | JavaScript | weak, WebdriverIO | 23 | 5 | 21 | 21 | – |
| [KerttSe/moneybase_wdio_](https://github.com/KerttSe/moneybase_wdio_/tree/2d0955f492f70936233e1980475acb5c9cbf5cce) | `2d0955f492` | MIT | TypeScript | fintech, WebdriverIO | 36 | 34 | 135 | 184 | android 459, class-chain 25, other 1 |
| [maxxy4real/MobileAutomationPaydock](https://github.com/maxxy4real/MobileAutomationPaydock/tree/3d9b6f9785683498814748010eb78f8918eee5a8) | `3d9b6f9785` | none | TypeScript | payment SDK | 21 | 8 | 24 | 63 | – |
| [dotnet/maui](https://github.com/dotnet/maui/tree/9f607de9aafc88504940f8edbeed95fed8ede634) | `9f607de9aa` | MIT | C# | large organizational (UI tests) | 16 | 12 | 11 | 17 | other 3 |
| [AutomateThePlanet/BELLATRIX](https://github.com/AutomateThePlanet/BELLATRIX/tree/4e5e187d674d7580bcbd80eaf239d832e1bb64d5) | `4e5e187d67` | Apache-2.0 | C# | framework + iOS tests | 37 | 4 | 1 | 4 | – |
| [TestCentricity/tc_mobile_react_native_demo](https://github.com/TestCentricity/tc_mobile_react_native_demo/tree/09d9f98b5391757722003327e21c699d0f185cc7) | `09d9f98b53` | none | Ruby | demo, screen objects | 80 | 16 | 53 | 61 | web 2 |
| [courtneyzhan/tic-tac-toe-ui-tests](https://github.com/courtneyzhan/tic-tac-toe-ui-tests/tree/fe98945a36060d1a3ad395f4829941d3830a664b) | `fe98945a36` | none | Ruby | weak, page objects | 36 | 6 | 5 | 6 | other 1 |
| [klarna/react-native-klarna-inapp-sdk](https://github.com/klarna/react-native-klarna-inapp-sdk/tree/11eb9b5e2e07ba91eea8c7bff83f4a2bb4dcaacb) | `11eb9b5e2e` | Apache-2.0 | Kotlin | organizational, integration tests | 74 | 11 | 45 | 109 | web 25, android 1 |

GitHub code search, 2026-10-21: `"//XCUIElementType"` in 18 496 files. By language: Java 2952, Python 888, JavaScript 737, TypeScript 420, Ruby 107, C# 95, Kotlin 53.

Considered and left out:
- Frameworks whose `XCUIElementType` strings are library code rather than locators: ldi-github/shirates-core, jdi-testing/jdi-light, testsigmahq/testsigma, attila-fazekas/kolibrium, sbabcoc/Selenium-Foundation.
- Copies of one course: rudrasurti/Appium-Java-POM-Framework copies rajatt95/MasterAppiumFramework.

## How the corpus is made

No repository is cloned.

1. **Candidates.** `gh search code` for `@iOSXCUITFindBy(xpath`, `AppiumBy.xpath("//XCUIElementType` and `//XCUIElementType` per language. Hits are counted per repository, and the metadata (license, stars, size, last push) comes from GraphQL. The user approved the list before any download.
2. **Files.** The git tree at the pinned commit, filtered to the scanner's extensions. Excluded: `node_modules`, `build`, `dist`, `target`, `vendor`, `*.d.ts`, minified files and files over 200 KB. Per-project limits: metamask-sdk `e2e/`; session-appium without `run/desktop/`; `.py` only for puma and appium-unittest; `.java` only for PerfectoCode; BELLATRIX only its iOS tests and templates; klarna only `integration-tests/`. For dotnet/maui and KerttSe/moneybase_wdio_ (trees too large or truncated), only the files that a code search for `XCUIElementType` inside the repository returns.
3. **Download.** The files only, from `raw.githubusercontent.com` at the pinned commit, into a cache outside git (≈16 MB on disk).
4. **Extraction.** [`harvest.js`](harvest.js) runs the scanner in dry-run mode over the cache. It keeps one entry per (project, quote, literal) with `count`, `project`, `lang` and `strategy`, the XPath strategy call when the scanner reports one. Quoted strings with an `XCUIElementType` that the scanner did not pick up go to [`scanner-misses.json`](scanner-misses.json) with a reason.
5. **Anonymization.** As in the Android corpus: every letter run in a quoted value becomes a pseudo-word of the same length, script and case pattern, from one salted mapping. Kept as they are: the XPath structure (types, attributes, functions, axes), digits, punctuation, quotes, backslashes, interpolations (`${x}`, `#{x}`, `$x`, `{x}`, `{0}`, `%s`), words of one or two letters, `true` / `false` and whole `XCUIElementType…` values. The salt stays in the cache.

To rebuild: download the files as above into `<cache>/<owner>__<repo>/<path>`, write `<cache>/pins.txt` (`owner/repo sha license` per line, in the table order) and run `node audit/corpus/harvest.js <cache>`. The production entries are read from the current file and kept. A new salt gives different pseudo-words.

## Fields

`id`, `kind`, `quote`, `source`, `count` as in Phase 1, plus `project`, `lang` and `strategy` (`null` for a bare string or a production entry).
