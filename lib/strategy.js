// Explicit XPath strategies around a locator string (audit RC-S1, RC-S2).
//
// The scanner rewrites only the string. When the string is passed to a call
// that names the XPath strategy — `AppiumBy.xpath("…")`, `(By.XPATH, '…')`,
// `@iOSXCUITFindBy(xpath = "…")` — the strategy stays XPath and the rewritten
// "-ios class chain:…" string no longer finds anything at runtime. Such strings
// are skipped instead.
//
// Markers are per language and taken from the client sources, not guessed:
//   JVM     Selenium By.xpath; java-client AppiumBy / MobileBy (both extend By);
//           xpath() on @iOSXCUITFindBy, @iOSXCUITBy, @AndroidFindBy, @FindBy;
//           @FindBy(how = How.XPATH, using = …); Selenium 3 findElement(s)ByXPath
//   Python  By.XPATH = "xpath"; AppiumBy / MobileBy (subclasses of By);
//           find_element(by, value); Selenium 3 find_element(s)_by_xpath
//   C#      By.XPath (AppiumBy and MobileBy extend By); AppiumDriver.FindElement(string by,
//           string value); XPath = … on the dotnet-client 4.x FindsBy* attributes;
//           [FindsBy(How = How.XPath, Using = …)]; Selenium 3 FindElement(s)ByXPath
//   Ruby    find_element(:xpath, …) / find_element(xpath: …) (SearchContext
//           FINDERS); appium_lib helpers xpath / xpaths
//   JS/TS   CodeceptJS strict locator { xpath: … }; WebdriverIO
//           findElement(s)(using, value); selenium-webdriver By.xpath
//   PHP     php-webdriver WebDriverBy::xpath
// Data/config files and Swift/Objective-C have no call around the string, so
// nothing there is treated as a strategy.
//
// Each pattern is anchored at the end of the text that precedes the opening
// quote, so only the call the string is an argument of counts — an XPath call
// that closed earlier on the same line does not. `\s` spans newlines, so a
// marker on the previous line (multi-line calls, annotations) is found too.
// Group `m` is the marker shown in the skip reason.

// Annotation / attribute arguments up to `<key> =`; quoted strings are skipped
// whole so a `(` or `)` inside an earlier argument value does not end the match.
const ARGS = String.raw`(?:[^()"']|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')*?`;

// The XPath strategy passed as a string: find_element("xpath", …).
const XPATH_STRING = String.raw`(?<m>(?<q>['"])xpath\k<q>)\s*,\s*`;

const JVM = [
  /(?<m>\b(?:AppiumBy|MobileBy|By)\.xpath\s*\(|\bfindElements?ByXPath\s*\()\s*$/,
  new RegExp(String.raw`(?<m>@[\w.]+\s*\(${ARGS}\bxpath\s*=)\s*$`),
  /(?<m>\bHow\.XPATH\s*,\s*using\s*=)\s*$/,
];

const PATTERNS = {
  java: JVM,
  kotlin: JVM,
  groovy: JVM,
  python: [
    /(?<m>\b(?:AppiumBy|MobileBy|By)\.XPATH)\s*,\s*(?:value\s*=\s*)?$/,
    new RegExp(`${XPATH_STRING}(?:value\\s*=\\s*)?$`),
    /(?<m>\bfind_elements?_by_xpath\s*\()\s*$/,
  ],
  csharp: [
    /(?<m>\b(?:AppiumBy|MobileBy|By)\.XPath\s*\(|\bFindElements?ByXPath\s*\()\s*$/,
    new RegExp(`${XPATH_STRING}$`),
    new RegExp(String.raw`(?<m>\b[\w.]+\s*\(${ARGS}\bXPath\s*=)\s*$`),
    /(?<m>\bHow\.XPath\s*,\s*Using\s*=)\s*$/,
  ],
  ruby: [
    /(?<m>:xpath)\s*(?:,|=>)\s*$/,
    /(?<m>(?<![\w:])xpath:)\s*$/,
    new RegExp(`${XPATH_STRING}$`),
    /(?<m>(?<![\w:])xpaths?(?:\s*\(|(?=\s)))\s*$/,
  ],
  js: [
    /(?<m>(?<![\w$])(?<q>['"]?)xpath\k<q>\s*:)\s*$/,
    new RegExp(`${XPATH_STRING}$`),
    /(?<m>\bBy\.xpath\s*\()\s*$/,
  ],
  php: [
    /(?<m>\bWebDriverBy::xpath\s*\()\s*$/,
  ],
};

const LANGUAGE_BY_EXTENSION = {
  '.java': 'java', '.kt': 'kotlin', '.kts': 'kotlin', '.groovy': 'groovy',
  '.py': 'python', '.cs': 'csharp', '.rb': 'ruby', '.php': 'php',
  '.js': 'js', '.mjs': 'js', '.cjs': 'js', '.jsx': 'js',
  '.ts': 'js', '.mts': 'js', '.cts': 'js', '.tsx': 'js',
};

// How far back from the opening quote a marker may start. Covers a marker a
// few lines up in a formatted call; a longer prefix only costs regex time.
const LOOKBACK = 400;

// Returns the marker (e.g. "AppiumBy.xpath(") when the string starting at
// `offset` (its opening quote) is passed to an explicit XPath strategy, else null.
function findXpathStrategy(content, offset, ext) {
  const patterns = PATTERNS[LANGUAGE_BY_EXTENSION[ext]];
  if (!patterns) return null;
  const prefix = content.slice(Math.max(0, offset - LOOKBACK), offset);
  for (const re of patterns) {
    const m = re.exec(prefix);
    if (m) return m.groups.m.replace(/\s+/g, ' ').replace(/\( /g, '(');
  }
  return null;
}

module.exports = { findXpathStrategy };
