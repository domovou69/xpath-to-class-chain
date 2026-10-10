// Harness self-test: WDA's own FBClassChainTests valid/invalid queries must parse/fail identically.
const fs = require('fs'), { execFileSync } = require('child_process');
const P = require('./paths');
const valid = [
 'XCUIElementTypeWindow/XCUIElementTypeButton','XCUIElementTypeWindow/XCUIElementTypeButton[3]/*[4]/*[5]/XCUIElementTypeAlert','*',
 '**/*/*/XCUIElementTypeButton','**/XCUIElementTypeButton/**/*','**/XCUIElementTypeButton/**/XCUIElementTypeImage','XCUIElementTypeWindow/XCUIElementTypeButton[-1]',
 "XCUIElementTypeWindow[`name == 'blabla'`]/XCUIElementTypeButton","XCUIElementTypeWindow[`name == 'blabla'`]/XCUIElementTypeButton[`value == 'blabla'`]",
 "**/XCUIElementTypeTable[`name == 'blabla'`][10]/**/XCUIElementTypeButton[`value == 'blabla'`]",
 '*[`name == "к``ири````\'лиця"`][3]/XCUIElementTypeButton[`value == "blabla"`][-1]',
 "**/XCUIElementTypeTable[$type == 'XCUIElementTypeImage' AND name == 'olala'$][`name == 'blabla'`][10]",
];
const invalid = ['/XCUIElementTypeWindow','XCUIElementTypeWindow/','XCUIElementTypeWindow//*','XCUIElementTypeWindow*/*','**','***','**/*/**','/**',
 'XCUIElementTypeWindow/**','**[1]/XCUIElementTypeWindow',"**[`name == '1'`]/XCUIElementTypeWindow",'XCUIElementTypeWindow[0]','XCUIElementTypeWindow[1][1]',
 'blabla','XCUIElementTypeWindow/blabla',' XCUIElementTypeWindow','XCUIElementTypeWindow[ 2 ]','XCUIElementTypeWindow[[2]','XCUIElementTypeWindow[2]]',
 'XCUIElementType[Window[2]]','XCUIElementTypeWindow[visible = 1]','XCUIElementTypeWindow[1][`visible = 1`]','XCUIElementTypeWindow[1] [`visible = 1`]',
 'XCUIElementTypeWindow[ `visible = 1`]','XCUIElementTypeWindow[`visible = 1][`name = "bla"`]','XCUIElementTypeWindow[`visible = 1]','XCUIElementTypeWindow[$visible = 1]',
 'XCUIElementTypeWindow[``]','XCUIElementTypeWindow[$$]','XCUIElementTypeWindow[`name = "bla```bla"`]','XCUIElementTypeWindow[$name = "bla$$$bla"$]'];
const xml = '<XCUIElementTypeApplication><XCUIElementTypeWindow/></XCUIElementTypeApplication>';
const cases = [...valid.map((c,i)=>({id:'v'+i,xml,chain:c})), ...invalid.map((c,i)=>({id:'i'+i,xml,chain:c}))];
fs.writeFileSync(P.out('selftest.json'), JSON.stringify(cases));
const out = JSON.parse(execFileSync(P.EMU, [P.out('selftest.json')]));
let bad = 0;
for (const r of out) { const isErr = !Array.isArray(r.chain); const want = r.id[0]==='i';
  if (isErr !== want) { bad++; console.log('MISMATCH', r.id, JSON.stringify(cases.find(c=>c.id===r.id).chain), JSON.stringify(r.chain)); } }
console.log(`selftest: ${out.length - bad}/${out.length} agree with FBClassChainTests`);
if (bad) process.exitCode = 1;
