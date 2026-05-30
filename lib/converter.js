/* eslint-disable @typescript-eslint/no-require-imports */
const STATUS = require('./status');
const { PREDICATE_REGEX, rewriteStringFunctions, upperCaseLogicOps } = require('./predicates');
const { validateAndFixClassChain } = require('./validator');
const { optimizeClassChain } = require('./optimizer');

// Bracket/quote-aware splitter. Unlike a plain `.split('/')`, this never cuts on
// a slash that lives inside a predicate string (e.g. [@name="a/b"]) or a nested
// predicate path. Returns the token shape the converter expects: separators
// ('/' and '//') interleaved with node parts.
function tokenizeXpath(xpath) {
  const tokens = [];
  const n = xpath.length;
  let i = 0;

  while (i < n) {
    if (xpath[i] === '/') {
      if (xpath[i + 1] === '/') {
        tokens.push('//');
        i += 2;
      } else {
        tokens.push('/');
        i += 1;
      }
      continue;
    }

    const start = i;
    let depth = 0;
    let quote = null;
    while (i < n) {
      const c = xpath[i];
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'" || c === '`') {
        quote = c;
      } else if (c === '[') {
        depth++;
      } else if (c === ']') {
        depth--;
      } else if (c === '/' && depth === 0) {
        break;
      }
      i++;
    }
    tokens.push(xpath.slice(start, i));
  }

  return tokens;
}

// `opts.optimize` (default false) routes the candidate through the optimizer
// pass instead of plain validation — this is what lets a wildcard-`==` XPath
// like //Btn[@name="a*"] survive (recovered as `name LIKE "a*"`) rather than
// fail validation.
function convertXpathToClassChain(xpath, opts = {}) {
  if (!xpath.startsWith('/') && !xpath.startsWith('//')) return { locator: xpath, status: STATUS.SKIPPED_NOT_XPATH };

  if (xpath.includes('android.')) return { locator: xpath, status: STATUS.SKIPPED_ANDROID };
  if (xpath.includes(' | ')) return { locator: xpath, status: STATUS.SKIPPED_UNSUPPORTED_LOGIC };

  // A backtick means this is already (or partially) a Class Chain predicate, not a
  // clean XPath. Converting it would double-wrap the backticks — leave it alone.
  if (xpath.includes('`')) return { locator: xpath, status: STATUS.SKIPPED_VALIDATION_FAILED };

  // Skip complex functions that Class Chains don't support well.
  // Whitespace-tolerant so `not (` is caught the same as `not(`.
  if (/\b(?:not|count|last|position)\s*\(/i.test(xpath))
    return { locator: xpath, status: STATUS.SKIPPED_UNSUPPORTED_LOGIC };

  // Axes other than child/descendant aren't expressible as a Class Chain.
  if (
    xpath.includes('following-sibling') ||
    xpath.includes('preceding-sibling') ||
    xpath.includes('parent::') ||
    xpath.includes('following::') ||
    xpath.includes('preceding::') ||
    xpath.includes('ancestor::')
  ) {
    return { locator: xpath, status: STATUS.SKIPPED_UNSUPPORTED_LOGIC };
  }

  let normalizedXpath = xpath.replace(/\/child::/g, '/').replace(/\/descendant::/g, '//');

  // child:: and descendant:: were just normalized away. Any '::' that survives is
  // an axis a Class Chain cannot express (self::, parent::, attribute::, namespace::,
  // *-or-self::, …) — skip rather than emit a broken chain.
  if (normalizedXpath.includes('::')) {
    return { locator: xpath, status: STATUS.SKIPPED_UNSUPPORTED_LOGIC };
  }

  let classChain = '';
  const parts = tokenizeXpath(normalizedXpath).filter(p => p.length > 0);

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === '//') {
      classChain += '**/';
      continue;
    } else if (part === '/') {
      classChain += '/';
      continue;
    }

    // [\s\S] (not '.') so element parts whose predicate value contains a
    // newline — e.g. an address label "19, Owen Close\nFareham" — aren't truncated.
    const elementMatch = part.match(/^([a-zA-Z0-9_*]+)([\s\S]*)$/);
    if (!elementMatch) {
      classChain += part;
      continue;
    }

    const type = elementMatch[1];
    const predicateRaw = elementMatch[2];
    classChain += type;

    if (predicateRaw) {
      const predicates = predicateRaw.match(PREDICATE_REGEX);
      if (predicates) {
        const logicParts = [];
        const indexParts = [];
        predicates.forEach(pred => {
          let inner = pred.slice(1, -1);

          // only 'and' / 'or' appear in raw XPath; NSPredicate keywords handled by validator
          inner = upperCaseLogicOps(inner, ['and', 'or']);
          inner = inner.replace(/@([a-zA-Z0-9_-]+)\s*=\s*/g, '$1 == ');
          inner = rewriteStringFunctions(inner);
          inner = inner.replace(
            /\b([a-zA-Z0-9_-]+)\s*(==|!=)\s*['"]?(true|false)(?:\(\))?['"]?/gi,
            (match, attr, operator, val) => {
              return `${attr} ${operator} ${val.toLowerCase()}`;
            }
          );
          inner = inner
            .replace(/@label/g, 'label')
            .replace(/@name/g, 'name')
            .replace(/@value/g, 'value');

          // collect now, emit after the loop — index and logic need separate brackets
          if (/^\d+$/.test(inner)) {
            indexParts.push(inner);
          } else {
            logicParts.push(inner);
          }
        });

        // Class Chain allows ONE predicate per segment. Merge all logic
        // predicates with AND, then append positional indexes as their own
        // brackets. e.g. //foo[@a='1'][@b='2'][2]  ->  foo[`a == "1" AND b == "2"`][2]
        if (logicParts.length) {
          classChain += `[\`${logicParts.join(' AND ')}\`]`;
        }
        indexParts.forEach(idx => {
          classChain += `[${idx}]`;
        });
      } else {
        classChain += predicateRaw;
      }
    }
  }

  const candidate = `-ios class chain:${classChain}`;
  const validation = opts.optimize
    ? optimizeClassChain(candidate)
    : validateAndFixClassChain(candidate);

  if (!validation.valid) {
    return { locator: xpath, status: STATUS.SKIPPED_VALIDATION_FAILED };
  }

  return { locator: validation.fixedLocator, status: STATUS.SUCCESS };
}

module.exports = { tokenizeXpath, convertXpathToClassChain };
