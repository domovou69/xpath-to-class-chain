// The XPath strategy is explicit in the call. Rewriting only the string to
// "-ios class chain:..." keeps the XPath strategy and breaks the locator at runtime.
class Strategy {
  WebElement a0() { return driver.findElement(AppiumBy.xpath("(//XCUIElementTypeStaticText/child::XCUIElementTypeStaticText[1])[1]")); }
  WebElement a1() { return driver.findElement(AppiumBy.xpath("//*[contains(@type,\"XCUIElementTypeStaticText\") and contains(@label, \"Zov zir meb la farucevo teg su rociri Hijareci Logozeb tazeviz\")]")); }
  WebElement a2() { return driver.findElement(AppiumBy.xpath("//XCUIElementTypeButton[@name=\"CileDewecidaWutitofOzis.hamahiduZefopihi\"]")); }
  WebElement b0() { return driver.findElement(By.xpath("//*[@name=\"Zov cuba nififet dom kofodat rolafa ho wajih.\"]")); }
  WebElement b1() { return driver.findElement(By.xpath("//XCUIElementTypeStaticText[contains(@name, \"Zov retoh cuba sab\")]")); }
  @iOSXCUITFindBy(xpath = "//XCUIElementTypeTextField[contains(@name, \"Sosedeki bihi\")]")
  WebElement c0;
  @iOSXCUITFindBy(xpath = "//*[contains(@type,\"XCUIElementTypeStaticText\") and contains(@name,\"Meja\")]")
  WebElement c1;
  WebElement d0() { return driver.findElement(MobileBy.xpath("//*[contains(@type,\"XCUIElementTypeTextField\") and contains(@name,\"VegAluGezamIrez.kusibEtapAjijo\")]")); }
}
