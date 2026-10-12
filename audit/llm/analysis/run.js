// Text analysis of the Phase 4 results by Opus (effort high), isolated like the conversion runs.
// Input: table.md, cross.md, errors.json from this folder. Output: analysis.md + analysis-meta.json.
const fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const CLI = process.env.CLAUDE_BIN || (() => {
  const ext = path.join(os.homedir(), '.vscode/extensions');
  const dir = fs.readdirSync(ext).filter(d => d.startsWith('anthropic.claude-code-')).sort().pop();
  return path.join(ext, dir, 'resources/native-binary/claude');
})();
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'results-'));
for (const f of ['table.md', 'cross.md', 'errors.json']) fs.copyFileSync(path.join(__dirname, f), path.join(work, f));
const env = Object.fromEntries(['HOME', 'USER', 'LOGNAME', 'PATH', 'SHELL', 'TMPDIR', 'LANG'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
const args = ['-p', fs.readFileSync(path.join(__dirname, 'prompt.md'), 'utf8'), '--model', 'claude-opus-5-5', '--effort', 'high', '--tools', 'Read,Write',
  '--setting-sources', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--permission-mode', 'acceptEdits', '--no-session-persistence', '--output-format', 'json'];
const t0 = Date.now();
const p = spawnSync(CLI, args, { cwd: work, env, encoding: 'utf8', maxBuffer: 1e9, timeout: 60 * 60e3 });
let cli = null; try { cli = JSON.parse(p.stdout); } catch { }
const md = path.join(work, 'analysis.md');
if (fs.existsSync(md)) fs.copyFileSync(md, path.join(__dirname, 'analysis.md'));
fs.writeFileSync(path.join(__dirname, 'analysis-meta.json'), JSON.stringify({ model: 'claude-opus-5-5', effort: 'high', started: new Date(t0).toISOString(), wallMs: Date.now() - t0, exitCode: p.status, cli }, null, 1) + '\n');
fs.rmSync(work, { recursive: true, force: true });
console.log(`analysis.md: ${fs.existsSync(path.join(__dirname, 'analysis.md')) ? 'written' : 'MISSING'} · ${((Date.now() - t0) / 6e4).toFixed(1)} min · $${cli && cli.total_cost_usd != null ? cli.total_cost_usd.toFixed(2) : '?'} · exit ${p.status}${cli && cli.is_error ? ' · ' + cli.result : ''}`);
