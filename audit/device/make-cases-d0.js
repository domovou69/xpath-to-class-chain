#!/usr/bin/env node
// Phase 5 D0: cases-d0.json — each probe string against the exact-code-point XPath and the chain operators.
'use strict';
const fs = require('fs'), path = require('path');
const probes = [
  ['Q', 'Q'], ['FW-Q', 'Ｑ'], ['q', 'q'], ['FW-q', 'ｑ'], ['fi', 'fi'], ['lig-fi', 'ﬁ'],
  ['1', '1'], ['circled-1', '①'], ['s', 's'], ['long-s', 'ſ'], ['ss', 'ss'], ['sharp-s', 'ß'],
  ['k', 'k'], ['K', 'K'], ['Kelvin', 'K'], ['e', 'e'], ['e-acute-composed', 'é'], ['e-acute-decomposed', 'é'],
  ['A', 'A'], ['A-ring-composed', 'Å'], ['A-ring-decomposed', 'Å'],
];
const lit = s => `"${s}"`;
const ascLower = s => s.replace(/[A-Z]/g, c => c.toLowerCase());
const AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', az = AZ.toLowerCase();
const re = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\\\$&');   // already doubled for the chain's string escape
const cases = [];
for (const [name, p] of probes) {
  const add = (op, xpath, chain) => cases.push({ id: `D0-${name}-${op}`, screen: 'c1', xpath, verdict: 'GAP', category: 'D', variant: 'c1',
    probe: [...p].map(c => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')).join(' '), operator: op, candidates: [chain] });
  const q = lit(p), c = lit(ascLower(p));
  add('CONTAINS', `//*[contains(@label,${q})]`, `**/*[\`label CONTAINS ${q}\`]`);
  add('BEGINSWITH', `//*[starts-with(@label,${q})]`, `**/*[\`label BEGINSWITH ${q}\`]`);
  add('==', `//*[@label=${q}]`, `**/*[\`label == ${q}\`]`);
  add('CONTAINS[c]', `//*[contains(translate(@label,"${AZ}","${az}"),${c})]`, `**/*[\`label CONTAINS[c] ${q}\`]`);
  add('==[c]', `//*[translate(@label,"${AZ}","${az}")=${c}]`, `**/*[\`label ==[c] ${q}\`]`);
  add('MATCHES', `//*[contains(@label,${q})]`, `**/*[\`label MATCHES "(?s:.*)(?-s:${re(p)})(?s:.*)"\`]`);
}
fs.writeFileSync(path.join(__dirname, 'cases-d0.json'), JSON.stringify(cases, null, 1) + '\n');
console.log(cases.length, 'cases');
