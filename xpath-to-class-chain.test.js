// Zero-dependency test runner: `node xpath-to-class-chain.test.js`
// Exit code is non-zero on any failure. Cases use synthetic, app-neutral data
// and cover the documented iOS Class Chain / NSPredicate conversion rules.
// Add a row and re-run.
const { convertXpathToClassChain, validateAndFixClassChain, optimizeClassChain, tokenizeXpath, isLikelyIosLocator, parseFlags } = require('./xpath-to-class-chain');

const CC = '-ios class chain:'; // prefix shorthand to keep rows readable

// =====================================================================
// CONVERT_CASES — XPath that SHOULD convert. `expect` is the full locator.
// =====================================================================
const CONVERT_CASES = [
  // --- element type + single attribute (name / label / value) ---
  ['//XCUIElementTypeButton[@name="Submit"]', `${CC}**/XCUIElementTypeButton[\`name == "Submit"\`]`],
  ['//XCUIElementTypeButton[@label="Cancel"]', `${CC}**/XCUIElementTypeButton[\`label == "Cancel"\`]`],
  ['//XCUIElementTypeTextView[@value="Sample text value."]', `${CC}**/XCUIElementTypeTextView[\`value == "Sample text value."\`]`],

  // --- wildcard element (*) ---
  ['//*[@label="Continue"]', `${CC}**/*[\`label == "Continue"\`]`],
  ['//*[@value="Total"]', `${CC}**/*[\`value == "Total"\`]`],

  // --- text() node function: maps to label OR value ---
  ['//XCUIElementTypeButton[text()="Submit"]', `${CC}**/XCUIElementTypeButton[\`label == "Submit" OR value == "Submit"\`]`],
  ['//XCUIElementTypeCell[contains(text(), "Save")]', `${CC}**/XCUIElementTypeCell[\`label CONTAINS "Save" OR value CONTAINS "Save"\`]`],
  ['//XCUIElementTypeStaticText[starts-with(text(), "Nav")]', `${CC}**/XCUIElementTypeStaticText[\`label BEGINSWITH "Nav" OR value BEGINSWITH "Nav"\`]`],
  ['(//*[text()="Submit"])[1]', `${CC}**/*[\`label == "Submit" OR value == "Submit"\`][1]`],

  // --- string functions: contains / starts-with / ends-with ---
  ['//*[contains(@name, "alpha")]', `${CC}**/*[\`name CONTAINS "alpha"\`]`],
  ['//XCUIElementTypeButton[contains(@label,"Save")]', `${CC}**/XCUIElementTypeButton[\`label CONTAINS "Save"\`]`],
  ['//XCUIElementTypeStaticText[starts-with(@label, "Welcome")]', `${CC}**/XCUIElementTypeStaticText[\`label BEGINSWITH "Welcome"\`]`],
  ['//XCUIElementTypeStaticText[ends-with(@label, "done")]', `${CC}**/XCUIElementTypeStaticText[\`label ENDSWITH "done"\`]`],
  // whitespace before '(' + single-quoted value
  ["//XCUIElementTypeStaticText[contains (@name, 'hello world.')]", `${CC}**/XCUIElementTypeStaticText[\`name CONTAINS 'hello world.'\`]`],

  // --- B1 literals: quote, ] and backtick inside a value ---
  [`//*[@label='a"b']`, `${CC}**/*[\`label == 'a"b'\`]`],                      // G03
  [`//*[contains(@label,"a]b")]`, `${CC}**/*[\`label CONTAINS "a]b"\`]`],       // G14
  ['//*[@label="a`b"]', `${CC}**/*[\`label == "a\`\`b"\`]`],                   // G04: a backtick is doubled
  [`//XCUIElementTypeButton[@name="a]" and @label='b"c']`, `${CC}**/XCUIElementTypeButton[\`name == "a]" AND label == 'b"c'\`]`],

  // --- B2 not(): NOT (…) ---
  ['//XCUIElementTypeButton[not(@name="a")]', `${CC}**/XCUIElementTypeButton[\`NOT (name == "a")\`]`], // D07
  ['//*[contains(@label,"a") and not(contains(@label,"b"))]', `${CC}**/*[\`label CONTAINS "a" AND NOT (label CONTAINS "b")\`]`], // D08
  ['//*[contains(@label, "s") and not (contains(@label, "s"))]', `${CC}**/*[\`label CONTAINS "s" AND NOT (label CONTAINS "s")\`]`], // L458
  ['//*[not(@name)]', `${CC}**/*[\`NOT (name != nil)\`]`],
  ['//*[not(@name="a" or @label="b")]', `${CC}**/*[\`NOT (name == "a" OR label == "b")\`]`],
  ['//*[@label="not(x"]', `${CC}**/*[\`label == "not(x"\`]`],                  // text, not a function

  // --- boolean logic AND / OR ---
  ['//XCUIElementTypeButton[@name="Screen.primaryButton" and @label="Submit"]', `${CC}**/XCUIElementTypeButton[\`name == "Screen.primaryButton" AND label == "Submit"\`]`],
  ['//XCUIElementTypeButton[@label="Option A" or @label="Option B"]', `${CC}**/XCUIElementTypeButton[\`label == "Option A" OR label == "Option B"\`]`],
  // mixed AND/OR — converted verbatim; NSPredicate AND binds tighter than OR
  ['//*[@name="A" and @label="B" or @name="C"]', `${CC}**/*[\`name == "A" AND label == "B" OR name == "C"\`]`],

  // --- @type optimization: contains(@type,"X") collapses into the native element ---
  ['//*[contains(@type,"XCUIElementTypeButton") and contains(@label,"Submit")]', `${CC}**/XCUIElementTypeButton[\`label CONTAINS "Submit"\`]`],
  ['//*[contains(@type,"XCUIElementTypeStaticText") and contains(@name,"Item ID:")]', `${CC}**/XCUIElementTypeStaticText[\`name CONTAINS "Item ID:"\`]`],
  // type-only predicate drops the brackets entirely
  ['//*[contains(@type,"XCUIElementTypeOther")]', `${CC}**/XCUIElementTypeOther`],

  // --- boolean attributes: true/false unquoted ---
  ['//XCUIElementTypeButton[contains(@label, "Confirm") and @enabled="true"]', `${CC}**/XCUIElementTypeButton[\`label CONTAINS "Confirm" AND enabled == true\`]`],
  ['//*[@name="Widget.actionButton" and @enabled="false"]', `${CC}**/*[\`name == "Widget.actionButton" AND enabled == false\`]`],

  // --- grouped XPath: (//inner)[n] and bare (//inner) ---
  // bare parens without index — semantically identical to the unwrapped XPath
  ['(//XCUIElementTypeStaticText[@label="Not available"])', `${CC}**/XCUIElementTypeStaticText[\`label == "Not available"\`]`],
  ['(//XCUIElementTypeImage[@name="right_arrow"])', `${CC}**/XCUIElementTypeImage[\`name == "right_arrow"\`]`],
  // literal integer index — the outer [n] selects the n-th global result
  ['(//XCUIElementTypeButton[@name="Widget.backButton"])[1]', `${CC}**/XCUIElementTypeButton[\`name == "Widget.backButton"\`][1]`],
  ['(//XCUIElementTypeButton[@name="Widget.backButton"])[3]', `${CC}**/XCUIElementTypeButton[\`name == "Widget.backButton"\`][3]`],
  ['(//XCUIElementTypeOther[@name="unselected, radio button"])[1]', `${CC}**/XCUIElementTypeOther[\`name == "unselected, radio button"\`][1]`],
  ['(//XCUIElementTypeOther[@name="unselected, radio button"])[2]', `${CC}**/XCUIElementTypeOther[\`name == "unselected, radio button"\`][2]`],
  // template-expression index — passed through as-is so the JS runtime evaluates
  // it inside the template literal; the class chain engine then uses the resolved number
  ['(//XCUIElementTypeOther[@name="unselected, radio button"])[${option + 1}]', `${CC}**/XCUIElementTypeOther[\`name == "unselected, radio button"\`][${'${option + 1}'}]`],

  // inner ends with a child index AND outer provides a position index —
  // Strategy A (outer [1]): drop it; driver.findElement() returns first match
  ['(//XCUIElementTypeStaticText/child::XCUIElementTypeStaticText[1])[1]', `${CC}**/XCUIElementTypeStaticText/XCUIElementTypeStaticText[1]`],
  ['(//XCUIElementTypeStaticText/child::XCUIElementTypeStaticText[2])[1]', `${CC}**/XCUIElementTypeStaticText/XCUIElementTypeStaticText[2]`],
  // Strategy B (outer [n>1] or template): move outer index to the parent element.
  // Valid for flat list/table patterns where each parent has one child at position n.
  // e.g. row[${t}]/2nd-child  ≡  (all rows' 2nd children)[${t}] when rows are flat siblings
  ['(//*[contains(@name, "Balance,")]/child::*[2])[${transaction}]', `${CC}**/*[\`name CONTAINS "Balance,"\`][${'${transaction}'}]/*[2]`],

  // --- true/false on a NON-boolean attr stays a quoted string: a label whose
  //     literal text is "true" must NOT be coerced to the boolean `== true` ---
  ['//XCUIElementTypeStaticText[@name="true"]', `${CC}**/XCUIElementTypeStaticText[\`name == "true"\`]`],
  ['//XCUIElementTypeStaticText[@label="false"]', `${CC}**/XCUIElementTypeStaticText[\`label == "false"\`]`],
  // …but a real boolean attr is still coerced to the unquoted form
  ['//XCUIElementTypeButton[@selected="true"]', `${CC}**/XCUIElementTypeButton[\`selected == true\`]`],

  // --- template-literal interpolation preserved; boolean attrs are intentionally
  //     unquoted (NSPredicate wants `enabled == true`, so `${isActive}` -> bool) ---
  ['//*[@label="Save" and @enabled="${isActive}"]', `${CC}**/*[\`label == "Save" AND enabled == ${'${isActive}'}\`]`],

  // --- child:: navigation (normalized to '/') + descendant chains ---
  ['//*[contains(@name, "alpha")]/child::XCUIElementTypeStaticText[@name="Title"]', `${CC}**/*[\`name CONTAINS "alpha"\`]/XCUIElementTypeStaticText[\`name == "Title"\`]`],
  ['//XCUIElementTypeButton[@name="Widget.field"]/XCUIElementTypeButton', `${CC}**/XCUIElementTypeButton[\`name == "Widget.field"\`]/XCUIElementTypeButton`],
  ['//XCUIElementTypeOther[contains(@label, "Animation block")]/XCUIElementTypeStaticText', `${CC}**/XCUIElementTypeOther[\`label CONTAINS "Animation block"\`]/XCUIElementTypeStaticText`],

  // --- indexes & multiple brackets ---
  ['//XCUIElementTypeTextField[1]', `${CC}**/XCUIElementTypeTextField[1]`],
  // predicate + trailing index — index stays its own bracket
  ['//XCUIElementTypeButton[contains(@name, "Widget.backButton")][1]', `${CC}**/XCUIElementTypeButton[\`name CONTAINS "Widget.backButton"\`][1]`],
  // two attribute predicates merge into ONE with AND
  ['//XCUIElementTypeButton[@name="ok"][@label="OK"]', `${CC}**/XCUIElementTypeButton[\`name == "ok" AND label == "OK"\`]`],
  // merge + index together
  ['//XCUIElementTypeCell[@name="1"][@label="2"][3]', `${CC}**/XCUIElementTypeCell[\`name == "1" AND label == "2"\`][3]`],

  // --- tricky literals that must NOT trip the parser/validator ---
  ['//XCUIElementTypeCell[@name="a/b"]', `${CC}**/XCUIElementTypeCell[\`name == "a/b"\`]`], // slash inside value
  ['//XCUIElementTypeOther[contains(@name, "Widget.item(1")]', `${CC}**/XCUIElementTypeOther[\`name CONTAINS "Widget.item(1"\`]`], // unbalanced '(' inside value
  ['//XCUIElementTypeStaticText[contains(@label, "£")]', `${CC}**/XCUIElementTypeStaticText[\`label CONTAINS "£"\`]`], // currency / unicode
  ['//XCUIElementTypeStaticText[@name="Line one\nLine two"]', `${CC}**/XCUIElementTypeStaticText[\`name == "Line one\\nLine two"\`]`], // newline in value: escaped for NSPredicate (RC4)
  // a literal '|' inside a quoted value is NOT a union — must still convert
  ['//XCUIElementTypeStaticText[@label="a|b"]', `${CC}**/XCUIElementTypeStaticText[\`label == "a|b"\`]`],
  // apostrophe inside a double-quoted value must not break the regex match
  ['//XCUIElementTypeButton[contains(@label, "it\'s fine")]', `${CC}**/XCUIElementTypeButton[\`label CONTAINS "it\'s fine"\`]`],
  ['//XCUIElementTypeButton[@label="Don\'t Allow"]', `${CC}**/XCUIElementTypeButton[\`label == "Don\'t Allow"\`]`],

  // axis-like / function-like / android-like text INSIDE a quoted value must NOT
  // trigger a structural skip — gates look at syntax, not attribute-value text
  ['//XCUIElementTypeStaticText[@label="parent::root info"]', `${CC}**/XCUIElementTypeStaticText[\`label == "parent::root info"\`]`],
  ['//XCUIElementTypeStaticText[@name="my.android.helper"]', `${CC}**/XCUIElementTypeStaticText[\`name == "my.android.helper"\`]`],
  ['//XCUIElementTypeStaticText[@label="following-sibling node"]', `${CC}**/XCUIElementTypeStaticText[\`label == "following-sibling node"\`]`],
  ['//XCUIElementTypeStaticText[@value="count(items) total"]', `${CC}**/XCUIElementTypeStaticText[\`value == "count(items) total"\`]`],

  // --- audit regressions (audit/coverage-report.md; ids from audit/coverage-cases.json) ---
  // RC1: `//` after a step needs its own '/' separator: `A/**/B`, never `A**/B` (WDA rejects it)
  ['//XCUIElementTypeCell//XCUIElementTypeButton', `${CC}**/XCUIElementTypeCell/**/XCUIElementTypeButton`], // A09
  ['//XCUIElementTypeCell/descendant::XCUIElementTypeButton', `${CC}**/XCUIElementTypeCell/**/XCUIElementTypeButton`], // A06
  ['//XCUIElementTypeCell[@name="a"]//XCUIElementTypeButton[@label="b"]', `${CC}**/XCUIElementTypeCell[\`name == "a"\`]/**/XCUIElementTypeButton[\`label == "b"\`]`], // A10
  ['//*[contains(@label, "Row 1")]//*[contains(@label, "Win")]', `${CC}**/*[\`label CONTAINS "Row 1"\`]/**/*[\`label CONTAINS "Win"\`]`], // L483, L484
  // RC9: an absolute path starts at the Application root; the chain is evaluated from it, so the root step is dropped
  ['/XCUIElementTypeApplication/XCUIElementTypeWindow/XCUIElementTypeButton', `${CC}XCUIElementTypeWindow/XCUIElementTypeButton`], // A07
  ['/XCUIElementTypeApplication/XCUIElementTypeWindow[1]/XCUIElementTypeOther[1]/XCUIElementTypeButton[2]', `${CC}XCUIElementTypeWindow[1]/XCUIElementTypeOther[1]/XCUIElementTypeButton[2]`], // A08
  ['/XCUIElementTypeApplication//XCUIElementTypeButton[@name="x"]', `${CC}**/XCUIElementTypeButton[\`name == "x"\`]`],
  ['/*/XCUIElementTypeWindow', `${CC}XCUIElementTypeWindow`],
  // RC2: contains()/starts-with() on a boolean attribute compares the "true"/"false" text
  ['//XCUIElementTypeButton[contains(@enabled,"false")]', `${CC}**/XCUIElementTypeButton[\`enabled == false\`]`], // B18
  ['//*[contains(@name,"n") and contains(@enabled,"false")]', `${CC}**/*[\`name CONTAINS "n" AND enabled == false\`]`], // L278, L520
  ['//*[starts-with(@visible,"true")]', `${CC}**/*[\`visible == true\`]`],
  // RC10: a `.` step is the same element
  ['//XCUIElementTypeCell/./XCUIElementTypeButton', `${CC}**/XCUIElementTypeCell/XCUIElementTypeButton`], // A11
  ['//XCUIElementTypeCell//./XCUIElementTypeButton', `${CC}**/XCUIElementTypeCell/**/XCUIElementTypeButton`],
  ['//XCUIElementTypeCell/.//XCUIElementTypeButton', `${CC}**/XCUIElementTypeCell/**/XCUIElementTypeButton`],
  ['//XCUIElementTypeCell/.', `${CC}**/XCUIElementTypeCell`],
  // RC11: a type test collapses into a step only when exactly one WDA type matches
  ['//*[contains(@type,"XCUIElementTypeText")]', `${CC}**/*[\`type CONTAINS "XCUIElementTypeText"\`]`], // C10
  ['//*[@type="XCUIElementTypeButton" or @name="x"]', `${CC}**/*[\`type == "XCUIElementTypeButton" OR name == "x"\`]`],
  ['//XCUIElementTypeAny[@name="a"]', `${CC}**/*[\`name == "a"\`]`], // A04: WDA treats XCUIElementTypeAny as `*` in XPath too
  // RC12: `@` inside a value is text
  ['//*[@label="$5 and @x"]', `${CC}**/*[\`label == "$5 and @x"\`]`], // G13
  ['//*[@label="a @b=c"]', `${CC}**/*[\`label == "a @b=c"\`]`],
  // RC13: XPath `=` is literal, and so is NSPredicate `==`; `*` is not a wildcard in either
  ['//*[@name="a*b"]', `${CC}**/*[\`name == "a*b"\`]`], // G07
  ['//*[@name="abc*"]', `${CC}**/*[\`name == "abc*"\`]`],
  ['//*[@name!="abc*"]', `${CC}**/*[\`name != nil AND name != "abc*"\`]`],
  // RC3: page-source attributes map to what WDA evaluates in a chain
  ['//XCUIElementTypeButton[@x>60]', `${CC}**/XCUIElementTypeButton[\`rect.x > 60\`]`], // B04
  ['//*[@width="100" and @height>=44]', `${CC}**/*[\`rect.width == 100 AND rect.height >= 44\`]`],
  // RC14: numbers compare as numbers
  ['//*[@index="1"]', `${CC}**/*[\`index == 1\`]`], // B11
  ['//*[@index!=0]', `${CC}**/*[\`index != 0\`]`],
  ['//XCUIElementTypeButton[@value>5]', `${CC}**/XCUIElementTypeButton[\`value.doubleValue > 5\`]`], // B03
  ['//XCUIElementTypeSlider[@value>="0.5"]', `${CC}**/XCUIElementTypeSlider[\`value.doubleValue >= 0.5\`]`],
  // an XPath `!=` needs the attribute to exist; NSPredicate's would also match nil
  ['//XCUIElementTypeButton[@label!="a"]', `${CC}**/XCUIElementTypeButton[\`label != nil AND label != "a"\`]`], // B02
  // attribute existence
  ['//XCUIElementTypeButton[@name]', `${CC}**/XCUIElementTypeButton[\`name != nil\`]`], // B10
  ['//*[@name and @label="x"]', `${CC}**/*[\`name != nil AND label == "x"\`]`],
  // RC4: NSPredicate decodes backslash escapes, so `\` and control characters are escaped
  ['//*[@label="a\nb"]', `${CC}**/*[\`label == "a\\nb"\`]`], // G05: a real newline
  ['//*[@label="C:\\dir"]', `${CC}**/*[\`label == "C:\\\\dir"\`]`], // G12: a real backslash
  ['//*[@label="a\tb"]', `${CC}**/*[\`label == "a\\tb"\`]`],
  ['//*[contains(@label,"a\\b")]', `${CC}**/*[\`label CONTAINS "a\\\\b"\`]`],
  // host-literal escapes (raw source text from the scanner) are left as they are
  ["//*[@label=\"Don\\'t\"]", `${CC}**/*[\`label == "Don\\'t"\`]`],
  ['//*[@label="caf\\u00e9"]', `${CC}**/*[\`label == "caf\\u00e9"\`]`],
  // type collapse also works on JSON-escaped quotes (raw .json / .java source)
  ['//*[contains(@type,\\"XCUIElementTypeButton\\") and contains(@label,\\"Nozod\\")]', `${CC}**/XCUIElementTypeButton[\`label CONTAINS \\"Nozod\\"\`]`],
  // RC7: predicates joined with AND keep each OR group intact
  ['//*[@name="a" or @label="b"][@value="c"]', `${CC}**/*[\`(name == "a" OR label == "b") AND value == "c"\`]`], // D06
  ['//*[@name="a" or @name="b"][@label="c" or @label="d"]', `${CC}**/*[\`(name == "a" OR name == "b") AND (label == "c" OR label == "d")\`]`], // D12
  ['//XCUIElementTypeButton[contains(text(),"a") and @enabled="true"]', `${CC}**/XCUIElementTypeButton[\`(label CONTAINS "a" OR value CONTAINS "a") AND enabled == true\`]`],
  // RC8: a descendant path in a predicate becomes a `$…$` descendant predicate, not a filter on the outer element
  ['//XCUIElementTypeCell[.//XCUIElementTypeButton[@name="x"]]', `${CC}**/XCUIElementTypeCell[$type == "XCUIElementTypeButton" AND name == "x"$]`], // F01
  ['//XCUIElementTypeTable/XCUIElementTypeCell[.//XCUIElementTypeStaticText[@label="x"]]/XCUIElementTypeButton', `${CC}**/XCUIElementTypeTable/XCUIElementTypeCell[$type == "XCUIElementTypeStaticText" AND label == "x"$]/XCUIElementTypeButton`], // F07
  ['//XCUIElementTypeCell[@name="a"][.//XCUIElementTypeButton]', `${CC}**/XCUIElementTypeCell[\`name == "a"\`][$type == "XCUIElementTypeButton"$]`], // F08
  ['//XCUIElementTypeCell[.//XCUIElementTypeButton[@name="x" or @label="y"]][2]', `${CC}**/XCUIElementTypeCell[$type == "XCUIElementTypeButton" AND (name == "x" OR label == "y")$][2]`],
];

// =====================================================================
// SKIP_CASES — input that must be left UNCHANGED (not convertible / bad usage).
// =====================================================================
const SKIP_CASES = [
  // axes a Class Chain cannot express (only downward child/descendant is allowed)
  ['//XCUIElementTypeCell/following-sibling::XCUIElementTypeButton', 'following-sibling'],
  ['//*[@name="X"]/preceding-sibling::*[1]', 'preceding-sibling'],
  ['//XCUIElementTypeButton[contains(@name, "alpha")]/parent::XCUIElementTypeOther/XCUIElementTypeScrollView', 'parent::'],
  ['//*[contains(@name, "Header")]/parent::*[1]/following-sibling::*[2]', 'parent + sibling'],
  ['//*[@label="x"]/following::*[1]', 'following::'],
  ['//XCUIElementTypeOther[@name="x"]/following-sibling::XCUIElementTypeOther/XCUIElementTypeLink', 'following-sibling chain'],
  // self:: axis must skip even when it appears alone
  ['//*[self::XCUIElementTypeStaticText or self::XCUIElementTypeTextView]', 'self:: axis'],

  // XPath functions with no Class Chain equivalent
  ['//*[last()]', 'last()'],
  // [last()] as the OUTER index of a grouped XPath: unwrapGrouped rejects it
  // (not a digit and not a ${} expression), so the whole thing falls through
  // as SKIPPED_NOT_XPATH. last() is an XPath function with no static value —
  // there is no equivalent in Class Chain; must be converted manually.
  ['(//XCUIElementTypeStaticText[@name="icon"])[last()]', 'grouped outer last()'],
  ['//*[contains(@name, "Item")]/following-sibling::*[1][position() <= 15]', 'position()'],
  // not() converts to NOT (…), but only around conditions that have a chain form
  ['//*[not(./XCUIElementTypeButton)]', 'not() around a path'],
  ['//*[not(@foo="v")]', 'not() around a non-WDA attribute'],
  ['//*[not(position()=1)]', 'not() around position()'],
  // a backtick outside a quoted value is a class-chain predicate, not XPath
  ['//*[`label == "a"`]', 'backtick predicate'],
  ['//*[@label="a" and `x`]', 'backtick outside a value'],
  ['//XCUIElementTypeStaticText[@name="First field"]/following-sibling::XCUIElementTypeStaticText[1]', 'sibling'],

  // unions — must skip regardless of whitespace around '|'
  ['//*[@a="1"] | //*[@b="2"]', 'union | (space-padded)'],
  ['//*[@a="1"]|//*[@b="2"]', 'union | (no space)'],
  ['//*[@a="1"] |//*[@b="2"]', 'union | (space before only)'],
  ['//*[@a="1"]| //*[@b="2"]', 'union | (space after only)'],

  // android selector
  ['//android.widget.TextView', 'android.'],

  // masking must not hide a GENUINE structural axis/android that lives outside
  // the quotes, even when a quoted value also carries misleading text
  ['//XCUIElementTypeStaticText[@label="plain"]/following-sibling::XCUIElementTypeButton', 'real axis + benign value'],
  ['//android.widget.TextView[@text="parent::x"]', 'real android + axis-like value'],

  // grouping + unsupported inner content — union inside parens propagates SKIPPED_UNSUPPORTED_LOGIC
  ['(//XCUIElementTypeButton[@name="x"] | //XCUIElementTypeButton[@name="y"])[1]', 'grouped union'],

  // grouped outer [n>1] when the inner chain reduces to just **/Type[m] with no
  // named parent to attach the outer index to. Strategy B (move index to parent)
  // needs a concrete parent element; ** alone is not a valid attachment point.
  // e.g. (//Type[1])[2] → inner = **/Type[1], parentChain = ** → skip.
  ['(//XCUIElementTypeStaticText[1])[2]', 'grouped outer [n>1] + inner has no parent segment'],

  // already a Class Chain fragment mislabelled as XPath
  ['//XCUIElementTypeButton[`label == "Done"`]', 'backtick fragment'],

  // not an XPath at all
  ['', 'empty string'],
  ['Some plain string', 'plain text'],
  ['-ios class chain:**/XCUIElementTypeButton[`name == "x"`]', 'already a class chain'],

  // --- audit regressions ---
  // RC1: a grouped outer index cannot attach to a `**` step
  ['(//XCUIElementTypeCell//XCUIElementTypeButton[2])[3]', 'RC1: grouped outer index would land on **'],
  // RC9: absolute paths the chain cannot express
  ['/XCUIElementTypeApplication', 'RC9: selects the application element itself'],
  ['/XCUIElementTypeWindow/XCUIElementTypeButton', 'RC9: the root element is always the Application'],
  ['/XCUIElementTypeApplication[@name="App"]/XCUIElementTypeWindow', 'RC9: predicate on the root step'],
  // RC6: leftover XPath inside the backtick block must fail validation, not ship as "success"
  ['//XCUIElementTypeButton[contains(., "a")]', 'RC6: contains(.) (C05)'],
  ['//*[normalize-space(@label)="a b"]', 'RC6: normalize-space (C06)'],
  ['//XCUIElementTypeButton[string-length(@label)>3]', 'RC6: string-length (C07)'],
  ['//*[@label=concat("a","b")]', 'RC6: concat (C09)'],
  ['//XCUIElementTypeCell[XCUIElementTypeButton]', 'RC6: child-existence test (F02)'],
  ['//*[matches(@name,"^a.c$")]', 'RC6: matches (H02)'],
  ['//*[lower-case(@label)="ab"]', 'RC6: lower-case (H05)'],
  // RC8: nested paths the chain cannot express
  ['//XCUIElementTypeCell[./XCUIElementTypeButton[@name="x"]]', 'RC8: child-existence test (F05)'],
  ['//*[tokenize(@label," ")[2]="b"]', 'RC8: nested index inside a function (H08)'],
  ['//XCUIElementTypeCell[.//XCUIElementTypeButton[@name="x"] and @name="a"]', 'RC8: descendant path mixed with a filter'],
  ['//XCUIElementTypeCell[.//XCUIElementTypeButton[.//XCUIElementTypeImage]]', 'RC8: nested descendant predicates'],
  ['//XCUIElementTypeCell[.//*]', 'RC8: any descendant'],
  // RC-D2: XCTest's containingPredicate ($…$) also tests the element itself, so the
  // chain is exact only when both steps name a type and the types differ
  ['//XCUIElementTypeCell[.//*[@name="x"]]', 'RC-D2: any descendant could be the Cell itself (F03)'],
  ['//XCUIElementTypeCell[.//XCUIElementTypeAny[@name="x"]]', 'RC-D2: XCUIElementTypeAny descendant'],
  ['//*[.//XCUIElementTypeButton[@name="x"]]', 'RC-D2: the Button itself would match'],
  ['//XCUIElementTypeAny[.//XCUIElementTypeButton]', 'RC-D2: XCUIElementTypeAny step'],
  ['//XCUIElementTypeCell[.//XCUIElementTypeCell[@name="x"]]', 'RC-D2: same type outside and inside'],
  ['(//*[.//XCUIElementTypeButton[@name="x"]])[2]', 'RC-D2: grouped'],
  // RC2: any other value on a boolean attribute has no NSPredicate form
  ['//XCUIElementTypeButton[contains(@enabled,"rue")]', 'RC2: partial text of a boolean'],
  // RC10: the parent step has no class chain form
  ['//XCUIElementTypeButton/..', 'RC10: parent step (R02)'],
  ['//XCUIElementTypeCell/../XCUIElementTypeButton', 'RC10: parent step mid-path'],
  // RC11: WDA maps an unknown type name to Other; in XPath it matches nothing
  ['//XCUIElementTypeLabel[@name="a"]', 'RC11: not an iOS element type (A13)'],
  // RC3: not an attribute WDA knows; the chain would raise FBUnknownAttributeException
  ['//XCUIElementTypeStaticText[@text="a"]', 'RC3: @text (B13)'],
  ['//XCUIElementTypeStaticText[contains(@text, "a")]', 'RC3: @text in a function (L306)'],
  ['//*[contains(@x, "1")]', 'RC3: string function on a number'],
  // RC14: comparisons with no safe NSPredicate form
  ['//*[@value<5]', 'RC14: text below a number (non-numeric text reads as 0)'],
  ['//*[@index="a"]', 'RC14: index against text'],
  ['//*[@value=5]', 'RC14: text equal to a number'],
  ['//*[@enabled>0]', 'RC14: ordering a boolean'],
  // RC15: XPath filters after the per-parent index; the chain cannot
  ['//XCUIElementTypeCell[2][@name="a"]', 'RC15: index before a filter (E12)'],
];

// =====================================================================
// LINT_CASES — validateAndFixClassChain on EXISTING chains (the "fix" path).
// { chain, valid, fixed? }  — fixed defaults to chain when omitted.
// =====================================================================
const LINT_CASES = [
  { chain: `${CC}**/XCUIElementTypeButton[\`label == "Done"\`]`, valid: true },
  { chain: `${CC}**/XCUIElementTypeButton[\`name == "x"\`][1]`, valid: true },
  // case-insensitive CONTAINS[c] modifier must survive untouched
  { chain: `${CC}**/XCUIElementTypeButton[\`name == "Widget.primaryButton" AND label CONTAINS[c] "okay"\`]`, valid: true },

  // --- audit RC6: what WDA rejects must fail; valid NSPredicate must not be flagged (both checked in mini-WDA) ---
  { chain: `${CC}**/*[\`name\`]`, valid: false },                       // no comparison
  { chain: `${CC}**/*[\`1\`]`, valid: false },                          // index inside a backtick block

  // --- B1: a quote, ] or doubled backtick inside a literal is text; real imbalance still fails ---
  { chain: `${CC}**/*[\`label == 'a"b'\`]`, valid: true },
  { chain: `${CC}**/*[\`label CONTAINS "a]b"\`]`, valid: true },
  { chain: `${CC}**/*[\`label == "a\`\`b"\`]`, valid: true },
  { chain: `${CC}**/*[\`label == "a\`]`, valid: false },                  // unclosed literal
  { chain: `${CC}**/*[\`label == 'a"\`]`, valid: false },                 // ' opened, never closed
  { chain: `${CC}**/*[\`label == "a"\`][1`, valid: false },               // missing ]
  { chain: `${CC}**/*[\`label == "a"\`]]`, valid: false },                // extra ]
  { chain: `${CC}**/*[\`matches(name, "a")\`]`, valid: false },         // XPath function
  { chain: `${CC}**/XCUIElementTypeCell[\`name == "a" AND .//XCUIElementTypeButton\`]`, valid: false }, // XPath path
  { chain: `${CC}**/*[name == "a"]`, valid: false },                      // predicate without backticks
  { chain: `${CC}**/*[\`NOT (name == "a")\`]`, valid: true },
  { chain: `${CC}**/*[\`name CONTAINS ("a")\`]`, valid: true },
  { chain: `${CC}**/*[\`label.length > 3 AND rect.x >= 0\`]`, valid: true },
  { chain: `${CC}**/*[\`name IN {"a","b"}\`]`, valid: true },
  { chain: `${CC}**/*[$name == "a"$]`, valid: true },
  { chain: `${CC}**/*[\`name == "f(x) a/b"\`][-1]`, valid: true },  // syntax inside a string is just text
  // --- audit RC11/RC12/RC13 ---
  { chain: `${CC}**/*[\`label == "$5 and @x"\`]`, valid: true },                   // `@` in a value stays
  { chain: `${CC}**/XCUIElementTypeButton[\`name == "abc*"\`]`, valid: true },       // `==` with `*` is a literal match
  { chain: `${CC}**/*[\`type CONTAINS "XCUIElementTypeText"\`]`, valid: true },      // TextField and TextView both match: no collapse
  { chain: `${CC}**/*[\`type == "XCUIElementTypeButton" OR name == "x"\`]`, valid: true }, // OR: dropping the type clause would widen it
  { chain: `${CC}**/*[\`type == "XCUIElementTypeLabel"\`]`, valid: true },         // unknown type name: WDA would read the step as Other
  { chain: `${CC}**/*[\`type BEGINSWITH "XCUIElementTypeButton" AND name == "x"\`]`, valid: true, fixed: `${CC}**/XCUIElementTypeButton[\`name == "x"\`]` },
];

// =====================================================================
// DETECT_CASES — isLikelyIosLocator: the prefix-free scanner gate.
// [string, shouldMatch]
// =====================================================================
const DETECT_CASES = [
  // real iOS locators — detected with no ios:/android: prefix needed
  ['//XCUIElementTypeButton[@name="OK"]', true],
  ['//*[contains(@label, "Save")]', true],
  ['//XCUIElementTypeWebView', true], // element type, no predicate
  ['//XCUIElementTypeTextField[1]', true], // index-only predicate
  [`${CC}**/XCUIElementTypeButton[\`name == "x"\`]`, true], // existing class chain

  // grouped XPath patterns — detected via the unwrapped core
  ['(//XCUIElementTypeButton[@name="OK"])[1]', true],
  ['(//XCUIElementTypeButton[@name="OK"])', true],
  ['(//XCUIElementTypeOther[@name="x"])[${option + 1}]', true],

  // NOT locators — must be left alone even though they start with '//'
  ['//cdn.example.com/lib.js', false], // protocol-relative URL
  ['// just a comment lifted into a string', false],
  ['//foo/bar/baz', false], // path-like, no iOS signal
  ['#bottom_bar_tab_scanner', false], // android resource-id, no '//'
  ['//XCUIElementTypeButton[@name="OK"', false], // unbalanced bracket
];

// =====================================================================
// FLAGS_CASES — parseFlags CLI parsing. { argv, expect: subset to match }
// (dryRun default is the script's DRY_RUN = true — safer; --write to opt in)
// =====================================================================
const FLAGS_CASES = [
  // The bare command previews. The optimizer is on in both modes, so the
  // preview predicts exactly what --write would save.
  { argv: ['./src'], expect: { positionals: ['./src'], dryRun: true, json: false, quiet: false, optimize: true } },
  { argv: ['./src', '--write'], expect: { dryRun: false, optimize: true } },
  { argv: ['./src', '--dry-run'], expect: { positionals: ['./src'], dryRun: true } },
  { argv: ['--write'], expect: { dryRun: false } },
  { argv: ['--dry-run', '--write'], expect: { dryRun: true } }, // --dry-run wins
  { argv: ['--json'], expect: { json: true, quiet: true } }, // --json implies --quiet
  { argv: ['--quiet'], expect: { quiet: true, json: false } },
  { argv: ['//XCUIElementTypeButton', '--json'], expect: { positionals: ['//XCUIElementTypeButton'], json: true } },
  { argv: ['--optimize'], expect: { optimize: true } },
  { argv: ['./src', '--optimize', '--write'], expect: { optimize: true, dryRun: false } },
  // --help / --version, long and short forms
  { argv: ['--help'], expect: { help: true, version: false, unknown: [] } },
  { argv: ['-h'], expect: { help: true } },
  { argv: ['--version'], expect: { version: true, help: false } },
  { argv: ['-V'], expect: { version: true } },
  // Unknown flags are collected, never silently ignored. A typo'd --optimise
  // must NOT come back as optimize:true, and must be reported.
  { argv: ['./src', '--optimise'], expect: { unknown: ['--optimise'], positionals: ['./src'] } },
  // --optimize is still accepted (no-op) so existing commands keep working.
  { argv: ['./src', '--optimize'], expect: { unknown: [], optimize: true } },
  // A typo'd write flag is caught as unknown and the CLI exits before scanning.
  { argv: ['--wirte'], expect: { unknown: ['--wirte'] } },
  { argv: ['--nope', '-x'], expect: { unknown: ['--nope', '-x'] } },
  // Short flags must not be mistaken for positionals.
  { argv: ['./src', '-h'], expect: { positionals: ['./src'] } },
  // A fully valid invocation reports nothing unknown.
  { argv: ['./src', '--write', '--optimize'], expect: { unknown: [] } },
];

// =====================================================================
// OPTIMIZE_CASES — convertXpathToClassChain WITH { optimize: true }.
// `*` in a value is a literal character in both XPath `=` and NSPredicate
// `==`, so it stays `==` (audit RC13: rewriting to LIKE widened the match).
// =====================================================================
const OPTIMIZE_CASES = [
  {
    xpath: '//XCUIElementTypeButton[@name="abc*"]',
    optimized: `${CC}**/XCUIElementTypeButton[\`name == "abc*"\`]`,
  },
  {
    xpath: '//XCUIElementTypeStaticText[@label="*done"]',
    optimized: `${CC}**/XCUIElementTypeStaticText[\`label == "*done"\`]`,
  },
  // the optimizer reorders conditions cheapest-first: the boolean before the string
  {
    xpath: '//XCUIElementTypeButton[contains(@name,"login") and @enabled="true"]',
    optimized: `${CC}**/XCUIElementTypeButton[\`enabled == true AND name CONTAINS "login"\`]`,
  },
  // type-collapse (validator) on the same chain
  {
    xpath: '//*[contains(@type,"XCUIElementTypeButton") and @name="abc*"]',
    optimized: `${CC}**/XCUIElementTypeButton[\`name == "abc*"\`]`,
  },
];

// Existing-class-chain cases: optimizeClassChain on chains already in the code.
const OPTIMIZE_CHAIN_CASES = [
  // `==` with `*` is a valid literal match — left alone
  {
    input: `${CC}**/XCUIElementTypeButton[\`name == "abc*"\`]`,
    fixed: `${CC}**/XCUIElementTypeButton[\`name == "abc*"\`]`,
  },
  // LIKE written by the user is a no-op (fixed point reached immediately)
  {
    input: `${CC}**/XCUIElementTypeButton[\`name LIKE "abc*"\`]`,
    fixed: `${CC}**/XCUIElementTypeButton[\`name LIKE "abc*"\`]`,
  },
  // No wildcards anywhere — optimizer leaves the chain untouched
  {
    input: `${CC}**/XCUIElementTypeButton[\`name == "Submit"\`]`,
    fixed: `${CC}**/XCUIElementTypeButton[\`name == "Submit"\`]`,
  },

  // XCUIElementTypeAny → * normalization
  {
    input: `${CC}**/XCUIElementTypeAny[\`label == "Done"\`]`,
    fixed: `${CC}**/*[\`label == "Done"\`]`,
  },
  // XCUIElementTypeAny in a multi-step chain
  {
    input: `${CC}**/XCUIElementTypeCell/XCUIElementTypeAny[\`name == "x"\`]`,
    fixed: `${CC}**/XCUIElementTypeCell/*[\`name == "x"\`]`,
  },

  // Single-value IN set → == (hash comparison, same semantics, faster)
  {
    input: `${CC}**/XCUIElementTypeButton[\`label IN {"Submit"}\`]`,
    fixed: `${CC}**/XCUIElementTypeButton[\`label == "Submit"\`]`,
  },

  // An ESCAPED backtick inside the predicate value — Appium's way of writing a
  // literal ` in an NSPredicate block. PREDICATE_REGEX must not treat it as the
  // end of the backtick block: when it did, this predicate matched NOTHING and
  // every optimizer rule routed through that regex silently skipped it.
  {
    input: `${CC}**/XCUIElementTypeCell[\`label IN {"a\\\`b"}\`]`,
    fixed: `${CC}**/XCUIElementTypeCell[\`label == "a\\\`b"\`]`,
  },
  // audit RC7 in the optimizer: AND binds tighter than OR, so merged OR blocks keep their parentheses
  {
    input: `${CC}**/*[\`name == "a" OR label == "b"\`][\`value == "c"\`]`,
    fixed: `${CC}**/*[\`(name == "a" OR label == "b") AND value == "c"\`]`,
  },
  {
    input: `${CC}**/XCUIElementTypeCell[\`visible == 1\`]/XCUIElementTypeButton[\`name == "a" OR label == "b"\`]`,
    fixed: `${CC}**/XCUIElementTypeCell/XCUIElementTypeButton[\`(name == "a" OR label == "b") AND visible == 1\`]`,
  },
  // Multi-value IN stays untouched — semantics differ
  {
    input: `${CC}**/XCUIElementTypeButton[\`label IN {"Ok", "Okay"}\`]`,
    fixed: `${CC}**/XCUIElementTypeButton[\`label IN {"Ok", "Okay"}\`]`,
  },

  // --- Rule 4: collapse **/**/ → **/ ---
  // Root double-star: **/**/ at the start collapses to **/
  {
    input: `${CC}**/**/XCUIElementTypeButton[\`name == "OK"\`]`,
    fixed: `${CC}**/XCUIElementTypeButton[\`name == "OK"\`]`,
  },
  // Three consecutive **/ collapse to one
  {
    input: `${CC}**/**/**/XCUIElementTypeButton[\`name == "OK"\`]`,
    fixed: `${CC}**/XCUIElementTypeButton[\`name == "OK"\`]`,
  },
  // Single **/ is untouched (no consecutive pair to collapse)
  {
    input: `${CC}**/XCUIElementTypeTable/XCUIElementTypeCell[\`name == "Row"\`]`,
    fixed: `${CC}**/XCUIElementTypeTable/XCUIElementTypeCell[\`name == "Row"\`]`,
  },

  // --- Rule 1: strip no-predicate XCUIElementTypeOther / Window intermediates ---
  // Window + multiple Others before the real target
  {
    input: `${CC}**/XCUIElementTypeWindow/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeButton[\`name == "Submit"\`]`,
    fixed: `${CC}**/XCUIElementTypeButton[\`name == "Submit"\`]`,
  },
  // Other between two semantic nodes: gap becomes /**/
  {
    input: `${CC}**/XCUIElementTypeCell[\`name == "Account"\`]/XCUIElementTypeOther/XCUIElementTypeStaticText`,
    fixed: `${CC}**/XCUIElementTypeCell[\`name == "Account"\`]/**/XCUIElementTypeStaticText`,
  },
  // Other WITH a predicate is kept — it genuinely narrows the search
  {
    input: `${CC}**/XCUIElementTypeOther[\`name == "Container"\`]/XCUIElementTypeButton[\`label == "Go"\`]`,
    fixed: `${CC}**/XCUIElementTypeOther[\`name == "Container"\`]/XCUIElementTypeButton[\`label == "Go"\`]`,
  },
  // Single-step chain: nothing to strip (final target kept unconditionally)
  {
    input: `${CC}**/XCUIElementTypeOther[\`name == "x"\`]`,
    fixed: `${CC}**/XCUIElementTypeOther[\`name == "x"\`]`,
  },

  // --- Rule 11: reorder AND conditions cheapest-first ---
  // CONTAINS (cost 4) moves after == (cost 1)
  {
    input: `${CC}**/XCUIElementTypeCell[\`label CONTAINS "due" AND name == "task_42"\`]`,
    fixed: `${CC}**/XCUIElementTypeCell[\`name == "task_42" AND label CONTAINS "due"\`]`,
  },
  // Already ordered — no change
  {
    input: `${CC}**/XCUIElementTypeCell[\`name == "x" AND label CONTAINS "y"\`]`,
    fixed: `${CC}**/XCUIElementTypeCell[\`name == "x" AND label CONTAINS "y"\`]`,
  },
  // OR predicate — left untouched (reordering across OR changes precedence)
  {
    input: `${CC}**/XCUIElementTypeCell[\`label CONTAINS "due" OR name == "x"\`]`,
    fixed: `${CC}**/XCUIElementTypeCell[\`label CONTAINS "due" OR name == "x"\`]`,
  },
  // Three conditions sorted: == (1) < BEGINSWITH (2) < CONTAINS (4)
  {
    input: `${CC}**/XCUIElementTypeCell[\`label CONTAINS "due" AND name == "id" AND title BEGINSWITH "Q"\`]`,
    fixed: `${CC}**/XCUIElementTypeCell[\`name == "id" AND title BEGINSWITH "Q" AND label CONTAINS "due"\`]`,
  },

  // --- Rule 8: strip redundant type == when chain node already specifies that type ---
  // type == leading — stripped
  {
    input: `${CC}**/XCUIElementTypeButton[\`type == "XCUIElementTypeButton" AND name == "OK"\`]`,
    fixed: `${CC}**/XCUIElementTypeButton[\`name == "OK"\`]`,
  },
  // type == trailing — stripped
  {
    input: `${CC}**/XCUIElementTypeButton[\`name == "OK" AND type == "XCUIElementTypeButton"\`]`,
    fixed: `${CC}**/XCUIElementTypeButton[\`name == "OK"\`]`,
  },
  // type == is the only condition — bracket removed entirely
  {
    input: `${CC}**/XCUIElementTypeButton[\`type == "XCUIElementTypeButton"\`]`,
    fixed: `${CC}**/XCUIElementTypeButton`,
  },
  // Different type in predicate — not touched (e.g. a deliberate cross-type check)
  {
    input: `${CC}**/XCUIElementTypeButton[\`type == "XCUIElementTypeStaticText" AND name == "OK"\`]`,
    fixed: `${CC}**/XCUIElementTypeButton[\`type == "XCUIElementTypeStaticText" AND name == "OK"\`]`,
  },

  // --- Rule 7: defer visible == 1 from intermediate steps to the final target ---
  // Single intermediate with predicate, final has existing predicate
  {
    input: `${CC}**/XCUIElementTypeTable[\`visible == 1\`]/XCUIElementTypeCell/XCUIElementTypeButton[\`name == "Submit"\`]`,
    fixed: `${CC}**/XCUIElementTypeTable/XCUIElementTypeCell/XCUIElementTypeButton[\`name == "Submit" AND visible == 1\`]`,
  },
  // Two intermediates both carry visible — merged once onto final
  {
    input: `${CC}**/XCUIElementTypeTable[\`visible == 1\`]/XCUIElementTypeCell[\`visible == 1\`]/XCUIElementTypeButton[\`name == "Submit"\`]`,
    fixed: `${CC}**/XCUIElementTypeTable/XCUIElementTypeCell/XCUIElementTypeButton[\`name == "Submit" AND visible == 1\`]`,
  },
  // Final step has no predicate yet — new predicate block inserted
  {
    input: `${CC}**/XCUIElementTypeTable[\`visible == 1\`]/XCUIElementTypeButton`,
    fixed: `${CC}**/XCUIElementTypeTable/XCUIElementTypeButton[\`visible == 1\`]`,
  },
  // Final step already has visible == 1 — stripped from intermediate, not duplicated
  {
    input: `${CC}**/XCUIElementTypeTable[\`visible == 1\`]/XCUIElementTypeButton[\`visible == 1 AND name == "OK"\`]`,
    fixed: `${CC}**/XCUIElementTypeTable/XCUIElementTypeButton[\`visible == 1 AND name == "OK"\`]`,
  },
  // Single-step chain — nothing to defer
  {
    input: `${CC}**/XCUIElementTypeButton[\`visible == 1 AND name == "OK"\`]`,
    fixed: `${CC}**/XCUIElementTypeButton[\`visible == 1 AND name == "OK"\`]`,
  },

  // --- Rule 6: merge adjacent backtick predicate blocks on the same step ---
  // Two backtick blocks merged with AND (acceptance-criteria case)
  {
    input: `${CC}**/XCUIElementTypeCell[\`name == "x"\`][\`visible == 1\`]`,
    fixed: `${CC}**/XCUIElementTypeCell[\`name == "x" AND visible == 1\`]`,
  },
  // Three consecutive backtick blocks merged into one
  {
    input: `${CC}**/XCUIElementTypeCell[\`name == "x"\`][\`visible == 1\`][\`enabled == 1\`]`,
    fixed: `${CC}**/XCUIElementTypeCell[\`name == "x" AND visible == 1 AND enabled == 1\`]`,
  },
  // Backtick + numeric index — left unmerged (acceptance-criteria case)
  {
    input: `${CC}**/XCUIElementTypeCell[\`name == "x"\`][2]`,
    fixed: `${CC}**/XCUIElementTypeCell[\`name == "x"\`][2]`,
  },
  // Numeric index + backtick — left unmerged
  {
    input: `${CC}**/XCUIElementTypeCell[2][\`name == "x"\`]`,
    fixed: `${CC}**/XCUIElementTypeCell[2][\`name == "x"\`]`,
  },
  // Non-consecutive backtick blocks (index between them) — not merged across index
  {
    input: `${CC}**/XCUIElementTypeCell[\`name == "x"\`][2][\`visible == 1\`]`,
    fixed: `${CC}**/XCUIElementTypeCell[\`name == "x"\`][2][\`visible == 1\`]`,
  },
  // Single backtick predicate — no-op (fixed point)
  {
    input: `${CC}**/XCUIElementTypeCell[\`name == "x"\`]`,
    fixed: `${CC}**/XCUIElementTypeCell[\`name == "x"\`]`,
  },
  // Lone index bracket — no-op (fixed point)
  {
    input: `${CC}**/XCUIElementTypeCell[2]`,
    fixed: `${CC}**/XCUIElementTypeCell[2]`,
  },
  // Multi-step: only the step with two backtick blocks is merged
  {
    input: `${CC}**/XCUIElementTypeTable/XCUIElementTypeCell[\`name == "row"\`][\`visible == 1\`]`,
    fixed: `${CC}**/XCUIElementTypeTable/XCUIElementTypeCell[\`name == "row" AND visible == 1\`]`,
  },

  // --- `/**/` separator must survive every rule that re-parses the chain. ---
  // Regression: parseChainSteps consumed the `/` then broke on `**/`, emitting
  // an empty node that was discarded — so the `/` was silently dropped and
  // `Table/**/Cell` came back as `Table**/Cell`, still reported valid.
  {
    input: `${CC}**/XCUIElementTypeTable/**/XCUIElementTypeCell`,
    fixed: `${CC}**/XCUIElementTypeTable/**/XCUIElementTypeCell`,
  },
  // …and while mergeSiblingPredicates rewrites the same chain.
  {
    input: `${CC}**/XCUIElementTypeTable/**/XCUIElementTypeCell[\`a == "1"\`][\`b == "2"\`]`,
    fixed: `${CC}**/XCUIElementTypeTable/**/XCUIElementTypeCell[\`a == "1" AND b == "2"\`]`,
  },
  // …and while deferVisibleToFinalStep moves a predicate across the gap.
  {
    input: `${CC}**/XCUIElementTypeTable[\`visible == 1\`]/**/XCUIElementTypeCell/XCUIElementTypeButton[\`name == "OK"\`]`,
    fixed: `${CC}**/XCUIElementTypeTable/**/XCUIElementTypeCell/XCUIElementTypeButton[\`name == "OK" AND visible == 1\`]`,
  },
  // Multiple gaps in one chain.
  {
    input: `${CC}**/XCUIElementTypeTable/**/XCUIElementTypeCell/**/XCUIElementTypeButton`,
    fixed: `${CC}**/XCUIElementTypeTable/**/XCUIElementTypeCell/**/XCUIElementTypeButton`,
  },

  // --- Rule 11 costs the operator, not the data. ---
  // Regression: `\bLIKE\b` was tested against the whole condition, so a value
  // containing the word LIKE was costed 5 and sorted last instead of first.
  {
    input: `${CC}**/XCUIElementTypeButton[\`name CONTAINS "z" AND label == "I LIKE it"\`]`,
    fixed: `${CC}**/XCUIElementTypeButton[\`label == "I LIKE it" AND name CONTAINS "z"\`]`,
  },
  {
    input: `${CC}**/XCUIElementTypeButton[\`name MATCHES "^a" AND label == "we CONTAINS it"\`]`,
    fixed: `${CC}**/XCUIElementTypeButton[\`label == "we CONTAINS it" AND name MATCHES "^a"\`]`,
  },
];

// =====================================================================
// RUNNER
// =====================================================================
let passed = 0;
let failed = 0;
const fail = (msg) => { failed++; console.error(`❌ ${msg}`); };
const ok = () => { passed++; };

console.log('— CONVERT —');
for (const [xpath, expect] of CONVERT_CASES) {
  const { locator, status } = convertXpathToClassChain(xpath);
  const got = status === 'success' ? locator : null;
  if (got === expect) ok();
  else fail(`CONVERT ${xpath}\n     expected: ${expect}\n     got:      ${got}  (status: ${status})`);
}

console.log('— SKIP —');
for (const [xpath, why] of SKIP_CASES) {
  const { locator, status } = convertXpathToClassChain(xpath);
  const skipped = status !== 'success';
  // For real XPath inputs the locator should also come back unchanged.
  const unchanged = locator === xpath;
  if (skipped && unchanged) ok();
  else fail(`SKIP (${why}) ${xpath}\n     expected: skip+unchanged\n     got:      status=${status} locator=${locator}`);
}

// RC-D1: a grouped position is converted, but WDA counts class chain matches in
// XCTest query order (breadth-first) and XPath in document order, so the result
// carries a warning that the --json report passes on.
console.log('— WARNINGS —');
const POSITION_WARNING = /grouped position/;
for (const [xpath, warned] of [
  ['(//XCUIElementTypeButton)[2]', true], // E02
  ['(//XCUIElementTypeOther[@name="row"])[${index}]', true],
  ['(//XCUIElementTypeStaticText/child::XCUIElementTypeStaticText[2])[1]', true], // outer [1] dropped
  ['(//*[contains(@name, "Balance,")]/child::*[2])[${transaction}]', true], // outer index moved to the parent
  ['(//XCUIElementTypeButton[@name="OK"])', false],
  ['//XCUIElementTypeButton[2]', false],
  ['//XCUIElementTypeButton[@name="OK"]', false],
]) {
  const res = convertXpathToClassChain(xpath);
  const got = res.status === 'success' && POSITION_WARNING.test(res.warning || '');
  if (res.status === 'success' && got === warned && (warned || res.warning === undefined)) ok();
  else fail(`WARNING ${xpath}\n     expected: ${warned ? 'a grouped-position warning' : 'no warning'}\n     got:      status=${res.status} warning=${res.warning}`);
}

console.log('— LINT —');
for (const { chain, valid, fixed } of LINT_CASES) {
  const res = validateAndFixClassChain(chain);
  const wantFixed = fixed === undefined ? chain : fixed;
  if (res.valid === valid && (!valid || res.fixedLocator === wantFixed)) ok();
  else fail(`LINT ${chain}\n     expected: valid=${valid} fixed=${wantFixed}\n     got:      valid=${res.valid} fixed=${res.fixedLocator} reason=${res.reason}`);
}

console.log('— TOKENIZER —');
const tokenChecks = [
  ['//Cell[@name="a/b"]/Text', ['//', 'Cell[@name="a/b"]', '/', 'Text']],
  ['//a/b//c', ['//', 'a', '/', 'b', '//', 'c']],
  ['//*[@name="x/y" and @label="p/q"]', ['//', '*[@name="x/y" and @label="p/q"]']],
];
for (const [input, expect] of tokenChecks) {
  const got = tokenizeXpath(input).filter(t => t.length > 0);
  if (JSON.stringify(got) === JSON.stringify(expect)) ok();
  else fail(`TOKENIZER ${input}\n     expected: ${JSON.stringify(expect)}\n     got:      ${JSON.stringify(got)}`);
}

console.log('— DETECT —');
for (const [str, shouldMatch] of DETECT_CASES) {
  const got = isLikelyIosLocator(str);
  if (got === shouldMatch) ok();
  else fail(`DETECT ${str}\n     expected: ${shouldMatch}\n     got:      ${got}`);
}

console.log('— FLAGS —');
for (const { argv, expect } of FLAGS_CASES) {
  const got = parseFlags(argv);
  const mismatch = Object.keys(expect).find(k => JSON.stringify(got[k]) !== JSON.stringify(expect[k]));
  if (!mismatch) ok();
  else fail(`FLAGS ${JSON.stringify(argv)}\n     key '${mismatch}' expected: ${JSON.stringify(expect[mismatch])}\n     got:      ${JSON.stringify(got[mismatch])}`);
}

console.log('— OPTIMIZE: XPath path —');
for (const { xpath, optimized } of OPTIMIZE_CASES) {
  const opt = convertXpathToClassChain(xpath, { optimize: true });
  if (opt.status === 'success' && opt.locator === optimized) ok();
  else fail(`OPTIMIZE ${xpath}\n     expected: ${optimized}\n     got:      ${opt.locator}  (status: ${opt.status})`);
}

console.log('— OPTIMIZE: existing chain —');
for (const { input, fixed } of OPTIMIZE_CHAIN_CASES) {
  const res = optimizeClassChain(input);
  if (res.valid && res.fixedLocator === fixed) ok();
  else fail(`OPTIMIZE CHAIN ${input}\n     expected: ${fixed}\n     got:      ${res.fixedLocator}  (valid=${res.valid}, reason=${res.reason})`);
}

// =====================================================================
// SCANNER — makeStats, walkDir, processFile against real on-disk fixtures.
// Uses os.tmpdir() so the host repo is never touched; each block cleans up
// its own directory at the end.
// =====================================================================
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } = require('fs');
const { tmpdir } = require('os');
const { join } = require('path');
const { makeStats, walkDir, processFile } = require('./lib/scanner');
const { PREDICATE_REGEX } = require('./lib/predicates');
const STATUS = require('./lib/status');

function makeTempRoot(prefix = 'xpath-test-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

console.log('— SCANNER: makeStats —');
{
  const a = makeStats();
  const b = makeStats();
  a.filesScanned++;
  a.skipped.android++;
  if (b.filesScanned === 0 && b.skipped.android === 0) ok();
  else fail(`makeStats: instances share state (b.filesScanned=${b.filesScanned}, b.skipped.android=${b.skipped.android})`);
}

console.log('— SCANNER: walkDir —');
{
  const root = makeTempRoot('xpath-walk-');
  try {
    mkdirSync(join(root, 'src'));
    mkdirSync(join(root, 'src', 'pages'));
    mkdirSync(join(root, 'node_modules'));
    mkdirSync(join(root, 'node_modules', 'pkg'));
    writeFileSync(join(root, 'src', 'a.js'), '// a');
    writeFileSync(join(root, 'src', 'pages', 'b.ts'), '// b');
    writeFileSync(join(root, 'node_modules', 'pkg', 'c.js'), '// ignored');

    const visited = [];
    walkDir(root, p => visited.push(p.slice(root.length + 1).replace(/\\/g, '/')));

    const visitedSorted = [...visited].sort();
    const expected = ['src/a.js', 'src/pages/b.ts'];
    if (JSON.stringify(visitedSorted) === JSON.stringify(expected)) ok();
    else fail(`walkDir: expected ${JSON.stringify(expected)}, got ${JSON.stringify(visitedSorted)}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

console.log('— SCANNER: processFile —');
{
  // dry-run: source stays untouched even when locators get converted
  const root = makeTempRoot('xpath-dry-');
  try {
    const file = join(root, 'a.js');
    const before = `const locator = '//XCUIElementTypeButton[@name="OK"]';`;
    writeFileSync(file, before);

    const records = [];
    const stats = makeStats();
    processFile(file, { dryRun: true, quiet: true }, records, stats);

    const after = readFileSync(file, 'utf8');
    if (after === before) ok();
    else fail(`processFile dry-run: file changed on disk\n     before: ${before}\n     after:  ${after}`);

    if (stats.filesScanned === 1 && stats.locatorsFound === 1 && stats.locatorsUpdated === 1) ok();
    else fail(`processFile dry-run: stats wrong ${JSON.stringify(stats)}`);

    if (records.length === 1 && records[0].changed && records[0].status === 'success') ok();
    else fail(`processFile dry-run: records wrong ${JSON.stringify(records)}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  // write mode: file actually gets rewritten with the converted locator
  const root = makeTempRoot('xpath-write-');
  try {
    const file = join(root, 'a.js');
    writeFileSync(file, `const locator = '//XCUIElementTypeButton[@name="OK"]';`);

    const records = [];
    const stats = makeStats();
    processFile(file, { dryRun: false, quiet: true }, records, stats);

    const after = readFileSync(file, 'utf8');
    const expected = `const locator = '-ios class chain:**/XCUIElementTypeButton[\`name == "OK"\`]';`;
    if (after === expected) ok();
    else fail(`processFile write: rewrite mismatch\n     expected: ${expected}\n     got:      ${after}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  // unsupported extension is fully skipped (no stats, no records, no read attempt)
  const root = makeTempRoot('xpath-ext-');
  try {
    const file = join(root, 'a.unknown');
    writeFileSync(file, `const locator = '//XCUIElementTypeButton[@name="OK"]';`);

    const records = [];
    const stats = makeStats();
    processFile(file, { dryRun: true, quiet: true }, records, stats);

    if (stats.filesScanned === 0 && records.length === 0) ok();
    else fail(`processFile: should skip unsupported extension; stats=${JSON.stringify(stats)}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  // an already-valid class chain is a no-op: file unchanged, status = skipped_no_change
  const root = makeTempRoot('xpath-noop-');
  try {
    const file = join(root, 'a.js');
    const source = `const locator = '-ios class chain:**/XCUIElementTypeButton[\`name == "OK"\`]';`;
    writeFileSync(file, source);

    const records = [];
    const stats = makeStats();
    processFile(file, { dryRun: false, quiet: true }, records, stats);

    const after = readFileSync(file, 'utf8');
    if (after === source) ok();
    else fail(`processFile no-op: rewrote a valid chain\n     before: ${source}\n     after:  ${after}`);
    if (stats.locatorsFound === 1 && stats.locatorsUpdated === 0 && stats.skipped.noChangeNeeded === 1) ok();
    else fail(`processFile no-op: stats wrong ${JSON.stringify(stats)}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  // opts.optimize plumbs through processFile end-to-end: the optimizer's
  // cheapest-first reordering shows up in the rewritten file.
  const root = makeTempRoot('xpath-opt-');
  try {
    const file = join(root, 'a.js');
    writeFileSync(file, `const locator = '//XCUIElementTypeButton[contains(@name,"login") and @enabled="true"]';`);

    const records = [];
    const stats = makeStats();
    processFile(file, { dryRun: false, quiet: true, optimize: true }, records, stats);

    const after = readFileSync(file, 'utf8');
    const expected = `const locator = '-ios class chain:**/XCUIElementTypeButton[\`enabled == true AND name CONTAINS "login"\`]';`;
    if (after === expected) ok();
    else fail(`processFile --optimize: rewrite mismatch\n     expected: ${expected}\n     got:      ${after}`);
    if (stats.locatorsUpdated === 1 && stats.skipped.validationFailed === 0) ok();
    else fail(`processFile --optimize: stats wrong ${JSON.stringify(stats)}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  // locator under an `android:` key is skipped even without android. in the value
  const root = makeTempRoot('xpath-android-key-');
  try {
    const file = join(root, 'a.js');
    writeFileSync(file, [
      `const loc = { ios: '//XCUIElementTypeButton[@name="OK"]', android: '//XCUIElementTypeButton[@name="OK"]' };`,
    ].join('\n'));

    const records = [];
    const stats = makeStats();
    processFile(file, { dryRun: true, quiet: true }, records, stats);

    if (stats.locatorsFound === 2 && stats.locatorsUpdated === 1 && stats.skipped.android === 1) ok();
    else fail(`processFile android-key: stats wrong ${JSON.stringify(stats)}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  // locator on an `android:` line inside a ternary is skipped; ios: on the same
  // line is NOT affected (regression guard for the "last platform key" fix)
  const root = makeTempRoot('xpath-android-ternary-');
  try {
    const file = join(root, 'a.js');
    writeFileSync(file, [
      `const loc = {`,
      `  android: single ? someCode : '//XCUIElementTypeButton[@name="OK"]',`,
      `  ios: '//XCUIElementTypeButton[@name="OK"]',`,
      `};`,
    ].join('\n'));

    const records = [];
    const stats = makeStats();
    processFile(file, { dryRun: true, quiet: true }, records, stats);

    if (stats.locatorsFound === 2 && stats.locatorsUpdated === 1 && stats.skipped.android === 1) ok();
    else fail(`processFile android-ternary: stats wrong ${JSON.stringify(stats)}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  // multiple locators in one file accumulate into the same stats object
  const root = makeTempRoot('xpath-multi-');
  try {
    const file = join(root, 'a.js');
    writeFileSync(file, [
      `const a = '//XCUIElementTypeButton[@name="OK"]';`,
      `const b = '//XCUIElementTypeStaticText[@label="Hi"]';`,
      `const c = '//android.widget.TextView[@text="Hi"]';`, // android (has @-attr signal) — counted, skipped
      `const d = '//cdn.example.com/lib.js';`,              // not a locator — ignored entirely
    ].join('\n'));

    const records = [];
    const stats = makeStats();
    processFile(file, { dryRun: true, quiet: true }, records, stats);

    if (stats.locatorsFound === 3 && stats.locatorsUpdated === 2 && stats.skipped.android === 1) ok();
    else fail(`processFile multi: stats wrong ${JSON.stringify(stats)}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  // grouped XPath (//...)[n] in write mode: scanner captures and converts
  const root = makeTempRoot('xpath-grouped-');
  try {
    const file = join(root, 'a.js');
    writeFileSync(file, `const locator = '(//XCUIElementTypeOther[@name="radio button"])[2]';`);

    const records = [];
    const stats = makeStats();
    processFile(file, { dryRun: false, quiet: true }, records, stats);

    const after = readFileSync(file, 'utf8');
    const expected = `const locator = '-ios class chain:**/XCUIElementTypeOther[\`name == "radio button"\`][2]';`;
    if (after === expected) ok();
    else fail(`processFile grouped [n]: rewrite mismatch\n     expected: ${expected}\n     got:      ${after}`);
    if (stats.locatorsFound === 1 && stats.locatorsUpdated === 1) ok();
    else fail(`processFile grouped [n]: stats wrong ${JSON.stringify(stats)}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  // bare grouped XPath (//...) without an outer index
  const root = makeTempRoot('xpath-grouped-bare-');
  try {
    const file = join(root, 'a.js');
    writeFileSync(file, `const locator = '(//XCUIElementTypeImage[@name="right_arrow"])';`);

    const records = [];
    const stats = makeStats();
    processFile(file, { dryRun: false, quiet: true }, records, stats);

    const after = readFileSync(file, 'utf8');
    const expected = `const locator = '-ios class chain:**/XCUIElementTypeImage[\`name == "right_arrow"\`]';`;
    if (after === expected) ok();
    else fail(`processFile grouped bare: rewrite mismatch\n     expected: ${expected}\n     got:      ${after}`);
    if (stats.locatorsFound === 1 && stats.locatorsUpdated === 1) ok();
    else fail(`processFile grouped bare: stats wrong ${JSON.stringify(stats)}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  // multiline template literal locator is matched and converted (dotAll fix)
  const root = makeTempRoot('xpath-multiline-');
  try {
    const file = join(root, 'a.js');
    writeFileSync(file, 'const loc = `//XCUIElementTypeStaticText\n  [@name="hello"]`;');

    const records = [];
    const stats = makeStats();
    processFile(file, { dryRun: true, quiet: true }, records, stats);

    if (stats.locatorsFound === 1) ok();
    else fail(`processFile multiline: locatorsFound=${stats.locatorsFound}, expected 1`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  // android: key on preceding line (key and value split across lines) — must skip
  const root = makeTempRoot('xpath-android-prevline-');
  try {
    const file = join(root, 'a.js');
    writeFileSync(file, [
      'const x = {',
      "  android:",
      "    '//XCUIElementTypeStaticText[@name=\"Hello\"]',",
      '};',
    ].join('\n'));

    const records = [];
    const stats = makeStats();
    processFile(file, { dryRun: true, quiet: true }, records, stats);

    if (stats.skipped.android === 1 && stats.locatorsUpdated === 0) ok();
    else fail(`android prev-line key: expected android=1 updated=0, got ${JSON.stringify(stats)}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  // ios: key on preceding line (key and value split across lines) — must convert
  const root = makeTempRoot('xpath-ios-prevline-');
  try {
    const file = join(root, 'a.js');
    writeFileSync(file, [
      'const x = {',
      "  ios:",
      "    '//XCUIElementTypeStaticText[@name=\"Hello\"]',",
      '};',
    ].join('\n'));

    const records = [];
    const stats = makeStats();
    processFile(file, { dryRun: true, quiet: true }, records, stats);

    if (stats.locatorsUpdated === 1 && stats.skipped.android === 0) ok();
    else fail(`ios prev-line key: expected updated=1, got ${JSON.stringify(stats)}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  // 'android.' inside a quoted attribute value must NOT trigger the android skip
  const root = makeTempRoot('xpath-android-in-value-');
  try {
    const file = join(root, 'a.js');
    writeFileSync(file, `const loc = '//XCUIElementTypeStaticText[@name="my.android.helper"]';`);

    const records = [];
    const stats = makeStats();
    processFile(file, { dryRun: false, quiet: true }, records, stats);

    const after = readFileSync(file, 'utf8');
    const expected = `const loc = '-ios class chain:**/XCUIElementTypeStaticText[\`name == "my.android.helper"\`]';`;
    if (after === expected) ok();
    else fail(`processFile android-in-value: rewrite mismatch\n     expected: ${expected}\n     got:      ${after}`);
    if (stats.skipped.android === 0 && stats.locatorsUpdated === 1) ok();
    else fail(`processFile android-in-value: stats wrong ${JSON.stringify(stats)}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// --- audit regressions (RC-S1, RC-S2): a locator passed to an explicit XPath
// strategy must not be rewritten. Only the string would change, the strategy
// would stay XPath, and the locator would break at runtime. ---
console.log('— SCANNER: audit regressions —');
{
  const DQ = `//XCUIElementTypeButton[@name='OK']`; // for double-quoted strings
  const SQ = `//XCUIElementTypeButton[@name="OK"]`; // for single-quoted strings
  // [file, source, marker shown in the skip reason]
  const XPATH_STRATEGY_CASES = [
    // Java (RC-S1)
    ['A.java', `e = driver.findElement(AppiumBy.xpath("${DQ}"));`, 'AppiumBy.xpath('],
    ['A.java', `e = driver.findElement(By.xpath("${DQ}"));`, 'By.xpath('],
    ['A.java', `e = driver.findElement(MobileBy.xpath("${DQ}"));`, 'MobileBy.xpath('],
    ['A.java', `@iOSXCUITFindBy(xpath = "${DQ}")\nWebElement e;`, '@iOSXCUITFindBy(xpath ='],
    ['A.java', `@iOSXCUITFindBy(priority = 1, xpath = "${DQ}")\nWebElement e;`, '@iOSXCUITFindBy(priority = 1, xpath ='],
    ['A.java', `@iOSXCUITFindBys({@iOSXCUITBy(xpath = "${DQ}")})\nWebElement e;`, '@iOSXCUITBy(xpath ='],
    ['A.java', `@FindBy(xpath = "${DQ}")\nWebElement e;`, '@FindBy(xpath ='],
    ['A.java', `@FindBy(how = How.XPATH, using = "${DQ}")\nWebElement e;`, 'How.XPATH, using ='],
    ['A.java', `e = driver.findElementByXPath("${DQ}");`, 'findElementByXPath('],
    ['A.java', `e = driver.findElement(\n    AppiumBy.xpath(\n        "${DQ}"));`, 'AppiumBy.xpath('],
    ['A.java', `@iOSXCUITFindBy(\n    xpath = "${DQ}"\n)\nWebElement e;`, '@iOSXCUITFindBy(xpath ='],
    // an earlier run of this tool may already have put a chain under an XPath strategy
    ['A.java', `e = driver.findElement(By.xpath("-ios class chain:**/XCUIElementTypeButton[\`name == 'OK'\`]"));`, 'By.xpath('],
    // Kotlin / Groovy: same client APIs as Java
    ['A.kt', `val e = driver.findElement(AppiumBy.xpath("${DQ}"))`, 'AppiumBy.xpath('],
    ['A.kt', `@iOSXCUITFindBy(xpath = "${DQ}")\nlateinit var e: WebElement`, '@iOSXCUITFindBy(xpath ='],
    ['A.groovy', `def e = driver.findElement(By.xpath('${SQ}'))`, 'By.xpath('],
    // Python (RC-S2)
    ['a.py', `e = driver.find_element(AppiumBy.XPATH, '${SQ}')`, 'AppiumBy.XPATH'],
    ['a.py', `B0 = (By.XPATH, "${DQ}")`, 'By.XPATH'],
    ['a.py', `e = driver.find_element(MobileBy.XPATH, '${SQ}')`, 'MobileBy.XPATH'],
    ['a.py', `e = driver.find_element("xpath", '${SQ}')`, '"xpath"'],
    ['a.py', `e = driver.find_element(by=AppiumBy.XPATH, value='${SQ}')`, 'AppiumBy.XPATH'],
    ['a.py', `e = driver.find_element(\n    AppiumBy.XPATH,\n    '${SQ}',\n)`, 'AppiumBy.XPATH'],
    ['a.py', `e = driver.find_element_by_xpath('${SQ}')`, 'find_element_by_xpath('],
    // C#
    ['A.cs', `var e = driver.FindElement(MobileBy.XPath("${DQ}"));`, 'MobileBy.XPath('],
    ['A.cs', `var e = driver.FindElement(By.XPath("${DQ}"));`, 'By.XPath('],
    ['A.cs', `var e = driver.FindElement("xpath", "${DQ}");`, '"xpath"'],
    ['A.cs', `[FindsByIOSUIAutomation(XPath = "${DQ}")]\nprivate IWebElement e;`, 'FindsByIOSUIAutomation(XPath ='],
    ['A.cs', `[FindsBy(How = How.XPath, Using = "${DQ}")]\nprivate IWebElement e;`, 'How.XPath, Using ='],
    ['A.cs', `var e = driver.FindElementByXPath("${DQ}");`, 'FindElementByXPath('],
    // Ruby
    ['a.rb', `e = driver.find_element(:xpath, '${SQ}')`, ':xpath'],
    ['a.rb', `e = driver.find_element :xpath => '${SQ}'`, ':xpath'],
    ['a.rb', `e = driver.find_element(xpath: '${SQ}')`, 'xpath:'],
    ['a.rb', `e = xpath('${SQ}')`, 'xpath('],
    ['a.rb', `e = xpaths '${SQ}'`, 'xpaths'],
    // JS / TS
    ['a.js', `I.click({ xpath: '${SQ}' });`, 'xpath:'],
    ['a.js', `const loc = {\n  xpath:\n    '${SQ}',\n};`, 'xpath:'],
    ['a.js', 'I.click({ xpath: `//XCUIElementTypeButton[@name="${name}"]` });', 'xpath:'],
    ['a.js', `const e = await driver.findElement('xpath', '${SQ}');`, "'xpath'"],
    ['a.js', `const e = await driver.findElement(By.xpath('${SQ}'));`, 'By.xpath('],
    ['a.ts', `const e = await driver.findElements('xpath', '${SQ}');`, "'xpath'"],
    // PHP
    ['a.php', `$e = $driver->findElement(WebDriverBy::xpath('${SQ}'));`, 'WebDriverBy::xpath('],
  ];

  // Every one of these has no explicit XPath strategy and must keep converting.
  const CONVERT_CASES_SCANNER = [
    ['a.js', `const a = '${SQ}';`],
    ['a.js', `I.click('${SQ}');`],
    ['a.js', `const p = { ios: '${SQ}', android: '//android.widget.Button' };`],
    ['a.js', `const xpath = '${SQ}';`], // a variable name is not a strategy
    ['a.ts', `export const s = () => $('${SQ}');`],
    ['a.ts', 'export const d = () => $(`//XCUIElementTypeButton[@name="${name}"]`);'],
    ['A.java', `static final String LOC = "${DQ}";`],
    ['A.java', `String xpath = "${DQ}";`],
    ['a.py', `LOC = '${SQ}'`],
    ['a.rb', `LOC = '${SQ}'`],
  ];

  const run = (name, source) => {
    const root = makeTempRoot('xpath-strategy-');
    try {
      const file = join(root, name);
      writeFileSync(file, source);
      const records = [];
      const stats = makeStats();
      processFile(file, { dryRun: false, quiet: true }, records, stats);
      return { records, stats, after: readFileSync(file, 'utf8') };
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };

  for (const [name, source, marker] of XPATH_STRATEGY_CASES) {
    const { records, stats, after } = run(name, source);
    const rec = records[0] || {};
    const reason = `xpath strategy: ${marker}`;
    if (after === source && stats.locatorsUpdated === 0 && stats.skipped.xpathStrategy === 1
      && records.length === 1 && rec.status === STATUS.SKIPPED_XPATH_STRATEGY && rec.reason === reason) ok();
    else fail(`xpath strategy (${name}) ${JSON.stringify(source)}\n     expected: untouched, skip reason ${JSON.stringify(reason)}\n     got:      ${after === source ? 'untouched' : 'REWRITTEN'}, records=${JSON.stringify(records)} stats=${JSON.stringify(stats.skipped)}`);
  }

  for (const [name, source] of CONVERT_CASES_SCANNER) {
    const { stats, after } = run(name, source);
    if (after !== source && after.includes('-ios class chain:') && stats.locatorsUpdated === 1 && !stats.skipped.xpathStrategy) ok();
    else fail(`no xpath strategy (${name}) ${JSON.stringify(source)}\n     expected: converted\n     got:      ${after}  stats=${JSON.stringify(stats)}`);
  }

  // Android detection still runs first: an android locator under an XPath
  // strategy stays an Android skip.
  {
    const { stats } = run('A.java', `@AndroidFindBy(xpath = "//android.widget.Button[@text='OK']")\nWebElement e;`);
    if (stats.skipped.android === 1 && !stats.skipped.xpathStrategy) ok();
    else fail(`xpath strategy android: expected android=1 xpathStrategy=0, got ${JSON.stringify(stats.skipped)}`);
  }

  // Only the call the string is passed to counts: an XPath call that closed
  // earlier on the same line must not affect the next string.
  {
    const source = `driver.findElement(By.xpath("//a")); String loc = "${DQ}";`;
    const { stats, after } = run('A.java', source);
    if (after !== source && stats.locatorsUpdated === 1 && !stats.skipped.xpathStrategy) ok();
    else fail(`xpath strategy closed call: expected converted, got ${after}  stats=${JSON.stringify(stats)}`);
  }

  // The --json report lists the skip with its reason and counts it in stats.
  {
    const { execFileSync } = require('child_process');
    const root = makeTempRoot('xpath-strategy-json-');
    try {
      mkdirSync(join(root, 'src'));
      writeFileSync(join(root, 'src', 'a.py'), `e = driver.find_element(AppiumBy.XPATH, '${SQ}')\n`);
      execFileSync(process.execPath, [join(__dirname, 'xpath-to-class-chain.js'), './src', '--json'], { cwd: root, stdio: 'pipe', timeout: 20000 });
      const report = JSON.parse(readFileSync(join(root, 'xpath-to-class-chain.report.json'), 'utf8'));
      const want = { file: 'a.py', locator: SQ, status: STATUS.SKIPPED_XPATH_STRATEGY, reason: 'xpath strategy: AppiumBy.XPATH' };
      if (report.stats.skipped.xpathStrategy === 1 && report.updated.length === 0
        && JSON.stringify(report.skipped) === JSON.stringify([want])) ok();
      else fail(`xpath strategy --json: expected skipped=[${JSON.stringify(want)}], got stats=${JSON.stringify(report.stats)} skipped=${JSON.stringify(report.skipped)}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
}

// RC-D1: the --json report keeps the grouped-position warning on the updated
// entry and counts it in stats.
{
  const { execFileSync } = require('child_process');
  const root = makeTempRoot('grouped-position-json-');
  try {
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src', 'a.js'), `const a = '(//XCUIElementTypeButton)[2]';\nconst b = '//XCUIElementTypeButton[@name="OK"]';\n`);
    execFileSync(process.execPath, [join(__dirname, 'xpath-to-class-chain.js'), './src', '--json'], { cwd: root, stdio: 'pipe', timeout: 20000 });
    const report = JSON.parse(readFileSync(join(root, 'xpath-to-class-chain.report.json'), 'utf8'));
    const [first, second] = report.updated;
    if (report.updated.length === 2 && report.stats.warnings === 1
      && first.new === '-ios class chain:**/XCUIElementTypeButton[2]' && POSITION_WARNING.test(first.warning || '')
      && !('warning' in second)) ok();
    else fail(`grouped position --json: expected one warning on the first updated entry, got stats=${JSON.stringify(report.stats)} updated=${JSON.stringify(report.updated)}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// =====================================================================
// SCANNER: refusals — inputs the scanner must decline to touch rather than
// process. Each of these was a real failure mode: silently corrupting a file,
// rewriting files outside the target tree, or aborting the whole scan.
// =====================================================================
console.log('— SCANNER: refusals —');

{
  // A file that is not valid UTF-8 must be left byte-for-byte alone. Decoding
  // latin-1 as utf8 turns every undecodable byte into U+FFFD across the WHOLE
  // file, so writing it back destroyed the file instead of editing a locator.
  const root = makeTempRoot('xpath-latin1-');
  try {
    const file = join(root, 'legacy.properties');
    // 0xE9 is 'é' in latin-1 and is not valid UTF-8 on its own.
    const before = Buffer.concat([
      Buffer.from('x=//XCUIElementTypeButton[@name="caf'),
      Buffer.from([0xe9]),
      Buffer.from('"]\n'),
    ]);
    writeFileSync(file, before);

    const records = [];
    const stats = makeStats();
    processFile(file, { dryRun: false, quiet: true }, records, stats);

    if (readFileSync(file).equals(before)) ok();
    else fail(`processFile non-UTF-8: file was modified (data loss)`);
    if (stats.filesScanned === 0 && records.length === 0) ok();
    else fail(`processFile non-UTF-8: should not be scanned; stats=${JSON.stringify(stats)}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  // A UTF-8 file with a BOM is valid and must still be processed — the
  // non-UTF-8 guard must not over-reject.
  const root = makeTempRoot('xpath-bom-');
  try {
    const file = join(root, 'a.js');
    writeFileSync(file, '﻿' + `const l = '//XCUIElementTypeButton[@name="OK"]';`);

    const records = [];
    const stats = makeStats();
    processFile(file, { dryRun: false, quiet: true }, records, stats);

    if (stats.locatorsUpdated === 1) ok();
    else fail(`processFile BOM: expected the file to be processed; stats=${JSON.stringify(stats)}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  // walkDir must never follow a symlink out of the target tree: with --write
  // that rewrote files the user never pointed the tool at. Skipped when the
  // platform/account can't create links (Windows without Developer Mode).
  const root = makeTempRoot('xpath-symlink-');
  try {
    const target = join(root, 'target');
    const outside = join(root, 'outside');
    mkdirSync(target);
    mkdirSync(outside);
    writeFileSync(join(target, 'a.js'), '// in tree');
    writeFileSync(join(outside, 'secret.js'), '// out of tree');

    let linked = true;
    try {
      symlinkSync(outside, join(target, 'escape'), 'junction');
    } catch {
      linked = false;
    }

    if (linked) {
      const visited = [];
      walkDir(target, p => visited.push(p.slice(target.length + 1).replace(/\\/g, '/')));
      if (!visited.some(p => p.includes('secret'))) ok();
      else fail(`walkDir: followed a symlink out of the target tree, visited ${JSON.stringify(visited)}`);
    } else {
      ok(); // cannot create links here; nothing to assert
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  // An unreadable/missing directory is reported and stepped over. Previously
  // the raw error escaped walkDir and killed the entire scan.
  let threw = false;
  try {
    walkDir(join(tmpdir(), 'xpath-does-not-exist-' + Date.now()), () => {});
  } catch {
    threw = true;
  }
  if (!threw) ok();
  else fail('walkDir: an unreadable directory aborted the scan instead of being skipped');
}

{
  // Records identify files by path relative to the scan root, so a repo with
  // many same-named files does not produce indistinguishable rows.
  const root = makeTempRoot('xpath-relpath-');
  try {
    mkdirSync(join(root, 'pages'));
    const file = join(root, 'pages', 'index.ts');
    writeFileSync(file, `const l = '//XCUIElementTypeButton[@name="OK"]';`);

    const records = [];
    const stats = makeStats();
    processFile(file, { dryRun: true, quiet: true, rootDir: root }, records, stats);

    if (records.length === 1 && records[0].file === 'pages/index.ts') ok();
    else fail(`processFile rootDir: expected file='pages/index.ts', got '${records[0] && records[0].file}'`);

    // Without rootDir the bare filename is still used (library callers).
    const bare = [];
    processFile(file, { dryRun: true, quiet: true }, bare, makeStats());
    if (bare.length === 1 && bare[0].file === 'index.ts') ok();
    else fail(`processFile no rootDir: expected file='index.ts', got '${bare[0] && bare[0].file}'`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  // skipped_not_xpath has its own counter. Folding it into noChangeNeeded made
  // the console summary contradict the JSON report for the same run.
  const stats = makeStats();
  if (stats.skipped.notXpath === 0) ok();
  else fail(`makeStats: missing notXpath counter, got ${JSON.stringify(stats.skipped)}`);
}

// =====================================================================
// CLI SAFETY — the tool rewrites source in place with no built-in undo, so the
// two ways it could touch a folder the user never named are asserted here.
// These run the real binary: the guards live in the `require.main` block, which
// importing the module deliberately does not execute.
// =====================================================================
console.log('— CLI SAFETY —');
{
  const { execFileSync } = require('child_process');
  const cli = join(__dirname, 'xpath-to-class-chain.js');

  // Run the CLI from inside a scratch dir holding ./tests (DEFAULT_TARGET_DIR),
  // and report whether that fixture survived untouched.
  const runInFixture = (args) => {
    const root = mkdtempSync(join(tmpdir(), 'xpath-cli-'));
    try {
      mkdirSync(join(root, 'tests'));
      const file = join(root, 'tests', 'spec.js');
      const before = 'const a = "//XCUIElementTypeButton[@name=\'Go\']";\n';
      writeFileSync(file, before);
      let status = 0;
      try {
        execFileSync(process.execPath, [cli, ...args], { cwd: root, stdio: 'pipe', timeout: 20000 });
      } catch (e) {
        status = e.status === undefined ? -1 : e.status;
      }
      return { status, untouched: readFileSync(file, 'utf8') === before };
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };

  // No arguments at all: previewing DEFAULT_TARGET_DIR is fine, editing it is
  // not. Typing the bare command to see what a new tool does must be safe.
  {
    const { status, untouched } = runInFixture([]);
    if (status === 0 && untouched) ok();
    else fail(`CLI SAFETY bare command: exit ${status}, file ${untouched ? 'untouched' : 'MODIFIED'} (expected exit 0, untouched)`);
  }

  // --write with no folder must be refused outright rather than quietly
  // promoting DEFAULT_TARGET_DIR into a write target.
  {
    const { status, untouched } = runInFixture(['--write']);
    if (status === 1 && untouched) ok();
    else fail(`CLI SAFETY bare --write: exit ${status}, file ${untouched ? 'untouched' : 'MODIFIED'} (expected exit 1, untouched)`);
  }

  // The guard must not block the legitimate form: an explicit folder writes.
  {
    const { status, untouched } = runInFixture(['./tests', '--write']);
    if (status === 0 && !untouched) ok();
    else fail(`CLI SAFETY explicit --write: exit ${status}, file ${untouched ? 'NOT written' : 'written'} (expected exit 0, written)`);
  }
}

// =====================================================================
// REGEX SAFETY — both scanning regexes previously had two ways to match the
// same character, so a run of them backtracked exponentially and the scan hung
// on ordinary files. Each of these completed in ~20s+ before the fix.
// =====================================================================
console.log('— REGEX SAFETY —');
{
  // Run each probe in a child process with a hard timeout. Backtracking that
  // has gone exponential does not return slowly — it does not return at all,
  // so an in-process timing assertion would hang the suite instead of failing
  // it. execFileSync throws on timeout, turning a hang into a clean failure.
  const { execFileSync } = require('child_process');
  const budgetMs = 5000;

  const probe = (label, script) => {
    try {
      execFileSync(process.execPath, ['-e', script], { timeout: budgetMs, stdio: 'pipe' });
      ok();
    } catch (e) {
      const why = e.killed || e.signal ? `did not finish within ${budgetMs}ms — catastrophic backtracking` : e.message;
      fail(`REGEX SAFETY ${label}: ${why}`);
    }
  };

  probe('PREDICATE_REGEX (200 backticks)', `
    const { PREDICATE_REGEX } = require(${JSON.stringify(join(__dirname, 'lib', 'predicates'))});
    ('[' + '\\u0060'.repeat(200)).match(new RegExp(PREDICATE_REGEX.source, 'g'));
  `);

  probe('scanner strictRegex (200 backslashes)', `
    const { processFile, makeStats } = require(${JSON.stringify(join(__dirname, 'lib', 'scanner'))});
    const { mkdtempSync, writeFileSync, rmSync } = require('fs');
    const { tmpdir } = require('os');
    const { join } = require('path');
    const root = mkdtempSync(join(tmpdir(), 'xpath-redos-'));
    try {
      const f = join(root, 'a.js');
      writeFileSync(f, 'const l = "//XCUIElementTypeButton' + '\\\\'.repeat(200));
      processFile(f, { dryRun: true, quiet: true }, [], makeStats());
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  `);
}

console.log(`\n${failed === 0 ? '✅' : '⚠️'} ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
