// Turns the RAW literal text the scanner sees into the runtime string the driver receives.
// quote: the JS/TS literal quote the locator lived in; subst: Map(exprText -> value).
function interpolations(s) {
  const out = []; let i = 0;
  while ((i = s.indexOf('${', i)) !== -1) {
    let d = 0, j = i + 1;
    for (; j < s.length; j++) { if (s[j] === '{') d++; else if (s[j] === '}' && --d === 0) break; }
    out.push({ start: i, end: j + 1, expr: s.slice(i + 2, j) }); i = j + 1;
  }
  return out;
}
function substitute(s, subst) {
  let r = '', last = 0;
  for (const p of interpolations(s)) { r += s.slice(last, p.start) + (subst.has(p.expr) ? subst.get(p.expr) : '${' + p.expr + '}'); last = p.end; }
  return r + s.slice(last);
}
function unescapeJs(s) {
  return s.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g, (m, e) => {
    if (e[0] === 'u') return String.fromCodePoint(parseInt(e.replace(/[u{}]/g, ''), 16));
    if (e[0] === 'x' && e.length === 3) return String.fromCharCode(parseInt(e.slice(1), 16));
    return { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0', '\n': '' }[e] ?? e;
  });
}
// Mirrors lib/scanner.js:248-249 (quote re-escaping when writing back)
function scannerEscape(loc, quote) {
  if (quote === '`') return loc.replace(/(?<!\\)`/g, '\\`');
  if (quote === "'") return loc.replace(/(?<!\\)'/g, "\\'");
  return loc;
}
function toRuntime(raw, quote, subst) {
  if (quote === '`') return unescapeJs(substitute(raw, subst));
  return unescapeJs(raw);
}
module.exports = { interpolations, substitute, unescapeJs, scannerEscape, toRuntime };
