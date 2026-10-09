// Locators without an ios: key: constants, helper calls, object props, arrays.
const first = '//*[contains(@name, "Bika Fabis tuve so liv je mefizo mi ")]';
const second = "//XCUIElementTypeButton[@name=\"FetuwozaNihelavAvuv.mipunaco\"]";
I.click('//XCUIElementTypeOther[@label="Logozeb gohaz, Lenapa gusuri, RIG"]');
I.seeElement(locate('//*[contains(@label, "Jeb fej") and contains (@label, "rolafa")]'));
const page = {
  okButton: '//XCUIElementTypeStaticText[@value="Kajepazagopotev, zov cuba jizorawohuni posetog bika tazeviz"]',
  title: '//XCUIElementTypeStaticText[contains(@name, "Bika fabis tuve devihib")]',
};
const list = [
  '//*[contains(@name, "Dobe teg")]',
  '//XCUIElementTypeImage[@name="sibo_gasupe"]',
];
function open() { return '//*[contains(@name,"FetuwozaNihelavAvuv.mipunaco") and contains(@label,"Comu mipunaco")]'; }
module.exports = { first, second, page, list, open, last: '//*[contains(@name,"LofInipaSazAzuwiJuzovUsah.tejazuLimicUbiro") and contains(@enabled,"false")]' };
