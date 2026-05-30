/* eslint-disable @typescript-eslint/no-require-imports */
// Shared predicate rewrites. Both the XPath converter and the class-chain
// validator rewrite the same legacy XPath syntax inside `[ ... ]` brackets —
// keeping the helpers here means a behavior change happens in exactly one place.

// Predicate matcher (`[ ... ]`) that respects quoted strings — single, double,
// and (for already-converted chains) backtick. The backtick branch is a no-op
// on raw XPath, so it's safe to use everywhere.
const PREDICATE_REGEX = /\[(?:[^[\]"']|"[^"]*"|'[^']*'|`[^`]*`)*\]/g;

function rewriteStringFunctions(text) {
  return text
    .replace(/contains\s*\(\s*@?([a-zA-Z0-9_-]+)\s*,\s*(['"][^'"]*['"])\s*\)/gi, '$1 CONTAINS $2')
    .replace(/starts-with\s*\(\s*@?([a-zA-Z0-9_-]+)\s*,\s*(['"][^'"]*['"])\s*\)/gi, '$1 BEGINSWITH $2')
    .replace(/ends-with\s*\(\s*@?([a-zA-Z0-9_-]+)\s*,\s*(['"][^'"]*['"])\s*\)/gi, '$1 ENDSWITH $2');
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

module.exports = { PREDICATE_REGEX, rewriteStringFunctions, upperCaseLogicOps };
