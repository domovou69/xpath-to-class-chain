### Where a model is right and the converter is not (30 cases, 11 cells)

| Case | XPath | Converter | Cells right | Example chain from a model |
|---|---|---|---|---|
| C08 | `//*[contains(translate(@label,"ABCDEFGHIJKLMNOPQRSTUVWXYZ","abcdefghijklmnopqrstuvwxyz"),"ab")]` | GAP | 11/11 | `**/XCUIElementTypeAny[ˋlabel CONTAINS[c] "ab"ˋ]` |
| A16 | `//XCUIElementTypeCell[@visible="true"]/XCUIElementTypeButton` | DRIFT | 11/11 | `**/XCUIElementTypeCell[ˋvisible == 1ˋ]/XCUIElementTypeButton` |
| G14 | `//*[contains(@label,"a]b")]` | GAP | 11/11 | `**/XCUIElementTypeAny[ˋlabel CONTAINS "a]b"ˋ]` |
| G03 | `//*[@label='a"b']` | GAP | 11/11 | `**/XCUIElementTypeAny[ˋlabel == "a\"b"ˋ]` |
| L458 | `//*[contains(@label, "NE Cisibosogoz Jufoz bihi") and not (contains(@label, "Bika"))]` | GAP | 11/11 | `**/XCUIElementTypeAny[ˋ(label CONTAINS "NE Cisibosogoz Jufoz bihi" AND NOT (label CONTAINS "Bika"))ˋ]` |
| A14 | `//XCUIElementTypeWindow/XCUIElementTypeOther/XCUIElementTypeButton[@name="a"]` | DRIFT | 11/11 | `**/XCUIElementTypeWindow/XCUIElementTypeOther/XCUIElementTypeButton[ˋname == "a"ˋ]` |
| A15 | `//XCUIElementTypeOther/XCUIElementTypeButton[@name="a"]` | DRIFT | 11/11 | `**/XCUIElementTypeOther/XCUIElementTypeButton[ˋname == "a"ˋ]` |
| D08 | `//*[contains(@label,"a") and not(contains(@label,"b"))]` | GAP | 11/11 | `**/XCUIElementTypeAny[ˋ(label CONTAINS "a" AND NOT (label CONTAINS "b"))ˋ]` |
| D07 | `//XCUIElementTypeButton[not(@name="a")]` | GAP | 11/11 | `**/XCUIElementTypeButton[ˋNOT (name == "a")ˋ]` |
| C09 | `//*[@label=concat("a","b")]` | GAP | 10/11 | `**/XCUIElementTypeAny[ˋlabel == "ab"ˋ]` |
| X07 | `//*[self::XCUIElementTypeButton or self::XCUIElementTypeStaticText]` | GAP | 10/11 | `**/XCUIElementTypeAny[ˋtype == "XCUIElementTypeButton" OR type == "XCUIElementTypeStaticText"ˋ]` |
| A12 | `.//XCUIElementTypeButton[@name="a"]` | GAP | 10/11 | `**/XCUIElementTypeButton[ˋname == "a"ˋ]` |
| A07 | `/XCUIElementTypeApplication/XCUIElementTypeWindow/XCUIElementTypeButton` | DRIFT | 10/11 | `XCUIElementTypeWindow/XCUIElementTypeButton` |
| B16 | `//XCUIElementTypeButton[@enabled=true()]` | DRIFT | 8/11 | `**/XCUIElementTypeButton` |
| X04 | `//XCUIElementTypeButton[@name="a"] \| //XCUIElementTypeButton[@name="b"]` | GAP | 7/11 | `**/XCUIElementTypeButton[ˋname == "a" OR name == "b"ˋ]` |
| X05 | `//XCUIElementTypeButton[@name="a"] \| //XCUIElementTypeStaticText[@name="b"]` | GAP | 7/11 | `**/XCUIElementTypeAny[ˋ(type == "XCUIElementTypeButton" AND name == "a") OR (type == "XCUIElementTypeStaticText" AND name == "b")ˋ]` |
| L355 | `//*[@name="Veg monuw"] \| //*[@name="LipohUgicolu.codid"]` | GAP | 7/11 | `**/XCUIElementTypeAny[ˋname == "Veg monuw" OR name == "LipohUgicolu.codid"ˋ]` |
| L461 | `//*[@label="Vq1 Vq2"] \| //*[@label="Nodeg: Vq1"]` | GAP | 7/11 | `**/XCUIElementTypeAny[ˋlabel == "Vq1 Vq2" OR label == "Nodeg: Vq1"ˋ]` |
| C07 | `//XCUIElementTypeButton[string-length(@label)>3]` | GAP | 7/11 | `**/XCUIElementTypeButton[ˋlabel.length > 3ˋ]` |
| L455 | `//*[@name="Fej bihi tete Vq1, jeb t fej bihi" and @accessible="true"]\|//*[@name="Bihi Vq1" and @accessible="true"]` | GAP | 6/11 | `**/*[ˋ(name == "Fej bihi tete Vq1, jeb t fej bihi" AND accessible == 1) OR (name == "Bihi Vq1" AND accessible == 1)ˋ]` |
| F04 | `//XCUIElementTypeCell[descendant::XCUIElementTypeButton]` | GAP | 6/11 | `**/XCUIElementTypeCell[$type == "XCUIElementTypeButton"$]` |
| H04 | `//*[matches(@name,"ab","i")]` | GAP | 5/11 | `**/XCUIElementTypeAny[ˋname CONTAINS[c] "ab"ˋ]` |
| H05 | `//*[lower-case(@label)="ab"]` | GAP | 5/11 | `**/XCUIElementTypeAny[ˋlabel ==[c] "ab"ˋ]` |
| H03 | `//*[matches(@name,"b")]` | GAP | 5/11 | `**/XCUIElementTypeAny[ˋname CONTAINS "b"ˋ]` |
| H06 | `//*[contains(upper-case(@label),"AB")]` | GAP | 5/11 | `**/XCUIElementTypeAny[ˋlabel CONTAINS[c] "AB"ˋ]` |
| H02 | `//*[matches(@name,"^a.c$")]` | GAP | 5/11 | `**/XCUIElementTypeAny[ˋname MATCHES "a.c"ˋ]` |
| C06 | `//*[normalize-space(@label)="a b"]` | GAP | 4/11 | `**/*[ˋlabel MATCHES "\\s*a\\s+b\\s*"ˋ]` |
| H07 | `//*[replace(@label,"a","b")="bb"]` | CORRECT-SKIP | 3/11 | `**/XCUIElementTypeAny[ˋlabel MATCHES "[ab]{2}"ˋ]` |
| G04 | `//*[@label="aˋb"]` | GAP | 3/11 | `**/*[ˋlabel == "aˋˋb"ˋ]` |
| R01 | `//XCUIElementTypeButton[@name="x"]/ancestor::XCUIElementTypeCell` | GAP | 3/11 | `**/XCUIElementTypeCell[$type == "XCUIElementTypeButton" AND name == "x"$]` |

### Where the converter is right and a model is not (55 cases)

| Case | XPath | Converter | Cells wrong / invalid / gap | Cells |
|---|---|---|---|---|
| L119 | `//XCUIElementTypeStaticText[@name="19, Juzo Kabih\nJomojab, FI16 7TE"]` | CORRECT | 0 / 10 / 1 | haiku/low, haiku/medium, haiku/high, haiku/max, sonnet/low, sonnet/medium, sonnet/high, sonnet/max, opus/low, opus/medium, opus/high |
| G05 | `//*[@label="a\nb"]` | CORRECT | 0 / 10 / 1 | haiku/low, haiku/medium, haiku/high, haiku/max, sonnet/low, sonnet/medium, sonnet/high, sonnet/max, opus/low, opus/medium, opus/high |
| B03 | `//XCUIElementTypeButton[@value>5]` | CORRECT | 0 / 0 / 11 | haiku/low, haiku/medium, haiku/high, haiku/max, sonnet/low, sonnet/medium, sonnet/high, sonnet/max, opus/low, opus/medium, opus/high |
| B11 | `//*[@index="1"]` | CORRECT | 0 / 0 / 10 | haiku/low, haiku/medium, haiku/high, haiku/max, sonnet/low, sonnet/medium, sonnet/high, opus/low, opus/medium, opus/high |
| A04 | `//XCUIElementTypeAny[@name="a"]` | CORRECT | 0 / 0 / 10 | haiku/medium, haiku/high, haiku/max, sonnet/low, sonnet/medium, sonnet/high, sonnet/max, opus/low, opus/medium, opus/high |
| B04 | `//XCUIElementTypeButton[@x>60]` | CORRECT | 0 / 0 / 10 | haiku/low, haiku/medium, haiku/high, haiku/max, sonnet/low, sonnet/medium, sonnet/high, sonnet/max, opus/low, opus/medium |
| L162 | `(//XCUIElementTypeStaticText[@name="Romor wepes je robo\n7393"])[1]` | DRIFT | 0 / 9 / 0 | haiku/low, haiku/high, sonnet/low, sonnet/medium, sonnet/high, sonnet/max, opus/low, opus/medium, opus/high |
| L012 | `(//XCUIElementTypeStaticText/child::XCUIElementTypeStaticText[1])[1]` | CORRECT | 0 / 0 / 7 | haiku/low, haiku/medium, haiku/high, haiku/max, sonnet/low, sonnet/medium, sonnet/high |
| B02 | `//XCUIElementTypeButton[@label!="a"]` | CORRECT | 7 / 0 / 0 | haiku/low, haiku/medium, haiku/high, haiku/max, sonnet/low, sonnet/medium, sonnet/high |
| F08 | `//XCUIElementTypeCell[@name="a"][.//XCUIElementTypeButton]` | CORRECT | 0 / 0 / 5 | haiku/low, haiku/medium, haiku/high, haiku/max, sonnet/low |
| F01 | `//XCUIElementTypeCell[.//XCUIElementTypeButton[@name="x"]]` | CORRECT | 0 / 0 / 5 | haiku/low, haiku/medium, haiku/high, haiku/max, sonnet/low |
| H01 | `//*[ends-with(@name,"ab")]` | CORRECT | 0 / 0 / 5 | haiku/high, haiku/max, opus/low, opus/medium, opus/high |
| F07 | `//XCUIElementTypeTable/XCUIElementTypeCell[.//XCUIElementTypeStaticText[@label="x"]]/XCUIElementTypeButton` | CORRECT | 0 / 0 / 5 | haiku/low, haiku/medium, haiku/high, haiku/max, sonnet/low |
| B10 | `//XCUIElementTypeButton[@name]` | CORRECT | 1 / 0 / 3 | haiku/low, haiku/medium, haiku/max, sonnet/low |
| B14 | `//XCUIElementTypeButton[@hittable="true"]` | CORRECT | 0 / 0 / 4 | haiku/low, haiku/medium, haiku/high, haiku/max |
| G12 | `//*[@label="C:\dir"]` | CORRECT | 0 / 0 / 4 | haiku/high, haiku/max, sonnet/low, sonnet/high |
| B17 | `//XCUIElementTypeButton[@accessible="true" and @enabled="false"]` | CORRECT | 0 / 0 / 3 | haiku/low, haiku/medium, haiku/high |
| B15 | `//XCUIElementTypeTextField[@placeholderValue="a"]` | CORRECT | 0 / 0 / 3 | haiku/low, haiku/medium, haiku/high |
| B16 | `//XCUIElementTypeButton[@enabled=true()]` | DRIFT | 0 / 0 / 2 | haiku/low, sonnet/medium |
| A08 | `/XCUIElementTypeApplication/XCUIElementTypeWindow[1]/XCUIElementTypeOther[1]/XCUIElementTypeButton[2]` | CORRECT | 0 / 1 / 1 | haiku/low, haiku/max |
| E14 | `(//XCUIElementTypeCell)[1]` | DRIFT | 0 / 1 / 0 | haiku/low |
| L070 | `(//XCUIElementTypeButton[@name="ZejizasAgal.giselolIpefov"])[2]` | DRIFT | 1 / 0 / 0 | haiku/low |
| L258 | `(//XCUIElementTypeButton[contains(@name, "Dobe teg")])[1]` | DRIFT | 0 / 1 / 0 | haiku/low |
| L471 | `(//XCUIElementTypeButton[@name="LohenobEcohazoLasi.sewanecAbifub"])[1]` | DRIFT | 0 / 1 / 0 | haiku/low |
| L572 | `(//XCUIElementTypeButton[@name="WefaniBedufeDanu.gotePebazoh"])[1]` | DRIFT | 0 / 1 / 0 | haiku/low |
| E10 | `(//XCUIElementTypeButton[@name="a"])[2]` | DRIFT | 1 / 0 / 0 | haiku/low |
| L565 | `(//XCUIElementTypeOther[@name="hilubodamo, lulik gusuri"])[2]` | DRIFT | 1 / 0 / 0 | haiku/low |
| L062 | `(//XCUIElementTypeButton[@name="HosidoLitokazajiCimo.noraSefili"])[1]` | DRIFT | 0 / 1 / 0 | haiku/low |
| L573 | `(//XCUIElementTypeButton[@name="WefaniBedufeDanu.gotePebazoh"])[2]` | DRIFT | 1 / 0 / 0 | haiku/low |
| L556 | `//*[@name="VavepaGomudatepUvepajImar.lawupe(Vq1)"]/child::*[1]` | DRIFT | 0 / 1 / 0 | haiku/low |
| L451 | `(//*[@name="Woj, ge sefasi zad t jivuho bihi, Nepureze, hilubodamo"])[2]` | DRIFT | 1 / 0 / 0 | haiku/low |
| L407 | `(//XCUIElementTypeButton[@label="Dobe Dubow teg £2.00"])[2]` | DRIFT | 1 / 0 / 0 | haiku/low |
| L396 | `(//XCUIElementTypeButton[@name="taka_vawotub_giwap"])[3]` | DRIFT | 1 / 0 / 0 | haiku/low |
| L498 | `(//XCUIElementTypeButton[@name="HosidoLitokazajiCimo.dijivOdozev"])[3]` | DRIFT | 1 / 0 / 0 | haiku/low |
| L171 | `(//*[contains(@name, "Vq1")])[2]` | DRIFT | 1 / 0 / 0 | haiku/low |
| L207 | `(//XCUIElementTypeStaticText[@name="Hicepe"])[2]` | DRIFT | 1 / 0 / 0 | haiku/low |
| L182 | `(//XCUIElementTypeOther[@name="Luvuce tuve nowam"])[2]` | DRIFT | 1 / 0 / 0 | haiku/low |
| L428 | `(//XCUIElementTypeOther[@name=", Nepureze, hilubodamo"])[1]` | DRIFT | 0 / 1 / 0 | haiku/low |
| E09 | `(//XCUIElementTypeButton[@name="a"])[2]` | DRIFT | 1 / 0 / 0 | haiku/low |
| L566 | `(//XCUIElementTypeOther[@name="hilubodamo, lulik gusuri"])[3]` | DRIFT | 1 / 0 / 0 | haiku/low |
| L567 | `(//XCUIElementTypeOther[@name="hilubodamo, lulik gusuri"])[2]` | DRIFT | 1 / 0 / 0 | haiku/low |
| L310 | `(//XCUIElementTypeLink[@name="Bemat roki"])[2]` | DRIFT | 1 / 0 / 0 | haiku/low |
| L208 | `(//XCUIElementTypeStaticText[@name="Hero"])[2]` | DRIFT | 1 / 0 / 0 | haiku/low |
| G11 | `(//*[@label="a)b"])[2]` | DRIFT | 1 / 0 / 0 | haiku/low |
| L234 | `(//XCUIElementTypeButton[@name="LunaseMinihEsak.vosuzAnomeMevoja"])[2]` | DRIFT | 1 / 0 / 0 | haiku/low |
| E03 | `(//XCUIElementTypeButton[@name="a"])[1]` | DRIFT | 0 / 1 / 0 | haiku/low |
| L081 | `(//XCUIElementTypeButton[@label="Taka"])[1]` | DRIFT | 0 / 1 / 0 | haiku/low |
| L082 | `(//XCUIElementTypeButton[@name="HosidoLitokazajiCimo.dijivOdozev"])[1]` | DRIFT | 0 / 1 / 0 | haiku/low |
| L177 | `(//XCUIElementTypeStaticText[@name="Vilokor"])[3]` | DRIFT | 1 / 0 / 0 | haiku/low |
| L382 | `(//XCUIElementTypeButton[@name="taka_vawotub_giwap"])[1]` | DRIFT | 0 / 1 / 0 | haiku/low |
| L564 | `(//XCUIElementTypeOther[@name="hilubodamo, lulik gusuri"])[1]` | DRIFT | 0 / 1 / 0 | haiku/low |
| L571 | `(//XCUIElementTypeOther[@name="Lugatej gisu zov cuba meja goz juhilibehu dom sonib, Nepureze, hilubodamo"])[2]` | DRIFT | 1 / 0 / 0 | haiku/low |
| L262 | `(//XCUIElementTypeOther[contains(@label, "Dobe teg")])[1]` | DRIFT | 0 / 1 / 0 | haiku/low |
| A07 | `/XCUIElementTypeApplication/XCUIElementTypeWindow/XCUIElementTypeButton` | DRIFT | 1 / 0 / 0 | haiku/medium |
| E02 | `(//XCUIElementTypeButton)[2]` | DRIFT | 1 / 0 / 0 | haiku/low |

### Wrong or invalid chains where the converter also has no right chain (11 cases)

| Case | XPath | Converter | Cells wrong / invalid |
|---|---|---|---|
| H09 | `//*[string-join(tokenize(@label," "),"-")="a-b"]` | CORRECT-SKIP | sonnet/low WRONG, sonnet/medium WRONG |
| L271 | `(//XCUIElementTypeStaticText[@name="Kuki pefu matumutor"])[last()]` | CORRECT-SKIP | haiku/low WRONG, haiku/medium WRONG, haiku/high WRONG, sonnet/low WRONG, sonnet/medium WRONG, sonnet/high WRONG, sonnet/max WRONG, opus/low WRONG, opus/medium WRONG, opus/high WRONG |
| F03 | `//XCUIElementTypeCell[.//*[@name="x"]]` | CORRECT-SKIP | sonnet/medium WRONG, sonnet/high WRONG, sonnet/max WRONG, opus/low WRONG, opus/medium WRONG, opus/high WRONG |
| L270 | `(//XCUIElementTypeStaticText[@name="jila_zugo"])[last()]` | CORRECT-SKIP | haiku/low WRONG, haiku/medium WRONG, haiku/high WRONG, sonnet/low WRONG, sonnet/medium WRONG, sonnet/high WRONG, sonnet/max WRONG, opus/low WRONG, opus/medium WRONG, opus/high WRONG |
| G04 | `//*[@label="aˋb"]` | GAP | sonnet/low INVALID, sonnet/high INVALID |
| E07 | `(//XCUIElementTypeButton)[position()=2]` | CORRECT-SKIP | haiku/medium WRONG, haiku/high WRONG, sonnet/low WRONG, sonnet/medium WRONG, sonnet/high WRONG, sonnet/max WRONG, opus/low WRONG, opus/medium WRONG, opus/high WRONG |
| A13 | `//XCUIElementTypeLabel[@name="a"]` | CORRECT-SKIP | haiku/low WRONG, haiku/medium WRONG, haiku/high WRONG |
| E06 | `(//XCUIElementTypeButton)[last()-1]` | CORRECT-SKIP | haiku/medium WRONG, haiku/high WRONG, sonnet/low WRONG, sonnet/medium WRONG, sonnet/high WRONG, sonnet/max WRONG, opus/low WRONG, opus/medium WRONG, opus/high WRONG |
| E05 | `(//XCUIElementTypeButton)[last()]` | CORRECT-SKIP | haiku/low WRONG, haiku/medium WRONG, haiku/high WRONG, sonnet/low WRONG, sonnet/medium WRONG, sonnet/high WRONG, sonnet/max WRONG, opus/low WRONG, opus/medium WRONG, opus/high WRONG |
| L272 | `(//XCUIElementTypeOther[contains(@label, "Lenapa gusuri")]/XCUIElementTypeStaticText)[last()]` | CORRECT-SKIP | sonnet/max WRONG, opus/low WRONG, opus/medium WRONG, opus/high WRONG |
| E11 | `(//XCUIElementTypeCell)[2]/XCUIElementTypeButton` | CORRECT-SKIP | haiku/medium WRONG, haiku/high WRONG, sonnet/low WRONG, sonnet/medium WRONG, sonnet/high WRONG, sonnet/max WRONG, opus/low WRONG, opus/medium WRONG, opus/high WRONG |
