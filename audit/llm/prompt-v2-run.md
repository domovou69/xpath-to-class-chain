`input.json` in the current folder has 678 XPath locators from iOS UI tests (Appium, XCUITest driver). Convert each one to an iOS class chain locator (`-ios class chain`) that finds the same elements. If a locator cannot be expressed as a class chain that finds the same elements, skip it and give the reason.

The rules below describe how to convert. Where they say to reply with a chain or "SKIP: <reason>", use the output format given after them.

--- RULES ---
Convert each Appium XCUITest XPath into an iOS class chain that finds exactly
the same elements. Reply with the chain, or "SKIP: <reason>" if no exact chain
exists. A skip costs little; a chain that WDA rejects or that finds other
elements costs more. Convert what the rules below cover, skip the rest.

Structure
- **/X any depth, /X child, * any type (XCUIElementTypeAny is *). `//` between
  steps -> /**/. .//X at the start -> **/X. /XCUIElementTypeApplication/A/B ->
  A/B. Keep every intermediate step.
- Predicate [`NSPredicate`]; descendant test [$NSPredicate$].
- Only real XCUITest type names. SKIP any other name (e.g. XCUIElementTypeLabel).

String literals
- Double quotes. Escape " as \" and \ as \\. Write line breaks as \n and tabs
  as \t, never raw. Write a backtick as two backticks.
- == is exact and has no wildcards: * and ? in a literal are plain characters,
  so never use LIKE for them.

Attributes
- Keys: name, label, value, type, enabled, visible, accessible, hittable,
  placeholderValue, index; @x/@y/@width/@height -> rect.x, rect.y, rect.width,
  rect.height. Booleans and numbers are unquoted: enabled == true, index == 1,
  rect.x > 60.
- @type="T" is the step T, not a predicate. Other tests on @type: SKIP.
- SKIP @selected and @text (not in the XML WDA searches), text(), and any use
  of "." as text: contains(., "a").
- A missing attribute fails an XPath comparison, but is nil in NSPredicate:
  @a!="v" -> a != nil AND a != "v"; [@a] -> a != nil;
  not(@a="v") -> NOT (a == "v").
- @a=true() on enabled, visible, accessible or hittable only tests that the
  attribute exists, and WDA always writes it: no predicate. Other uses of true()
  and false(): SKIP.
- < and > on a text attribute (name, label, value): SKIP. XPath reads "10abc"
  as NaN, NSPredicate reads it as 10. Only the numeric attributes above
  (rect.*, index) take < and >.
- AND binds tighter than OR in both languages; add parentheses around every
  AND group inside an OR, and around an OR that is combined with a second
  [..] -> (a OR b) AND c.

Text functions
- contains / starts-with / ends-with -> CONTAINS / BEGINSWITH / ENDSWITH.
  Fold concat() of literals. Convert XPath 2.0 functions too (WDA has them).
- Case: lower-case(x)="v", upper-case(x)="V" -> x ==[c] "v"; contains of
  lower-case(x), upper-case(x) or translate(x, "A..Z", "a..z") -> CONTAINS[c].
  Only with a literal of ASCII letters, already in the case the function
  produces (otherwise the XPath never matches: SKIP).
- matches(x, p) without flags, p with no regex metacharacters -> CONTAINS; with
  flag "i" -> CONTAINS[c]. Any other p -> MATCHES "(?s:.*)(?-s:p)(?s:.*)", with
  p keeping its own ^ and $. Reason: XPath matches() searches inside the string,
  and MATCHES must match the whole string, and its "." also matches a line
  break. SKIP flags other than "i", and any p that contains a space.
- SKIP normalize-space() and string-length(). MATCHES treats a no-break space
  as a space, and .length counts UTF-16 units, so neither has an exact form.
  Never use MATCHES to work around whitespace or text normalization.
- == is exact. CONTAINS and BEGINSWITH equal the XPath on ordinary text.
  MATCHES and [c] also fold compatibility characters (fullwidth letters,
  ligatures, ß); they are an approximation for such text. Do not claim more.
- SKIP replace(), tokenize(), string-join(), count().

Combining
- [a][b] -> a AND b. Unions of //T[p] tests that differ only in the predicate
  -> one step with the predicates joined by OR (add type == "T" when the types
  differ). Other unions: SKIP.
- [.//T[p]] or [descendant::T[p]] -> [$type == "T" AND p$];
  //T1[p]/ancestor::T2 -> **/T2[$type == "T1" AND p$].
  $...$ also tests the element itself. So use it only when the outer step and
  the inner step both name a type and the types differ. With * or the same type
  on either side: SKIP. Child tests like [T] or [./T]: SKIP.
- SKIP parent, sibling, preceding, following axes, ancestor with a predicate or
  an index, and any other ancestor form.

Positions (1-based, never 0)
- (//X[p])[n] -> **/X[`p`][n]; (//X)[last()] -> **/X[-1];
  (//X)[last()-n] -> **/X[-(n+1)]. In the chain, a predicate comes before the
  index. These count in WDA's breadth-first order, which differs from XPath's
  document order when the matches sit at different depths; convert them anyway.
- SKIP: last() inside a step (//X[last()]), position() tests, ranges, an index
  written before a filter (X[2][@a="v"]), an index on a parenthesised path that
  has a further step or an inner index, and a position that is not a number.
--- END OF RULES ---

Write the result to `output.json` in the current folder: a JSON array with one entry per input `id`, either

```json
{ "id": "x001", "chain": "-ios class chain:**/XCUIElementTypeButton[`name == \"OK\"`]" }
```

or

```json
{ "id": "x002", "skip": true, "reason": "..." }
```

Write each chain as the full locator string, with the `-ios class chain:` prefix. If the result is too large for one file, write it in parts as `output-1.json`, `output-2.json`, …; the parts are merged after you finish. Every id must be present in the end.
