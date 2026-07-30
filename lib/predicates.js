// Shared predicate rewrites. Both the XPath converter and the class-chain
// validator rewrite the same legacy XPath syntax inside `[ ... ]` brackets —
// keeping the helpers here means a behavior change happens in exactly one place.

// Predicate matcher (`[ ... ]`) that respects quoted strings — single, double,
// and (for already-converted chains) backtick. The backtick branch is a no-op
// on raw XPath, so it's safe to use everywhere.
//
// The backtick MUST be excluded from the leading negated class. If it is matched
// by both `[^[\]"']` and the `` `[^`]*` `` branch, a run of backticks inside an
// unclosed bracket decomposes exponentially and the scan hangs (~19s at 42
// backticks, unbounded past that) on ordinary user files. Excluding it makes the
// alternatives disjoint: an unbalanced backtick now simply fails to match here
// and is reported by the validator's backtick-balance check instead.
const PREDICATE_REGEX = /\[(?:[^[\]"'`]|"[^"]*"|'[^']*'|`[^`]*`)*\]/g;

// Attributes whose values are genuinely boolean in the iOS element tree. ONLY
// these may have a `true`/`false` value unquoted (`enabled == true`). A string
// attribute that happens to hold the text "true" (e.g. a StaticText named
// "true") must keep its quotes — coercing it would silently change the match.
// Shared so the converter and validator agree on the exact same set.
const BOOLEAN_ATTRS = ['enabled', 'visible', 'accessible', 'selected', 'hittable', 'focused', 'exists'];

// Matches a string literal that may or may not have its quotes backslash-escaped
// (e.g. both "Save" and \"Save\" from raw JSON file content).
const QUOTED_VALUE = /\\?(?:"[^"\\]*"|'[^'\\]*')/;
const QUOTED_VALUE_SRC = QUOTED_VALUE.source;

function rewriteStringFunctions(text) {
  return text
    // text() node-function: map visible text to label OR value
    .replace(new RegExp(`contains\\s*\\(\\s*text\\s*\\(\\s*\\)\\s*,\\s*(${QUOTED_VALUE_SRC})\\s*\\)`, 'gi'), 'label CONTAINS $1 OR value CONTAINS $1')
    .replace(new RegExp(`starts-with\\s*\\(\\s*text\\s*\\(\\s*\\)\\s*,\\s*(${QUOTED_VALUE_SRC})\\s*\\)`, 'gi'), 'label BEGINSWITH $1 OR value BEGINSWITH $1')
    .replace(new RegExp(`ends-with\\s*\\(\\s*text\\s*\\(\\s*\\)\\s*,\\s*(${QUOTED_VALUE_SRC})\\s*\\)`, 'gi'), 'label ENDSWITH $1 OR value ENDSWITH $1')
    .replace(new RegExp(`text\\s*\\(\\s*\\)\\s*=\\s*(${QUOTED_VALUE_SRC})`, 'gi'), 'label == $1 OR value == $1')
    // regular attributes
    .replace(new RegExp(`contains\\s*\\(\\s*@?([a-zA-Z0-9_-]+)\\s*,\\s*(${QUOTED_VALUE_SRC})\\s*\\)`, 'gi'), '$1 CONTAINS $2')
    .replace(new RegExp(`starts-with\\s*\\(\\s*@?([a-zA-Z0-9_-]+)\\s*,\\s*(${QUOTED_VALUE_SRC})\\s*\\)`, 'gi'), '$1 BEGINSWITH $2')
    .replace(new RegExp(`ends-with\\s*\\(\\s*@?([a-zA-Z0-9_-]+)\\s*,\\s*(${QUOTED_VALUE_SRC})\\s*\\)`, 'gi'), '$1 ENDSWITH $2');
}

// Upper-case operator keywords that sit OUTSIDE quoted strings.
// `keywords` lists what to upper-case: XPath only needs `and|or`; existing
// class chains may also have NSPredicate keywords like CONTAINS / BEGINSWITH.
function upperCaseLogicOps(text, keywords) {
  const kw = keywords.join('|');
  const re = new RegExp(`(['"\`])[\\s\\S]*?\\1|\\b(${kw})\\b`, 'gi');
  return text.replace(re, (match, quote, keyword) => {
    if (quote) return match;        // inside a string literal — leave alone
    if (keyword) return match.toUpperCase();
    return match;
  });
}

module.exports = { PREDICATE_REGEX, BOOLEAN_ATTRS, rewriteStringFunctions, upperCaseLogicOps };
