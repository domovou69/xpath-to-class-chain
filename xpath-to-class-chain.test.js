/* eslint-disable @typescript-eslint/no-require-imports */
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

  // --- string functions: contains / starts-with / ends-with ---
  ['//*[contains(@name, "alpha")]', `${CC}**/*[\`name CONTAINS "alpha"\`]`],
  ['//XCUIElementTypeButton[contains(@label,"Save")]', `${CC}**/XCUIElementTypeButton[\`label CONTAINS "Save"\`]`],
  ['//XCUIElementTypeStaticText[starts-with(@label, "Welcome")]', `${CC}**/XCUIElementTypeStaticText[\`label BEGINSWITH "Welcome"\`]`],
  ['//XCUIElementTypeStaticText[ends-with(@label, "done")]', `${CC}**/XCUIElementTypeStaticText[\`label ENDSWITH "done"\`]`],
  // whitespace before '(' + single-quoted value
  ["//XCUIElementTypeStaticText[contains (@name, 'hello world.')]", `${CC}**/XCUIElementTypeStaticText[\`name CONTAINS 'hello world.'\`]`],

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
  ['//foo[@a="1"][@b="2"][3]', `${CC}**/foo[\`a == "1" AND b == "2"\`][3]`],

  // --- tricky literals that must NOT trip the parser/validator ---
  ['//XCUIElementTypeCell[@name="a/b"]', `${CC}**/XCUIElementTypeCell[\`name == "a/b"\`]`], // slash inside value
  ['//XCUIElementTypeOther[contains(@name, "Widget.item(1")]', `${CC}**/XCUIElementTypeOther[\`name CONTAINS "Widget.item(1"\`]`], // unbalanced '(' inside value
  ['//XCUIElementTypeStaticText[contains(@label, "£")]', `${CC}**/XCUIElementTypeStaticText[\`label CONTAINS "£"\`]`], // currency / unicode
  ['//XCUIElementTypeStaticText[@name="Line one\nLine two"]', `${CC}**/XCUIElementTypeStaticText[\`name == "Line one\nLine two"\`]`], // newline in value
  // @text is an attribute named "text", not the text() node-test
  ['//XCUIElementTypeStaticText[contains(@text, "Section")]', `${CC}**/XCUIElementTypeStaticText[\`text CONTAINS "Section"\`]`],
  // a literal '|' inside a quoted value is NOT a union — must still convert
  ['//XCUIElementTypeStaticText[@label="a|b"]', `${CC}**/XCUIElementTypeStaticText[\`label == "a|b"\`]`],

  // axis-like / function-like / android-like text INSIDE a quoted value must NOT
  // trigger a structural skip — gates look at syntax, not attribute-value text
  ['//XCUIElementTypeStaticText[@label="parent::root info"]', `${CC}**/XCUIElementTypeStaticText[\`label == "parent::root info"\`]`],
  ['//XCUIElementTypeStaticText[@name="my.android.helper"]', `${CC}**/XCUIElementTypeStaticText[\`name == "my.android.helper"\`]`],
  ['//XCUIElementTypeStaticText[@label="following-sibling node"]', `${CC}**/XCUIElementTypeStaticText[\`label == "following-sibling node"\`]`],
  ['//XCUIElementTypeStaticText[@value="count(items) total"]', `${CC}**/XCUIElementTypeStaticText[\`value == "count(items) total"\`]`],
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
  ['(//XCUIElementTypeStaticText[@name="icon"])[last()]', 'last() + grouping'],
  ['//*[contains(@name, "Item")]/following-sibling::*[1][position() <= 15]', 'position()'],
  ['//*[contains(@label,"x") and not(contains(@label,"y"))]', 'not()'],
  ['//*[contains(@label, "x") and not (contains(@label, "y"))]', 'not ( with space'], // caught by leftover-paren validation
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

  // grouping parens — XPath (...)[n] is not expressible inline; leading '(' is not an XPath start
  ['(//XCUIElementTypeButton[@name="Widget.backButton"])[1]', 'grouped + index'],
  ['(//XCUIElementTypeStaticText[@label="Some label"])', 'unnecessary wrapping parens'],

  // wildcard inside an exact match — invalid in NSPredicate (use LIKE/MATCHES)
  ['//*[@name="abc*"]', 'wildcard in =='],

  // already a Class Chain fragment mislabelled as XPath
  ['//XCUIElementTypeButton[`label == "Done"`]', 'backtick fragment'],

  // not an XPath at all
  ['', 'empty string'],
  ['Some plain string', 'plain text'],
  ['-ios class chain:**/XCUIElementTypeButton[`name == "x"`]', 'already a class chain'],
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
  { argv: ['./src'], expect: { positionals: ['./src'], dryRun: true, json: false, quiet: false, optimize: false } },
  { argv: ['./src', '--dry-run'], expect: { positionals: ['./src'], dryRun: true } },
  { argv: ['--write'], expect: { dryRun: false } },
  { argv: ['--dry-run', '--write'], expect: { dryRun: true } }, // --dry-run wins
  { argv: ['--json'], expect: { json: true, quiet: true } }, // --json implies --quiet
  { argv: ['--quiet'], expect: { quiet: true, json: false } },
  { argv: ['//XCUIElementTypeButton', '--json'], expect: { positionals: ['//XCUIElementTypeButton'], json: true } },
  { argv: ['--optimize'], expect: { optimize: true } },
  { argv: ['./src', '--optimize', '--write'], expect: { optimize: true, dryRun: false } },
];

// =====================================================================
// OPTIMIZE_CASES — convertXpathToClassChain WITH { optimize: true } recovers
// inputs that fail validation by default. Each row asserts both directions:
// without optimize → skipped; with optimize → success with the LIKE form.
// =====================================================================
const OPTIMIZE_CASES = [
  // wildcard-equality is invalid in NSPredicate; LIKE is the right operator
  {
    xpath: '//XCUIElementTypeButton[@name="abc*"]',
    optimized: `${CC}**/XCUIElementTypeButton[\`name LIKE "abc*"\`]`,
  },
  // wildcard at the front of the value, and in a non-Button element
  {
    xpath: '//XCUIElementTypeStaticText[@label="*done"]',
    optimized: `${CC}**/XCUIElementTypeStaticText[\`label LIKE "*done"\`]`,
  },
  // Wildcard combined with an AND clause — both predicates merge under one
  // backtick; the optimizer touches the wildcard side (LIKE) and also reorders
  // conditions cheapest-first: enabled == (cost 1) before name LIKE (cost 5).
  {
    xpath: '//XCUIElementTypeButton[@name="login*" and @enabled="true"]',
    optimized: `${CC}**/XCUIElementTypeButton[\`enabled == true AND name LIKE "login*"\`]`,
  },
  // Cross-cutting case: type-collapse (validator) + LIKE (optimizer) on the
  // same chain — the idempotency loop is what guarantees both fire.
  {
    xpath: '//*[contains(@type,"XCUIElementTypeButton") and @name="abc*"]',
    optimized: `${CC}**/XCUIElementTypeButton[\`name LIKE "abc*"\`]`,
  },
];

// Existing-class-chain cases: optimizeClassChain healing wildcards in-place.
const OPTIMIZE_CHAIN_CASES = [
  {
    input: `${CC}**/XCUIElementTypeButton[\`name == "abc*"\`]`,
    fixed: `${CC}**/XCUIElementTypeButton[\`name LIKE "abc*"\`]`,
  },
  // Already-LIKE chain is a no-op (fixed point reached immediately)
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
  // Without --optimize: validator rejects the wildcard, source XPath returned unchanged.
  const baseline = convertXpathToClassChain(xpath);
  if (baseline.status === 'skipped_validation_failed' && baseline.locator === xpath) ok();
  else fail(`OPTIMIZE baseline ${xpath}\n     expected: skipped_validation_failed (unchanged)\n     got:      status=${baseline.status} locator=${baseline.locator}`);

  // With --optimize: LIKE recovery succeeds.
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
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } = require('fs');
const { tmpdir } = require('os');
const { join } = require('path');
const { makeStats, walkDir, processFile } = require('./lib/scanner');

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
  // opts.optimize plumbs through processFile end-to-end: a wildcard XPath that
  // would be skipped by default gets rewritten to a LIKE class chain on disk.
  const root = makeTempRoot('xpath-opt-');
  try {
    const file = join(root, 'a.js');
    writeFileSync(file, `const locator = '//XCUIElementTypeButton[@name="abc*"]';`);

    const records = [];
    const stats = makeStats();
    processFile(file, { dryRun: false, quiet: true, optimize: true }, records, stats);

    const after = readFileSync(file, 'utf8');
    const expected = `const locator = '-ios class chain:**/XCUIElementTypeButton[\`name LIKE "abc*"\`]';`;
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

console.log(`\n${failed === 0 ? '✅' : '⚠️'} ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
