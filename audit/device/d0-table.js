#!/usr/bin/env node
// Phase 5 D0: summary of results-d0.json — per probe and operator: the XPath hits and what the chain adds / loses.
'use strict';
const r = require('./results-d0.json'), cases = require('./cases-d0.json');
const lab = f => f.split('|')[2];
const show = s => [...s].map(c => /[\x21-\x7e]/.test(c) ? c : 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')).join(' ');
const rows = {};
for (const c of r.cases) {
  const k = cases.find(x => x.id === c.id), cand = c.candidates[0];
  const xs = new Set(c.xpathHits.map(lab)), cs = new Set(Array.isArray(cand.hits) ? cand.hits.map(lab) : []);
  const plus = [...cs].filter(x => !xs.has(x)), minus = [...xs].filter(x => !cs.has(x));
  const probe = c.id.split('-').slice(1, -1).join('-');
  (rows[probe] = rows[probe] || {})[k.operator] = { o: cand.outcome, xs: [...xs], plus, minus, err: cand.hits.error };
}
for (const [p, ops] of Object.entries(rows)) {
  console.log('\n' + p);
  for (const [op, v] of Object.entries(ops)) console.log(`  ${op.padEnd(12)} ${v.o.padEnd(11)} xpath=[${v.xs.map(show).join(' | ')}]` + (v.plus.length ? `  chain+[${v.plus.map(show).join(' | ')}]` : '') + (v.minus.length ? `  chain-[${v.minus.map(show).join(' | ')}]` : '') + (v.err ? ' ERR ' + v.err : ''));
}
