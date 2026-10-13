// One Phase 4 cycle: a model converts input.json in an empty folder outside the repository.
// Usage: node run.js <haiku|sonnet|opus|haiku45|sonnet46|sonnet5> <low|medium|high|xhigh|max> <run> [input.json]
// Writes out/<model>-<effort>-<run>.json: run metadata, the CLI's JSON result and the merged output.
const fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');

const MODELS = { haiku: 'claude-haiku-5-5', sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5', 'haiku45': 'claude-haiku-4-5', 'sonnet46': 'claude-sonnet-4-6', sonnet5: 'claude-sonnet-5' };
const [model, effort, run, inputArg] = process.argv.slice(2);
if (!MODELS[model] || !['low', 'medium', 'high', 'xhigh', 'max'].includes(effort) || !run) {
  console.error('usage: node run.js <haiku|sonnet|opus|haiku45|sonnet46|sonnet5> <low|medium|high|xhigh|max> <run> [input.json]'); process.exit(2);
}
const CLI = process.env.CLAUDE_BIN || (() => {
  const ext = path.join(os.homedir(), '.vscode/extensions');
  const dir = fs.readdirSync(ext).filter(d => d.startsWith('anthropic.claude-code-')).sort().pop();
  return path.join(ext, dir, 'resources/native-binary/claude');
})();
const TIMEOUT_MIN = +(process.env.TIMEOUT_MIN || 120);
const OUT = process.env.LLM_OUT || path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

// 1. a new empty folder outside the repository (system temp dir, neutral name) with input.json only
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'locators-'));
fs.copyFileSync(inputArg || path.join(__dirname, 'input.json'), path.join(work, 'input.json'));
const prompt = fs.readFileSync(process.env.PROMPT || path.join(__dirname, 'prompt.md'), 'utf8');

// 2. isolated run: Read + Write only, no settings/hooks/MCP from any source, no session saved.
// The parent session's environment is not inherited (CLAUDE_* variables would leak into the child).
const env = Object.fromEntries(['HOME', 'USER', 'LOGNAME', 'PATH', 'SHELL', 'TMPDIR', 'LANG'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
const args = ['-p', prompt, '--model', MODELS[model], '--effort', effort, '--tools', 'Read,Write',
  '--setting-sources', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
  '--permission-mode', 'acceptEdits', '--no-session-persistence', '--output-format', 'json'];
const t0 = Date.now(), started = new Date().toISOString();
const p = spawnSync(CLI, args, { cwd: work, env, encoding: 'utf8', maxBuffer: 1e9, timeout: TIMEOUT_MIN * 60e3 });
const wallMs = Date.now() - t0;

// 3. collect output.json or output-N.json parts; a missing or broken file is a failed run
let cli = null; try { cli = JSON.parse(p.stdout); } catch { }
const files = fs.readdirSync(work).filter(f => f !== 'input.json');
const parts = files.filter(f => /^output(-\d+)?\.json$/.test(f)).sort((a, b) => (+(a.match(/\d+/) || [0])[0]) - (+(b.match(/\d+/) || [0])[0]));
let output = null, error = null;
if (!parts.length) error = 'no output file';
else {
  output = [];
  for (const f of parts) {
    try { const j = JSON.parse(fs.readFileSync(path.join(work, f), 'utf8')); if (!Array.isArray(j)) throw new Error('not an array'); output.push(...j); }
    catch (e) { error = `${f}: ${e.message}`; output = null; break; }
  }
}
const rec = {
  model, modelId: MODELS[model], effort, run: +run, started, wallMs, cliVersion: spawnSync(CLI, ['--version'], { encoding: 'utf8' }).stdout.trim(),
  exitCode: p.status, signal: p.signal, timedOut: p.error && p.error.code === 'ETIMEDOUT', stderr: (p.stderr || '').slice(-4000),
  error, files, parts, cli: cli || { rawStdout: (p.stdout || '').slice(-4000) }, output,
};
const name = `${model}-${effort}-${run}.json`;
fs.writeFileSync(path.join(OUT, name), JSON.stringify(rec, null, 1) + '\n');
fs.rmSync(work, { recursive: true, force: true });
console.log(`${name}: ${error || `${output.length} entries`} · ${(wallMs / 60e3).toFixed(1)} min · $${cli && cli.total_cost_usd != null ? cli.total_cost_usd.toFixed(2) : '?'} · exit ${p.status}${rec.timedOut ? ' TIMEOUT' : ''}`);
