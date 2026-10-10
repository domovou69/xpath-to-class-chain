// Shared locations: the repo root (converter + corpus), the output dir and the mini-WDA binary.
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const OUT = path.resolve(process.env.HARNESS_OUT || path.join(__dirname, 'out'));
const EMU = process.env.EMU || path.join(OUT, 'wdaemu');
require('fs').mkdirSync(OUT, { recursive: true });
module.exports = { ROOT, OUT, EMU, out: f => path.join(OUT, f) };
