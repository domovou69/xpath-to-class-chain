const STATUS = require('./status');
const { BOOLEAN_ATTRS, hasTopLevelOp, hasTopLevelOr, outsideQuotes, rewriteStringFunctions, upperCaseLogicOps } = require('./predicates');
const { IOS_ELEMENT_TYPES } = require('./elementTypes');
const { walk, topLevelIndexes, OUTSIDE, INSIDE } = require('./lexer');
const { checkChain, collapseWildcardTypes } = require('./validator');
const { optimizeClassChain } = require('./optimizer');

// Bracket/quote-aware splitter. Unlike a plain `.split('/')`, this never cuts on
// a slash that lives inside a predicate string (e.g. [@name="a/b"]) or a nested
// predicate path. Returns the token shape the converter expects: separators
// ('/' and '//') interleaved with node parts.
function tokenizeXpath(xpath) {
  const tokens = [];
  const slashes = topLevelIndexes(xpath, '/');
  let last = 0;
  for (let s = 0; s < slashes.length;) {
    const at = slashes[s];
    if (at > last) tokens.push(xpath.slice(last, at));
    if (slashes[s + 1] === at + 1) {
      tokens.push('//');
      last = at + 2;
      s += 2;
    } else {
      tokens.push('/');
      last = at + 1;
      s++;
    }
  }
  if (last < xpath.length) tokens.push(xpath.slice(last));
  return tokens;
}

// True when a top-level `|` (XPath union) sits OUTSIDE any quoted string and
// outside `[...]` predicate brackets, so a literal '|' inside a value like
// [@label="a|b"] is not mistaken for a union operator. Whitespace around the '|'
// is irrelevant.
function hasTopLevelUnion(xpath) {
  return topLevelIndexes(xpath, '|').length > 0;
}

// The operands of a top-level union, split the same way as hasTopLevelUnion:
// a '|' inside a quoted value or a predicate is part of its operand.
function splitTopLevelUnion(xpath) {
  const operands = [];
  let start = 0;
  for (const at of topLevelIndexes(xpath, '|')) {
    operands.push(xpath.slice(start, at));
    start = at + 1;
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
// skip.
function maskQuotedValues(xpath) {
  const chars = xpath.split('');
  walk(xpath, (c, i, depth, kind) => {
    if (kind === INSIDE) chars[i] = ' ';
  });
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
// '[2]', '[${option + 1}]'), the chain form of `[last()]` / `[last()-n]` (with
// `fromEnd`), or null when there is no outer index.
// Returns null when the input is not a grouped pattern or has an unrecognised
// trailing suffix (e.g. `(//...)[position()<=2]` or multiple outer brackets).
//
// Quote-aware walk so a ')' inside a value like [@label="a)b"] doesn't close
// the group prematurely. Template-expression indexes ([${...}]) are detected
// by the `startsWith`/`endsWith` pair — the content between ${ and } is left
// opaque; the JS runtime evaluates it when the locator lives in a template
// literal, so no static analysis is needed.
function unwrapGrouped(xpath) {
  if (!xpath.startsWith('(')) return null;

  // This runs before the backtick gate in convertXpath, which has to see the whole group: a
  // lone backtick must not swallow the closing paren, so only " and ' are quotes here.
  let depth = 0;
  let closeIdx = -1;
  walk(xpath, (c, i, _depth, kind) => {
    if (kind !== OUTSIDE) return false;
    if (c === '(') depth++;
    else if (c === ')' && --depth === 0) { closeIdx = i; return true; }
    return false;
  }, '"\'');
  if (closeIdx === -1) return null;

  const inner = xpath.slice(1, closeIdx);
  const rest  = xpath.slice(closeIdx + 1);

  if (rest === '') return { inner, index: null };
  if (/^\[\d+\]$/.test(rest)) return { inner, index: rest };
  // Template-literal expression index: [${option + 1}], [${items.length}], etc.
  if (rest.startsWith('[${') && rest.endsWith('}]')) return { inner, index: rest };
  // [last()] / [last()-n] → [-1] / [-(n+1)]: a chain counts negative positions from
  // the end of the same match list (RC-D1 applies, as for [n]; confirmed on device, C1).
  const last = /^\[\s*last\(\s*\)\s*(?:-\s*([1-9]\d*)\s*)?\]$/.exec(rest);
  if (last) return { inner, index: `[-${last[1] ? Number(last[1]) + 1 : 1}]`, fromEnd: true };

  return null; // e.g. [position()<=2], [last()+1], multiple trailing brackets
}

// Top-level `[...]` groups of a step's predicate text, nesting- and quote-aware:
// `[.//B[@n="x"]][2]` → ['[.//B[@n="x"]]', '[2]']. PREDICATE_REGEX cannot nest, so it
// would hand back the inner `[@n="x"]` as if it belonged to the step. Returns null
// when the text is not just a run of bracket groups.
function splitPredicates(text) {
  const groups = [];
  let start = -1;
  let broken = false;
  const left = walk(text, (c, i, depth, kind) => {
    if (kind !== OUTSIDE) return false;
    if (c === '[') {
      if (depth === 0) start = i;
    } else if (c === ']') {
      if (depth === 0) broken = true; // a ] with no [ before it
      else if (depth === 1) groups.push(text.slice(start, i + 1));
    } else if (depth === 0 && !/\s/.test(c)) {
      broken = true;
    }
    return broken;
  });
  return !broken && left === 0 && groups.length ? groups : null;
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
// Booleans WDA writes on every element of the page source (seen on device).
const WRITTEN_BOOLEANS = new Set(['enabled', 'visible', 'accessible']);
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
    // XPath compares true() / false() with the attribute node-set, which is true
    // whenever the attribute exists, whatever its value: see booleanExistenceTest.
    if (/\(\)$/.test(raw)) return { reason: `@${attr}${op}${raw} tests that the attribute exists, not its value: only a whole [@${attr}=true()] predicate has a chain form` };
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
    // XPath reads the text as a number, NaN unless the whole text is one; doubleValue
    // reads a numeric prefix ("10abc", "50%" → 10, 50) and other text as 0 (RC-D3).
    return { reason: `numeric comparison @${attr} ${op} ${raw} has no exact chain form (doubleValue reads "10abc" as 10, XPath as NaN)` };
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

// `concat("a", 'b', …)` of plain string literals → the one literal it evaluates to,
// in double quotes unless the text holds a `"`. A call it cannot fold is left as it
// is, for the validator to reject: fewer than two arguments, any argument that is
// not a plain literal (attribute, number, function, path, \"…\" from JSON / Java
// source), a backslash (a host-language escape), text holding both quote kinds, or
// a `${…}` that only exists once the arguments are joined.
function foldConcatLiterals(inner) {
  const masked = maskQuotedValues(inner);
  let out = '';
  let last = 0;
  const call = /(?<![\w@$.-])concat\s*\(/g;
  let m;
  while ((m = call.exec(masked))) {
    const args = [];
    let i = m.index + m[0].length;
    let closed = false;
    for (;;) {
      while (/\s/.test(inner[i] || '')) i++;
      const q = inner[i];
      if (q !== '"' && q !== "'") break;
      const end = inner.indexOf(q, i + 1);
      if (end === -1) break;
      args.push(inner.slice(i + 1, end));
      i = end + 1;
      while (/\s/.test(inner[i] || '')) i++;
      if (inner[i] === ',') { i++; continue; }
      if (inner[i] === ')') closed = true;
      break;
    }
    if (!closed || args.length < 2) continue;
    const text = args.join('');
    const interpolations = s => (s.match(/\$\{/g) || []).length;
    const openInterpolation = s => /\$\{[^}]*$/.test(s);
    if (text.includes('\\')) continue;
    if (text.includes('"') && text.includes("'")) continue;
    if (args.some(openInterpolation) || interpolations(text) !== args.reduce((n, a) => n + interpolations(a), 0)) continue;
    const quote = text.includes('"') ? "'" : '"';
    out += inner.slice(last, m.index) + quote + text + quote;
    last = i + 1;
    call.lastIndex = last;
  }
  return out + inner.slice(last);
}

// The arguments of the call whose `(` is at `open`: { args (trimmed source text), end
// (index after `)`) }, or null when the call is never closed.
function callArguments(text, open) {
  const args = [];
  let depth = 0;
  let quote = null;
  let start = open + 1;
  for (let i = open + 1; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (c === '\\' && (text[i + 1] === '"' || text[i + 1] === "'")) {
      // \"…\" (JSON / Java source) closes at the next escaped quote
      const close = text.indexOf('\\' + text[i + 1], i + 2);
      if (close === -1) return null;
      i = close + 1;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '(') depth++;
    else if (c === ')' && depth-- === 0) {
      args.push(text.slice(start, i).trim());
      return { args, end: i + 1 };
    } else if (c === ',' && depth === 0) {
      args.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  return null;
}

// Regex metacharacters of XPath (and ICU) patterns; a pattern without them is a substring.
const REGEX_META = /[\\^$.|?*+()[\]{}]/;
const PLAIN_LITERAL = /^(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')$/;
const ASCII = /^[\x20-\x7e]*$/;
const XPATH_STRING_FUNCTIONS = /(?<![\w@$.:-])(contains|matches|lower-case|upper-case|translate|normalize-space|string-length)\s*\(/g;
const UPPER_ASCII = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Why `@attr` cannot be a text argument, or null when it can.
function textArgumentProblem(arg) {
  const m = arg.match(/^@([a-zA-Z0-9_-]+)$/);
  if (!m) return `argument ${arg} is not a single @attribute`;
  if (TEXT_ATTRS.has(m[1])) return null;
  if (BOOLEAN_ATTRS.includes(m[1])) return `@${m[1]} is a boolean, used as text`;
  return m[1] in NUMBER_ATTRS ? `@${m[1]} is a number, used as text` : `@${m[1]} is not a WDA attribute`;
}

// Why a literal cannot go into a chain as it is, or null. A `${…}` is runtime text;
// a backslash before a quote, backtick, `$`, `u` or `x` is left for the host
// language by escapeStringLiterals, so its meaning in the pattern is unknown. An
// empty literal is what XPath reads for a missing attribute, and a chain never matches nil.
function literalProblem(raw, what) {
  if (!PLAIN_LITERAL.test(raw)) return `${what} ${raw} is not a plain string literal`;
  const text = raw.slice(1, -1);
  if (text === '') return `empty ${what}: XPath reads a missing attribute as "", a chain as nil`;
  if (/\$\{/.test(text)) return `${what} built at runtime: ${raw}`;
  if (/\\(?:['"`$]|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2})/.test(text)) return `${what} ${raw} holds a host-language escape`;
  return null;
}

// `matches(@attr, "p"[, "i"])` → `CONTAINS` / `CONTAINS[c]` for a plain pattern
// (ASCII with "i"), otherwise `MATCHES "(?s:.*)(?-s:p)(?s:.*)"` (C1, device): WDA's
// matches() is an ICU search with `.` not matching \n and `$` also before a final
// \n, while MATCHES matches the whole text with `.` dot-all.
function matchesCall(args) {
  if (args.length < 2 || args.length > 3) return { reason: `matches() with ${args.length} arguments` };
  const problem = textArgumentProblem(args[0]) || literalProblem(args[1], 'matches() pattern');
  if (problem) return { reason: problem };
  let flags = '';
  if (args.length === 3) {
    if (!/^(?:"[a-z]*"|'[a-z]*')$/.test(args[2])) return { reason: `matches() flags ${args[2]} are not a plain literal` };
    flags = args[2].slice(1, -1);
    // WDA accepts m, s and x but applies only i (FBXPathExtensions.m); not checked on the device.
    if (!/^i?$/.test(flags)) return { reason: `matches() flags "${flags}": only "i" has a checked chain form` };
  }
  const attr = args[0].slice(1);
  const quote = args[1][0];
  const pattern = args[1].slice(1, -1);
  // MATCHES reads a literal space as any space, a no-break space (U+00A0) included (C1, device).
  if (/\s/.test(pattern)) return { reason: 'matches() pattern with a literal space: MATCHES also matches a no-break space (U+00A0)' };
  if (!REGEX_META.test(pattern) && (!flags || ASCII.test(pattern))) {
    return { text: `${attr} CONTAINS${flags ? '[c]' : ''} ${args[1]}` };
  }
  let re;
  try {
    re = new RegExp(pattern, flags);
  } catch (e) {
    return { reason: `matches() pattern ${args[1]} is not a valid regular expression` };
  }
  // XPath reads a missing attribute as "", which such a pattern matches; MATCHES on nil never does.
  if (re.test('')) return { reason: `matches() pattern ${args[1]} matches the empty string, so the XPath also selects elements without @${attr}` };
  return { text: `${attr} MATCHES ${quote}${flags ? '(?i)' : ''}(?s:.*)(?-s:${pattern})(?s:.*)${quote}` };
}

// matches(), lower-case(), upper-case() (WDA registers them), translate(),
// normalize-space() and string-length() in a predicate body → their chain form
// (C1, device), or { reason }. Only these forms convert:
//   matches(@a, "p"[, "i"])                    → see matchesCall
//   lower-case(@a) = "v"                        → a ==[c] "v"
//   contains(upper-case(@a), "V")               → a CONTAINS[c] "V"
//   contains(translate(@a, "A…Z", "a…z"), "v")  → a CONTAINS[c] "v"
// with an ASCII literal: `[c]` against Unicode case mapping was not checked.
// contains(@a, …) is left for rewriteStringFunctions.
function rewriteXpathFunctions(inner) {
  const masked = maskQuotedValues(inner);
  const caseLiteral = (raw, fn, upper) => {
    const problem = literalProblem(raw, `${fn}() literal`);
    if (problem) return problem;
    const text = raw.slice(1, -1);
    if (!ASCII.test(text)) return `${fn}() with a non-ASCII literal ${raw}: [c] against Unicode case mapping is not checked`;
    if (text !== (upper ? text.toUpperCase() : text.toLowerCase())) return `${fn}() never gives ${raw}`;
    return null;
  };
  // contains(x, "") and starts-with(x, "") are true for every element in XPath (libxml2),
  // even without the attribute, while CONTAINS "" / BEGINSWITH "" never match in
  // NSPredicate (Phase 7, device). ends-with() is WDA's own extension and is false for
  // "" too, so ENDSWITH "" is exact.
  const always = /(?<![\w@$.:-])(contains|starts-with)\s*\(/g;
  let a;
  while ((a = always.exec(masked))) {
    const parsed = callArguments(inner, a.index + a[0].length - 1);
    if (parsed && parsed.args.length === 2 && /^(?:""|''|\\"\\"|\\'\\')$/.test(parsed.args[1].trim())) {
      return { reason: `${a[1]}(…, "") is always true in XPath, but ${a[1] === 'contains' ? 'CONTAINS' : 'BEGINSWITH'} "" never matches` };
    }
  }
  let out = '';
  let last = 0;
  const call = new RegExp(XPATH_STRING_FUNCTIONS);
  let m;
  while ((m = call.exec(masked))) {
    const name = m[1];
    const parsed = callArguments(inner, m.index + m[0].length - 1);
    if (!parsed) {
      if (name === 'contains') continue;
      return { reason: `${name}() is never closed` };
    }
    const { args } = parsed;
    let end = parsed.end;
    let text;
    if (name === 'contains') {
      const fn = args.length === 2 && args[0].match(/^(upper-case|lower-case|translate)\s*\(/);
      if (!fn) continue;
      const nested = callArguments(args[0], fn[0].length - 1);
      if (!nested || nested.end !== args[0].length) return { reason: `contains() over ${args[0]}` };
      const toLower = fn[1] === 'translate' && nested.args.length === 3
        && PLAIN_LITERAL.test(nested.args[1]) && nested.args[1].slice(1, -1) === UPPER_ASCII
        && PLAIN_LITERAL.test(nested.args[2]) && nested.args[2].slice(1, -1) === UPPER_ASCII.toLowerCase();
      if (!(fn[1] === 'upper-case' && nested.args.length === 1) && !toLower) {
        return { reason: `contains(${fn[1]}(…), …) in this form is not checked on the device` };
      }
      const problem = textArgumentProblem(nested.args[0]) || caseLiteral(args[1], fn[1], fn[1] === 'upper-case');
      if (problem) return { reason: problem };
      text = `${nested.args[0].slice(1)} CONTAINS[c] ${args[1]}`;
    } else if (name === 'matches') {
      const r = matchesCall(args);
      if (r.reason) return r;
      text = r.text;
    } else if (name === 'lower-case') {
      const eq = inner.slice(end).match(/^\s*=\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/);
      if (!eq || args.length !== 1) return { reason: 'lower-case() other than lower-case(@attr) = "v" is not checked on the device' };
      const problem = textArgumentProblem(args[0]) || caseLiteral(eq[1], 'lower-case', false);
      if (problem) return { reason: problem };
      text = `${args[0].slice(1)} ==[c] ${eq[1]}`;
      end += eq[0].length;
    } else if (name === 'normalize-space') {
      return { reason: 'normalize-space() has no exact chain form: MATCHES treats a no-break space (U+00A0) as a space (C1, device)' };
    } else if (name === 'string-length') {
      return { reason: 'string-length() has no exact chain form: .length counts UTF-16 units, string-length() code points (C1, device)' };
    } else {
      return { reason: `${name}() outside contains(${name}(@attr), "v") is not checked on the device` };
    }
    out += inner.slice(last, m.index) + text;
    last = end;
    call.lastIndex = end;
  }
  return { text: out + inner.slice(last) };
}

// One XPath predicate body → { text } NSPredicate (no surrounding brackets), or
// { reason } when it has no faithful chain form.
function rewritePredicate(inner) {
  let reason = null;
  inner = foldConcatLiterals(inner);
  const functions = rewriteXpathFunctions(inner);
  if (functions.reason) return functions;
  inner = functions.text;
  // only 'and' / 'or' appear in raw XPath; NSPredicate keywords handled by validator
  inner = upperCaseLogicOps(inner, ['and', 'or']);
  // `@attr = v` that starts inside a quoted value is data: contains(@label, "a @name='y'").
  const masked = maskQuotedValues(inner);
  inner = inner.replace(XPATH_COMPARISON, (m, attr, op, raw, offset) => {
    if (masked[offset] !== '@') return m;
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
    // WDA's class chain parser ends the block at any `$`, even inside a string literal
    // (a `${…}` is replaced by the host language before WDA sees it).
    if (rewritten.text.replace(/\$\{[^}]*\}/g, '').includes('$')) return { reason: `$ inside a descendant predicate: [${inner}]` };
    conds.push(hasTopLevelOr(rewritten.text) ? `(${rewritten.text})` : rewritten.text);
  }
  return { text: conds.join(' AND ') };
}

// `//T1[cond]/ancestor::T2` selects every T2 that contains such a T1, which is
// `//T2[.//T1[cond]]` (R01). Returns { xpath } with that form for the descendant
// predicate, { reason } for any other use of `/ancestor::`, or null without one.
// Same RC-D2 rule as `.//`: both steps name a type and the types differ.
function ancestorStep(xpath) {
  const at = maskQuotedValues(xpath).indexOf('/ancestor::');
  if (at < 0) return null;
  const parts = tokenizeXpath(xpath.slice(0, at));
  const from = parts.length === 2 && parts[0] === '//' && parts[1].match(/^([a-zA-Z0-9_*]+)([\s\S]*)$/);
  if (!from) return { reason: `ancestor:: after anything but a single //Type step: ${xpath}` };
  const target = xpath.slice(at + '/ancestor::'.length);
  if (!/^[a-zA-Z0-9_*]+$/.test(target)) return { reason: `ancestor:: step with a predicate, an index or a further path: ${target}` };
  const t1 = from[1] === 'XCUIElementTypeAny' ? '*' : from[1];
  const t2 = target === 'XCUIElementTypeAny' ? '*' : target;
  if (t1 === '*' || t2 === '*' || t1 === t2) {
    return { reason: 'ancestor:: with a * or the same type on both steps: $…$ would also match the element itself (RC-D2)' };
  }
  if (t2 === 'XCUIElementTypeApplication') return { reason: 'ancestor::XCUIElementTypeApplication is the root, which **/ never returns' };
  for (const t of [t1, t2]) if (!IOS_ELEMENT_TYPES.has(t)) return { reason: `non-iOS element type: ${t}` };
  return { xpath: `//${t2}[.//${t1}${from[2]}]` };
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

// `[@attr=true()]` (or `!=false()`) compares the attribute node-set with a boolean:
// true whenever the attribute exists, even as "false". On a boolean WDA always
// writes it filters nothing → { drop: true }; `=false()` never matches → { reason }.
// Other attributes, or any other predicate → null (rewritePredicate decides).
function booleanExistenceTest(inner) {
  const m = inner.match(/^\s*@([a-zA-Z]+)\s*(!?=)\s*(true|false)\(\)\s*$/);
  if (!m || !BOOLEAN_ATTRS.includes(m[1])) return null;
  if (!WRITTEN_BOOLEANS.has(m[1])) return { reason: `@${m[1]} is not always in WDA's page source: [${inner}] has no chain form` };
  if ((m[2] === '=') === (m[3] === 'true')) return { drop: true };
  return { reason: `[${inner}] never matches: WDA always writes @${m[1]}` };
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
      const exists = booleanExistenceTest(inner);
      if (exists && exists.reason) return exists;
      if (exists) continue;
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
  const result = convertXpath(xpath, opts);
  // A raw line break left in the chain sits inside a value that RC4 could not
  // escape: source-escaped quotes (Java \"…\" wrapped onto the next line in
  // commented-out code, Phase 7). NSPredicate rejects it, so it is skipped.
  if (result.status === STATUS.SUCCESS && /[\r\n]/.test(result.locator)) {
    return { locator: xpath, status: STATUS.SKIPPED_UNSUPPORTED_LOGIC, reason: 'raw line break inside a value that cannot be escaped' };
  }
  return result;
}

function convertXpath(xpath, opts) {
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
  //
  // A trailing `/` is not a complete XPath: in source code it is the first
  // piece of a concatenation (Python "…/" "Next/…"), and a chain ending in `/`
  // does not parse in WDA (Phase 7, GitHub corpus).
  if (/\/\s*$/.test(xpath)) return { locator: xpath, status: STATUS.SKIPPED_UNSUPPORTED_LOGIC, reason: 'incomplete XPath: ends with / (a piece of a concatenated string?)' };
  const grouped = unwrapGrouped(xpath);
  if (grouped !== null) {
    // A position over a union counts the matches of all operands; left as a skip.
    if (hasTopLevelUnion(grouped.inner)) return { locator: xpath, status: STATUS.SKIPPED_UNSUPPORTED_LOGIC, reason: 'grouped union' };
    const innerResult = convertXpathToClassChain(grouped.inner, opts);
    if (innerResult.status !== STATUS.SUCCESS) {
      return { locator: xpath, status: innerResult.status, reason: innerResult.reason };
    }
    if (grouped.index && /\[\d+\]$/.test(innerResult.locator)) {
      // Moving a from-the-end position onto the parent is not tried; left as a skip.
      if (grouped.fromEnd) return { locator: xpath, status: STATUS.SKIPPED_UNSUPPORTED_LOGIC, reason: 'grouped last() over an inner index' };
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
      return { locator: xpath, status: STATUS.SKIPPED_UNSUPPORTED_LOGIC, reason: 'grouped position over an inner index: no named parent step to move it to' };
    }
    if (!grouped.index) return { locator: innerResult.locator, status: STATUS.SUCCESS };
    return { locator: innerResult.locator + grouped.index, status: STATUS.SUCCESS, warning: GROUPED_POSITION_WARNING };
  }

  // A leading `.//X` searches below the context node: the Application element for a
  // driver lookup, the element itself for an element lookup. A chain is evaluated from
  // that same node and `**/X` never matches it, so `.//X` is exactly `**/X` (`.//*`
  // included). Any other relative start (`./X`, `.`, `..`) is left alone, and so is a
  // union: slicing the `.` off `.//X | //Y` would leave its other operands unchanged.
  if (/^\.\/\/(?!\/|$)/.test(xpath) && !hasTopLevelUnion(xpath)) {
    // `ancestor::` climbs back up to the context node and above it, where `**/` never looks.
    if (maskQuotedValues(xpath).includes('/ancestor::')) {
      return { locator: xpath, status: STATUS.SKIPPED_UNSUPPORTED_LOGIC, reason: 'ancestor:: under a leading .// can select the context node or its ancestors' };
    }
    const result = convertXpathToClassChain(xpath.slice(1), opts);
    return result.status === STATUS.SUCCESS ? result : { ...result, locator: xpath };
  }

  if (!xpath.startsWith('/') && !xpath.startsWith('//')) {
    return { locator: xpath, status: STATUS.SKIPPED_NOT_XPATH, reason: 'not an absolute XPath: only /, // and a leading .// convert' };
  }

  // Structural gates below run against a masked copy so that axis-like or
  // `android.`-like text *inside* a quoted attribute value can't trigger a
  // false skip (e.g. [@label="parent::root info"], [@name="my.android.helper"]).
  const masked = maskQuotedValues(xpath);

  if (masked.includes('android.')) return { locator: xpath, status: STATUS.SKIPPED_ANDROID, reason: 'Android class name (android.*)' };

  // A backtick means this is already (or partially) a Class Chain predicate, not a
  // clean XPath. Converting it would double-wrap the backticks — leave it alone.
  // A backtick inside a quoted value ("a`b") is just text; `masked` keeps only the delimiters.
  if (masked.includes('`')) {
    return { locator: xpath, status: STATUS.SKIPPED_VALIDATION_FAILED, reason: 'backtick outside a quoted value: already part of a class chain predicate' };
  }

  // Skip complex functions that Class Chains don't support well.
  // Whitespace-tolerant so `count (` is caught the same as `count(`. (`not(` has a chain form: NOT (…).)
  const positional = masked.match(/\b(count|last|position)\s*\(/i);
  if (positional) {
    return { locator: xpath, status: STATUS.SKIPPED_UNSUPPORTED_LOGIC, reason: `${positional[1]}() has no class chain form here` };
  }

  const ancestor = ancestorStep(xpath);
  if (ancestor) {
    if (ancestor.reason) return { locator: xpath, status: STATUS.SKIPPED_UNSUPPORTED_LOGIC, reason: ancestor.reason };
    const result = convertXpathToClassChain(ancestor.xpath, opts);
    return result.status === STATUS.SUCCESS ? result : { ...result, locator: xpath, reason: result.reason && `ancestor:: step: ${result.reason}` };
  }

  // Axes other than child/descendant aren't expressible as a Class Chain.
  const axis = ['following-sibling', 'preceding-sibling', 'parent::', 'following::', 'preceding::', 'ancestor::']
    .find(a => masked.includes(a));
  if (axis) {
    return { locator: xpath, status: STATUS.SKIPPED_UNSUPPORTED_LOGIC, reason: `${axis.replace(/::$/, '')} axis has no class chain form` };
  }

  // `[descendant::X…]` at the start of a predicate is `[.//X…]` (F04).
  let normalizedXpath = outsideQuotes(
    xpath.replace(/\/child::/g, '/').replace(/\/descendant::/g, '//'),
    t => t.replace(/\[\s*descendant::/g, '[.//')
  );

  // child:: and descendant:: were just normalized away. Any '::' that survives is
  // an axis a Class Chain cannot express (parent::, attribute::, namespace::,
  // *-or-self::, …) — skip rather than emit a broken chain. Masked so a literal
  // '::' inside a value (e.g. "parent::root info") isn't mistaken for an axis.
  // `self::Name` is left to the predicate rewrite (rewriteSelfTests), which only
  // accepts it as a type test inside a `*` step's predicate.
  const otherAxis = maskQuotedValues(normalizedXpath).replace(/(?<![\w-])self::[A-Za-z0-9_]+/g, '').match(/([\w-]*)::/);
  if (otherAxis) {
    return { locator: xpath, status: STATUS.SKIPPED_UNSUPPORTED_LOGIC, reason: `${otherAxis[1] || '::'} axis has no class chain form` };
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
  // `//XCUIElementTypeApplication/…` names the same root (there is only one
  // Application element), but `**/XCUIElementTypeApplication` never matches it:
  // `**/` searches below the application. So it is read as the absolute path
  // (Phase 7, GitHub corpus).
  if (/^\/\/XCUIElementTypeApplication(?![\w])/.test(normalizedXpath)) normalizedXpath = normalizedXpath.slice(1);
  if (normalizedXpath.startsWith('/') && !normalizedXpath.startsWith('//')) {
    const root = normalizedXpath.match(/^\/(?:XCUIElementTypeApplication|\*)(?:\[1\])?(?=\/|$)/);
    if (!root) {
      const reason = /^\/XCUIElementTypeApplication\[/.test(normalizedXpath)
        ? 'a predicate on the Application root has no class chain form'
        : 'absolute path must start at /XCUIElementTypeApplication (the page source root)';
      return { locator: xpath, status: STATUS.SKIPPED_UNSUPPORTED_LOGIC, reason };
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
    ? optimizeClassChain(candidate, { heal: false })
    : checkChain(collapseWildcardTypes(candidate));

  if (!validation.valid) {
    return { locator: xpath, status: STATUS.SKIPPED_VALIDATION_FAILED, reason: validation.reason };
  }

  return { locator: validation.fixedLocator, status: STATUS.SUCCESS };
}

module.exports = { tokenizeXpath, convertXpathToClassChain };
