const STATUS = require('./status');
const { BOOLEAN_ATTRS, hasTopLevelOp, hasTopLevelOr, outsideQuotes, rewriteStringFunctions, upperCaseLogicOps } = require('./predicates');
const { IOS_ELEMENT_TYPES } = require('./elementTypes');
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

// The operands of a top-level union, split with the same scan as hasTopLevelUnion:
// a '|' inside a quoted value or a predicate is part of its operand.
function splitTopLevelUnion(xpath) {
  const operands = [];
  let depth = 0;
  let quote = null;
  let start = 0;
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
      operands.push(xpath.slice(start, i));
      start = i + 1;
    }
  }
  operands.push(xpath.slice(start));
  return operands;
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

// Find the last structural '/' in a Class Chain body string — i.e. a '/' that
// is outside any predicate bracket [...] or quoted string (including backtick-
// delimited predicates). Used when moving the outer grouped-XPath index to the
// parent element in the chain rather than appending it to the last segment.
function lastStructuralSlash(chainBody) {
  let depth = 0;
  let inStr = false;
  let strChar = null;
  let last = -1;
  for (let i = 0; i < chainBody.length; i++) {
    const c = chainBody[i];
    if (inStr) {
      if (c === strChar) inStr = false;
    } else if (depth > 0 && (c === '"' || c === "'" || c === '`')) {
      inStr = true;
      strChar = c;
    } else if (c === '[') {
      depth++;
    } else if (c === ']') {
      depth--;
    } else if (c === '/' && depth === 0) {
      last = i;
    }
  }
  return last;
}

// Unwrap a grouped XPath pattern `(//inner)[n]` or `(//inner)`.
// Returns { inner, index } — `index` is the raw outer bracket string (e.g.
// '[2]', '[${option + 1}]') or null when there is no outer index.
// Returns null when the input is not a grouped pattern or has an unrecognised
// trailing suffix (e.g. `(//...)[last()]` or multiple outer brackets).
//
// Quote-aware walk so a ')' inside a value like [@label="a)b"] doesn't close
// the group prematurely. Template-expression indexes ([${...}]) are detected
// by the `startsWith`/`endsWith` pair — the content between ${ and } is left
// opaque; the JS runtime evaluates it when the locator lives in a template
// literal, so no static analysis is needed.
function unwrapGrouped(xpath) {
  if (!xpath.startsWith('(')) return null;

  let depth = 0;
  let closeIdx = -1;
  let quote = null;
  for (let i = 0; i < xpath.length; i++) {
    const c = xpath[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '(') {
      depth++;
    } else if (c === ')') {
      depth--;
      if (depth === 0) { closeIdx = i; break; }
    }
  }
  if (closeIdx === -1) return null;

  const inner = xpath.slice(1, closeIdx);
  const rest  = xpath.slice(closeIdx + 1);

  if (rest === '') return { inner, index: null };
  if (/^\[\d+\]$/.test(rest)) return { inner, index: rest };
  // Template-literal expression index: [${option + 1}], [${items.length}], etc.
  if (rest.startsWith('[${') && rest.endsWith('}]')) return { inner, index: rest };

  return null; // e.g. [last()], [position()<=2], multiple trailing brackets
}

// Top-level `[...]` groups of a step's predicate text, nesting- and quote-aware:
// `[.//B[@n="x"]][2]` → ['[.//B[@n="x"]]', '[2]']. PREDICATE_REGEX cannot nest, so it
// would hand back the inner `[@n="x"]` as if it belonged to the step. Returns null
// when the text is not just a run of bracket groups.
function splitPredicates(text) {
  const groups = [];
  let depth = 0;
  let quote = null;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '[') {
      if (depth++ === 0) start = i;
    } else if (c === ']') {
      if (--depth === 0) groups.push(text.slice(start, i + 1));
      if (depth < 0) return null;
    } else if (depth === 0 && !/\s/.test(c)) {
      return null;
    }
  }
  return depth === 0 && groups.length ? groups : null;
}

// Remove `.` (self) steps from the token list, merging the separators around
// them: `A/./B` → `A/B`, `A//./B` and `A/.//B` → `A//B`, a trailing `A/.` → `A`.
// Returns null for what has no chain form: a `..` (parent) step, and a
// trailing `A//.`, which selects A itself as well as its descendants.
function dropSelfSteps(parts) {
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === '..') return null;
    if (part !== '.') { out.push(part); continue; }
    const prev = out.length && (out[out.length - 1] === '/' || out[out.length - 1] === '//') ? out.pop() : null;
    const next = parts[i + 1] === '/' || parts[i + 1] === '//' ? parts[++i] : null;
    if (!next) {
      if (prev === '//') return null;
      continue;
    }
    // A leading `./X` stays relative to the root; `//` anywhere keeps the descendant scan.
    if (prev === '//' || next === '//') out.push('//');
    else if (prev) out.push('/');
  }
  return out;
}

// XPath attributes in WDA's page source, grouped by how a class chain has to
// compare them. Booleans are BOOLEAN_ATTRS (predicates.js). Anything else is
// absent from the page source (the XPath matches nothing) and unknown to WDA's
// predicate parser (the chain raises FBUnknownAttributeException), so it is skipped.
const TEXT_ATTRS = new Set(['name', 'label', 'value', 'type', 'placeholderValue', 'traits']);
const NUMBER_ATTRS = { index: 'index', x: 'rect.x', y: 'rect.y', width: 'rect.width', height: 'rect.height' };
const NUMBER_LITERAL = /^-?\d+(?:\.\d+)?$/;
const XPATH_COMPARISON = /@([a-zA-Z0-9_-]+)\s*(!=|<=|>=|=|<|>)\s*(\\"[^"\\]*\\"|\\'[^'\\]*\\'|"[^"]*"|'[^']*'|-?\d+(?:\.\d+)?|true\(\)|false\(\))/g;

// `@attr OP value` → NSPredicate, or { reason } when there is no faithful form.
function compareAttribute(attr, op, raw) {
  const quoted = !/^[-\d]|\(\)$/.test(raw);
  const literal = quoted ? raw.replace(/^\\?["']|\\?["']$/g, '') : raw;
  const nsOp = op === '=' ? '==' : op;
  // A template interpolation ("${flag}") is the runtime value: unquoted for a boolean or number.
  const interpolation = quoted && /^\$\{[\s\S]*\}$/.test(literal) && (op === '=' || op === '!=');
  if (BOOLEAN_ATTRS.includes(attr)) {
    if (interpolation) return { text: `${attr} ${nsOp} ${literal}` };
    const bool = literal.replace(/\(\)$/, '').toLowerCase();
    if ((op === '=' || op === '!=') && (bool === 'true' || bool === 'false')) return { text: `${attr} ${nsOp} ${bool}` };
    return { reason: `@${attr} is a boolean: only = / != "true" or "false" have a chain form` };
  }
  if (attr in NUMBER_ATTRS) {
    // XPath compares the number the text holds.
    if (interpolation) return { text: `${NUMBER_ATTRS[attr]} ${nsOp} ${literal}` };
    if (NUMBER_LITERAL.test(literal.trim())) return { text: `${NUMBER_ATTRS[attr]} ${nsOp} ${literal.trim()}` };
    return { reason: `@${attr} is a number, compared with ${raw}` };
  }
  if (TEXT_ATTRS.has(attr)) {
    if (op === '=' || op === '!=') {
      if (!quoted) return { reason: `@${attr} compared with the number ${raw}` };
      // An XPath `!=` needs the attribute to exist; NSPredicate's would also match nil.
      return { text: op === '=' ? `${attr} == ${raw}` : `${attr} != nil AND ${attr} != ${raw}` };
    }
    // XPath reads the text as a number (NaN when it is not one); doubleValue reads
    // non-numeric text as 0. They agree exactly when 0 fails the test.
    const n = Number(literal);
    if (NUMBER_LITERAL.test(literal.trim()) && ((op === '>' && n >= 0) || (op === '>=' && n > 0))) {
      return { text: `${attr}.doubleValue ${op} ${literal.trim()}` };
    }
    return { reason: `numeric comparison @${attr} ${op} ${raw} has no exact chain form` };
  }
  return { reason: `@${attr} is not a WDA attribute` };
}

// NSPredicate decodes backslash escapes inside string literals, so a backslash
// or control character in a value must be escaped. Escapes that belong to the
// host language literal (\' \" \` \$ \uXXXX \xXX — raw source text from the
// scanner) are left for that language to decode. A string delimited by escaped
// quotes (\"…\", JSON / Java source) is left as it is.
function escapeStringLiterals(text) {
  let out = '';
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (!quote) {
      if (c === '\\' && (text[i + 1] === '"' || text[i + 1] === "'")) {
        const close = text.indexOf('\\' + text[i + 1], i + 2);
        const end = close === -1 ? text.length : close + 2;
        out += text.slice(i, end);
        i = end - 1;
      } else {
        if (c === '"' || c === "'") quote = c;
        out += c;
      }
    } else if (c === quote) {
      quote = null;
      out += c;
    } else if (c === '\\') {
      const host = /^(?:['"`$]|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2})/.exec(text.slice(i + 1));
      if (host) { out += c + host[0]; i += host[0].length; }
      else out += '\\\\';
    } else if (c === '`') out += '``';
    else if (c === '\n') out += '\\n';
    else if (c === '\r') out += '\\r';
    else if (c === '\t') out += '\\t';
    else out += c;
  }
  return out;
}

// One XPath predicate body → { text } NSPredicate (no surrounding brackets), or
// { reason } when it has no faithful chain form.
function rewritePredicate(inner) {
  let reason = null;
  // only 'and' / 'or' appear in raw XPath; NSPredicate keywords handled by validator
  inner = upperCaseLogicOps(inner, ['and', 'or']);
  inner = inner.replace(XPATH_COMPARISON, (m, attr, op, raw) => {
    const r = compareAttribute(attr, op, raw);
    reason = reason || r.reason;
    return r.text || m;
  });
  // What is left of `@attr`: a function argument or an existence test (`[@name]`).
  inner = outsideQuotes(inner, t => t.replace(/@([a-zA-Z0-9_-]+)/g, (m, attr, offset) => {
    if (!TEXT_ATTRS.has(attr) && !BOOLEAN_ATTRS.includes(attr)) {
      reason = reason || (attr in NUMBER_ATTRS ? `@${attr} is a number, used as text` : `@${attr} is not a WDA attribute`);
      return m;
    }
    const before = t.slice(0, offset);
    const after = t.slice(offset + m.length);
    // `not(@name)` is a test of the attribute, `contains(@name, …)` passes it on.
    const isArgument = (/[\w-]\s*\(\s*$/.test(before) && !/\bnot\s*\(\s*$/i.test(before)) || /^\s*,/.test(after);
    if (isArgument) return m;
    if (TEXT_ATTRS.has(attr)) return `${attr} != nil`;
    reason = reason || `@${attr} existence test`;
    return m;
  }));
  if (reason) return { reason };
  inner = outsideQuotes(inner, t => t.replace(/\bnot\s*\(/gi, 'NOT ('));
  inner = rewriteStringFunctions(inner);
  return { text: escapeStringLiterals(inner) };
}

// `[.//Type[cond]]` — "has a descendant Type matching cond" — is WDA's descendant
// predicate `[$type == "Type" AND cond$]`. Returns { text } with its body, or null for
// any other path: `./X` and `X` test children only, nested paths and indexes have no `$…$` form.
// XCTest's containingPredicate also tests the element itself, while `.//` never
// does, so `stepType` and the inner type must both be named and differ.
function descendantPredicate(inner, stepType) {
  const m = inner.match(/^\s*\.\/\/(\*|XCUIElementType[A-Za-z]+)\s*(\[[\s\S]*\])?\s*$/);
  if (!m) return null;
  const innerType = m[1] === 'XCUIElementTypeAny' ? '*' : m[1];
  if (stepType === '*' || innerType === '*' || innerType === stepType) {
    return { reason: `descendant predicate would also match the element itself: [${inner}]` };
  }
  const conds = [`type == "${innerType}"`];
  if (m[2]) {
    const preds = splitPredicates(m[2]);
    if (!preds || preds.length !== 1) return null;
    const cond = preds[0].slice(1, -1);
    if (/^\s*-?\d+\s*$/.test(cond) || /[[/$]|::/.test(maskQuotedValues(cond))) return null;
    const rewritten = rewritePredicate(cond);
    if (rewritten.reason) return null;
    conds.push(hasTopLevelOr(rewritten.text) ? `(${rewritten.text})` : rewritten.text);
  }
  return { text: conds.join(' AND ') };
}

// `self::Type` in a predicate of a `*` step tests the element's own type: `type == "Type"`.
// A named step has no use for it, and any other `::` is an axis with no chain form.
// Under not() it would hold for the Application root, which `//*` returns and `**/*` never does.
function rewriteSelfTests(inner, stepType) {
  if (!/(?<![\w-])self::/.test(maskQuotedValues(inner))) return { text: inner };
  if (/\bnot\s*\(/i.test(maskQuotedValues(inner))) return { reason: `self:: test under not(): [${inner}]` };
  let reason = null;
  const text = outsideQuotes(inner, t => t.replace(/(?<![\w-])self::([A-Za-z0-9_]+)/g, (m, name) => {
    if (stepType !== '*') reason = reason || `self:: test on a ${stepType} step`;
    else if (name === 'XCUIElementTypeAny' || !IOS_ELEMENT_TYPES.has(name)) reason = reason || `self:: test of a non-iOS type: ${name}`;
    return `type == "${name}"`;
  }));
  if (reason) return { reason };
  if (maskQuotedValues(text).includes('::')) return { reason: `axis in predicate: [${inner}]` };
  return { text };
}

// Join conditions with AND. AND binds tighter than OR, so each OR group keeps its own parentheses.
function joinAnd(conds) {
  return conds.length === 1 ? conds[0] : conds.map(p => (hasTopLevelOr(p) ? `(${p})` : p)).join(' AND ');
}

// A step's `[...]` groups → { logic, descendant, index } (NSPredicate texts, `$…$`
// bodies, positions), or { reason } when one of them has no chain form.
function stepConditions(predicateRaw, type, part) {
  const logic = [];
  const descendant = [];
  const index = [];
  if (!predicateRaw) return { logic, descendant, index };
  const predicates = splitPredicates(predicateRaw);
  if (!predicates) return { reason: `unrecognised step: ${part}` };
  for (const pred of predicates) {
    const inner = pred.slice(1, -1);
    // XPath filters after a per-parent index (`Cell[2][@name="a"]`: the second
    // Cell, if it is named "a"); a chain index always comes last.
    const isIndex = /^\d+$/.test(inner);
    if (!isIndex && index.length) return { reason: 'index before a filter' };
    if (isIndex) {
      index.push(inner);
    } else if (/[[/]/.test(maskQuotedValues(inner))) {
      // A path inside the predicate tests other elements, never the step itself.
      const d = descendantPredicate(inner, type);
      if (!d || d.reason) return { reason: d ? d.reason : `path in predicate: [${inner}]` };
      descendant.push(d.text);
    } else {
      const self = rewriteSelfTests(inner, type);
      if (self.reason) return self;
      const rewritten = rewritePredicate(self.text);
      if (rewritten.reason) return rewritten;
      logic.push(rewritten.text);
    }
  }
  return { logic, descendant, index };
}

// `//A[p] | //B[q] | …` → one `**/…` step whose predicate ORs the operands. Only
// single-step `//` operands with plain conditions: the union is then the set of
// elements one scan matches, in the same order as `//*[p or q]`. Different types
// share a `*` step and each operand names its own (`type == "A" AND p`); a `*`
// operand adds no type test. Indexes, path predicates and longer paths select
// per operand and have no single-predicate form.
function convertUnion(xpath) {
  const branches = [];
  for (const operand of splitTopLevelUnion(xpath)) {
    const parts = tokenizeXpath(operand.trim());
    const m = parts.length === 2 && parts[0] === '//' && parts[1].match(/^([a-zA-Z0-9_*]+)([\s\S]*)$/);
    if (!m) return { reason: `union operand is not a single //Type[...] step: ${operand.trim()}` };
    const type = m[1] === 'XCUIElementTypeAny' ? '*' : m[1];
    if (type !== '*' && !IOS_ELEMENT_TYPES.has(type)) return { reason: `non-iOS element type: ${type}` };
    const conds = stepConditions(m[2], type, parts[1]);
    if (conds.reason) return conds;
    if (conds.descendant.length || conds.index.length) return { reason: `union operand with an index or a path predicate: ${operand.trim()}` };
    branches.push({ type, logic: conds.logic });
  }
  const step = new Set(branches.map(b => b.type)).size === 1 ? branches[0].type : '*';
  const terms = branches.map(b => {
    const conds = step === '*' && b.type !== '*' ? [`type == "${b.type}"`, ...b.logic] : b.logic;
    return conds.length ? joinAnd(conds) : '';
  });
  // An operand without conditions matches every element of the step.
  if (terms.includes('')) return { chain: `**/${step}` };
  const grouped = terms.map(t => (hasTopLevelOp(t, 'AND') || hasTopLevelOp(t, 'OR') ? `(${t})` : t));
  return { chain: `**/${step}[\`${terms.length === 1 ? terms[0] : grouped.join(' OR ')}\`]` };
}

// `(//X)[n]` counts the matches in document order; WDA counts a chain's matches in
// XCTest query order, which is breadth-first. No chain counts in document order,
// so grouped positions still convert, with this warning (RC-D1, seen on device).
const GROUPED_POSITION_WARNING = 'grouped position: WDA counts class chain matches breadth-first, XPath in document order, so the element can differ when matches sit at different depths';

// `opts.optimize` (default false) routes the candidate through the optimizer
// pass instead of plain validation.
function convertXpathToClassChain(xpath, opts = {}) {
  // Handle grouped XPath: (//inner)[n] or (//inner)
  // Strip the outer parens, convert the inner expression, then re-attach the
  // outer index. Two special cases apply when the inner result already ends
  // with a numeric index (which means appending the outer index directly would
  // produce non-standard [m][n] on the same Class Chain segment):
  //
  // • Outer is [1]: driver.findElement() returns the first match anyway, so
  //   the outer [1] is implicit. Drop it and return the inner chain as-is.
  //
  // • Outer is [n>1] or [${expr}]: restructure by moving the outer index to
  //   the PARENT element in the chain, keeping the last path step unchanged.
  //   e.g. (//*[name CONTAINS "X"]/child::*[2])[${t}]
  //      → **/*[`name CONTAINS "X"`][${t}]/*[2]
  //   Valid for flat list/table patterns where each parent has exactly one
  //   child at the given position (the common case for repeating table rows).
  //   Falls back to SKIPPED_UNSUPPORTED_LOGIC when the parent chain reduces
  //   to just ** (i.e. there is no named element to attach the index to).
  //
  // Any outer position is flagged with GROUPED_POSITION_WARNING (RC-D1).
  const grouped = unwrapGrouped(xpath);
  if (grouped !== null) {
    // A position over a union counts the matches of all operands; left as a skip.
    if (hasTopLevelUnion(grouped.inner)) return { locator: xpath, status: STATUS.SKIPPED_UNSUPPORTED_LOGIC, reason: 'grouped union' };
    const innerResult = convertXpathToClassChain(grouped.inner, opts);
    if (innerResult.status !== STATUS.SUCCESS) {
      return { locator: xpath, status: innerResult.status };
    }
    if (grouped.index && /\[\d+\]$/.test(innerResult.locator)) {
      if (grouped.index === '[1]') {
        // Outer [1] is what findElement() does by default — drop it.
        return { locator: innerResult.locator, status: STATUS.SUCCESS, warning: GROUPED_POSITION_WARNING };
      }
      // Move outer index to the parent element in the chain.
      const PREFIX = '-ios class chain:';
      const chainBody = innerResult.locator.slice(PREFIX.length);
      const lastSlash = lastStructuralSlash(chainBody);
      const parentChain = chainBody.slice(0, lastSlash);
      // The index needs a concrete parent step; `**` (alone or as the last step) is not one.
      if (lastSlash > 0 && !/(?:^|\/)\*\*$/.test(parentChain)) {
        const lastSegment = chainBody.slice(lastSlash); // includes the leading /
        return {
          locator: `${PREFIX}${parentChain}${grouped.index}${lastSegment}`,
          status: STATUS.SUCCESS,
          warning: GROUPED_POSITION_WARNING,
        };
      }
      return { locator: xpath, status: STATUS.SKIPPED_UNSUPPORTED_LOGIC };
    }
    if (!grouped.index) return { locator: innerResult.locator, status: STATUS.SUCCESS };
    return { locator: innerResult.locator + grouped.index, status: STATUS.SUCCESS, warning: GROUPED_POSITION_WARNING };
  }

  if (!xpath.startsWith('/') && !xpath.startsWith('//')) return { locator: xpath, status: STATUS.SKIPPED_NOT_XPATH };

  // Structural gates below run against a masked copy so that axis-like or
  // `android.`-like text *inside* a quoted attribute value can't trigger a
  // false skip (e.g. [@label="parent::root info"], [@name="my.android.helper"]).
  const masked = maskQuotedValues(xpath);

  if (masked.includes('android.')) return { locator: xpath, status: STATUS.SKIPPED_ANDROID };

  // A backtick means this is already (or partially) a Class Chain predicate, not a
  // clean XPath. Converting it would double-wrap the backticks — leave it alone.
  // A backtick inside a quoted value ("a`b") is just text; `masked` keeps only the delimiters.
  if (masked.includes('`')) return { locator: xpath, status: STATUS.SKIPPED_VALIDATION_FAILED };

  // Skip complex functions that Class Chains don't support well.
  // Whitespace-tolerant so `count (` is caught the same as `count(`. (`not(` has a chain form: NOT (…).)
  if (/\b(?:count|last|position)\s*\(/i.test(masked))
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
  // an axis a Class Chain cannot express (parent::, attribute::, namespace::,
  // *-or-self::, …) — skip rather than emit a broken chain. Masked so a literal
  // '::' inside a value (e.g. "parent::root info") isn't mistaken for an axis.
  // `self::Name` is left to the predicate rewrite (rewriteSelfTests), which only
  // accepts it as a type test inside a `*` step's predicate.
  if (maskQuotedValues(normalizedXpath).replace(/(?<![\w-])self::[A-Za-z0-9_]+/g, '').includes('::')) {
    return { locator: xpath, status: STATUS.SKIPPED_UNSUPPORTED_LOGIC };
  }

  if (hasTopLevelUnion(normalizedXpath)) {
    const union = convertUnion(normalizedXpath);
    if (union.reason) return { locator: xpath, status: STATUS.SKIPPED_UNSUPPORTED_LOGIC, reason: union.reason };
    return validateChain(`-ios class chain:${union.chain}`, xpath, opts);
  }

  // An absolute path starts at the document; WDA's page source root is always the
  // Application element, and a Class Chain is evaluated from that element. So the
  // root step is dropped: /XCUIElementTypeApplication/X → X, /XCUIElementTypeApplication//X → **/X.
  // A leading '/' would make WDA reject the chain.
  if (normalizedXpath.startsWith('/') && !normalizedXpath.startsWith('//')) {
    const root = normalizedXpath.match(/^\/(?:XCUIElementTypeApplication|\*)(?:\[1\])?(?=\/|$)/);
    if (!root) {
      return { locator: xpath, status: STATUS.SKIPPED_UNSUPPORTED_LOGIC, reason: 'absolute path must start at /XCUIElementTypeApplication (the page source root)' };
    }
    const rest = normalizedXpath.slice(root[0].length);
    if (rest === '') {
      return { locator: xpath, status: STATUS.SKIPPED_UNSUPPORTED_LOGIC, reason: 'selects the application element itself' };
    }
    normalizedXpath = rest.startsWith('//') ? rest : rest.slice(1);
  }

  let classChain = '';
  const parts = dropSelfSteps(tokenizeXpath(normalizedXpath).filter(p => p.length > 0));
  if (!parts) return { locator: xpath, status: STATUS.SKIPPED_UNSUPPORTED_LOGIC, reason: 'parent step (..) or a trailing //.' };

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === '//') {
      // After a step, `//` needs its own separator: `A/**/B`. WDA rejects `A**/B`.
      classChain += classChain === '' ? '**/' : '/**/';
      continue;
    } else if (part === '/') {
      classChain += '/';
      continue;
    }

    // [\s\S] (not '.') so element parts whose predicate value contains a
    // newline — e.g. an address label "19, Owen Close\nFareham" — aren't truncated.
    const elementMatch = part.match(/^([a-zA-Z0-9_*]+)([\s\S]*)$/);
    if (!elementMatch) {
      return { locator: xpath, status: STATUS.SKIPPED_UNSUPPORTED_LOGIC, reason: `unrecognised step: ${part}` };
    }

    // WDA rewrites XCUIElementTypeAny to `*` before running an XPath, so it is the wildcard in both.
    const type = elementMatch[1] === 'XCUIElementTypeAny' ? '*' : elementMatch[1];
    const predicateRaw = elementMatch[2];

    // Only names WDA knows: it reads any other XCUIElementType* step as Other,
    // while the XPath matches nothing.
    if (type !== '*' && !IOS_ELEMENT_TYPES.has(type)) {
      return { locator: xpath, status: STATUS.SKIPPED_UNSUPPORTED_LOGIC, reason: `non-iOS element type: ${type}` };
    }

    classChain += type;

    const conds = stepConditions(predicateRaw, type, part);
    if (conds.reason) return { locator: xpath, status: STATUS.SKIPPED_UNSUPPORTED_LOGIC, reason: conds.reason };
    // All logic predicates merge into one block with AND, then descendant
    // predicates, then positional indexes (WDA requires the index last).
    // e.g. //foo[@a='1'][@b='2'][2]  ->  foo[`a == "1" AND b == "2"`][2]
    if (conds.logic.length) classChain += `[\`${joinAnd(conds.logic)}\`]`;
    conds.descendant.forEach(d => {
      classChain += `[$${d}$]`;
    });
    conds.index.forEach(idx => {
      classChain += `[${idx}]`;
    });
  }

  return validateChain(`-ios class chain:${classChain}`, xpath, opts);
}

function validateChain(candidate, xpath, opts) {
  const validation = opts.optimize
    ? optimizeClassChain(candidate)
    : validateAndFixClassChain(candidate);

  if (!validation.valid) {
    return { locator: xpath, status: STATUS.SKIPPED_VALIDATION_FAILED };
  }

  return { locator: validation.fixedLocator, status: STATUS.SUCCESS };
}

module.exports = { tokenizeXpath, convertXpathToClassChain };
