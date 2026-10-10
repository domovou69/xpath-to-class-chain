// Assembles audit/coverage-cases.json and computes R / S from run evidence.
const fs = require('fs'), path = require('path');
const P = require('./paths'), ROOT = P.ROOT;
const m = require(path.join(ROOT, 'xpath-to-class-chain'));
const corpus = require(path.join(ROOT, 'audit/corpus/ios-locators.json'));
const coarse = require(P.out('coarse.json'));
const fuzz = require(P.out('fuzzresults_directed.json'));
const gapRes = require(P.out('gapresults.json'));
const gapExp = require('./gapexpected');
const spec = require(P.out('specresults.json'));
const strip = s => s && s.replace(/^-ios class chain:/, '');

const RC = {
  RC1: { sev: 'critical', loc: 'lib/converter.js:266', title: '`//` after a step emits `**/` with no `/` separator (`…]**/X`), which WDA cannot parse' },
  RC2: { sev: 'major', loc: 'lib/predicates.js:45', title: '`contains()` on a boolean attribute becomes `CONTAINS` on an NSNumber, which raises at evaluation' },
  RC3: { sev: 'major', loc: 'lib/converter.js:301', title: 'attributes that WDA does not know (`text`, `x`, `y`, `width`, `height`) are passed through; WDA throws FBUnknownAttributeException' },
  RC4: { sev: 'major', loc: 'lib/converter.js:301', title: 'values are not escaped for NSPredicate string literals (raw newline, backslash), so the chain fails to parse or matches something else' },
  RC5: { sev: 'major', loc: 'lib/converter.js:314', title: 'an interpolated predicate body `[${…}]` is wrapped in backticks as if it were NSPredicate' },
  RC6: { sev: 'critical', loc: 'lib/validator.js:83', title: 'the leftover-XPath guard strips the whole backtick block before looking for `(`, `@`, `text()`, so unconverted functions (`matches`, `lower-case`, `normalize-space`, `concat`, `contains(.)`, `[@name]`, `[Type]`) pass as success' },
  RC7: { sev: 'critical', loc: 'lib/converter.js:325', title: 'several logic predicates are joined with ` AND ` without parentheses: `[a or b][c]` becomes `a OR b AND c`' },
  RC8: { sev: 'critical', loc: 'lib/converter.js:292', title: 'nested predicates are flattened: `[.//Button[@name="x"]]` becomes `[name == "x"]` on the outer element (PREDICATE_REGEX is not nesting-aware)' },
  RC9: { sev: 'major', loc: 'lib/converter.js:269', title: 'a leading `/` and the `XCUIElementTypeApplication` step are kept, so the chain starts with `/` and WDA cannot parse it' },
  RC10: { sev: 'minor', loc: 'lib/converter.js:276', title: '`.` and `..` steps are copied verbatim into the chain' },
  RC11: { sev: 'major', loc: 'lib/validator.js:22', title: 'type names are not checked against WDA\'s type table: unknown `XCUIElementTypeFoo` and partial `contains(@type,"XCUIElementTypeText")` collapse to a type WDA maps to `Other`' },
  RC12: { sev: 'minor', loc: 'lib/validator.js:68', title: '`@` is stripped inside quoted values (`"$5 and @x"` becomes `"$5 and x"`)' },
  RC13: { sev: 'major', loc: 'lib/optimizer.js:45', title: 'a literal `*` in an `==` value is turned into a `LIKE` wildcard (XPath `=` is exact); validator.js:103 wrongly calls `== "a*"` invalid' },
  RC14: { sev: 'major', loc: 'lib/converter.js:301', title: 'typed comparisons are emitted untyped: `@index="1"` becomes `index == "1"` (never true), `@value>5` becomes `value>5` (raises)' },
  RC15: { sev: 'major', loc: 'lib/converter.js:314', title: 'an index predicate is moved after logic predicates: `//Cell[2][@name="a"]` becomes `Cell[name == "a"][2]`' },
  'RC-S1': { sev: 'critical', loc: 'lib/scanner.js:170', title: 'Java: strings inside `AppiumBy.xpath(…)`, `By.xpath(…)`, `MobileBy.xpath(…)`, `@iOSXCUITFindBy(xpath = …)` are rewritten while the XPath strategy stays' },
  'RC-S2': { sev: 'critical', loc: 'lib/scanner.js:170', title: 'Python: strings in `find_element(AppiumBy.XPATH, …)` / `(By.XPATH, …)` tuples are rewritten while the XPath strategy stays' },
  'RC-D1': { sev: 'major', loc: 'lib/converter.js:393', title: 'grouped positions `(//X)[n]` become `**/X[n]`: WDA counts class chain positions in XCTest query order (breadth-first), XPath in document order (Phase 2, device). DRIFT: no exact class chain exists, so no penalty' },
  'RC-D2': { sev: 'major', loc: 'lib/converter.js:508', title: '`[.//X[p]]` becomes `[$…$]`, but XCTest containingPredicate also tests the element itself: `//Cell[.//*[@name="x"]]` also selects a Cell named x (Phase 2, device)' },
  'RC-S3': { sev: 'major', loc: 'lib/predicates.js:34', title: 'escaped-quote contexts (JSON, Java, double-quoted strings): `contains(@a,\\"v\\")` is not rewritten (QUOTED_VALUE cannot close on `\\"`) and RC6 lets `contains(…)` through' },
};

const cases = [], review = [];
// ---------- corpus
const shapeOf = {}; coarse.forEach((g, i) => g.ids.forEach(id => shapeOf[id] = `S${String(i + 1).padStart(3, '0')} ${g.key.split('  =>  ')[0]}`));
const CORPUS_WRONG = {
};
const CORPUS_DRIFT = {
  L013: [true, 'inner per-parent [2] vs global [2] (README positional warning)'], L120: [true, 'per-parent [1] vs global [1]'],
  L349: [true, 'per-parent [1] vs global [1]'], L350: [true, 'per-parent [2] vs global [2]'], L556: [true, 'child::*[1] per parent vs global [1]'],
  L174: [false, 'hyp. 7: outer index moved onto the parent; equal only when every matched parent has ≥2 children and matches do not nest'],
  L225: [false, 'nested matching containers: XCTest query order is breadth-first, not document order (confirmed on device, Phase 2)'],
  L062: [false, 'RC-D1: grouped position counts matches in XCTest query order (breadth-first) on device, XPath in document order'],
  L070: [false, 'RC-D1: grouped position counts matches in XCTest query order (breadth-first) on device, XPath in document order'],
  L081: [false, 'RC-D1: grouped position counts matches in XCTest query order (breadth-first) on device, XPath in document order'],
  L082: [false, 'RC-D1: grouped position counts matches in XCTest query order (breadth-first) on device, XPath in document order'],
  L162: [false, 'RC-D1: grouped position counts matches in XCTest query order (breadth-first) on device, XPath in document order'],
  L171: [false, 'RC-D1: grouped position counts matches in XCTest query order (breadth-first) on device, XPath in document order'],
  L177: [false, 'RC-D1: grouped position counts matches in XCTest query order (breadth-first) on device, XPath in document order'],
  L182: [false, 'RC-D1: grouped position counts matches in XCTest query order (breadth-first) on device, XPath in document order'],
  L207: [false, 'RC-D1: grouped position counts matches in XCTest query order (breadth-first) on device, XPath in document order'],
  L208: [false, 'RC-D1: grouped position counts matches in XCTest query order (breadth-first) on device, XPath in document order'],
  L234: [false, 'RC-D1: grouped position counts matches in XCTest query order (breadth-first) on device, XPath in document order'],
  L258: [false, 'RC-D1: grouped position counts matches in XCTest query order (breadth-first) on device, XPath in document order'],
  L262: [false, 'RC-D1: grouped position counts matches in XCTest query order (breadth-first) on device, XPath in document order'],
  L310: [false, 'RC-D1: grouped position counts matches in XCTest query order (breadth-first) on device, XPath in document order'],
  L382: [false, 'RC-D1: grouped position counts matches in XCTest query order (breadth-first) on device, XPath in document order'],
  L396: [false, 'RC-D1: grouped position counts matches in XCTest query order (breadth-first) on device, XPath in document order'],
  L407: [false, 'RC-D1: grouped position counts matches in XCTest query order (breadth-first) on device, XPath in document order'],
  L428: [false, 'RC-D1: grouped position counts matches in XCTest query order (breadth-first) on device, XPath in document order'],
  L451: [false, 'RC-D1: grouped position counts matches in XCTest query order (breadth-first) on device, XPath in document order'],
  L471: [false, 'RC-D1: grouped position counts matches in XCTest query order (breadth-first) on device, XPath in document order'],
  L498: [false, 'RC-D1: grouped position counts matches in XCTest query order (breadth-first) on device, XPath in document order'],
  L564: [false, 'RC-D1: grouped position counts matches in XCTest query order (breadth-first) on device, XPath in document order'],
  L565: [false, 'RC-D1: grouped position counts matches in XCTest query order (breadth-first) on device, XPath in document order'],
  L566: [false, 'RC-D1: grouped position counts matches in XCTest query order (breadth-first) on device, XPath in document order'],
  L567: [false, 'RC-D1: grouped position counts matches in XCTest query order (breadth-first) on device, XPath in document order'],
  L571: [false, 'RC-D1: grouped position counts matches in XCTest query order (breadth-first) on device, XPath in document order'],
  L572: [false, 'RC-D1: grouped position counts matches in XCTest query order (breadth-first) on device, XPath in document order'],
  L573: [false, 'RC-D1: grouped position counts matches in XCTest query order (breadth-first) on device, XPath in document order'],
  // same shape as L062 (S006); its random trees never had 10 matches, so the shape's counter-example applies
  L397: [false, 'RC-D1: grouped position counts matches in XCTest query order (breadth-first) on device, XPath in document order', 'L062'],
};
const SKIP_REASON = s => /last\(\)/.test(s) ? 'grouped last(): document-order position; [-1] counts in XCTest query order (RC-D1)' : /\|/.test(s) ? 'union of different paths / page-level not()' : /following::/.test(s) ? 'following axis' : /sibling::/.test(s) ? 'sibling axis' : /parent::|\/\.\./.test(s) ? 'parent axis' : 'other';
for (const x of corpus) {
  if (!['xpath', 'xpath-dynamic', 'xpath-mixed-classchain'].includes(x.kind)) continue;
  const r = m.convertXpathToClassChain(x.source, { optimize: true });
  const c = { id: x.id, xpath: x.source, expected: null, actual: r.status === 'success' ? r.locator : null, status: r.status, verdict: null, shape: shapeOf[x.id], category: 'corpus', note: '' , expressible: true, rootCause: null, documented: null };
  const variants = Object.entries(fuzz).filter(([k]) => k.split('~')[0] === x.id).map(([, b]) => b);
  if (r.status === 'success') {
    const outs = variants.map(v => v.outcome);
    if (CORPUS_WRONG[x.id] && outs.includes('CC_ERROR')) {
      const [rc, expr, exp] = CORPUS_WRONG[x.id];
      Object.assign(c, { verdict: 'WRONG', rootCause: rc, expressible: expr, expected: exp, note: 'WDA: ' + variants.find(v => v.ccError).ccError.split('\n')[0].slice(0, 160) });
    } else if (CORPUS_DRIFT[x.id] && (outs.includes('SET_DIFFERS') || CORPUS_DRIFT[x.id][2])) {
      const [doc, why, sib] = CORPUS_DRIFT[x.id];
      const v = variants.find(v => v.example) || Object.entries(fuzz).filter(([k]) => k.split('~')[0] === sib).map(([, b]) => b).find(b => b.example);
      Object.assign(c, { verdict: 'DRIFT', documented: doc, expected: 'no exact class chain; ' + why, note: `${why}.${sib && !outs.includes('SET_DIFFERS') ? ` Judged by shape: counter-example from ${sib}.` : ''} Minimal page source: ${v.example.xml.replace(/ (enabled|visible|accessible)="[a-z]+"/g, '')} → XPath ${JSON.stringify(v.example.xpathHits)} vs chain ${JSON.stringify(v.example.chainHits)}` });
    } else if (outs.some(o => o !== 'EQUAL')) {
      // not in the baseline maps: a new failure — counted as WRONG with an unclassified root cause
      review.push(`${x.id}: fuzz outcome ${outs.join(',')} — classify by hand (CORPUS_WRONG / CORPUS_DRIFT)`);
      Object.assign(c, { verdict: 'WRONG', rootCause: 'RC-NEW', expected: 'REVIEW', note: 'fuzz: ' + outs.join(',') });
    } else {
      const hits = Math.min(...variants.map(v => v.hits));
      Object.assign(c, { verdict: 'CORRECT', expected: r.locator, note: `fuzz: ${variants.reduce((a, v) => a + v.trials, 0)} random page sources, equal set+first; min matching trials ${hits}${hits === 0 ? ' (needs 10 matches; same shape verified on siblings)' : ''}` });
    }
  } else if (gapExp[x.id]) {
    const g = gapRes[x.id + '~0'];
    Object.assign(c, { verdict: 'GAP', expected: gapExp[x.id], note: `expected chain vs XPath: ${g.equal}/${g.trials} equal${g.outcome !== 'EQUAL' ? ' (divergent trials have nested matching containers; ordering UNVERIFIED for the query strategy)' : ''}` });
  } else if (x.id === 'L476') {
    Object.assign(c, { verdict: 'CORRECT-SKIP', expressible: false, expected: 'SKIP with reason: predicate body is built at runtime (assumed to be XPath text, see §8)', note: 'excluded from the denominator' });
  } else if (x.id === 'L068') {
    Object.assign(c, { verdict: 'CORRECT-SKIP', expressible: false, expected: 'UNDETERMINED: bracket-less ${value} suffix; its runtime text is unknown', note: 'excluded from the denominator; see §8' });
  } else if (x.id === 'L157') {
    Object.assign(c, { verdict: 'CORRECT-SKIP', expressible: false, expected: 'INVALID XPATH on WDA (libxml2: Invalid expression); class-chain intent would be **/XCUIElementTypeButton[`label == "Gihasem"`]', note: 'mixed XPath + class chain syntax' });
  } else {
    Object.assign(c, { verdict: 'CORRECT-SKIP', expressible: false, expected: 'INEXPRESSIBLE: ' + SKIP_REASON(x.source) });
  }
  cases.push(c);
}
// ---------- spec
const SPEC = { // id: [verdict, rootCause|null, documented?]
  A01: ['CORRECT'], A02: ['CORRECT'], A03: ['CORRECT'], A04: ['CORRECT'], A05: ['CORRECT'], A06: ['CORRECT'], A07: ['DRIFT', null, false], A08: ['CORRECT'],
  A09: ['CORRECT'], A10: ['CORRECT'], A11: ['CORRECT'], A12: ['GAP'], A13: ['CORRECT-SKIP'], A14: ['DRIFT', null, false], A15: ['DRIFT', null, false], A16: ['DRIFT', null, true],
  B01: ['CORRECT'], B02: ['CORRECT'], B03: ['CORRECT'], B04: ['CORRECT'], B05: ['CORRECT'], B06: ['CORRECT'], B07: ['CORRECT'], B08: ['DRIFT', null, false],
  B09: ['CORRECT'], B10: ['CORRECT'], B11: ['CORRECT'], B12: ['CORRECT'], B13: ['CORRECT-SKIP'], B14: ['CORRECT'], B15: ['CORRECT'], B16: ['DRIFT', null, false], B17: ['CORRECT'], B18: ['CORRECT'],
  C01: ['CORRECT'], C02: ['CORRECT'], C03: ['DRIFT', null, true], C04: ['DRIFT', null, true], C05: ['CORRECT-SKIP'], C06: ['GAP'], C07: ['GAP'], C08: ['GAP'], C09: ['GAP'], C10: ['CORRECT'], C11: ['CORRECT'], C12: ['CORRECT'],
  D01: ['CORRECT'], D02: ['CORRECT'], D03: ['CORRECT'], D04: ['CORRECT'], D05: ['CORRECT'], D06: ['CORRECT'], D07: ['GAP'], D08: ['GAP'], D09: ['CORRECT'], D10: ['CORRECT'], D11: ['CORRECT'], D12: ['CORRECT'],
  E01: ['DRIFT', null, true], E02: ['DRIFT', null, false], E03: ['DRIFT', null, false], E04: ['CORRECT-SKIP'], E05: ['CORRECT-SKIP'], E06: ['CORRECT-SKIP'], E07: ['CORRECT-SKIP'], E08: ['CORRECT-SKIP'], E09: ['DRIFT', null, false], E10: ['CORRECT-SKIP'], E11: ['CORRECT-SKIP'], E12: ['CORRECT-SKIP'], E13: ['DRIFT', null, false], E14: ['DRIFT', null, false],
  F01: ['CORRECT'], F02: ['CORRECT-SKIP'], F03: ['WRONG', 'RC-D2'], F04: ['GAP'], F05: ['CORRECT-SKIP'], F06: ['CORRECT-SKIP'], F07: ['CORRECT'], F08: ['CORRECT'],
  G01: ['CORRECT'], G02: ['CORRECT'], G03: ['GAP'], G04: ['GAP'], G05: ['CORRECT'], G06: ['CORRECT'], G07: ['CORRECT'], G08: ['CORRECT'], G09: ['CORRECT'], G10: ['CORRECT'], G11: ['DRIFT', null, false], G12: ['CORRECT'], G13: ['CORRECT'], G14: ['GAP'],
  H01: ['CORRECT'], H02: ['GAP'], H03: ['GAP'], H04: ['GAP'], H05: ['GAP'], H06: ['GAP'], H07: ['CORRECT-SKIP'], H08: ['CORRECT-SKIP'], H09: ['CORRECT-SKIP'], H10: ['DRIFT', null, true],
  R01: ['GAP'], R02: ['CORRECT-SKIP'], R03: ['CORRECT-SKIP'], R04: ['CORRECT-SKIP'],
  X01: ['CORRECT-SKIP'], X02: ['CORRECT-SKIP'], X03: ['CORRECT-SKIP'], X04: ['GAP'], X05: ['GAP'], X06: ['CORRECT-SKIP'], X07: ['GAP'],
};
// cases whose XPath never matches anything on WDA (dead) or that have no exact form -> excluded from the denominator
const NOT_EXPRESSIBLE = new Set(['E11', 'E05', 'E06', 'E07', 'F03', 'A13', 'B08', 'B13', 'C03', 'C04', 'C05', 'H10', 'E04', 'E08', 'E10', 'E12', 'F02', 'F05', 'F06', 'H07', 'H08', 'H09', 'R02', 'R03', 'R04', 'X01', 'X02', 'X03', 'X06']);
for (const r of spec) {
  let [verdict, rc, doc] = SPEC[r.id] || [];
  const e = r.runExpected, a = r.runActual, f = r.fixtureRun;
  // consistency checks against the runs: the hand verdict must still match what the runs show
  const actOut = a && a.outcome, fa = f && f.FA;
  const faDiff = fa && (!Array.isArray(fa.chain) || JSON.stringify(fa.chain) !== JSON.stringify(fa.xpath));
  const holds = {
    CORRECT: () => actOut === 'EQUAL' && !faDiff,
    GAP: () => r.status !== 'success' && e && e.outcome === 'EQUAL',
    WRONG: () => r.status === 'success' && (actOut !== 'EQUAL' || faDiff),
    DRIFT: () => r.status === 'success' && (actOut === 'SET_DIFFERS' || actOut === 'FIRST_DIFFERS' || faDiff),
    'CORRECT-SKIP': () => r.status !== 'success',
  };
  if (!verdict || !holds[verdict]()) {
    // baseline no longer holds (e.g. the converter was fixed): derive the verdict from the runs
    const was = verdict || 'new case';
    if (r.status === 'success') [verdict, rc, doc] = actOut === 'EQUAL' && !faDiff ? ['CORRECT'] : ['WRONG', 'RC-NEW'];
    else [verdict, rc, doc] = e && e.outcome === 'EQUAL' ? ['GAP'] : ['CORRECT-SKIP'];
    review.push(`${r.id}: baseline ${was}, runs now say ${verdict}${rc ? ' (classify root cause / DRIFT by hand)' : ''} — update SPEC`);
  }
  if (e && verdict !== 'DRIFT' && e.outcome !== 'EQUAL' && !r.approx) review.push(`${r.id}: expected chain not proven (${e.outcome}) — fix speccases.js`);
  const ev = [];
  if (e) ev.push(`expected vs XPath: ${e.equal}/${e.trials} equal`);
  if (a) ev.push(`actual vs XPath: ${a.outcome}${a.ccErr ? ' (' + a.ccErr.split('\n')[0].slice(0, 120) + ')' : ''}`);
  if (f) ev.push('fixture: ' + Object.entries(f).map(([k, v]) => `${k === 'FE' ? 'expected' : k === 'FA' ? 'actual' : 'xpath'} xpath=${JSON.stringify(v.xpath)} chain=${JSON.stringify(v.chain && v.chain.error ? 'ERROR' : v.chain)}`).join('; '));
  if (r.runXpathOnly) ev.push(`XPath-only hits in ${r.runXpathOnly.hits}/${r.runXpathOnly.trials} trials`);
  cases.push({ id: r.id, xpath: r.xpath, expected: typeof r.expected === 'string' ? r.expected : (r.expected.inexpressible ? 'INEXPRESSIBLE: ' + r.expected.inexpressible : 'SKIP: ' + r.expected.skip),
    actual: r.actual ? '-ios class chain:' + r.actual : null, status: r.status, verdict, shape: r.xpath.replace(/"[^"]*"|'[^']*'/g, '"s"'), category: r.cat,
    note: [r.note, r.approx, ...ev].filter(Boolean).join(' | '), expressible: !NOT_EXPRESSIBLE.has(r.id), rootCause: rc || null, documented: doc ?? null });
}
// ---------- scanner contexts
const CTX = [
  ['CTX-codecept-pairs.js', 'convert ios values; android values untouched; file still parses', '10/10 ios converted, 10 android untouched, node --check OK', 'CORRECT', null],
  ['CTX-bare.js', 'convert; file still parses', '10/10 converted, node --check OK', 'CORRECT', null],
  ['CTX-wdio.ts', 'convert incl. template literals; emitted backticks must not break the template literal', '11 converted (backticks escaped as \\`), d9 (following-sibling) skipped; loads under Node 24 type stripping; all 11 chains parse in WDA', 'CORRECT', null],
  ['CTX-Strategy.java', 'must NOT rewrite while the strategy is XPath', '0/8 rewritten: all 8 skipped as skipped_xpath_strategy ("xpath strategy: AppiumBy.xpath(" ×3, "By.xpath(" ×2, "@iOSXCUITFindBy(xpath =" ×2, "MobileBy.xpath(" ×1); file byte-identical; javac unavailable (no JRE)', 'CORRECT', null],
  ['CTX-strategy.py', 'must NOT rewrite while the strategy is XPath', '0/8 rewritten: all 8 skipped as skipped_xpath_strategy ("xpath strategy: AppiumBy.XPATH" ×6, "By.XPATH" ×2); file byte-identical, parses OK', 'CORRECT', null],
  ['CTX-store.json', 'convert; JSON stays valid', 'JSON.parse OK; 6/6 converted and parse in WDA, including the 3 escaped-quote entries (`contains(@type,\\"…\\")`, RC-S3)', 'CORRECT', null],
];
for (const [id, exp, act, verdict, rc] of CTX) cases.push({ id, xpath: null, expected: exp, actual: act, status: 'scanner', verdict, shape: 'scanner-context', category: 'context', note: '', expressible: true, rootCause: rc, documented: null });
// ---------- scoring
const corp = cases.filter(c => c.category === 'corpus');
const count = (arr, f) => arr.filter(f).length;
const exprC = corp.filter(c => c.expressible);
const correct = count(exprC, c => c.verdict === 'CORRECT'), driftDoc = count(exprC, c => c.verdict === 'DRIFT' && c.documented), driftUndoc = count(exprC, c => c.verdict === 'DRIFT' && !c.documented);
const wrongC = count(corp, c => c.verdict === 'WRONG'), gap = count(exprC, c => c.verdict === 'GAP');
const rcCorpus = [...new Set(corp.filter(c => c.rootCause).map(c => c.rootCause))];
const rcCtx = [...new Set(cases.filter(c => c.category === 'context' && c.verdict === 'WRONG').map(c => c.rootCause))];
const penR = Math.min(30, 3 * (rcCorpus.length + rcCtx.length));
const Rraw = 100 * (correct + 0.5 * driftDoc) / exprC.length;
const R = Rraw - penR;
const C = 100 * exprC.length / corp.length;
console.log(`CORPUS in-scope=${corp.length} expressible=${exprC.length} CORRECT=${correct} DRIFTdoc=${driftDoc} DRIFTundoc=${driftUndoc} WRONG(all)=${wrongC} WRONG(expr)=${count(exprC, c => c.verdict === 'WRONG')} GAP=${gap} CORRECT-SKIP=${count(corp, c => c.verdict === 'CORRECT-SKIP')}`);
console.log(`R_raw=100*(${correct}+0.5*${driftDoc})/${exprC.length}=${Rraw.toFixed(2)}  rootCauses corpus=${rcCorpus} ctx=${rcCtx} penalty=-${penR}  R=${R.toFixed(1)}  C=${exprC.length}/${corp.length}=${C.toFixed(1)}%`);
const W = { A: 15, B: 15, C: 15, D: 12, E: 12, F: 10, G: 10, H: 6, R: 5 };
let Ssum = 0; const lines = [];
for (const [cat, w] of Object.entries(W)) {
  const cs = cases.filter(c => c.category === cat && c.expressible);
  const cc = count(cs, c => c.verdict === 'CORRECT'), dd = count(cs, c => c.verdict === 'DRIFT' && c.documented);
  const sc = cs.length ? w * (cc + 0.5 * dd) / cs.length : w;
  Ssum += sc; lines.push(`${cat} w=${w}: ${w}×(${cc}+0.5×${dd})/${cs.length} = ${sc.toFixed(2)}  [all=${count(cases, c => c.category === cat)} excluded=${count(cases, c => c.category === cat && !c.expressible)} DRIFTundoc=${count(cs, c => c.verdict === 'DRIFT' && !c.documented)} WRONG=${count(cases, c => c.category === cat && c.verdict === 'WRONG')} GAP=${count(cs, c => c.verdict === 'GAP')}]`);
}
const rcSpec = [...new Set(cases.filter(c => /^[A-HRX]\d\d$/.test(c.id) && c.rootCause).map(c => c.rootCause))];
const penS = Math.min(30, 3 * (rcSpec.length + rcCtx.length));
console.log(lines.join('\n'));
console.log(`S_raw=${Ssum.toFixed(2)} rootCauses spec=${rcSpec.length} (${rcSpec}) + ctx=${rcCtx.length} → penalty=-${penS} (uncapped -${3 * (rcSpec.length + rcCtx.length)})  S=${(Ssum - penS).toFixed(1)}`);
// pointer addresses in exception texts differ per run; normalise them so the output is reproducible
for (const c of cases) c.note = c.note && c.note.replace(/0x[0-9a-f]{6,}/g, '0x…');
const out = cases.map(({ id, xpath, expected, actual, status, verdict, shape, category, note, rootCause, expressible, documented }) => ({ id, xpath, expected, actual, status, verdict, shape, category, note: [note, rootCause ? `root cause ${rootCause}` : '', expressible === false ? 'excluded from denominator' : '', documented === true ? 'DRIFT documented in README' : documented === false && verdict === 'DRIFT' ? 'DRIFT not documented in README' : ''].filter(Boolean).join(' | ') }));
const BASELINE = path.join(ROOT, 'audit/coverage-cases.json');
const base = fs.existsSync(BASELINE) ? Object.fromEntries(JSON.parse(fs.readFileSync(BASELINE, 'utf8')).map(c => [c.id, c])) : {};
fs.writeFileSync(P.out('coverage-cases.json'), JSON.stringify(out, null, 1) + '\n');
if (process.argv.includes('--update')) fs.writeFileSync(BASELINE, JSON.stringify(out, null, 1) + '\n');
fs.writeFileSync(P.out('rc.json'), JSON.stringify(RC, null, 1));
console.log('cases written:', out.length, 'by verdict:', JSON.stringify(out.reduce((a, c) => (a[c.verdict] = (a[c.verdict] || 0) + 1, a), {})));
// ---------- what changed against the committed baseline (audit/coverage-cases.json)
const diffs = out.filter(c => !base[c.id] || base[c.id].verdict !== c.verdict || base[c.id].actual !== c.actual)
  .map(c => `${c.id}: ${base[c.id] ? base[c.id].verdict : '(new)'} → ${c.verdict}${base[c.id] && base[c.id].actual !== c.actual ? ' (converter output changed)' : ''}`);
const gone = Object.keys(base).filter(id => !out.some(c => c.id === id));
console.log(diffs.length || gone.length ? `\nchanged vs baseline (${diffs.length + gone.length}):\n  ` + [...diffs, ...gone.map(id => `${id}: removed`)].join('\n  ') : '\nno changes vs baseline');
if (review.length) console.log(`\nneeds review (${review.length}):\n  ` + review.join('\n  '));
if (diffs.length || gone.length || review.length) process.exitCode = 1;
