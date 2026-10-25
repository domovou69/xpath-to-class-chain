const { PREDICATE_REGEX, BOOLEAN_ATTRS, outsideQuotes, maskQuotes, rewriteStringFunctions, upperCaseLogicOps } = require('./predicates');
const { IOS_ELEMENT_TYPES } = require('./elementTypes');

const CC_PREFIX = '-ios class chain:';

// NSPredicate words that may legitimately be followed by '(' — everything else
// followed by '(' is an XPath function WDA cannot evaluate (matches, concat, …).
const NSPREDICATE_CALLABLE = new Set(['NOT', 'AND', 'OR', 'ANY', 'ALL', 'NONE', 'SOME', 'SUBQUERY', 'FUNCTION']);
// Binary operators: `name CONTAINS ("a")` is valid, `contains(name, "a")` is not.
const NSPREDICATE_BINARY = /^(?:CONTAINS|BEGINSWITH|ENDSWITH|LIKE|MATCHES|IN|BETWEEN)$/i;
const NSPREDICATE_COMPARISON = /==|!=|<>|<=|>=|=<|=>|[<>=]|\b(?:CONTAINS|BEGINSWITH|ENDSWITH|LIKE|MATCHES|IN|BETWEEN|TRUEPREDICATE|FALSEPREDICATE)\b/i;

// `${…}` with nested braces → a neutral operand. The runtime value is unknown
// here; as an operand (`name == ${v}`) it is fine, as a whole predicate it is not.
function maskInterpolations(text) {
  let out = '';
  for (let i = 0; i < text.length;) {
    if (text[i] === '$' && text[i + 1] === '{') {
      let depth = 0, j = i + 1;
      for (; j < text.length; j++) {
        if (text[j] === '{') depth++;
        else if (text[j] === '}' && --depth === 0) break;
      }
      out += '0';
      i = j + 1;
    } else out += text[i++];
  }
  return out;
}

// The one WDA type a `type OP "name"` test selects, or null when it selects
// none or several: `type CONTAINS "XCUIElementTypeText"` matches TextField and
// TextView, and an unknown name matches nothing (as a step WDA would read it as
// Other).
function singleTypeMatch(op, name) {
  const test = {
    '==': t => t === name,
    CONTAINS: t => t.includes(name),
    BEGINSWITH: t => t.startsWith(name),
    ENDSWITH: t => t.endsWith(name),
  }[op.toUpperCase()];
  const hits = [...IOS_ELEMENT_TYPES].filter(test);
  return hits.length === 1 ? hits[0] : null;
}

// Why WDA would reject one `[...]` predicate, or null when it is fine. Checks
// the whole backtick / `$` block — string literals are blanked first, so text
// inside a value ("f(x)", "a/b") never counts. Each rule is confirmed against
// WDA v16.14.1's parser (see audit/harness).
function predicateProblem(pred) {
  const body = pred.slice(1, -1);
  const block = body.match(/^(\\?`|\$)([\s\S]*)\1$/);
  if (!block) {
    // Outside a block only an index is allowed: [2], [-1], [${i}]
    if (/^-?\d+$/.test(body) || /^\$\{[\s\S]*\}$/.test(body)) return null;
    return 'predicate is not wrapped in backticks';
  }
  const expr = maskInterpolations(block[2].replace(/\\(["'])/g, '$1'))
    .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
  for (const m of expr.matchAll(/([A-Za-z_][\w-]*)\s*\(/g)) {
    const name = m[1];
    if (NSPREDICATE_CALLABLE.has(name.toUpperCase())) continue;
    if (NSPREDICATE_BINARY.test(name)) {
      const before = expr.slice(0, m.index).trimEnd();
      if (/[\w"')\]}]$/.test(before) && !/\b(?:AND|OR|NOT)$/i.test(before)) continue;
    }
    return `XPath function ${name}()`;
  }
  if (/@|\/|::/.test(expr)) return 'XPath attribute or path';
  if (!NSPREDICATE_COMPARISON.test(expr)) return 'no comparison';
  return null;
}

// Text with the string literals inside backtick blocks blanked, so a `]`, `"` or
// doubled backtick in a value ("a]b", 'a"b', "a``b") is not read as syntax.
// `unterminated` is true when a literal or block is left open.
function blankBlockLiterals(chain) {
  let out = '';
  let inBlock = false;
  let literal = null;
  for (let i = 0; i < chain.length; i++) {
    const c = chain[i];
    if (literal) {
      if (c === '\\') { out += ' '; i++; if (i < chain.length) out += ' '; }
      else if (c === literal) { literal = null; out += c; }
      else out += ' ';
    } else if (c === '\\') {
      out += c;
      if (i + 1 < chain.length) out += chain[++i];
    } else if (c === '`') { inBlock = !inBlock; out += c; }
    else if (inBlock && (c === '"' || c === "'")) { literal = c; out += c; }
    else out += c;
  }
  return { text: out, unterminated: literal !== null };
}

// True when a quote opened in `text` is never closed. A plain "…" / '…' closes at
// the same quote (a backslash escapes the next character), an escaped \"…\" at the
// next escaped quote; the other quote kind inside is just text.
function hasUnclosedQuote(text) {
  let close = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (close === null) {
      if (c === '\\' && (text[i + 1] === '"' || text[i + 1] === "'")) close = '\\' + text[++i];
      else if (c === '"' || c === "'") close = c;
    } else if (close.length === 2) {
      if (c === '\\' && text[i + 1] === close[1]) { close = null; i++; }
    } else if (c === '\\') i++;
    else if (c === close) close = null;
  }
  return close !== null;
}

// `*[type == "XCUIElementTypeFoo" AND …]` → `XCUIElementTypeFoo[…]`: the type test
// moves into the native element node. The converter applies this to its own output;
// validateAndFixClassChain applies it to chains found in code. Prefix kept as given.
function collapseWildcardTypes(classChain) {
  const hasPrefix = classChain.startsWith(CC_PREFIX);
  const chain = hasPrefix ? classChain.slice(CC_PREFIX.length) : classChain;
  // The (\\?['"`]) capture lets the same regex handle both raw and escaped
  // backticks (escaped backticks appear inside JS template literals).
  const collapsed = chain.replace(/\*\s*\[(\\?['"`])(.*?)\1\]/g, (match, quote, innerPredicate) => {
    // Only when the type test is ANDed with the rest: under OR or NOT, dropping
    // it changes what the predicate selects.
    const unquoted = maskQuotes(innerPredicate);
    if (/\b(?:OR|NOT)\b|\|\||!(?!=)|[()]/i.test(unquoted)) return match;
    // Find the 'type' check (handles ==, CONTAINS, BEGINSWITH, ENDSWITH) outside quoted
    // values: `label == "type == 'XCUIElementTypeButton'"` is data, not a type test.
    const typeMatch = [...innerPredicate.matchAll(
      /\btype\s*(==|CONTAINS|BEGINSWITH|ENDSWITH)\s*\\?['"](XCUIElementType[A-Za-z0-9]+)\\?['"]/gi
    )].find(m => unquoted[m.index] !== '_');
    const elementType = typeMatch && singleTypeMatch(typeMatch[1], typeMatch[2]);

    if (elementType) {
      let newPredicate = (innerPredicate.slice(0, typeMatch.index) + innerPredicate.slice(typeMatch.index + typeMatch[0].length)).trim();

      // Clean up any dangling AND / OR operators left behind
      newPredicate = newPredicate
        .replace(/^(AND|OR)\s+/i, '')
        .replace(/\s+(AND|OR)$/i, '')
        .trim();
      newPredicate = newPredicate.replace(/\s+(AND|OR)\s+(AND|OR)\s+/gi, ' $1 ').trim(); // Failsafe for double operators

      // If the predicate ONLY contained the type, drop the brackets entirely.
      if (!newPredicate) {
        return elementType;
      }

      return `${elementType}[${quote}${newPredicate}${quote}]`;
    }
    return match;
  });
  return hasPrefix ? `${CC_PREFIX}${collapsed}` : collapsed;
}

// Rewrites leftover XPath syntax inside one `[...]` predicate of an existing chain
// into NSPredicate: string functions, `@attr`, lower-case keywords, quoted booleans.
function healPredicate(pred) {
  pred = rewriteStringFunctions(pred);
  pred = outsideQuotes(pred, t => t.replace(/@([a-zA-Z0-9_-]+)/g, '$1'));
  pred = upperCaseLogicOps(pred, ['and', 'or', 'not', 'contains', 'beginswith', 'endswith']);
  return pred.replace(/\b([a-zA-Z0-9_-]+)\s*(==|!=)\s*['"]([^'"]+)['"]/gi, (match, attr, operator, val) => {
    if (BOOLEAN_ATTRS.includes(attr.toLowerCase())) {
      const cleanVal = /^(true|false)$/i.test(val) ? val.toLowerCase() : val;
      return `${attr} ${operator} ${cleanVal}`;
    }
    return match;
  });
}

// The checks, with `heal` choosing whether leftover XPath syntax in a predicate is
// rewritten first (an existing chain) or reported (the converter's own output).
// ALWAYS returns { valid, fixedLocator, reason } — the shape is uniform so callers can
// read fields unconditionally; on failure `fixedLocator` is null and `reason` carries
// the diagnostic.
function validateChain(classChain, heal) {
  const fail = (reason) => ({ valid: false, fixedLocator: null, reason });
  // Strip the prefix only when it IS the prefix. `.replace()` removes the first
  // occurrence anywhere, so a chain carrying the literal text mid-string would
  // be mangled. Matches how optimizer.js already slices it.
  let chain = classChain.startsWith(CC_PREFIX) ? classChain.slice(CC_PREFIX.length) : classChain;

  // 1. Bracket balance
  const blanked = blankBlockLiterals(chain);
  if (blanked.unterminated) return fail(`Unbalanced quotes in predicate`);
  const openB = (blanked.text.match(/\[/g) || []).length;
  const closeB = (blanked.text.match(/\]/g) || []).length;
  if (openB !== closeB) return fail(`Unbalanced brackets`);

  // 2. Backtick balance (ignoring escaped backticks)
  const chainWithoutEscapedBackticks = chain.replace(/\\`/g, '');
  const backticks = (chainWithoutEscapedBackticks.match(/`/g) || []).length;
  if (backticks % 2 !== 0) return fail(`Unbalanced backticks`);

  // 3. Predicate syntax — heal each, then splice transformed versions back in
  // by POSITION (not text-match), so two identical predicates such as [1]…[1]
  // are both updated rather than only the first.
  const predicateMatches = chain.match(PREDICATE_REGEX);
  if (predicateMatches) {
    const transformedPreds = [];
    for (let i = 0; i < predicateMatches.length; i++) {
      let pred = predicateMatches[i];

      // Auto-heal leftover XPath syntax inside legacy Class Chains
      if (heal) pred = healPredicate(pred);

      if (hasUnclosedQuote(pred)) return fail(`Unbalanced quotes in predicate`);

      const problem = predicateProblem(pred);
      if (problem) return fail(`Leftover XPath syntax detected (${problem}): "${pred}"`);

      transformedPreds.push(pred);
    }

    let predIdx = 0;
    chain = chain.replace(PREDICATE_REGEX, () => transformedPreds[predIdx++]);
  }

  return {
    valid: true,
    fixedLocator: `${CC_PREFIX}${chain}`,
    reason: null,
  };
}

// Validates an existing -ios class chain string, auto-healing the predicate syntax
// where possible: the chains users already have in their code.
function validateAndFixClassChain(classChain) {
  return validateChain(collapseWildcardTypes(classChain), true);
}

// Validates a chain the converter built: nothing is rewritten, leftover XPath syntax
// fails the check, so a converter defect is reported instead of healed.
function checkChain(classChain) {
  return validateChain(classChain, false);
}

module.exports = { validateAndFixClassChain, checkChain, collapseWildcardTypes };
