// For each XPath: what `$` / `$$` return with the optimizer on, and what the same XPath finds through the raw
// WebDriver command (findElements, which the optimizer does not touch). Writes ../result-default.json, or
// ../result-strict-off.json with STRICT_OFF=1. A strict `$` error is recorded, not thrown, so all cases run.
import fs from 'node:fs';

const BUNDLE = 'audit.xpath2cc.LocatorLab';
const ELEMENT = 'element-6066-11e4-a52e-4f735466cecf';
const results = [];

async function describeEl(id) {
  const a = n => browser.getElementAttribute(id, n);
  const [type, name, label, enabled] = await Promise.all([a('type'), a('name'), a('label'), a('enabled')]);
  return { type, name, label, enabled, rect: await browser.getElementRect(id) };
}

async function check(caseId, xpath, multiple = false) {
  const raw = (await browser.findElements('xpath', xpath)).map(e => e[ELEMENT]);
  const viaXpath = await Promise.all(raw.map(describeEl));
  const r = { case: caseId, command: multiple ? '$$' : '$', strictSelectors: browser.options.strictSelectors !== false, xpath, xpathFinds: viaXpath };
  try {
    const got = multiple ? [...(await $$(xpath))] : [await $(xpath)];
    r.dollarReturns = await Promise.all(got.map(e => describeEl(e.elementId)));
    const key = d => JSON.stringify(d);
    r.sameAsXpath = multiple ? key(viaXpath) === key(r.dollarReturns) : key(viaXpath[0]) === key(r.dollarReturns[0]);
  } catch (e) {
    r.error = `${e.name}: ${e.message.split('\n')[0]}`;
  }
  results.push(r);
}

async function openScreen(screen) {
  await driver.execute('mobile: terminateApp', { bundleId: BUNDLE });
  await driver.execute('mobile: launchApp', { bundleId: BUNDLE, arguments: ['-screen', screen] });
  let prev = '';
  for (;;) { // wait until two page sources are equal
    const cur = (await driver.getPageSource()).replace(/ processId="\d+"/, '');
    if (cur === prev) return;
    prev = cur; await browser.pause(500);
  }
}

describe('optimizer replaces the XPath element', () => {
  after(() => fs.writeFileSync(new URL(`../result-${process.env.STRICT_OFF ? 'strict-off' : 'default'}.json`, import.meta.url), JSON.stringify(results, null, 1) + '\n'));

  it('states: disabled twin (L032)', async () => {
    await openScreen('states');
    await check('L032', '//*[@label="Leba" and @enabled="false"]');
  });

  it('states: row index of a table path (P7-APP2, from a GitHub suite)', async () => {
    await check('P7-APP2', '//XCUIElementTypeApplication/XCUIElementTypeWindow[1]/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeOther/XCUIElementTypeTable/XCUIElementTypeCell[2]/XCUIElementTypeButton');
  });

  it('states: $$ of a disabled button gets the enabled twin too (L158)', async () => {
    await check('L158', '//*[@name="HaguhoCuzal.marivoDigivo" and @enabled="false"]', true);
  });

  it('nesting: path dropped (A14)', async () => {
    await openScreen('nesting');
    await check('A14', '//XCUIElementTypeWindow/XCUIElementTypeOther/XCUIElementTypeButton[@name="Close"]');
  });
});
