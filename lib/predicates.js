// Shared predicate rewrites. Both the XPath converter and the class-chain
// validator rewrite the same legacy XPath syntax inside `[ ... ]` brackets —
// keeping the helpers here means a behavior change happens in exactly one place.

// Predicate matcher (`[ ... ]`) that respects quoted strings — single, double,
// and (for already-converted chains) backtick. The backtick branch is a no-op
// on raw XPath, so it's safe to use everywhere.
//
// The backtick MUST be excluded from the leading negated class. If it is matched
// by both `[^[\]"']` and the backtick branch, a run of backticks inside an
// unclosed bracket decomposes exponentially and the scan hangs (~19s at 42
// backticks, unbounded past that) on ordinary user files. Excluding it makes the
// alternatives disjoint: an unbalanced backtick now simply fails to match here
// and is reported by the validator's backtick-balance check instead.
//
// The backtick branch spells out `\\.` so an ESCAPED backtick — Appium's way of
// putting a literal ` inside an NSPredicate block, and what the validator's
// backtick-balance check already tolerates — does not terminate the block early.
// Without it, `[\`label == "a\\\`b"\`]` matched nothing at all and every rule
// routed through this regex silently skipped the predicate. `\\.` and `[^\\\`]`
// are themselves disjoint (one starts with a backslash, the other excludes it),
// so this stays linear.
const PREDICATE_REGEX = /\[(?:[^[\]"'`]|"[^"]*"|'[^']*'|`(?:\\.|[^\\`])*`)*\]/g;

// Attributes whose values are genuinely boolean in the iOS element tree. ONLY
// these may have a `true`/`false` value unquoted (`enabled == true`). A string
// attribute that happens to hold the text "true" (e.g. a StaticText named
// "true") must keep its quotes — coercing it would silently change the match.
// Shared so the converter and validator agree on the exact same set.
const BOOLEAN_ATTRS = ['enabled', 'visible', 'accessible', 'selected', 'hittable', 'focused', 'exists'];

// Matches a string literal that may or may not have its quotes backslash-escaped
// (e.g. both "Save" and \"Save\" from raw JSON file content). A plain literal
// may hold backslash escapes ("a\\b", "Don\'t").
const QUOTED_VALUE = /\\"[^"\\]*\\"|\\'[^'\\]*\\'|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/;
const QUOTED_VALUE_SRC = QUOTED_VALUE.source;

// `label OP v OR value OP v`, parenthesised when AND or NOT sits next to it:
// both bind tighter than OR, so `[text()="a" and @enabled="true"]` needs the group.
function textAlternatives(op) {
  return (match, value, offset, whole) => {
    const alt = `label ${op} ${value} OR value ${op} ${value}`;
    const rest = whole.slice(0, offset) + whole.slice(offset + match.length);
    return /\b(?:AND|NOT)\b|&&|!/i.test(rest) ? `(${alt})` : alt;
  };
}

function rewriteStringFunctions(text) {
  return text
    // text() node-function: map visible text to label OR value
    .replace(new RegExp(`contains\\s*\\(\\s*text\\s*\\(\\s*\\)\\s*,\\s*(${QUOTED_VALUE_SRC})\\s*\\)`, 'gi'), textAlternatives('CONTAINS'))
    .replace(new RegExp(`starts-with\\s*\\(\\s*text\\s*\\(\\s*\\)\\s*,\\s*(${QUOTED_VALUE_SRC})\\s*\\)`, 'gi'), textAlternatives('BEGINSWITH'))
    .replace(new RegExp(`ends-with\\s*\\(\\s*text\\s*\\(\\s*\\)\\s*,\\s*(${QUOTED_VALUE_SRC})\\s*\\)`, 'gi'), textAlternatives('ENDSWITH'))
    .replace(new RegExp(`text\\s*\\(\\s*\\)\\s*=\\s*(${QUOTED_VALUE_SRC})`, 'gi'), textAlternatives('=='))
    // regular attributes
    .replace(new RegExp(`contains\\s*\\(\\s*@?([a-zA-Z0-9_-]+)\\s*,\\s*(${QUOTED_VALUE_SRC})\\s*\\)`, 'gi'), attributeFunction('CONTAINS'))
    .replace(new RegExp(`starts-with\\s*\\(\\s*@?([a-zA-Z0-9_-]+)\\s*,\\s*(${QUOTED_VALUE_SRC})\\s*\\)`, 'gi'), attributeFunction('BEGINSWITH'))
    .replace(new RegExp(`ends-with\\s*\\(\\s*@?([a-zA-Z0-9_-]+)\\s*,\\s*(${QUOTED_VALUE_SRC})\\s*\\)`, 'gi'), attributeFunction('ENDSWITH'));
}

// `contains(@attr, v)` → `attr OP v`. A boolean attribute is a number to
// NSPredicate, and a string operator on it raises in WDA; the XPath compares the
// page source's "true"/"false" text, so the only full-text matches become
// `attr == true|false`. Any other value is left as the XPath call, which the
// validator then rejects instead of shipping a chain WDA cannot evaluate.
function attributeFunction(op) {
  return (match, attr, value) => {
    if (!BOOLEAN_ATTRS.includes(attr.toLowerCase())) return `${attr} ${op} ${value}`;
    const bool = value.replace(/^\\?["']|\\?["']$/g, '');
    return /^(?:true|false)$/.test(bool) ? `${attr} == ${bool}` : match;
  };
}

// Apply `fn` to the text outside quoted strings only, so a value such as
// "$5 and @x" is never edited. A string opened with an escaped quote (\"…\",
// raw JSON / Java source) closes at the next escaped quote; a plain one allows
// backslash escapes inside.
function outsideQuotes(text, fn) {
  return text.replace(
    /(\\"[\s\S]*?\\"|\\'[\s\S]*?\\'|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|[^"'\\]+|[\s\S]/g,
    (m, quoted) => (quoted ? m : fn(m))
  );
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

// True when `expr` has an OR (or `||`) outside quotes and parentheses — joining it to
// another condition with AND then needs a group: `(a OR b) AND c`.
function hasTopLevelOr(expr) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (quote) {
      if (c === quote) quote = null; // XPath has no backslash escapes; a JSON-escaped \"a\" still pairs up
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (depth === 0 && (/^(?:OR\b|\|\|)/i.test(expr.slice(i))) && !/\w/.test(expr[i - 1] || '')) return true;
  }
  return false;
}

module.exports = { PREDICATE_REGEX, hasTopLevelOr, outsideQuotes, BOOLEAN_ATTRS, rewriteStringFunctions, upperCaseLogicOps };
