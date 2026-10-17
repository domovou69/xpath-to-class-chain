#!/usr/bin/env node
// Phase 6, after the LLM step: validates out/upstream-report.json and, when it says `important`,
// opens a GitHub issue (label `upstream`) unless an open one already names the same versions.
// Usage: node audit/upstream/report.js [--dry-run]   (or env DRY_RUN=true: print the issue body only)
// Env: MODEL, EFFORT (what the workflow asked for), EXECUTION_FILE (claude-code-action output,
// used to read the model that really ran). Exit 1 when the report is missing or invalid.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const OUT = process.env.UPSTREAM_OUT || path.join(ROOT, 'out');
const DRY = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';
const fail = msg => { console.error(`upstream report: ${msg}`); process.exit(1); };

const read = f => { try { return JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8')); } catch (e) { fail(`${f}: ${e.message}`); } };
const meta = read('upstream-meta.json');
const report = read('upstream-report.json');

// validate the shape the prompt asks for
const str = v => typeof v === 'string' && v.trim() !== '';
if (typeof report.important !== 'boolean') fail('`important` must be a boolean');
if (!str(report.summary)) fail('`summary` must be a non-empty string');
if (!Array.isArray(report.items)) fail('`items` must be an array');
report.items.forEach((it, i) => {
  if (!['wda', 'driver', 'appium'].includes(it.component)) fail(`items[${i}].component must be wda, driver or appium`);
  for (const k of ['change', 'impact']) if (!str(it[k])) fail(`items[${i}].${k} must be a non-empty string`);
  if (!Array.isArray(it.links) || !it.links.every(str)) fail(`items[${i}].links must be an array of strings`);
  if (typeof it.recheck !== 'boolean') fail(`items[${i}].recheck must be a boolean`);
});
const changed = meta.components.filter(c => c.files.length);
if (changed.length && !report.items.length) fail('watched files changed but `items` is empty');
// when unsure, important: any recheck item makes the report important
if (report.items.some(it => it.recheck) && !report.important) {
  console.log('an item asks for a re-check: treating the report as important');
  report.important = true;
}

// the model that really ran, from the action's execution file; else what the workflow asked for
let model = process.env.MODEL || report.model || 'unknown';
if (process.env.EXECUTION_FILE) {
  try {
    const log = JSON.parse(fs.readFileSync(process.env.EXECUTION_FILE, 'utf8'));
    const init = (Array.isArray(log) ? log : []).find(m => m.type === 'system' && m.subtype === 'init');
    if (init && init.model) model = init.model;
  } catch (e) { console.log(`execution file not read (${e.message}); model from MODEL`); }
}
const effort = process.env.EFFORT || report.effort || 'unknown';

const versions = meta.components.map(c => `${c.name} ${c.base}${c.newer ? ` → ${c.latest}` : ''}`).join(', ');
const key = meta.components.filter(c => c.newer).map(c => `${c.id}@${c.latest}`).join(' ');
const cell = s => String(s).replace(/\|/g, '\\|').replace(/\n+/g, ' ');
const NAMES = Object.fromEntries(meta.components.map(c => [c.id, c.name]));

const summaryMd = [
  `**${report.important ? 'Important' : 'Not important'}.** ${report.summary}`, '',
  `Versions: ${versions}.`, '',
  ...(report.items.length ? ['| Component | Change | Impact | Re-check | Links |', '|---|---|---|---|---|',
    ...report.items.map(it => `| ${NAMES[it.component] || it.component} | ${cell(it.change)} | ${cell(it.impact)} | ${it.recheck ? '**yes**' : 'no'} | ${it.links.map((l, i) => `[${i + 1}](${l})`).join(' ')} |`), ''] : []),
  ...meta.components.filter(c => c.compareUrl).map(c => `- ${c.name} compare: ${c.compareUrl}`), '',
  `Analysis: ${model}, effort ${effort}.`,
].join('\n');

if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Upstream schedule\n\n${summaryMd}\n`);
console.log(summaryMd);
if (!report.important) { console.log('\nnot important: no issue'); process.exit(0); }

const body = [summaryMd, '',
  '**What to do:** re-check the items marked **yes** (`audit/device` for the device run, `audit/harness/wda` for the mini-WDA self-test). ' +
  'When the converter still behaves the same, update `checked` in `audit/upstream.json` through a PR, then README "Checked with", `docs/results.md` and `audit/harness/wda/VERSION`. Close this issue.', '',
  `<!-- upstream-key: ${key} -->`].join('\n');
const title = `Upstream: ${meta.components.filter(c => c.newer).map(c => `${c.name} ${c.latest}`).join(', ')} may affect the converter`;

if (DRY) { console.log(`\n--- dry run: issue not created ---\nTitle: ${title}\n\n${body}`); process.exit(0); }

const gh = (...a) => execFileSync('gh', a, { encoding: 'utf8' });
const open = JSON.parse(gh('issue', 'list', '--label', 'upstream', '--state', 'open', '--limit', '100', '--json', 'number,body'));
const dup = open.find(i => (i.body || '').includes(`<!-- upstream-key: ${key} -->`));
if (dup) { console.log(`\nopen issue #${dup.number} already names these versions: no new issue`); process.exit(0); }
gh('label', 'create', 'upstream', '--color', 'D93F0B', '--description', 'Upstream release may affect the converter', '--force');
console.log('\n' + gh('issue', 'create', '--title', title, '--label', 'upstream', '--body', body).trim());
