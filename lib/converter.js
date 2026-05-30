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

// True when a top-level `|` (XPath union) sits OUTSIDE any quoted string and
// outside `[...]` predicate brackets. Reuses the same quote/bracket-depth scan
// as tokenizeXpath so a literal '|' inside a value like [@label="a|b"] is not
// mistaken for a union operator. Whitespace around the '|' is irrelevant.
function hasTopLevelUnion(xpath) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < xpath.length; i++) {
    const c = xpath[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'" || c === '`') {
      quote = c;
    } else if (c === '[') {
      depth++;
    } else if (c === ']') {
      depth--;
    } else if (c === '|' && depth === 0) {
      return true;
    }
  }
  return false;
}

// Blank out the *contents* of every quoted span ('…', "…", `…`) with spaces,
// keeping the quote delimiters and the overall length. The structural
// pre-conversion gates below (`android.`, axis names, unsupported functions,
// surviving `::`) must look at XPath syntax only — never at the text a user
// happened to put inside an attribute value. Without masking, a label like
// "parent::root info" or a name like "my.android.helper" would trigger a false
// skip. Uses the same quote-tracking scan as tokenizeXpath/hasTopLevelUnion.
function maskQuotedValues(xpath) {
  const chars = xpath.split('');
  let quote = null;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (quote) {
      if (c === quote) quote = null;
      else chars[i] = ' ';
    } else if (c === '"' || c === "'" || c === '`') {
      quote = c;
    }
  }
  return chars.join('');
}

// `opts.optimize` (default false) routes the candidate through the optimizer
// pass instead of plain validation — this is what lets a wildcard-`==` XPath
// like //Btn[@name="a*"] survive (recovered as `name LIKE "a*"`) rather than
// fail validation.
function convertXpathToClassChain(xpath, opts = {}) {
  if (!xpath.startsWith('/') && !xpath.startsWith('//')) return { locator: xpath, status: STATUS.SKIPPED_NOT_XPATH };

  // Structural gates below run against a masked copy so that axis-like or
  // `android.`-like text *inside* a quoted attribute value can't trigger a
  // false skip (e.g. [@label="parent::root info"], [@name="my.android.helper"]).
  const masked = maskQuotedValues(xpath);

  if (masked.includes('android.')) return { locator: xpath, status: STATUS.SKIPPED_ANDROID };
  if (hasTopLevelUnion(xpath)) return { locator: xpath, status: STATUS.SKIPPED_UNSUPPORTED_LOGIC };

  // A backtick means this is already (or partially) a Class Chain predicate, not a
  // clean XPath. Converting it would double-wrap the backticks — leave it alone.
  if (xpath.includes('`')) return { locator: xpath, status: STATUS.SKIPPED_VALIDATION_FAILED };

  // Skip complex functions that Class Chains don't support well.
  // Whitespace-tolerant so `not (` is caught the same as `not(`.
  if (/\b(?:not|count|last|position)\s*\(/i.test(masked))
    return { locator: xpath, status: STATUS.SKIPPED_UNSUPPORTED_LOGIC };

  // Axes other than child/descendant aren't expressible as a Class Chain.
  if (
    masked.includes('following-sibling') ||
    masked.includes('preceding-sibling') ||
    masked.includes('parent::') ||
    masked.includes('following::') ||
    masked.includes('preceding::') ||
    masked.includes('ancestor::')
  ) {
    return { locator: xpath, status: STATUS.SKIPPED_UNSUPPORTED_LOGIC };
  }

  let normalizedXpath = xpath.replace(/\/child::/g, '/').replace(/\/descendant::/g, '//');

  // child:: and descendant:: were just normalized away. Any '::' that survives is
  // an axis a Class Chain cannot express (self::, parent::, attribute::, namespace::,
  // *-or-self::, …) — skip rather than emit a broken chain. Masked so a literal
  // '::' inside a value (e.g. "parent::root info") isn't mistaken for an axis.
  if (maskQuotedValues(normalizedXpath).includes('::')) {
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
