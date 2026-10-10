#!/usr/bin/env node
// Builds cases.json from audit/coverage-cases.json: which cases run on which LocatorLab screen,
// with values adapted to the app. Structure is never changed: the script fails if a case's XPath,
// with string literals and ${…} blanked out, differs from the original.
//
// Per case: [id, screen, adapted XPath or null (= original), subst, flags]
//   subst: values for ${…} expressions; the locator is then treated as raw text inside a JS
//          template literal, exactly as the scanner sees it (corpus quote kept).
//   flags: dead — the XPath can never match on WDA (attribute not in the XML, text(), unknown type),
//                 so NONE is the expected observation, not a fixture problem
//          variant — a second run of the same id (another value or screen)
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const { interpolations } = require(path.join(ROOT, 'audit/harness/runtime'));
const cov = Object.fromEntries(require(path.join(ROOT, 'audit/coverage-cases.json')).map(c => [c.id, c]));
const corpus = Object.fromEntries(require(path.join(ROOT, 'audit/corpus/ios-locators.json')).map(c => [c.id, c]));
const B = 'XCUIElementTypeButton', ST = 'XCUIElementTypeStaticText', CELL = 'XCUIElementTypeCell', O = 'XCUIElementTypeOther';

const CASES = [
  // ---------------- corpus: one representative per shape, every DRIFT / GAP / Phase 1 WRONG, ~15 inexpressible
  // identity
  ['L002', 'identity'], ['L006', 'identity'], ['L014', 'identity'], ['L119', 'identity'], ['L162', 'identity'],
  ['L015', 'identity'], ['L016', 'identity', null, { message: 'Saved' }], ['L045', 'identity'], ['L048', 'identity'],
  ['L069', 'identity'], ['L076', 'identity'], ['L088', 'identity'], ['L107', 'identity'], ['L109', 'identity'],
  ['L110', 'identity'], ['L143', 'identity'], ['L145', 'identity'], ['L161', 'identity'], ['L163', 'identity'],
  ['L180', 'identity'], ['L188', 'identity'], ['L192', 'identity', null, { numbers: '3', text: 'lines', amount: '2.50' }],
  ['L194', 'identity', null, { day: 'Monday' }], ['L197', 'identity'], ['L210', 'identity'], ['L211', 'identity'],
  ['L223', 'identity'], ['L267', 'identity', null, { name: 'Alex' }], ['L297', 'identity', null, { name: 'Alex' }],
  ['L304', 'identity', '//XCUIElementTypeStaticText[contains(@name, "je vap bika zucubamo?")]'], ['L330', 'identity'],
  ['L354', 'identity'], ['L355', 'identity'], ['L372', 'identity'], ['L424', 'identity', null, { title: 'Alex' }],
  ['L429', 'identity'], ['L437', 'identity'], ['L458', 'identity'], ['L460', 'identity', null, { prize: '£5' }],
  ['L472', 'identity'], ['L474', 'identity'], ['L478', 'identity'], ['L513', 'identity'], ['L531', 'identity'],
  ['L037', 'identity'], ['L161', 'identity'],
  ['L306', 'identity', null, null, { dead: true }], ['L157', 'identity'],
  ['L068', 'identity', null, { value: '[1]' }],
  // modal
  ['L024', 'modal'], ['L300', 'modal'], ['L037', 'modal', null, null, { variant: 'sheet' }], ['L355', 'modal', null, null, { variant: 'sheet' }],
  // lists
  ['L062', 'lists', `(//${B}[@name="row.edit"])[1]`], ['L081', 'lists'], ['L120', 'lists', `//${B}[contains(@name, "row.edit")][1]`],
  ['L147', 'lists', '//*[contains(@label, "Line ${number}")]', { number: '2' }],
  ['L151', 'lists', '//*[contains(@name, "Code ${number}, total:")]', { number: '2' }],
  ['L152', 'lists', null, { line: '1' }], ['L199', 'lists', null, { line: '1' }], ['L201', 'lists', null, { line: '1', round: '2' }],
  ['L203', 'lists', null, { line: '1', pickCount: '4' }], ['L218', 'lists', null, { line: '1', pickCount: '4' }],
  ['L483', 'lists', null, { line: '1', match: 'Kurez' }], ['L484', 'lists', null, { line: '1', prize: 'Prize' }],
  ['L485', 'lists', null, { line: '1' }],
  ['L171', 'lists', null, { date: '12 Oct', transaction: '2' }],
  ['L174', 'lists', null, { transaction: '2' }],
  ['L182', 'lists'], ['L190', 'lists', null, { number: '1' }], ['L193', 'lists', null, { noOfLines: '3', line: 'lines' }],
  ['L207', 'lists', `(//${ST}[@name="Line 1"])[\${line}]`, { line: '3' }],
  ['L258', 'lists'], ['L262', 'lists'], ['L340', 'lists', null, { game: 'Lotto' }],
  ['L270', 'lists'], ['L271', 'lists'], ['L272', 'lists'], ['L451', 'lists'], ['L453', 'lists', null, { codeNumber: '7' }],
  ['L455', 'lists', null, { codeNumber: '7' }], ['L461', 'lists', null, { count: '3', "count == 1 ? 'winner' : 'winners'": 'winners' }],
  ['L556', 'lists', null, { 'value - 1': '0' }], ['L567', 'lists', null, { 'option + 1': '2' }],
  ['L012', 'lists'], ['L013', 'lists'],
  // states
  ['L031', 'states', `//${B}[contains(@label, "Lugatej") and @enabled="true"]`],
  ['L032', 'states', null, { isEnabled: 'false' }], ['L042', 'states', null, { isEnabled: 'true' }],
  ['L158', 'states'], ['L278', 'states'], ['L443', 'states'], ['L444', 'states'],
  ['L517', 'states', null, { gameName: 'Lotto', isEnabled: 'false' }], ['L520', 'states'], ['L521', 'states'],
  ['L346', 'states'], ['L349', 'states'], ['L350', 'states', null, {}],
  // nesting
  ['L001', 'nesting'], ['L019', 'nesting'], ['L020', 'nesting'], ['L022', 'nesting'], ['L054', 'nesting'],
  ['L518', 'nesting', null, { isEnabled: 'false' }], ['L090', 'nesting'], ['L097', 'nesting'], ['L179', 'nesting'],
  ['L198', 'nesting'], ['L220', 'nesting'], ['L225', 'nesting', null, { value: '2' }],
  ['L227', 'nesting', null, { noOfWeeks: '4' }], ['L228', 'nesting', null, { 'capitalize(day)': 'Monday' }],
  ['L240', 'nesting'], ['L301', 'nesting'], ['L554', 'nesting'],
  // siblings (inexpressible: XPath only)
  ['L146', 'siblings'], ['L003', 'siblings'], ['L011', 'siblings'], ['L153', 'siblings'], ['L166', 'siblings'],
  ['L336', 'siblings'], ['L257', 'siblings'], ['L009', 'siblings'], ['L017', 'siblings'],
  ['L189', 'siblings', null, { value: '7' }], ['L477', 'siblings', null, { game: 'Lotto', "condition('label')": 'contains(@label, "Draw")' }],
  ['L476', 'siblings', null, { "condition('label')": 'contains(@label, "Draw")' }],

  // ---------------- spec matrix (values adapted where the case is not about the literal itself)
  // A — steps
  ['A01', 'nesting'], ['A01', 'modal', null, null, { variant: 'modal' }],
  ['A02', 'lists'], ['A03', 'functions'], ['A03', 'functions', '//*[@name="LL"]', null, { variant: 'app-root' }],
  ['A04', 'functions'], ['A05', 'lists'], ['A06', 'lists'], ['A07', 'nesting'], ['A08', 'nesting'],
  ['A09', 'lists'], ['A10', 'lists', `//${CELL}[@name="row.1"]//${B}[@label="Taka"]`], ['A11', 'lists'],
  ['A12', 'nesting', `.//${B}[@name="btnSave"]`], ['A13', 'functions', null, null, { dead: true }],
  ['A14', 'nesting', `//XCUIElementTypeWindow/${O}/${B}[@name="Close"]`], ['A15', 'nesting', `//${O}/${B}[@name="Close"]`],
  ['A15', 'modal', `//${O}/${B}[@name="Close"]`, null, { variant: 'modal' }],
  ['A16', 'states'], ['A16', 'lists', null, null, { variant: 'lists' }],
  // B — attributes
  ['B01', 'functions'], ['B02', 'states', `//${B}[@label!="Qty"]`], ['B03', 'states'], ['B04', 'states'],
  ['B05', 'states'], ['B06', 'states'], ['B07', 'states'], ['B08', 'states'],
  ['B09', 'functions'], ['B10', 'states'], ['B11', 'functions'], ['B12', 'functions'], ['B13', 'functions', null, null, { dead: true }],
  ['B14', 'states'], ['B15', 'states', `//XCUIElementTypeTextField[@placeholderValue="Email"]`], ['B16', 'states'], ['B17', 'states'], ['B18', 'states'],
  // C — string functions
  ['C01', 'functions'], ['C02', 'functions'], ['C03', 'functions'], ['C04', 'functions'],
  ['C05', 'functions', null, null, { dead: true }], ['C06', 'functions'], ['C07', 'functions'], ['C08', 'functions'], ['C09', 'functions'],
  ['C10', 'states'], ['C11', 'functions'], ['C12', 'functions'],
  // D — logic (precedence targets on nesting)
  ['D01', 'nesting', '//*[@name="promo" and @label="Gift card"]'],
  ['D02', 'nesting', '//*[@name="promo" or @label="Gift card"]'],
  ['D03', 'nesting', '//*[@name="promo" and @label="Gift card" or @value="applied"]'],
  ['D04', 'nesting', '//*[@name="promo" or @label="Gift card" and @value="applied"]'],
  ['D05', 'nesting', '//*[(@name="promo" or @label="Gift card") and @value="applied"]'],
  ['D06', 'nesting', '//*[@name="promo" or @label="Gift card"][@value="applied"]'],
  ['D07', 'nesting', `//${B}[not(@name="promo")]`],
  ['D08', 'nesting', '//*[contains(@label,"Gift") and not(contains(@label,"card"))]'],
  ['D09', 'nesting', '//*[contains(@label,"Gift") and @name="promo" or @value="applied"]'],
  ['D10', 'nesting', '//*[contains(@label,"Gift") and @name="promo"]'],
  ['D11', 'nesting', '//*[@name="promo"][@label="Gift card"]'],
  ['D12', 'nesting', '//*[@name="promo" or @name="voucher"][@label="Coupon" or @label="Gift voucher"]'],
  ['X04', 'nesting', `//${B}[@name="promo"] | //${B}[@name="voucher"]`],
  ['X05', 'nesting', `//${B}[@name="promo"] | //${ST}[@name="voucher"]`],
  ['X06', 'lists'], ['X07', 'functions'],
  // E — positional
  ['E01', 'lists'], ['E02', 'lists'], ['E03', 'lists', `(//${B}[@name="row.edit"])[1]`], ['E04', 'lists'], ['E05', 'lists'],
  ['E06', 'lists'], ['E07', 'lists'], ['E08', 'lists'], ['E09', 'lists', `(//${B}[@name="row.edit"])[\${i}]`, { i: '2' }],
  ['E10', 'lists', `(//${B}[@name="row.edit"])\${suffix}`, { suffix: '[2]' }], ['E11', 'lists'],
  ['E12', 'lists', `//${CELL}[2][@name="row.2"]`], ['E13', 'lists', `(//${CELL}[@name="row.1"]/${B}[2])[2]`], ['E14', 'lists'],
  // F — nested predicates
  ['F01', 'lists', `//${CELL}[.//${B}[@name="row.pay"]]`], ['F02', 'lists'], ['F03', 'lists', `//${CELL}[.//*[@name="row.pay"]]`],
  ['F04', 'lists'], ['F05', 'lists', `//${CELL}[./${B}[@name="row.edit"]]`], ['F06', 'lists'],
  ['F07', 'lists', `//XCUIElementTypeTable/${CELL}[.//${ST}[@label="Overdue"]]/${B}`],
  ['F08', 'lists', `//${CELL}[@name="row.1"][.//${B}]`],
  // G — literals (values are the subject: kept)
  ...['G01', 'G02', 'G03', 'G04', 'G05', 'G06', 'G07', 'G08', 'G09', 'G10', 'G11', 'G12', 'G13', 'G14'].map(id => [id, 'identity']),
  // H — WDA extension functions (values kept)
  ...['H01', 'H02', 'H03', 'H04', 'H05', 'H06', 'H07', 'H08', 'H09'].map(id => [id, 'functions']),
  ['H10', 'functions'],
  // R — reverse axes, X — inexpressible axes
  ['R01', 'siblings', `//${B}[@name="sib.remove"]/ancestor::${CELL}`], ['R02', 'siblings'], ['R03', 'siblings'],
  ['R04', 'siblings', `//${B}[@name="sib.remove"]/ancestor::${CELL}[1]`],
  ['X01', 'siblings'], ['X02', 'siblings'], ['X03', 'siblings'],
];

// Phase 1 hand-written chains that Phase 2 found not to be exact (RC-D1). Their cases are now
// CORRECT-SKIP, so coverage-cases.json no longer holds a chain; they still run on the device to show why.
const PHASE1_EXPECTED = {
  E05: '**/XCUIElementTypeButton[-1]', E06: '**/XCUIElementTypeButton[-2]', E07: '**/XCUIElementTypeButton[2]',
  E11: '**/XCUIElementTypeCell[2]/XCUIElementTypeButton',
  L270: '**/XCUIElementTypeStaticText[`name == "jila_zugo"`][-1]',
  L271: '**/XCUIElementTypeStaticText[`name == "Kuki pefu matumutor"`][-1]',
  L272: '**/XCUIElementTypeOther[`label CONTAINS "Lenapa gusuri"`]/XCUIElementTypeStaticText[-1]',
};

const shape = s => {
  let r = '', last = 0;
  for (const p of interpolations(s)) { r += s.slice(last, p.start) + '$'; last = p.end; }
  return (r + s.slice(last)).replace(/"[^"]*"|'[^']*'/g, '"s"');
};

const seen = new Set(), out = [];
for (const [id, screen, adapted, subst, flags = {}] of CASES) {
  const key = id + (flags.variant ? '~' + flags.variant : '');
  if (seen.has(key)) continue;
  seen.add(key);
  const c = cov[id];
  if (!c) throw new Error(`${id}: not in coverage-cases.json`);
  const corp = corpus[id];
  const original = corp ? corp.source : c.xpath;
  const xpath = adapted || original;
  if (shape(xpath) !== shape(original) && !flags.variant) throw new Error(`${id}: structure changed\n  ${shape(original)}\n  ${shape(xpath)}`);
  const quote = corp ? corp.quote : (subst ? '`' : undefined);
  let expected = typeof c.expected === 'string' && /^(\*\*|XCUIElementType|-ios)/.test(c.expected) ? c.expected.replace(/^-ios class chain:/, '') : PHASE1_EXPECTED[id] || null;
  // carry adapted values into the hand-written chain: literals pair up in order (same structure)
  if (expected && xpath !== original) {
    const lits = s => [...s.matchAll(/"([^"]*)"|'([^']*)'/g)].map(m => m[1] ?? m[2]);
    const [from, to] = [lits(original), lits(xpath)];
    for (let i = 0; i < from.length; i++) if (from[i] !== to[i]) expected = expected.split(`"${from[i]}"`).join(`"${to[i]}"`);
  }
  out.push({
    id, variant: flags.variant, screen, xpath, quote, subst: subst || undefined,
    // the hand-written chain from Phase 1, run when it differs from the converter's output (GAP, DRIFT)
    expectedChain: expected && expected !== (c.actual || '').replace(/^-ios class chain:/, '') ? expected : undefined,
    dead: flags.dead || undefined,
    original: xpath !== original ? original : undefined,
    verdict: c.verdict, category: c.category,
  });
}
fs.writeFileSync(path.join(__dirname, 'cases.json'), JSON.stringify(out, null, 1) + '\n');
const by = out.reduce((a, c) => (a[c.screen] = (a[c.screen] || 0) + 1, a), {});
console.log(`${out.length} cases`, JSON.stringify(by), 'verdicts', JSON.stringify(out.reduce((a, c) => (a[c.verdict] = (a[c.verdict] || 0) + 1, a), {})));
