/* eslint-disable @typescript-eslint/no-require-imports */
const { PREDICATE_REGEX, BOOLEAN_ATTRS, rewriteStringFunctions, upperCaseLogicOps } = require('./predicates');

const CC_PREFIX = '-ios class chain:';

// Validates an existing -ios class chain string, auto-healing the predicate
// syntax where possible. ALWAYS returns { valid, fixedLocator, reason } — the
// shape is uniform so callers can read fields unconditionally; on failure
// `fixedLocator` is null and `reason` carries the diagnostic.
function validateAndFixClassChain(classChain) {
  const fail = (reason) => ({ valid: false, fixedLocator: null, reason });
  // Strip the prefix only when it IS the prefix. `.replace()` removes the first
  // occurrence anywhere, so a chain carrying the literal text mid-string would
  // be mangled. Matches how optimizer.js already slices it.
  let chain = classChain.startsWith(CC_PREFIX) ? classChain.slice(CC_PREFIX.length) : classChain;

  // Auto-optimize a `*[…type == 'XCUIElementTypeFoo'…]` predicate into the
  // native element node, dropping the type clause from the bracket.
  // The (\\?['"`]) capture lets the same regex handle both raw and escaped
  // backticks (escaped backticks appear inside JS template literals).
  chain = chain.replace(/\*\s*\[(\\?['"`])(.*?)\1\]/g, (match, quote, innerPredicate) => {
    // Find the 'type' check (handles ==, CONTAINS, BEGINSWITH, ENDSWITH)
    const typeMatch = innerPredicate.match(
      /\btype\s*(?:==|CONTAINS|BEGINSWITH|ENDSWITH)\s*['"](XCUIElementType[A-Za-z0-9]+)['"]/i
    );

    if (typeMatch) {
      const elementType = typeMatch[1]; // e.g., XCUIElementTypeOther
      let newPredicate = innerPredicate.replace(typeMatch[0], '').trim();

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

  // 1. Bracket balance
  const openB = (chain.match(/\[/g) || []).length;
  const closeB = (chain.match(/\]/g) || []).length;
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

      // Auto-heal leftover XPath string functions inside legacy Class Chains
      pred = rewriteStringFunctions(pred);
      pred = pred.replace(/@([a-zA-Z0-9_-]+)/g, '$1');
      pred = upperCaseLogicOps(pred, ['and', 'or', 'not', 'contains', 'beginswith', 'endswith']);
      pred = pred.replace(/\b([a-zA-Z0-9_-]+)\s*(==|!=)\s*['"]([^'"]+)['"]/gi, (match, attr, operator, val) => {
        if (BOOLEAN_ATTRS.includes(attr.toLowerCase())) {
          const cleanVal = /^(true|false)$/i.test(val) ? val.toLowerCase() : val;
          return `${attr} ${operator} ${cleanVal}`;
        }
        return match;
      });

      const quotes = (pred.match(/"/g) || []).length;
      if (quotes % 2 !== 0) return fail(`Unbalanced quotes in predicate`);

      // Anything that still looks like raw XPath syntax (bare @, text(), '(')
      // outside of strings means we couldn't fully convert this predicate.
      const predWithoutStrings = pred.replace(/(['"`]).*?\1/g, '');
      if (
        predWithoutStrings.includes('@') ||
        predWithoutStrings.includes('text()') ||
        predWithoutStrings.includes('(')
      ) {
        // Ignore simple index brackets like [1] or [`1`]
        if (!/^\[`?\d+`?\]$/.test(predWithoutStrings)) {
          return fail(`Leftover XPath syntax detected: "${pred}"`);
        }
      }

      transformedPreds.push(pred);
    }

    let predIdx = 0;
    chain = chain.replace(PREDICATE_REGEX, () => transformedPreds[predIdx++]);
  }

  // 4. Wildcard inside an exact match is invalid in NSPredicate (LIKE/MATCHES required).
  if (/[!=]=\s*['"][^'"]*\*/.test(chain)) {
    return fail('Invalid wildcard usage with == or != (use LIKE/MATCHES instead)');
  }

  return {
    valid: true,
    fixedLocator: `${CC_PREFIX}${chain}`,
    reason: null,
  };
}

module.exports = { validateAndFixClassChain };
