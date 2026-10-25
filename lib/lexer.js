// The one scan of XPath text that knows quotes and predicate brackets. Everything that
// has to ignore a `|` or `/` inside a value ([@label="a|b"]) or inside a predicate
// ([.//B[@n="x"]]) is built on it, so those rules live in a single place.

const OUTSIDE = 0;   // structural text
const DELIMITER = 1; // an opening or closing quote
const INSIDE = 2;    // the text between a pair of quotes

// Calls `visit(char, index, depth, kind)` for every character. `depth` is the number of
// open `[` at that character (a `]` without a `[` makes it negative), `kind` is OUTSIDE,
// DELIMITER or INSIDE. A quote opened with ", ' or ` closes at the same character;
// brackets inside quotes do not count. `visit` returns true to stop the scan.
function walk(text, visit) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      const closes = c === quote;
      if (visit(c, i, depth, closes ? DELIMITER : INSIDE)) return;
      if (closes) quote = null;
    } else if (c === '"' || c === "'" || c === '`') {
      if (visit(c, i, depth, DELIMITER)) return;
      quote = c;
    } else {
      if (visit(c, i, depth, OUTSIDE)) return;
      if (c === '[') depth++;
      else if (c === ']') depth--;
    }
  }
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
