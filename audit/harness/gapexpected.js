// Hand-written correct chains for corpus entries the tool skips (raw source form, ${} kept).
module.exports = {
  L270: '-ios class chain:**/XCUIElementTypeStaticText[`name == "jila_zugo"`][-1]',
  L271: '-ios class chain:**/XCUIElementTypeStaticText[`name == "Kuki pefu matumutor"`][-1]',
  L272: '-ios class chain:**/XCUIElementTypeOther[`label CONTAINS "Lenapa gusuri"`]/XCUIElementTypeStaticText[-1]',
  L355: '-ios class chain:**/*[`name == "Veg monuw" OR name == "LipohUgicolu.codid"`]',
  L455: '-ios class chain:**/*[`(name == "Fej bihi tete ${codeNumber}, jeb t fej bihi" AND accessible == true) OR (name == "Bihi ${codeNumber}" AND accessible == true)`]',
  L461: '-ios class chain:**/*[`label == "${count} ${count == 1 ? \'winner\' : \'winners\'}" OR label == "Nodeg: ${count}"`]',
  L458: '-ios class chain:**/*[`label CONTAINS "NE Cisibosogoz Jufoz bihi" AND NOT (label CONTAINS "Bika")`]',
};
