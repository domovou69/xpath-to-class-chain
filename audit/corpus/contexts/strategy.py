# The XPath strategy is explicit in the call or tuple; rewriting only the string breaks it.
def a0(driver):
    return driver.find_element(AppiumBy.XPATH, '(//XCUIElementTypeStaticText/child::XCUIElementTypeStaticText[2])[1]')
def a1(driver):
    return driver.find_element(AppiumBy.XPATH, '//*[contains(@type,"XCUIElementTypeStaticText") and contains(@label,"Zov cog meb zudadilacu lefetec mi dom NE hu Fuve ho Voz")]')
def a2(driver):
    return driver.find_element(AppiumBy.XPATH, '//XCUIElementTypeTextField[@name="CileDewecidaWutitofOzis.hamahiduZefopihi"]')
def a3(driver):
    return driver.find_element(AppiumBy.XPATH, '//XCUIElementTypeStaticText[@name="2 fecegiv je poz!"]')
B0 = (AppiumBy.XPATH, '//XCUIElementTypeStaticText[contains(@name, "Jif fojo pefu teg t rurulo je poz koce nivere")]')
B1 = (AppiumBy.XPATH, '//XCUIElementTypeStaticText[contains(@name,"Meli bika tazeviz") or contains(@name,"Jeb fabis tuve")]')
C0 = (By.XPATH, "//*[contains(@type,\"XCUIElementTypeButton\") and contains(@name,\"HosidoLitokazajiCimo.noraSefili\")]")
C1 = (By.XPATH, "//*[@label=\"Fowani wumesok muhevuw bika 75 gohaz kofodat ditar.\"]")
