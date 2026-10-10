// GFM code span whose delimiter is longer than any backtick run inside it.
module.exports = s => { const run = Math.max(0, ...(s.match(/`+/g) || []).map(r => r.length)); const d = '`'.repeat(run + 1); return `${d} ${s} ${d}`; };
