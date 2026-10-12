// Hand-written correct chains for corpus entries the tool skips (raw source form, ${} kept).
// L270–L272 ((//X)[last()] → [-1]) were removed in Phase 2 (RC-D1: no exact chain); since Phase 5 C2
// the converter emits [-1] and build.js scores them as documented DRIFT.
module.exports = {
  L355: '-ios class chain:**/*[`name == "Veg monuw" OR name == "LipohUgicolu.codid"`]',
  L455: '-ios class chain:**/*[`(name == "Fej bihi tete ${codeNumber}, jeb t fej bihi" AND accessible == true) OR (name == "Bihi ${codeNumber}" AND accessible == true)`]',
  L461: '-ios class chain:**/*[`label == "${count} ${count == 1 ? \'winner\' : \'winners\'}" OR label == "Nodeg: ${count}"`]',
  L458: '-ios class chain:**/*[`label CONTAINS "NE Cisibosogoz Jufoz bihi" AND NOT (label CONTAINS "Bika")`]',
};
