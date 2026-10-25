// The one scan of XPath text that knows quotes and predicate brackets. Everything that
// has to ignore a `|` or `/` inside a value ([@label="a|b"]) or inside a predicate
// ([.//B[@n="x"]]) is built on it, so those rules live in a single place.

const OUTSIDE = 0;   // structural text
const DELIMITER = 1; // an opening or closing quote
const INSIDE = 2;    // the text between a pair of quotes

// Calls `visit(char, index, depth, kind)` for every character. `depth` is the number of
// open `[` at that character (a `]` without a `[` makes it negative), `kind` is OUTSIDE,
// DELIMITER or INSIDE. A quote opened with one of `quotes` (", ' and ` unless given) closes at
// the same character; brackets inside quotes do not count. `visit` returns true to stop the scan;
// `walk` then returns null, otherwise the bracket depth left at the end (0 when they balance).
function walk(text, visit, quotes = '"\'`') {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      const closes = c === quote;
      if (visit(c, i, depth, closes ? DELIMITER : INSIDE)) return null;
      if (closes) quote = null;
    } else if (quotes.includes(c)) {
      if (visit(c, i, depth, DELIMITER)) return null;
      quote = c;
    } else {
      if (visit(c, i, depth, OUTSIDE)) return null;
      if (c === '[') depth++;
      else if (c === ']') depth--;
    }
  }
  return depth;
}

// Indexes of `ch` outside quotes and outside every `[...]`.
function topLevelIndexes(text, ch) {
  const found = [];
  walk(text, (c, i, depth, kind) => {
    if (kind === OUTSIDE && depth === 0 && c === ch) found.push(i);
  });
  return found;
}

module.exports = { walk, topLevelIndexes, OUTSIDE, DELIMITER, INSIDE };
