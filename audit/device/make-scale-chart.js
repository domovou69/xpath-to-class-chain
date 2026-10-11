#!/usr/bin/env node
// Phase 3 chart: time per lookup vs. elements in the tree, XPath and class chain, one panel per device.
// Reads the median-of-3-passes totals that scale.js wrote (the same numbers as the report's tables).
//
//   node make-scale-chart.js                                   → ../scale-chart.svg
//   node make-scale-chart.js sim.json device.json out.svg      other runs (e.g. your own device)
'use strict';
const fs = require('fs'), path = require('path');
const HERE = __dirname;
const [simFile, devFile, outFile] = [
  process.argv[2] || path.join(HERE, 'results-scale-ac.json'),
  process.argv[3] || path.join(HERE, 'results-scale-device.json'),
  process.argv[4] || path.join(HERE, '../scale-chart.svg'),
];
const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const series = doc => doc.loads.map(l => ({ n: l.elements, x: l.summary.xpathTotalMs / l.summary.timed, c: l.summary.chainTotalMs / l.summary.timed }));
const label = doc => doc.env.simulator ? `Simulator ${doc.env.simulator.replace(/^LocatorLab /, '')}, iOS ${doc.env.iosVersion}` : `${doc.env.model}, iOS ${doc.env.iosVersion}, USB`;
const panels = [read(simFile), read(devFile)].map(d => ({ title: label(d), pts: series(d) }));

// layout: two panels side by side, one shared y scale
const W = 840, H = 410, top = 96, bottom = 52, left = 56, gap = 96, right = 96;
const pw = (W - left - right - gap) / 2, ph = H - top - bottom;
const maxN = Math.max(...panels.flatMap(p => p.pts.map(q => q.n)));
const maxMs = Math.max(...panels.flatMap(p => p.pts.map(q => q.x)));
const yMax = Math.ceil(maxMs / 1000) * 1000, xMax = Math.ceil(maxN / 500) * 500;
const fmt = ms => ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`;
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

let body = '';
panels.forEach((p, i) => {
  const ox = left + i * (pw + gap), X = n => ox + n / xMax * pw, Y = ms => top + ph - ms / yMax * ph;
  body += `<text class="t2" x="${ox}" y="${top - 34}">${esc(p.title)}</text>\n`;
  for (let s = 0; s <= yMax; s += 1000) {
    body += `<line class="${s ? 'grid' : 'axis'}" x1="${ox}" x2="${ox + pw}" y1="${Y(s)}" y2="${Y(s)}"/>\n`;
    if (i === 0) body += `<text class="tick" x="${ox - 8}" y="${Y(s) + 4}" text-anchor="end">${s / 1000} s</text>\n`;
  }
  for (const n of [100, 500, 1000, 2000].filter(n => n <= xMax)) body += `<text class="tick" x="${X(n)}" y="${top + ph + 18}" text-anchor="middle">${n}</text>\n`;
  body += `<text class="tick" x="${ox + pw / 2}" y="${top + ph + 38}" text-anchor="middle">elements in the tree</text>\n`;
  for (const [key, cls] of [['x', 's-xpath'], ['c', 's-chain']]) {
    body += `<polyline class="line ${cls}" points="${p.pts.map(q => `${X(q.n).toFixed(1)},${Y(q[key]).toFixed(1)}`).join(' ')}"/>\n`;
    for (const q of p.pts) body += `<circle class="dot ${cls}" cx="${X(q.n).toFixed(1)}" cy="${Y(q[key]).toFixed(1)}" r="4"><title>${key === 'x' ? 'XPath' : 'class chain'}, ${q.n} elements: ${fmt(q[key])}</title></circle>\n`;
    const last = p.pts[p.pts.length - 1];
    body += `<text class="val" x="${X(last.n) + 10}" y="${Y(last[key]) + 4}">${fmt(last[key])}</text>\n`;
  }
  const sav = p.pts.map(q => (q.x - q.c) / q.x * 100);
  body += `<text class="tick" x="${ox}" y="${top - 16}">class chain ${Math.round(Math.min(...sav))}–${Math.round(Math.max(...sav))} % faster per lookup</text>\n`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Time per element lookup vs. elements in the tree, XPath and class chain, simulator and iPhone">
<title>Time per lookup vs. elements in the tree</title>
<style>
  svg { --surface: #fcfcfb; --ink: #0b0b0b; --ink2: #52514e; --muted: #898781; --grid: #e1e0d9; --axis: #c3c2b7; --xpath: #eb6834; --chain: #2a78d6; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
  @media (prefers-color-scheme: dark) { svg { --surface: #1a1a19; --ink: #ffffff; --ink2: #c3c2b7; --grid: #2c2c2a; --axis: #383835; --xpath: #d95926; --chain: #3987e5; } }
  .bg { fill: var(--surface); }
  .t1 { fill: var(--ink); font-size: 16px; font-weight: 600; }
  .t2 { fill: var(--ink); font-size: 13px; font-weight: 600; }
  .tick { fill: var(--muted); font-size: 11px; }
  .val, .leg { fill: var(--ink2); font-size: 12px; }
  .grid { stroke: var(--grid); stroke-width: 1; }
  .axis { stroke: var(--axis); stroke-width: 1; }
  .line { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
  .dot { stroke: var(--surface); stroke-width: 2; }
  .line.s-xpath { stroke: var(--xpath); } .dot.s-xpath { fill: var(--xpath); }
  .line.s-chain { stroke: var(--chain); } .dot.s-chain { fill: var(--chain); }
</style>
<rect class="bg" width="${W}" height="${H}" rx="8"/>
<text class="t1" x="${left}" y="28">Time per element lookup vs. elements in the tree</text>
<line class="line s-xpath" x1="${W - right - 196}" x2="${W - right - 180}" y1="24" y2="24"/><text class="leg" x="${W - right - 174}" y="28">XPath</text>
<line class="line s-chain" x1="${W - right - 120}" x2="${W - right - 104}" y1="24" y2="24"/><text class="leg" x="${W - right - 98}" y="28">class chain</text>
${body}</svg>
`;
fs.writeFileSync(outFile, svg);
console.log(`${outFile}: ${panels.map(p => `${p.title} (${p.pts.length} sizes)`).join('; ')}`);
