// Optimization rules from spec (14 total). Status per rule:
//
// HIGH IMPACT — implemented:
//   Rule 4:  collapseDoublestar()            — **/**/ → **/
//   Rule 5:  normalizeXCUIElementTypeAny()   — XCUIElementTypeAny → *
//            validator auto-fix (validator.js:16) — *[type == "XCUIElementTypeFoo" AND ...] → XCUIElementTypeFoo[...]
//
// HIGH IMPACT — not implemented (require app hierarchy knowledge, cannot automate statically):
//   Rule 1:  Remove no-predicate XCUIElementTypeOther/Window steps — removed in Phase 5 B4:
//            `P/Other/X` → `P/**/X` matches every X below P, not only those inside an Other
//   Rule 2:  Never index a non-terminal step — remove [N] from intermediate nodes
//   Rule 3:  **/ → / for guaranteed direct-child relationships
//
// MEDIUM IMPACT — implemented:
//   Rule 6:  mergeSiblingPredicates()      — merge adjacent [`a`][`b`] into [`a AND b`] per step
//            converter.js also does this during XPath→class-chain conversion
//   Rule 8:  stripRedundantTypePredicates() — remove type=="X" when chain node is already type X
//            (wildcard-node case *[type=="X"] remains handled by validateAndFixClassChain)
//   Rule 11: reorderAndConditions() — sort AND clauses cheapest-first for short-circuit
//   Rule 14: simplifyInSets()       — attr IN {"x"} → attr == "x"
//
// MEDIUM IMPACT — not implemented:
//   Rule 7:  Defer visible == 1 to the final step — removed in Phase 5 B4: the visibility of
//            an ancestor and of its descendant are independent (a visible Cell can hold a
//            Button that is not), so moving the test changes which elements match
//   Rule 9:  **/Cell/Image[name=="x"] → **/Cell[$name=="x" AND type==...Image$]
//            (parent-contains transform, changes the returned element — lossy, skip)
//   Rule 10: Tighten string operator (CONTAINS → == etc.) — requires knowing if value is a full match
//   Rule 12: Anchor on nearest stable ancestor — requires runtime app structure
//
// LOW IMPACT — not implemented:
//   Rule 13: Drop [cd] case modifier — requires knowing whether casing is stable

const { PREDICATE_REGEX, splitTopLevel, hasTopLevelOr } = require('./predicates');
const { validateAndFixClassChain, checkChain, collapseWildcardTypes, notString } = require('./validator');

const CC_PREFIX = '-ios class chain:';

// Rule: `XCUIElementTypeAny` is the API name for the wildcard `*` in a class
// chain. They are identical at runtime, but `*` is shorter and more idiomatic.
function normalizeXCUIElementTypeAny(chain) {
  return chain.replace(/\bXCUIElementTypeAny\b/g, '*');
}

// Rule: `attr IN {"value"}` → `attr == "value"`. A single-item IN set degrades
// to a hash comparison anyway, but the explicit `==` skips the set-lookup path
// and makes the intent clear. Only fires for exactly one quoted string; multi-
// value sets are left alone because they need the IN semantics.
function simplifyInSets(chain) {
  return chain.replace(PREDICATE_REGEX, predicate =>
    predicate.replace(
      /\b([a-zA-Z0-9_-]+)\s+IN\s+\{(['"])([^'"]*)\2\}/g,
      (_match, attr, quote, value) => `${attr} == ${quote}${value}${quote}`
    )
  );
}

// Rule (4): `**/**/` → `**/`. Two consecutive descendant scans are equivalent
// to one — the second `**` adds no filtering benefit but still triggers an extra
// recursive scan.
function collapseDoublestar(chain) {
  return chain.replace(/(\*\*\/){2,}/g, '**/');
}

// Helper: split a class chain body into [{sep, node}] steps, respecting
// brackets and quoted strings so a `/` or `**/` inside a predicate value is
// never mistaken for a chain separator.
function parseChainSteps(body) {
  const steps = [];
  let i = 0;
  let pendingSep = '';
  while (i < body.length) {
    let sep = '';
    // `/**/` must be matched before the bare `**/` and `/` forms. It is a single
    // separator (the converter emits it for `A//B`), and splitting it into `/` + `**/` drops the `/` when the steps are rejoined —
    // silently turning `Table/**/Cell` into `Table**/Cell`.
    if (body.startsWith('/**/', i)) { sep = '/**/'; i += 4; }
    else if (body.startsWith('**/', i)) { sep = '**/'; i += 3; }
    else if (body[i] === '/') { sep = '/'; i += 1; }

    const start = i;
    let depth = 0;
    let quote = null;
    while (i < body.length) {
      const c = body[i];
      if (quote) {
        if (c === quote) quote = null;
        i++;
      } else if (c === '`' || c === '"' || c === "'") {
        quote = c; i++;
      } else if (c === '[') { depth++; i++; }
      else if (c === ']') { depth--; i++; }
      else if (depth === 0 && (body.startsWith('**/', i) || c === '/')) break;
      else i++;
    }
    const node = body.slice(start, i);
    // An empty node means two separators ran together (e.g. a stray `**/**/`
    // that collapseDoublestar hasn't normalised yet). Carry the separator onto
    // the next step instead of dropping it — dropping it loses a `/` and
    // corrupts the chain. The first separator wins: `**/` then `**/` is `**/`.
    if (!node) { pendingSep = pendingSep || sep; continue; }
    steps.push({ sep: pendingSep || sep, node });
    pendingSep = '';
  }
  return steps;
}

// Rule (6): Merge consecutive backtick NSPredicate blocks on the same step into
// one. `Cell[\`a\`][\`b\`]` is equivalent to `Cell[\`a AND b\`]` but some
// engines misread multiple brackets as an index, silently changing selection.
// Numeric/index brackets like `[2]` are never merged — only `[\`...\`]` blocks.
// Consecutive backtick blocks are joined with ` AND `; a non-backtick bracket
// between two backtick blocks breaks the run. AND binds tighter than OR, so a
// block with a top-level OR is parenthesised: `[a OR b][c]` → `(a OR b) AND c`.
function mergeSiblingPredicates(chain) {
  const body = chain.startsWith(CC_PREFIX) ? chain.slice(CC_PREFIX.length) : chain;
  const steps = parseChainSteps(body);
  let changed = false;

  const newSteps = steps.map(({ sep, node }) => {
    const firstBracket = node.indexOf('[');
    if (firstBracket === -1) return { sep, node };

    const prefix = node.slice(0, firstBracket);
    const rest = node.slice(firstBracket);

    const blocks = [];
    let i = 0;
    while (i < rest.length) {
      if (rest[i] !== '[') break;
      const start = i;
      let depth = 0;
      let quote = null;
      while (i < rest.length) {
        const c = rest[i];
        if (quote) {
          if (c === quote) quote = null;
          i++;
        } else if (c === '`' || c === '"' || c === "'") {
          quote = c; i++;
        } else if (c === '[') { depth++; i++; }
        else if (c === ']') { depth--; i++; if (depth === 0) break; }
        else i++;
      }
      blocks.push(rest.slice(start, i));
    }

    if (blocks.length < 2) return { sep, node };

    const isBacktick = (b) => b.startsWith('[`') && b.endsWith('`]');
    const merged = [];
    let nodeChanged = false;
    let j = 0;
    while (j < blocks.length) {
      if (isBacktick(blocks[j]) && j + 1 < blocks.length && isBacktick(blocks[j + 1])) {
        const group = b => {
          const expr = b.slice(2, -2);
          return hasTopLevelOr(expr) ? `(${expr})` : expr;
        };
        let inner = group(blocks[j]);
        j++;
        while (j < blocks.length && isBacktick(blocks[j])) {
          inner += ' AND ' + group(blocks[j]);
          j++;
        }
        merged.push('[`' + inner + '`]');
        nodeChanged = true;
      } else {
        merged.push(blocks[j]);
        j++;
      }
    }

    if (!nodeChanged) return { sep, node };
    changed = true;
    return { sep, node: prefix + merged.join('') };
  });

  if (!changed) return chain;
  return CC_PREFIX + newSteps.map(s => s.sep + s.node).join('');
}

// Rule (11): Order AND conditions cheapest-first inside a predicate block so
// NSPredicate short-circuits on the fastest check when possible.
// Cost order (fastest → slowest): == / != → BEGINSWITH → ENDSWITH → CONTAINS → LIKE → MATCHES
// Predicates with a top-level OR are left alone — reordering across OR requires parenthesisation.
const OPERATOR_COST = { MATCHES: 6, LIKE: 5, CONTAINS: 4, ENDSWITH: 3, BEGINSWITH: 2 };

function conditionCost(cond) {
  // Blank out quoted values first: the operator name must be read from the
  // condition's syntax, not from its data. `name == "I LIKE it"` is an equality
  // test (cost 1) and would otherwise be mis-costed as a LIKE (cost 5).
  const bare = cond.replace(/(['"])(?:\\.|(?!\1)[^\\])*\1/g, '""');
  for (const [op, cost] of Object.entries(OPERATOR_COST)) {
    // Match operator with optional [c], [d], or [cd] case modifier
    if (new RegExp(`\\b${op}(?:\\[c[di]?\\])?\\b`, 'i').test(bare)) return cost;
  }
  return 1; // == / != / boolean comparisons — cheapest
}

function reorderAndConditions(chain) {
  return chain.replace(PREDICATE_REGEX, pred => {
    // Only operate on backtick NSPredicate blocks, not index brackets like [1]
    if (!pred.startsWith('[`') || !pred.endsWith('`]')) return pred;
    const inner = pred.slice(2, -2);
    // Leave a top-level OR (or `||`) alone — reordering across it changes precedence
    if (hasTopLevelOr(inner)) return pred;
    const parts = splitTopLevel(inner, 'AND');
    if (parts.length < 2) return pred;
    const sorted = [...parts].sort((a, b) => conditionCost(a.trim()) - conditionCost(b.trim()));
    if (parts.every((p, idx) => p === sorted[idx])) return pred;
    return '[`' + sorted.join(' AND ') + '`]';
  });
}

// Rule (8): Remove `type == "X"` from a predicate when the chain node already
// specifies type X. XCTest pre-filters by node type before evaluating the
// predicate, so the check is never false and costs a string comparison per
// candidate. Only handles concrete element nodes — the wildcard case
// `*[type == "X"]` → `X` is handled by validateAndFixClassChain.
// Predicates with a top-level OR are left alone; the type condition is found among the
// top-level AND clauses (splitTopLevel), so quoted strings and groups stay whole.
function stripRedundantTypePredicates(chain) {
  const body = chain.startsWith(CC_PREFIX) ? chain.slice(CC_PREFIX.length) : chain;
  const steps = parseChainSteps(body);
  let changed = false;

  const newSteps = steps.map(({ sep, node }) => {
    const typeNameMatch = node.match(/^(XCUIElementType[A-Za-z0-9]+)/);
    if (!typeNameMatch) return { sep, node };

    const elementType = typeNameMatch[1];
    const isRedundant = (cond) => {
      const m = cond.match(/^\s*type\s*==\s*["']([^"']+)["']\s*$/i);
      return m && m[1] === elementType;
    };

    const newNode = node.replace(PREDICATE_REGEX, pred => {
      if (!pred.startsWith('[`') || !pred.endsWith('`]')) return pred;
      const inner = pred.slice(2, -2);
      if (hasTopLevelOr(inner)) return pred;
      const parts = splitTopLevel(inner, 'AND');
      const filtered = parts.filter(p => !isRedundant(p));
      if (filtered.length === parts.length) return pred;
      changed = true;
      return filtered.length ? '[`' + filtered.join(' AND ') + '`]' : '';
    });

    return { sep, node: newNode };
  });

  if (!changed) return chain;
  return CC_PREFIX + newSteps.map(({ sep, node }) => sep + node).join('');
}

// Apply optimizer rules then re-validate, looping until the chain stops
// changing. The fixed point matters when a transform unlocks another — e.g.
// the validator's `*[type == X AND …]` collapse exposes a concrete step that
// stripRedundantTypePredicates and reorderAndConditions then work on.
//
// Returns the same shape as validateAndFixClassChain so callers can swap them.
// `opts.heal` (default true) rewrites leftover XPath syntax in the predicates, for chains
// found in code; the converter passes false so that its own defects are reported.
// Bounded iteration so a future buggy rule can't infinite-loop.
function optimizeClassChain(chain, opts = {}) {
  const invalid = notString(chain);
  if (invalid) return invalid;
  const settle = opts.heal === false
    ? c => checkChain(collapseWildcardTypes(c))
    : validateAndFixClassChain;
  let current = chain;
  for (let i = 0; i < 10; i++) {
    let transformed = current;
    transformed = normalizeXCUIElementTypeAny(transformed);
    transformed = simplifyInSets(transformed);
    transformed = collapseDoublestar(transformed);
    transformed = stripRedundantTypePredicates(transformed);
    transformed = mergeSiblingPredicates(transformed);
    transformed = reorderAndConditions(transformed);
    const validated = settle(transformed);
    if (!validated.valid) {
      return { valid: false, fixedLocator: null, reason: validated.reason };
    }
    if (validated.fixedLocator === current) return validated;
    current = validated.fixedLocator;
  }
  return { valid: true, fixedLocator: current, reason: null };
}

module.exports = {
  optimizeClassChain,
  normalizeXCUIElementTypeAny,
  simplifyInSets,
  collapseDoublestar,
  stripRedundantTypePredicates,
  mergeSiblingPredicates,
  reorderAndConditions,
};
