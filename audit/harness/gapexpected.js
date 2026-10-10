// Hand-written correct chains for corpus entries the tool skips (raw source form, ${} kept).
// L270–L272 ((//X)[last()] → [-1]) were removed in Phase 2: on device [-1] counts in XCTest query
// order (breadth-first), XPath's last() in document order, so no exact chain exists (RC-D1).
module.exports = {
  L355: '-ios class chain:**/*[`name == "Veg monuw" OR name == "LipohUgicolu.codid"`]',
  L455: '-ios class chain:**/*[`(name == "Fej bihi tete ${codeNumber}, jeb t fej bihi" AND accessible == true) OR (name == "Bihi ${codeNumber}" AND accessible == true)`]',
  L461: '-ios class chain:**/*[`label == "${count} ${count == 1 ? \'winner\' : \'winners\'}" OR label == "Nodeg: ${count}"`]',
  L458: '-ios class chain:**/*[`label CONTAINS "NE Cisibosogoz Jufoz bihi" AND NOT (label CONTAINS "Bika")`]',
};
