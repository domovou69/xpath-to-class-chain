/* eslint-disable @typescript-eslint/no-require-imports */
// Optimization rules from spec (14 total). Status per rule:
//
// HIGH IMPACT — implemented:
//   Rule 1:  stripMeaninglessIntermediates() — removes no-predicate XCUIElementTypeOther/Window steps
//   Rule 4:  collapseDoublestar()            — **/**/ → **/
//   Rule 5:  normalizeXCUIElementTypeAny()   — XCUIElementTypeAny → *
//            validator auto-fix (validator.js:16) — *[type == "XCUIElementTypeFoo" AND ...] → XCUIElementTypeFoo[...]
//
// HIGH IMPACT — not implemented (require app hierarchy knowledge, cannot automate statically):
//   Rule 2:  Never index a non-terminal step — remove [N] from intermediate nodes
//   Rule 3:  **/ → / for guaranteed direct-child relationships
//
// MEDIUM IMPACT — implemented:
//   Rule 6:  mergeSiblingPredicates()      — merge adjacent [`a`][`b`] into [`a AND b`] per step
//            converter.js also does this during XPath→class-chain conversion
//   Rule 7:  deferVisibleToFinalStep()     — strip visible==1 from intermediate steps, merge onto final
//   Rule 8:  stripRedundantTypePredicates() — remove type=="X" when chain node is already type X
//            (wildcard-node case *[type=="X"] remains handled by validateAndFixClassChain)
//   Rule 11: reorderAndConditions() — sort AND clauses cheapest-first for short-circuit
//   Rule 14: simplifyInSets()       — attr IN {"x"} → attr == "x"
//
// MEDIUM IMPACT — not implemented:
//   Rule 9:  **/Cell/Image[name=="x"] → **/Cell[$name=="x" AND type==...Image$]
//            (parent-contains transform, changes the returned element — lossy, skip)
//   Rule 10: Tighten string operator (CONTAINS → == etc.) — requires knowing if value is a full match
//   Rule 12: Anchor on nearest stable ancestor — requires runtime app structure
//
// LOW IMPACT — not implemented:
//   Rule 13: Drop [cd] case modifier — requires knowing whether casing is stable

const { PREDICATE_REGEX } = require('./predicates');
const { validateAndFixClassChain } = require('./validator');

const CC_PREFIX = '-ios class chain:';

// Rule: `attr == "abc*"` → `attr LIKE "abc*"`. NSPredicate's `==` is exact-match
// (no wildcards), so a chain that mixes them is invalid and validateAndFixClassChain
// rejects it. LIKE is the right operator for pattern matching with `*`/`?`, so
// the optimizer recovers these chains rather than skipping them.
//
// Only fires when the quoted value actually contains a literal `*`; exact-match
// strings are left alone. Scoped to text inside `[ ... ]` predicates so an
// element-type name that happens to contain `==` literally (it can't, but
// defensive) is never touched.
function rewriteWildcardEqualToLike(chain) {
  return chain.replace(PREDICATE_REGEX, predicate =>
    predicate.replace(
      /\b([a-zA-Z0-9_-]+)\s*==\s*(['"])([^'"]*\*[^'"]*)\2/g,
      (_match, attr, quote, value) => `${attr} LIKE ${quote}${value}${quote}`
    )
  );
}

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
    // separator (the "gap" marker stripMeaninglessIntermediates emits), and
    // splitting it into `/` + `**/` drops the `/` when the steps are rejoined —
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

// Rule (1): Remove no-predicate XCUIElementTypeOther / XCUIElementTypeWindow
// intermediate steps. These are pure layout wrappers that carry no semantic
// information; keeping them forces XCTest to materialise an intermediate result
// set at each step for zero filtering benefit.
//
// The gap left by a removed step becomes /**/ (descendant) rather than /
// (direct child) to avoid asserting a depth relationship that no longer holds.
// A node WITH a predicate is always kept — it genuinely narrows the search.
const MEANINGLESS_TYPES = new Set(['XCUIElementTypeOther', 'XCUIElementTypeWindow']);

function stripMeaninglessIntermediates(chain) {
  const body = chain.startsWith(CC_PREFIX) ? chain.slice(CC_PREFIX.length) : chain;
  const steps = parseChainSteps(body);
  if (steps.length <= 1) return chain;

  const keep = steps.map((step, idx) => {
    if (idx === steps.length - 1) return true;       // always keep final target
    if (step.node.includes('[')) return true;         // predicate narrows search
    const type = (step.node.match(/^([A-Za-z0-9*_]+)/) || [])[1] || '';
    return !MEANINGLESS_TYPES.has(type);
  });

  if (keep.every(Boolean)) return chain;

  let result = '';
  let prevKeptIdx = -1;

  for (let i = 0; i < steps.length; i++) {
    if (!keep[i]) continue;
    let { sep, node } = steps[i];

    if (prevKeptIdx === -1 && i > 0) {
      // First surviving step had removed predecessors — anchor with **/ so we
      // don't lose the "search entire tree" root scan.
      sep = '**/';
    } else if (prevKeptIdx !== -1 && prevKeptIdx !== i - 1) {
      // Internal gap: use /**/ instead of the original / to avoid asserting
      // direct-child depth that may no longer hold without the removed node.
      sep = '/**/';
    }

    result += sep + node;
    prevKeptIdx = i;
  }

  return CC_PREFIX + result;
}

// Rule (6): Merge consecutive backtick NSPredicate blocks on the same step into
// one. `Cell[\`a\`][\`b\`]` is equivalent to `Cell[\`a AND b\`]` but some
// engines misread multiple brackets as an index, silently changing selection.
// Numeric/index brackets like `[2]` are never merged — only `[\`...\`]` blocks.
// Consecutive backtick blocks are joined with ` AND `; a non-backtick bracket
// between two backtick blocks breaks the run.
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
        let inner = blocks[j].slice(2, -2);
        j++;
        while (j < blocks.length && isBacktick(blocks[j])) {
          inner += ' AND ' + blocks[j].slice(2, -2);
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
// OR predicates are left alone — reordering across OR requires parenthesisation.
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

// Split `inner` on ` AND ` outside of quoted strings.
function splitOnAnd(inner) {
  const parts = [];
  let quote = null;
  let start = 0;
  let i = 0;
  while (i < inner.length) {
    const c = inner[i];
    if (quote) {
      if (c === quote) quote = null;
      i++;
    } else if (c === '"' || c === "'") {
      quote = c; i++;
    } else if (inner.slice(i, i + 5) === ' AND ') {
      parts.push(inner.slice(start, i));
      i += 5;
      start = i;
    } else {
      i++;
    }
  }
  parts.push(inner.slice(start));
  return parts;
}

function reorderAndConditions(chain) {
  return chain.replace(PREDICATE_REGEX, pred => {
    // Only operate on backtick NSPredicate blocks, not index brackets like [1]
    if (!pred.startsWith('[`') || !pred.endsWith('`]')) return pred;
    const inner = pred.slice(2, -2);
    // Leave OR predicates alone — reordering across OR changes precedence
    if (/\bOR\b/.test(inner) || !/\bAND\b/.test(inner)) return pred;
    const parts = splitOnAnd(inner);
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
// OR predicates are left alone; the type condition position inside AND chains
// is resolved by splitOnAnd, which respects quoted strings.
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
      if (/\bOR\b/.test(inner)) return pred;
      const parts = splitOnAnd(inner);
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

// Rule (7): Evaluating visibility triggers a layout pass per element. On
// intermediate chain steps this means a pass for every candidate before the
// chain continues. Strip `visible == 1` / `visible == true` from non-terminal
// steps and merge it onto the final step's predicate (inserting a new predicate
// block before any index bracket if the step has no predicate yet).
// OR predicates and single-step chains are left alone.
const VISIBLE_CONDITION_RE = /^\s*visible\s*==\s*(1|true)\s*$/i;

function deferVisibleToFinalStep(chain) {
  const body = chain.startsWith(CC_PREFIX) ? chain.slice(CC_PREFIX.length) : chain;
  const steps = parseChainSteps(body);
  if (steps.length <= 1) return chain;

  let hadVisibleOnIntermediate = false;

  const newSteps = steps.map(({ sep, node }, idx) => {
    if (idx === steps.length - 1) return { sep, node };

    const newNode = node.replace(PREDICATE_REGEX, pred => {
      if (!pred.startsWith('[`') || !pred.endsWith('`]')) return pred;
      const inner = pred.slice(2, -2);
      if (/\bOR\b/.test(inner)) return pred;
      const parts = splitOnAnd(inner);
      const filtered = parts.filter(p => !VISIBLE_CONDITION_RE.test(p));
      if (filtered.length === parts.length) return pred;
      hadVisibleOnIntermediate = true;
      return filtered.length ? '[`' + filtered.join(' AND ') + '`]' : '';
    });
    return { sep, node: newNode };
  });

  if (!hadVisibleOnIntermediate) return chain;

  const lastIdx = newSteps.length - 1;
  const { sep, node } = newSteps[lastIdx];

  // Skip adding if the final step already carries a visible check
  if (/\bvisible\s*==\s*(1|true)\b/i.test(node)) {
    newSteps[lastIdx] = { sep, node };
    return CC_PREFIX + newSteps.map(s => s.sep + s.node).join('');
  }

  let newNode;
  let replaced = false;
  newNode = node.replace(PREDICATE_REGEX, pred => {
    if (replaced || !pred.startsWith('[`') || !pred.endsWith('`]')) return pred;
    replaced = true;
    return '[`' + pred.slice(2, -2) + ' AND visible == 1`]';
  });
  if (!replaced) {
    const bracketIdx = node.indexOf('[');
    newNode = bracketIdx === -1
      ? node + '[`visible == 1`]'
      : node.slice(0, bracketIdx) + '[`visible == 1`]' + node.slice(bracketIdx);
  }

  newSteps[lastIdx] = { sep, node: newNode };
  return CC_PREFIX + newSteps.map(s => s.sep + s.node).join('');
}

// Apply optimizer rules then re-validate, looping until the chain stops
// changing. The fixed point matters when a transform unlocks another — e.g.
// the validator's `*[type == X AND name == "abc*"]` collapse exposes a
// `name == "abc*"` predicate that the LIKE rule can then heal.
//
// Returns the same shape as validateAndFixClassChain so callers can swap them.
// Bounded iteration so a future buggy rule can't infinite-loop.
function optimizeClassChain(chain) {
  let current = chain;
  for (let i = 0; i < 10; i++) {
    let transformed = current;
    transformed = normalizeXCUIElementTypeAny(transformed);
    transformed = simplifyInSets(transformed);
    transformed = rewriteWildcardEqualToLike(transformed);
    transformed = collapseDoublestar(transformed);
    transformed = stripMeaninglessIntermediates(transformed);
    transformed = deferVisibleToFinalStep(transformed);
    transformed = stripRedundantTypePredicates(transformed);
    transformed = mergeSiblingPredicates(transformed);
    transformed = reorderAndConditions(transformed);
    const validated = validateAndFixClassChain(transformed);
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
  rewriteWildcardEqualToLike,
  normalizeXCUIElementTypeAny,
  simplifyInSets,
  collapseDoublestar,
  stripMeaninglessIntermediates,
  deferVisibleToFinalStep,
  stripRedundantTypePredicates,
  mergeSiblingPredicates,
  reorderAndConditions,
};
