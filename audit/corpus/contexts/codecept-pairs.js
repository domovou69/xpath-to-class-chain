// CodeceptJS dual-platform objects. ios must convert; android must stay untouched.
module.exports = {
  p0: { ios: '//*[contains(@name, "riduco")]/child::XCUIElementTypeStaticText[@name="WefaniBedufeDanu.gotePebazoh"]', android: '//android.widget.TextView[@text="item 0"]' },
  p1: { ios: '//XCUIElementTypeTextField[@name="FetuwozaNihelavAvuv.hamahiduZefopihi"]', android: '//android.widget.TextView[@text="item 1"]' },
  p2: { ios: '//XCUIElementTypeOther[@label="Logozeb gohaz, Lenapa gusuri, RI"]', android: '//android.widget.TextView[@text="item 2"]' },
  p3: { ios: '//XCUIElementTypeStaticText[@label="Bika wacisugik mazejuz cuba zecu jizorawohuni vamalul"]', android: '//android.widget.TextView[@text="item 3"]' },
  q0: { android: '//android.widget.TextView[@text="item 4"]', ios: '//*[contains(@name, "Bika wajih lojo la rurez mi 2 cazete lov figuleni rigi rog, cohiha zov 2 fecegiv je poz.")]' },
  q1: { android: '//android.widget.TextView[@text="item 5"]', ios: '//XCUIElementTypeStaticText[@name="Vilokor"]' },
  q2: { android: '//android.widget.TextView[@text="item 6"]', ios: '//XCUIElementTypeStaticText[contains(@name, "limazene migewovig.")]' },
  m0: {
    android:
      '//android.widget.TextView[@text="item 7"]',
    ios:
      '(//XCUIElementTypeButton[@name="taka_vawotub_giwap"])[10]',
  },
  m1: {
    android:
      '//android.widget.TextView[@text="item 8"]',
    ios:
      '//*[contains(@name,"FetuwozaNihelavAvuv.mipunaco") and contains(@label,"Kuki mipunaco")]',
  },
  m2: {
    android:
      '//android.widget.TextView[@text="item 9"]',
    ios:
      '//*[contains(@name,"LofInipaSazAzuwiJuzovUsah.fufikuJugehOvuca") and contains(@enabled,"false")]',
  },
};
