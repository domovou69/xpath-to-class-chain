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

  // --- B5: concat() of string literals folds into one literal ---
  ['//*[@label=concat("a","b")]', `${CC}**/*[\`label == "ab"\`]`], // C09
  [`//XCUIElementTypeButton[@name=concat('a', "b", 'c')]`, `${CC}**/XCUIElementTypeButton[\`name == "abc"\`]`],
  [`//*[@label=concat('say "', 'hi"')]`, `${CC}**/*[\`label == 'say "hi"'\`]`],
  [`//*[@label=concat("it's", " a]b\`c")]`, `${CC}**/*[\`label == "it's a]b\`\`c"\`]`],
  ['//*[@label=concat("a", "")]', `${CC}**/*[\`label == "a"\`]`],
  ['//*[@label!=concat("a","b")]', `${CC}**/*[\`label != nil AND label != "ab"\`]`],
  ['//*[contains(@label, concat("a","b"))]', `${CC}**/*[\`label CONTAINS "ab"\`]`],
  ['//*[@label=concat("Hi ","${name}")]', `${CC}**/*[\`label == "Hi \${name}"\`]`],
  ['//*[@label="concat(\'a\',\'b\')"]', `${CC}**/*[\`label == "concat('a','b')"\`]`], // text, not a call
  ['//XCUIElementTypeCell[.//XCUIElementTypeButton[@name=concat("a","b")]]', `${CC}**/XCUIElementTypeCell[$type == "XCUIElementTypeButton" AND name == "ab"$]`],

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

  // --- B3 unions of single //Type[…] steps: one predicate joined with OR ---
  ['//XCUIElementTypeButton[@name="a"] | //XCUIElementTypeButton[@name="b"]', `${CC}**/XCUIElementTypeButton[\`name == "a" OR name == "b"\`]`], // X04
  ['//XCUIElementTypeButton[@name="a"] | //XCUIElementTypeStaticText[@name="b"]', `${CC}**/*[\`(type == "XCUIElementTypeButton" AND name == "a") OR (type == "XCUIElementTypeStaticText" AND name == "b")\`]`], // X05
  ['//*[@name="Alpha one"] | //*[@name="Beta.two"]', `${CC}**/*[\`name == "Alpha one" OR name == "Beta.two"\`]`], // L355
  ['//*[@name="Item ${n}, more" and @accessible="true"]|//*[@name="Short ${n}" and @accessible="true"]', `${CC}**/*[\`(name == "Item \${n}, more" AND accessible == true) OR (name == "Short \${n}" AND accessible == true)\`]`], // L455
  [`//*[@label="\${n} \${n == 1 ? 'item' : 'items'}"] | //*[@label="Total: \${n}"]`, `${CC}**/*[\`label == "\${n} \${n == 1 ? 'item' : 'items'}" OR label == "Total: \${n}"\`]`], // L461
  ['//*[@label="a | //b"] | //*[@name="c|d"]', `${CC}**/*[\`label == "a | //b" OR name == "c|d"\`]`], // '|' inside a value is text
  // a `*` operand names no type
  ['//*[@name="a"] | //XCUIElementTypeButton[@name="b"]', `${CC}**/*[\`name == "a" OR (type == "XCUIElementTypeButton" AND name == "b")\`]`],
  ['//XCUIElementTypeAny[@name="a"] | //XCUIElementTypeAny[@label="b"]', `${CC}**/*[\`name == "a" OR label == "b"\`]`],
  // an operand with OR keeps its group inside the AND
  ['//XCUIElementTypeStaticText[@name="a"] | //XCUIElementTypeButton[@name="a" or @label="x"]', `${CC}**/*[\`(type == "XCUIElementTypeStaticText" AND name == "a") OR (type == "XCUIElementTypeButton" AND (name == "a" OR label == "x"))\`]`],
  // three operands (and more) use the same form
  ['//XCUIElementTypeButton[@name="a"] | //XCUIElementTypeButton[@name="b"] | //XCUIElementTypeStaticText[@label="c"]', `${CC}**/*[\`(type == "XCUIElementTypeButton" AND name == "a") OR (type == "XCUIElementTypeButton" AND name == "b") OR (type == "XCUIElementTypeStaticText" AND label == "c")\`]`],
  // operands without conditions: the type tests alone; one of them matches the whole step
  ['//XCUIElementTypeButton | //XCUIElementTypeStaticText', `${CC}**/*[\`type == "XCUIElementTypeButton" OR type == "XCUIElementTypeStaticText"\`]`],
  ['//XCUIElementTypeButton | //XCUIElementTypeButton[@name="x"]', `${CC}**/XCUIElementTypeButton`],

  // --- B3 self::Type inside a `*` step's predicate: type == "Type" ---
  ['//*[self::XCUIElementTypeButton or self::XCUIElementTypeStaticText]', `${CC}**/*[\`type == "XCUIElementTypeButton" OR type == "XCUIElementTypeStaticText"\`]`], // X07
  ['//*[self::XCUIElementTypeStaticText or self::XCUIElementTypeTextView]', `${CC}**/*[\`type == "XCUIElementTypeStaticText" OR type == "XCUIElementTypeTextView"\`]`],
  ['//*[@name="c" or self::XCUIElementTypeCell]', `${CC}**/*[\`name == "c" OR type == "XCUIElementTypeCell"\`]`],
  ['//*[self::XCUIElementTypeButton and @name="x"]', `${CC}**/XCUIElementTypeButton[\`name == "x"\`]`], // validator collapses the single type
  ['//XCUIElementTypeButton[@name="self::x"]', `${CC}**/XCUIElementTypeButton[\`name == "self::x"\`]`], // text, not an axis

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
  // outer [last()] / [last()-n] → [-1] / [-(n+1)]: counted from the end of the same
  // match list (RC-D1 applies, as for [n]; C1 on device: E05, E06, L270–L272)
  ['(//XCUIElementTypeButton)[last()]', `${CC}**/XCUIElementTypeButton[-1]`],
  ['(//XCUIElementTypeButton)[last()-1]', `${CC}**/XCUIElementTypeButton[-2]`],
  ['(//XCUIElementTypeButton)[ last() - 2 ]', `${CC}**/XCUIElementTypeButton[-3]`],
  ['(//XCUIElementTypeStaticText[@name="icon"])[last()]', `${CC}**/XCUIElementTypeStaticText[\`name == "icon"\`][-1]`],
  ['(//XCUIElementTypeOther[contains(@label, "a")]/XCUIElementTypeStaticText)[last()]', `${CC}**/XCUIElementTypeOther[\`label CONTAINS "a"\`]/XCUIElementTypeStaticText[-1]`],

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
  // //XCUIElementTypeApplication/… is the same root: **/XCUIElementTypeApplication never matches it (Phase 7)
  ['//XCUIElementTypeApplication/XCUIElementTypeWindow[1]/XCUIElementTypeOther', `${CC}XCUIElementTypeWindow[1]/XCUIElementTypeOther`],
  ['//XCUIElementTypeApplication[1]/XCUIElementTypeWindow[1]/XCUIElementTypeButton[2]', `${CC}XCUIElementTypeWindow[1]/XCUIElementTypeButton[2]`],
  ['//XCUIElementTypeApplication//XCUIElementTypeButton', `${CC}**/XCUIElementTypeButton`],
  ['/*/XCUIElementTypeWindow', `${CC}XCUIElementTypeWindow`],
  // RC2: contains()/starts-with() on a boolean attribute compares the "true"/"false" text
  ['//XCUIElementTypeButton[contains(@enabled,"false")]', `${CC}**/XCUIElementTypeButton[\`enabled == false\`]`], // B18
  ['//*[contains(@name,"n") and contains(@enabled,"false")]', `${CC}**/*[\`name CONTAINS "n" AND enabled == false\`]`], // L278, L520
  ['//*[starts-with(@visible,"true")]', `${CC}**/*[\`visible == true\`]`],
  // RC10: a `.` step is the same element
  ['//XCUIElementTypeCell/./XCUIElementTypeButton', `${CC}**/XCUIElementTypeCell/XCUIElementTypeButton`], // A11
  // B4: a leading `.//` searches below the context node, as `**/` does
  ['.//XCUIElementTypeButton[@name="a"]', `${CC}**/XCUIElementTypeButton[\`name == "a"\`]`], // A12
  ['.//*', `${CC}**/*`],
  ['.//XCUIElementTypeCell/./XCUIElementTypeButton', `${CC}**/XCUIElementTypeCell/XCUIElementTypeButton`],
  ['.//XCUIElementTypeCell//XCUIElementTypeButton', `${CC}**/XCUIElementTypeCell/**/XCUIElementTypeButton`],
  ['(.//XCUIElementTypeButton[@name="a"])[2]', `${CC}**/XCUIElementTypeButton[\`name == "a"\`][2]`],
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
  // B16: `@attr=true()` is true whenever the attribute exists; WDA always writes these
  ['//XCUIElementTypeButton[@enabled=true()]', `${CC}**/XCUIElementTypeButton`], // B16
  ['//XCUIElementTypeButton[@visible != false()]', `${CC}**/XCUIElementTypeButton`],
  ['//XCUIElementTypeButton[@accessible=true()][@name="a"]', `${CC}**/XCUIElementTypeButton[\`name == "a"\`]`],
  ['(//XCUIElementTypeButton[@enabled=true()])[2]', `${CC}**/XCUIElementTypeButton[2]`],
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
  // C2 c2-axes: `[descendant::T]` is `[.//T]`; `//T1[cond]/ancestor::T2` is `//T2[.//T1[cond]]` (types named and different)
  ['//XCUIElementTypeCell[descendant::XCUIElementTypeButton]', `${CC}**/XCUIElementTypeCell[$type == "XCUIElementTypeButton"$]`], // F04
  ['//XCUIElementTypeCell[ descendant::XCUIElementTypeButton[@name="x"]]', `${CC}**/XCUIElementTypeCell[$type == "XCUIElementTypeButton" AND name == "x"$]`],
  ['//XCUIElementTypeCell[@label="[descendant::x"]', `${CC}**/XCUIElementTypeCell[\`label == "[descendant::x"\`]`],
  ['//XCUIElementTypeButton[@name="x"]/ancestor::XCUIElementTypeCell', `${CC}**/XCUIElementTypeCell[$type == "XCUIElementTypeButton" AND name == "x"$]`], // R01
  ['//XCUIElementTypeButton/ancestor::XCUIElementTypeCell', `${CC}**/XCUIElementTypeCell[$type == "XCUIElementTypeButton"$]`],
  ['//XCUIElementTypeButton[@name="x" or @label="y"]/ancestor::XCUIElementTypeCell', `${CC}**/XCUIElementTypeCell[$type == "XCUIElementTypeButton" AND (name == "x" OR label == "y")$]`],
  ['(//XCUIElementTypeButton[@name="x"]/ancestor::XCUIElementTypeCell)[2]', `${CC}**/XCUIElementTypeCell[$type == "XCUIElementTypeButton" AND name == "x"$][2]`],
  ['//XCUIElementTypeButton[@name="ancestor::x"]', `${CC}**/XCUIElementTypeButton[\`name == "ancestor::x"\`]`],
  // Phase 7 stage 3 (device): only an empty contains() / starts-with() needle is skipped
  ['//XCUIElementTypeButton[ends-with(@label, "")]', `${CC}**/XCUIElementTypeButton[\`label ENDSWITH ""\`]`],
  ['//XCUIElementTypeButton[contains(@name, " ")]', `${CC}**/XCUIElementTypeButton[\`name CONTAINS " "\`]`],
  // C2 c2-functions: matches() without metacharacters is a substring test; any other
  // pattern keeps XPath's search semantics: `.` not dot-all, `$` before a final \n (C1, device)
  ['//*[matches(@name,"b")]', `${CC}**/*[\`name CONTAINS "b"\`]`], // H03
  ['//*[matches(@name,"ab","i")]', `${CC}**/*[\`name CONTAINS[c] "ab"\`]`], // H04
  ['//*[matches(@name,"^a.c$")]', `${CC}**/*[\`name MATCHES "(?s:.*)(?-s:^a.c$)(?s:.*)"\`]`], // H02
  ['//*[matches(@name,"^a.c$","i")]', `${CC}**/*[\`name MATCHES "(?i)(?s:.*)(?-s:^a.c$)(?s:.*)"\`]`],
  ['//*[matches( @label , \'[ab]c\' )]', `${CC}**/*[\`label MATCHES '(?s:.*)(?-s:[ab]c)(?s:.*)'\`]`],
  ['//*[matches(@name,"(a|x)b")]', `${CC}**/*[\`name MATCHES "(?s:.*)(?-s:(a|x)b)(?s:.*)"\`]`],
  ['//*[matches(@name,"a\\.c")]', `${CC}**/*[\`name MATCHES "(?s:.*)(?-s:a\\\\.c)(?s:.*)"\`]`], // NSPredicate decodes \\ to \
  ['//*[matches(@name,"a\\\\c")]', `${CC}**/*[\`name MATCHES "(?s:.*)(?-s:a\\\\\\\\c)(?s:.*)"\`]`],
  [`//*[matches(@name,'a"b')]`, `${CC}**/*[\`name CONTAINS 'a"b'\`]`],
  [`//*[matches(@name,'a".b')]`, `${CC}**/*[\`name MATCHES '(?s:.*)(?-s:a".b)(?s:.*)'\`]`],
  ['//*[matches(@name,"a]b|c")]', `${CC}**/*[\`name MATCHES "(?s:.*)(?-s:a]b|c)(?s:.*)"\`]`],
  ['//*[matches(@name,"a`.")]', `${CC}**/*[\`name MATCHES "(?s:.*)(?-s:a\`\`.)(?s:.*)"\`]`],
  ['//*[matches(@name,"é")]', `${CC}**/*[\`name CONTAINS "é"\`]`],
  ['//*[matches(@name,"é","i")]', `${CC}**/*[\`name MATCHES "(?i)(?s:.*)(?-s:é)(?s:.*)"\`]`], // [c] only for ASCII
  ['//XCUIElementTypeButton[not(matches(@name,"b"))]', `${CC}**/XCUIElementTypeButton[\`NOT (name CONTAINS "b")\`]`],
  ['//XCUIElementTypeButton[matches(@name,"^x") or @label="y"]', `${CC}**/XCUIElementTypeButton[\`name MATCHES "(?s:.*)(?-s:^x)(?s:.*)" OR label == "y"\`]`],
  ['//XCUIElementTypeCell[.//XCUIElementTypeButton[matches(@name,"^a")]]', `${CC}**/XCUIElementTypeCell[$type == "XCUIElementTypeButton" AND name MATCHES "(?s:.*)(?-s:^a)(?s:.*)"$]`],
  ['//*[@name="matches(@name,\'x\')"]', `${CC}**/*[\`name == "matches(@name,'x')"\`]`],
  // lower-case / upper-case / translate with an ASCII literal → [c] (C1, device)
  ['//*[lower-case(@label)="ab"]', `${CC}**/*[\`label ==[c] "ab"\`]`], // H05
  ['//*[lower-case(@label) = "a-1"]', `${CC}**/*[\`label ==[c] "a-1"\`]`],
  ['//*[contains(upper-case(@label),"AB")]', `${CC}**/*[\`label CONTAINS[c] "AB"\`]`], // H06
  ['//*[contains(translate(@label,"ABCDEFGHIJKLMNOPQRSTUVWXYZ","abcdefghijklmnopqrstuvwxyz"),"ab")]', `${CC}**/*[\`label CONTAINS[c] "ab"\`]`], // C08
  ["//*[contains(translate(@name, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'ab')]", `${CC}**/*[\`name CONTAINS[c] 'ab'\`]`],
  ['//XCUIElementTypeButton[lower-case(@label)="ab" and matches(@name,"b")]', `${CC}**/XCUIElementTypeButton[\`label ==[c] "ab" AND name CONTAINS "b"\`]`],
  ['//XCUIElementTypeButton[not(lower-case(@label)="ab")]', `${CC}**/XCUIElementTypeButton[\`NOT (label ==[c] "ab")\`]`],
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
  // self:: is a type test only inside a `*` step's predicate, for a WDA type, outside not()
  ['//XCUIElementTypeButton[self::XCUIElementTypeStaticText]', 'self:: on a named step'],
  ['//self::XCUIElementTypeButton', 'self:: as a step'],
  ['//XCUIElementTypeButton/self::XCUIElementTypeButton', 'self:: as a later step'],
  ['//*[self::*]', 'self::*'],
  ['//*[self::node()]', 'self::node()'],
  ['//*[self::XCUIElementTypeLabel]', 'self:: of a non-WDA type'],
  ['//*[self::XCUIElementTypeAny]', 'self:: of XCUIElementTypeAny'],
  ['//*[not(self::XCUIElementTypeButton)]', 'self:: under not(): //* also returns the Application root'],
  ['//XCUIElementTypeCell[.//*[self::XCUIElementTypeButton]]', 'self:: inside a path predicate'],
  ['//*[descendant-or-self::XCUIElementTypeButton]', 'descendant-or-self::'],

  // incomplete or broken source pieces (Phase 7, GitHub corpus)
  ['//XCUIElementTypeOther[3]//XCUIElementTypeScrollView/', 'trailing / (Python "…/" "Next/…" concatenation)'],
  ['//XCUIElementTypeWebView/XCUIElementTypeOther/', 'trailing / after a child step'],
  ['//XCUIElementTypeOther[@name=\\"test-Error\r\n\t// message\\"]/child::XCUIElementTypeStaticText', 'raw line break inside a source-escaped value'],

  // XPath functions with no Class Chain equivalent
  ['//*[last()]', 'last()'],
  // grouped outer last(): only [last()] and [last()-n] with n ≥ 1 convert
  ['(//XCUIElementTypeButton)[last()+1]', 'grouped outer last()+1'],
  ['(//XCUIElementTypeButton)[last()-0]', 'grouped outer last()-0'],
  ['(//XCUIElementTypeButton)[last()-${n}]', 'grouped outer last() minus an expression'],
  ['(//XCUIElementTypeButton)[last()][1]', 'grouped outer last() plus another bracket'],
  ['(//XCUIElementTypeCell/XCUIElementTypeButton[2])[last()]', 'grouped outer last() over an inner index'],
  ['(//XCUIElementTypeButton[@name="a"] | //XCUIElementTypeButton[@name="b"])[last()]', 'grouped union with last()'],
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
  // B3: a union converts only when every operand is a single //Type step with plain conditions
  ['//XCUIElementTypeButton[1] | //XCUIElementTypeButton[@name="b"]', 'union operand with an index'],
  ['//XCUIElementTypeButton[@name="a"][2] | //XCUIElementTypeButton[@name="b"]', 'union operand with a filter and an index'],
  ['//XCUIElementTypeCell[.//XCUIElementTypeButton] | //XCUIElementTypeCell[@name="b"]', 'union operand with a descendant predicate'],
  ['//*[@name="a"] | //*[not(//*[@name="c"])]', 'union operand with a nested path'],
  ['//XCUIElementTypeCell/XCUIElementTypeButton | //XCUIElementTypeButton', 'union of different depths'],
  ['//XCUIElementTypeCell//XCUIElementTypeButton | //XCUIElementTypeButton', 'union with a two-step operand'],
  ['/XCUIElementTypeApplication/XCUIElementTypeButton | //XCUIElementTypeButton', 'union with an absolute operand'],
  ['//*[@name="a" and position()=1] | //*[@name="b"]', 'union with position()'],
  ['//*[@name="a"] | //XCUIElementTypeLabel', 'union with a non-WDA type'],
  ['//*[@name="a"] | //*[@name="b"]/following-sibling::*', 'union with an axis'],
  ['(//XCUIElementTypeButton[@name="a"] | //XCUIElementTypeButton[@name="b"])', 'grouped union without an index'],

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
  ['//XCUIElementTypeApplication[@name="App"]/XCUIElementTypeWindow', 'predicate on the root step, relative form'],
  ['//XCUIElementTypeApplication', 'relative form of the application element itself'],
  // RC6: leftover XPath inside the backtick block must fail validation, not ship as "success"
  ['//XCUIElementTypeButton[contains(., "a")]', 'RC6: contains(.) (C05)'],
  // B5: concat() folds only when every argument is a plain literal; the rest still fails RC6
  ['//*[@label=concat(@name,"x")]', 'B5: concat with an attribute argument'],
  ['//*[@label=concat("a",1)]', 'B5: concat with a number argument'],
  ['//*[@label=concat("a",lower-case("B"))]', 'B5: concat with a nested function'],
  ['//*[@label=concat("a",.//x)]', 'B5: concat with a path argument'],
  ['//*[@label=concat("a")]', 'B5: concat with one argument'],
  ['//*[@label=concat()]', 'B5: concat with no arguments'],
  [`//*[@label=concat('a"', "b'")]`, 'B5: folded text holds both quote kinds'],
  ['//*[@label=concat("$","{x}")]', 'B5: ${…} only exists after the join'],
  ['//*[@label=concat("${a","}")]', 'B5: ${…} split across arguments'],
  ['//*[@label=concat(\\"a\\",\\"b\\")]', 'B5: escaped quotes from JSON / Java source'],
  ['//*[@label=concat("a\\","b")]', 'B5: backslash inside an argument'],
  ['//*[@label=concat("a","b"]', 'B5: concat never closed'],
  ['//XCUIElementTypeCell[XCUIElementTypeButton]', 'RC6: child-existence test (F02)'],
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
  ['//XCUIElementTypeButton[@value>5]', 'RC-D3: doubleValue reads "10abc" as 10 (B03)'],
  ['//XCUIElementTypeSlider[@value>="0.5"]', 'RC-D3: >= on text'],
  ['//*[@label>0]', 'RC-D3: > 0 on text'],
  ['//*[@index="a"]', 'RC14: index against text'],
  ['//*[@value=5]', 'RC14: text equal to a number'],
  ['//*[@enabled>0]', 'RC14: ordering a boolean'],
  // B16: true() / false() test that the attribute exists
  ['//XCUIElementTypeButton[@enabled=false()]', 'B16: never matches, WDA always writes @enabled'],
  ['//XCUIElementTypeButton[@visible!=true()]', 'B16: never matches'],
  ['//XCUIElementTypeButton[@selected=true()]', 'B16: @selected is not in the page source'],
  ['//XCUIElementTypeButton[@hittable=true()]', 'B16: @hittable only when the query names it'],
  ['//XCUIElementTypeButton[@enabled=true() and @name="a"]', 'B16: inside a larger predicate'],
  ['//XCUIElementTypeButton[not(@enabled=true())]', 'B16: under not()'],
  // RC15: XPath filters after the per-parent index; the chain cannot
  ['//XCUIElementTypeCell[2][@name="a"]', 'RC15: index before a filter (E12)'],
  // B4: only a leading `.//` converts; any other relative start is left alone
  ['./XCUIElementTypeButton', 'B4: ./ child of the context node'],
  ['./XCUIElementTypeCell//XCUIElementTypeButton', 'B4: ./ then //'],
  ['.', 'B4: the context node itself'],
  ['.//', 'B4: nothing after .//'],
  ['.///XCUIElementTypeButton', 'B4: three slashes'],
  ['..//XCUIElementTypeButton', 'B4: parent of the context node'],
  ['.//XCUIElementTypeCell/..', 'B4: parent step after .//'],
  ['.//XCUIElementTypeCell//.', 'B4: trailing //. after .//'],
  ['.//XCUIElementTypeButton | .//XCUIElementTypeCell', 'B4: union of relative paths'],
  ['.//XCUIElementTypeButton | //XCUIElementTypeCell', 'B4: union mixing relative and absolute'],
  ['.//XCUIElementTypeLabel[@name="a"]', 'B4: non-iOS type after .//'],
  ['.//XCUIElementTypeStaticText[@text="a"]', 'B4: unknown attribute after .//'],
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
  // outer [last()]: the group-close is the balancing paren, not the last ')' (Phase 7, PerfectoCode)
  ['(//XCUIElementTypeButton)[last()]', true],
  ['(//XCUIElementTypeStaticText[@label=\'Safari\'])[last()]', true],
  ['(//XCUIElementTypeButton)[last()-1]', true],
  ['(//XCUIElementTypeButton[@name="a)b"])[last()]', true],
  ['(//XCUIElementTypeButton[@name="OK"]', false], // group never closed
  // absolute paths from the page source root (Phase 7: dotnet/maui, Ruby page objects)
  ['/XCUIElementTypeApplication/XCUIElementTypeWindow/XCUIElementTypePopover', true],
  ['/XCUIElementTypeApplication[1]/XCUIElementTypeWindow//XCUIElementTypeButton[2]', true],
  ['/XCUIElementTypeWindow/XCUIElementTypeButton', false], // a path piece, not from the root
  ['/XCUIElementTypeApplicationFoo/x', false],

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
  // B5: the harness path; concat() of literals folds before the optimizer sees it
  {
    xpath: '//*[@label=concat("a","b")]',
    optimized: `${CC}**/*[\`label == "ab"\`]`,
  },
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
  // B4: Other / Window steps without a predicate are kept; dropping them widened the match
  {
    xpath: '/XCUIElementTypeApplication/XCUIElementTypeWindow/XCUIElementTypeButton', // A07
    optimized: `${CC}XCUIElementTypeWindow/XCUIElementTypeButton`,
  },
  {
    xpath: '//XCUIElementTypeWindow/XCUIElementTypeOther/XCUIElementTypeButton[@name="a"]', // A14
    optimized: `${CC}**/XCUIElementTypeWindow/XCUIElementTypeOther/XCUIElementTypeButton[\`name == "a"\`]`,
  },
  {
    xpath: '//XCUIElementTypeOther/XCUIElementTypeButton[@name="a"]', // A15
    optimized: `${CC}**/XCUIElementTypeOther/XCUIElementTypeButton[\`name == "a"\`]`,
  },
  // B4: visible stays on the step it tests; a visible Cell can hold a Button that is not
  {
    xpath: '//XCUIElementTypeCell[@visible="true"]/XCUIElementTypeButton', // A16
    optimized: `${CC}**/XCUIElementTypeCell[\`visible == true\`]/XCUIElementTypeButton`,
  },
  {
    xpath: './/XCUIElementTypeButton[@name="a"]', // A12
    optimized: `${CC}**/XCUIElementTypeButton[\`name == "a"\`]`,
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

  // --- Removed rule 1 (B4): Other / Window steps without a predicate stay ---
  // `**/Window/Other/Button` also requires the Button to sit in an Other in a Window;
  // `**/Button` matched every Button (A14, seen on device in Phase 2).
  {
    input: `${CC}**/XCUIElementTypeWindow/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeButton[\`name == "Submit"\`]`,
    fixed: `${CC}**/XCUIElementTypeWindow/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeButton[\`name == "Submit"\`]`,
  },
  // `/Other/` is not `/**/`: a StaticText deeper in the Cell does not match
  {
    input: `${CC}**/XCUIElementTypeCell[\`name == "Account"\`]/XCUIElementTypeOther/XCUIElementTypeStaticText`,
    fixed: `${CC}**/XCUIElementTypeCell[\`name == "Account"\`]/XCUIElementTypeOther/XCUIElementTypeStaticText`,
  },
  {
    input: `${CC}XCUIElementTypeWindow/XCUIElementTypeButton`,
    fixed: `${CC}XCUIElementTypeWindow/XCUIElementTypeButton`,
  },
  {
    input: `${CC}**/XCUIElementTypeOther[\`name == "Container"\`]/XCUIElementTypeButton[\`label == "Go"\`]`,
    fixed: `${CC}**/XCUIElementTypeOther[\`name == "Container"\`]/XCUIElementTypeButton[\`label == "Go"\`]`,
  },
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

  // --- Removed rule 7 (B4): visible stays on the step it tests ---
  // Visibility of an ancestor and of its descendant are independent (A16, seen on
  // device in Phase 2: the Cell is visible, its Button is not).
  {
    input: `${CC}**/XCUIElementTypeTable[\`visible == 1\`]/XCUIElementTypeCell/XCUIElementTypeButton[\`name == "Submit"\`]`,
    fixed: `${CC}**/XCUIElementTypeTable[\`visible == 1\`]/XCUIElementTypeCell/XCUIElementTypeButton[\`name == "Submit"\`]`,
  },
  {
    input: `${CC}**/XCUIElementTypeTable[\`visible == 1\`]/XCUIElementTypeButton`,
    fixed: `${CC}**/XCUIElementTypeTable[\`visible == 1\`]/XCUIElementTypeButton`,
  },
  {
    input: `${CC}**/XCUIElementTypeCell[\`visible == true\`]/XCUIElementTypeButton`,
    fixed: `${CC}**/XCUIElementTypeCell[\`visible == true\`]/XCUIElementTypeButton`,
  },
  // Other rules still work around it: merge and reorder on the intermediate step
  {
    input: `${CC}**/XCUIElementTypeCell[\`visible == 1\`][\`name CONTAINS "a"\`]/XCUIElementTypeButton[\`name == "a" OR label == "b"\`]`,
    fixed: `${CC}**/XCUIElementTypeCell[\`visible == 1 AND name CONTAINS "a"\`]/XCUIElementTypeButton[\`name == "a" OR label == "b"\`]`,
  },
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
  // …and while a predicate on the step before the gap is left in place.
  {
    input: `${CC}**/XCUIElementTypeTable[\`visible == 1\`]/**/XCUIElementTypeCell/XCUIElementTypeButton[\`name == "OK"\`]`,
    fixed: `${CC}**/XCUIElementTypeTable[\`visible == 1\`]/**/XCUIElementTypeCell/XCUIElementTypeButton[\`name == "OK"\`]`,
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

// RC-D3: a numeric comparison on text says why it is skipped.
for (const xpath of ['//XCUIElementTypeButton[@value>5]', '//XCUIElementTypeSlider[@value>="0.5"]']) {
  const res = convertXpathToClassChain(xpath);
  if (res.status !== 'success' && /doubleValue reads "10abc" as 10/.test(res.reason || '')) ok();
  else fail(`SKIP REASON ${xpath}\n     expected: the doubleValue reason\n     got:      status=${res.status} reason=${res.reason}`);
}

// C2 c2-axes: the forms of `descendant::` / `ancestor::` with no `$…$` form say why.
for (const [xpath, why] of [
  ['//XCUIElementTypeCell[descendant::XCUIElementTypeCell]', /would also match the element itself/],
  ['//*[descendant::XCUIElementTypeButton]', /would also match the element itself/],
  ['//XCUIElementTypeCell[descendant::*]', /would also match the element itself/],
  ['//XCUIElementTypeCell[descendant::XCUIElementTypeButton[2]]', /path in predicate/],
  ['//XCUIElementTypeCell[descendant::XCUIElementTypeButton/XCUIElementTypeButton]', /path in predicate/],
  ['//XCUIElementTypeButton[@name="x"]/ancestor::XCUIElementTypeButton', /same type on both steps.*RC-D2/],
  ['//*[@name="x"]/ancestor::XCUIElementTypeCell', /RC-D2/],
  ['//XCUIElementTypeButton[@name="x"]/ancestor::*', /RC-D2/],
  ['//XCUIElementTypeButton[@name="x"]/ancestor::XCUIElementTypeAny', /RC-D2/],
  ['//XCUIElementTypeButton[@name="x"]/ancestor::XCUIElementTypeCell[1]', /ancestor:: step with a predicate, an index/], // R04
  ['//XCUIElementTypeButton[@name="x"]/ancestor::XCUIElementTypeCell[@name="c"]', /ancestor:: step with a predicate, an index/],
  ['//XCUIElementTypeButton/ancestor::XCUIElementTypeCell/XCUIElementTypeButton', /a further path/],
  ['//XCUIElementTypeButton[2]/ancestor::XCUIElementTypeCell', /ancestor:: step: path in predicate/],
  ['//XCUIElementTypeButton[@a="1"][@name="2"]/ancestor::XCUIElementTypeCell', /ancestor:: step: path in predicate/],
  ['//XCUIElementTypeTable//XCUIElementTypeButton/ancestor::XCUIElementTypeCell', /single \/\/Type step/],
  ['//XCUIElementTypeButton/ancestor::XCUIElementTypeApplication', /the root/],
  ['//XCUIElementTypeFoo/ancestor::XCUIElementTypeCell', /non-iOS element type/],
  ['.//XCUIElementTypeButton[@name="x"]/ancestor::XCUIElementTypeCell', /context node/],
]) {
  const res = convertXpathToClassChain(xpath);
  if (res.status !== 'success' && res.locator === xpath && why.test(res.reason || '')) ok();
  else fail(`SKIP REASON ${xpath}\n     expected: skip, reason ${why}\n     got:      status=${res.status} locator=${res.locator} reason=${res.reason}`);
}
// C2 c2-functions: forms with no exact chain, or not checked on the device, say why.
for (const [xpath, why] of [
  ['//*[normalize-space(@label)="a b"]', /normalize-space\(\).*no-break space/], // C06
  ['//XCUIElementTypeButton[string-length(@label)>3]', /string-length\(\).*UTF-16/], // C07
  ['//*[matches(@name,"a","s")]', /flags "s"/],
  ['//*[matches(@name,"a","im")]', /flags "im"/],
  ['//*[matches(@name,"a",$f)]', /flags .* not a plain literal/],
  ['//*[matches(@name,"a b")]', /literal space.*U\+00A0/],
  ['//*[matches(@name,"^a\tb")]', /literal space/],
  ['//*[matches(@name,"a(")]', /not a valid regular expression/],
  ['//*[matches(@name,"a*")]', /matches the empty string/],
  ['//*[matches(@name,"^$")]', /matches the empty string/],
  ['//*[matches(@name,"")]', /empty matches\(\) pattern/],
  ['//*[matches(@name,"${p}")]', /built at runtime/],
  ['//*[matches(@name,"a\\$")]', /host-language escape/],
  ['//*[matches(@name,\\"a\\")]', /not a plain string literal/],
  ['//*[matches(@name)]', /1 arguments/],
  ['//*[matches(@name,"a"]', /never closed/],
  ['//*[matches(text(),"a")]', /not a single @attribute/],
  ['//*[matches(.,"a")]', /not a single @attribute/],
  ['//*[matches(@enabled,"t")]', /@enabled is a boolean/],
  ['//*[matches(@x,"1")]', /@x is a number/],
  ['//*[matches(@text,"a")]', /@text is not a WDA attribute/],
  ['//*[lower-case(@label)="äb"]', /non-ASCII literal/],
  ['//*[lower-case(@label)="AB"]', /never gives "AB"/],
  ['//*[lower-case(@label)=""]', /empty/],
  // Phase 7 stage 3 (device): an empty needle is always true in XPath, never in NSPredicate
  ['//XCUIElementTypeCell[contains(@traits, "")]', /contains\(…, ""\) is always true/],
  ['//XCUIElementTypeButton[contains(@name, \'\')]', /CONTAINS "" never matches/],
  ['//XCUIElementTypeButton[starts-with(@value, "")]', /BEGINSWITH "" never matches/],
  ['//XCUIElementTypeTextField[contains(text(), "")]', /always true/],
  ['//*[@name="a" and contains(@label,\\"\\")]', /always true/],
  ['//*[lower-case(@label)!="ab"]', /lower-case\(\) other than/],
  ['//*[lower-case(@enabled)="true"]', /@enabled is a boolean/],
  ['//*[lower-case(@index)="1"]', /@index is a number/],
  ['//*[contains(upper-case(@label),"ab")]', /never gives "ab"/],
  ['//*[contains(upper-case(@label),"ÄB")]', /non-ASCII literal/],
  ['//*[contains(lower-case(@label),"ab")]', /not checked on the device/],
  ['//*[contains(translate(@label,"AB","ab"),"ab")]', /not checked on the device/],
  ['//*[contains(translate(@label,"ABCDEFGHIJKLMNOPQRSTUVWXYZ","abcdefghijklmnopqrstuvwxyz"),"AB")]', /never gives "AB"/],
  ['//*[upper-case(@label)="AB"]', /upper-case\(\) outside contains/],
  ['//*[translate(@label,"a","b")="b"]', /translate\(\) outside contains/],
  ['//XCUIElementTypeButton[not(normalize-space(@label)="a")]', /normalize-space/],
  ['//XCUIElementTypeButton[@name="a" or matches(@name,"a b")]', /literal space/],
  // WDA's class chain parser ends a $…$ block at any `$`, even inside a string literal
  ['//XCUIElementTypeCell[.//XCUIElementTypeButton[matches(@name,"a$")]]', /\$ inside a descendant predicate/],
  ['//XCUIElementTypeCell[.//XCUIElementTypeButton[@name="a$b"]]', /\$ inside a descendant predicate/],
]) {
  const res = convertXpathToClassChain(xpath);
  if (res.status !== 'success' && res.locator === xpath && why.test(res.reason || '')) ok();
  else fail(`SKIP REASON ${xpath}\n     expected: skip, reason ${why}\n     got:      status=${res.status} locator=${res.locator} reason=${res.reason}`);
}
// A ${…} in a $…$ block is replaced by the host language before WDA parses the chain.
{
  const res = convertXpathToClassChain('//XCUIElementTypeCell[.//XCUIElementTypeButton[@name="${n}"]]');
  if (res.locator === `${CC}**/XCUIElementTypeCell[$type == "XCUIElementTypeButton" AND name == "\${n}"$]`) ok();
  else fail(`CONVERT \${…} in a descendant predicate\n     got: ${res.status} ${res.locator}`);
}
// Still skipped by the axis gates: ancestor-or-self::, descendant-or-self::, parent::, `..`.
for (const xpath of [
  '//XCUIElementTypeButton[@name="x"]/ancestor-or-self::XCUIElementTypeCell',
  '//XCUIElementTypeCell[descendant-or-self::XCUIElementTypeButton]',
  '//XCUIElementTypeCell[@name="a" and descendant::XCUIElementTypeButton]',
  '//XCUIElementTypeButton/parent::XCUIElementTypeCell', // R03
  '//XCUIElementTypeButton/..', // R02
]) {
  const res = convertXpathToClassChain(xpath);
  if (res.status !== 'success' && res.locator === xpath) ok();
  else fail(`SKIP ${xpath}\n     expected: skip+unchanged\n     got:      status=${res.status} locator=${res.locator}`);
}

// RC-D1: a grouped position is converted, but WDA counts class chain matches in
// XCTest query order (breadth-first) and XPath in document order, so the result
// carries a warning that the --json report passes on.
console.log('— WARNINGS —');
const POSITION_WARNING = /grouped position/;
for (const [xpath, warned] of [
  ['(//XCUIElementTypeButton)[2]', true], // E02
  ['(.//XCUIElementTypeButton)[2]', true],
  ['(//XCUIElementTypeOther[@name="row"])[${index}]', true],
  ['(//XCUIElementTypeStaticText/child::XCUIElementTypeStaticText[2])[1]', true], // outer [1] dropped
  ['(//*[contains(@name, "Balance,")]/child::*[2])[${transaction}]', true], // outer index moved to the parent
  ['(//XCUIElementTypeButton)[last()]', true], // E05
  ['(//XCUIElementTypeButton)[last()-1]', true], // E06
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
  // an absolute XPath from the root is picked up and converted (Phase 7)
  const root = makeTempRoot('xpath-absolute-');
  try {
    const file = join(root, 'alerts.cs');
    writeFileSync(file, [
      `var popover = App.FindElement(By.XPath("/XCUIElementTypeApplication/XCUIElementTypeWindow/XCUIElementTypePopover"));`,
      `var ok = "/XCUIElementTypeApplication//XCUIElementTypeButton[@name='OK']";`,
    ].join('\n'));

    const records = [];
    const stats = makeStats();
    processFile(file, { dryRun: true, quiet: true }, records, stats);
    const converted = records.find((r) => r.status === 'success');

    if (stats.locatorsFound === 2 && stats.skipped.xpathStrategy === 1 && converted
      && converted.new === "-ios class chain:**/XCUIElementTypeButton[`name == 'OK'`]") ok();
    else fail(`processFile absolute: ${JSON.stringify(stats)} ${JSON.stringify(records)}`);
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
  // an Android id value ("android:id/message") on the line above is not a platform key: the iOS
  // locator is reported under its XPath strategy, not counted as Android (Phase 7, eliasnogueira)
  const root = makeTempRoot('xpath-android-id-value-');
  try {
    const file = join(root, 'LoginScreen.java');
    writeFileSync(file, [
      `    @AndroidFindBy(id = "android:id/message")`,
      `    @iOSXCUITFindBy(xpath = "//XCUIElementTypeStaticText[2]")`,
      `    WebElement message;`,
      `    @AndroidFindBy(id = "org.app:id/android:id/edit")`,
      `    @iOSXCUITFindBy(xpath = "//XCUIElementTypeTextField")`,
      `    WebElement edit;`,
    ].join('\n'));

    const records = [];
    const stats = makeStats();
    processFile(file, { dryRun: true, quiet: true }, records, stats);

    if (stats.locatorsFound === 2 && stats.skipped.android === 0 && stats.skipped.xpathStrategy === 2) ok();
    else fail(`processFile android-id-value: stats wrong ${JSON.stringify(stats)}`);
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
