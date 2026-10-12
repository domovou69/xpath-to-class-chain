// Builds the runnable prompt from a rules file: the Phase 4 task paragraph, the rules, then the Phase 4 output format.
// Usage: node make-run-prompt.js prompt-v3.md prompt-v3-run.md
const fs = require('fs'), path = require('path');
const [rulesFile, outFile] = process.argv.slice(2);
const w = fs.readFileSync(path.join(__dirname, 'prompt.md'), 'utf8').split('\n\n');
const rules = fs.readFileSync(path.join(__dirname, rulesFile), 'utf8').trim();
fs.writeFileSync(path.join(__dirname, outFile), [w[0], 'The rules below describe how to convert. Where they say to reply with a chain or "SKIP: <reason>", use the output format given after them.', '--- RULES ---\n' + rules + '\n--- END OF RULES ---', ...w.slice(1)].join('\n\n'));
