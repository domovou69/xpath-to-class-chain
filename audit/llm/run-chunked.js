// Chunked variant of run.js for a model that does not finish the whole file in one request.
// Usage: node run-chunked.js <model> <effort> <size> <chunk numbers, e.g. 1 or 1,2,3 or all> [concurrency]
// Each chunk is an isolated run (as in run.js) over <size> locators of input.json; output is stream-json, so tokens
// and cost survive a stopped run. Writes out/<model>-<effort>-chunks/chunk-N.json (kept; a done chunk is skipped)
// and, when all chunks are valid, merges them into out/<model>-<effort>-c<size>.json (the format score.js reads).
const fs = require('fs'), os = require('os'), path = require('path'), { spawn, spawnSync } = require('child_process');
const MODELS = { haiku45: 'claude-haiku-4-5', sonnet46: 'claude-sonnet-4-6', sonnet5: 'claude-sonnet-5', haiku: 'claude-haiku-5-5', sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5' };
const [model, effort, sizeArg, chunksArg, concArg] = process.argv.slice(2);
if (!MODELS[model] || !effort || !sizeArg || !chunksArg) { console.error('usage: node run-chunked.js <model> <effort> <size> <1,2|all> [concurrency]'); process.exit(2); }
const size = +sizeArg, conc = +(concArg || 1), TIMEOUT_MIN = +(process.env.TIMEOUT_MIN || 10);
const CLI = process.env.CLAUDE_BIN || (() => { const ext = path.join(os.homedir(), '.vscode/extensions'); return path.join(ext, fs.readdirSync(ext).filter(d => d.startsWith('anthropic.claude-code-')).sort().pop(), 'resources/native-binary/claude'); })();
const input = JSON.parse(fs.readFileSync(path.join(__dirname, 'input.json'), 'utf8'));
const nChunks = Math.ceil(input.length / size);
const chunks = chunksArg === 'all' ? [...Array(nChunks).keys()].map(i => i + 1) : chunksArg.split(',').map(Number);
const DIR = path.join(__dirname, 'out', `${model}-${effort}-chunks`); fs.mkdirSync(DIR, { recursive: true });
const basePrompt = fs.readFileSync(path.join(__dirname, 'prompt.md'), 'utf8');
const env = Object.fromEntries(['HOME', 'USER', 'LOGNAME', 'PATH', 'SHELL', 'TMPDIR', 'LANG'].filter(k => process.env[k]).map(k => [k, process.env[k]]));

function runChunk(n) {
  return new Promise(resolve => {
    const f = path.join(DIR, `chunk-${n}.json`);
    if (fs.existsSync(f) && JSON.parse(fs.readFileSync(f, 'utf8')).valid) { console.log(`chunk ${n}: skip (done)`); return resolve(); }
    const part = input.slice((n - 1) * size, n * size), ids = part.map(x => x.id);
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'locators-'));
    fs.writeFileSync(path.join(work, 'input.json'), JSON.stringify(part, null, 1));
    // the same prompt, only the count and the output file name differ (one file per run)
    const prompt = basePrompt.replace('678 XPath', `${part.length} XPath`).replace(/If the result is too large for one file[^.]*\./, '');
    const args = ['-p', prompt, '--model', MODELS[model], '--effort', effort, '--tools', 'Read,Write', '--setting-sources', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
      '--permission-mode', 'acceptEdits', '--no-session-persistence', '--output-format', 'stream-json', '--verbose'];
    const t0 = Date.now(), msgs = {}; let result = null, buf = '', turns = 0, timedOut = false;
    const p = spawn(CLI, args, { cwd: work, env });
    const timer = setTimeout(() => { timedOut = true; p.kill('SIGTERM'); }, TIMEOUT_MIN * 60e3);
    p.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); try { const j = JSON.parse(line);
      if (j.type === 'assistant' && j.message) { msgs[j.message.id || Math.random()] = j.message.usage; turns++; }
      if (j.type === 'result') result = j; } catch { } } });
    p.on('close', code => {
      clearTimeout(timer);
      const usage = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0, thinking: 0 };
      for (const u of Object.values(msgs)) if (u) { usage.input += u.input_tokens || 0; usage.cacheWrite += u.cache_creation_input_tokens || 0; usage.cacheRead += u.cache_read_input_tokens || 0; usage.output += u.output_tokens || 0; usage.thinking += (u.output_tokens_details || {}).thinking_tokens || 0; }
      if (result && result.usage) { const u = result.usage; Object.assign(usage, { input: u.input_tokens || 0, cacheWrite: u.cache_creation_input_tokens || 0, cacheRead: u.cache_read_input_tokens || 0, output: u.output_tokens || 0, thinking: (u.output_tokens_details || {}).thinking_tokens || 0 }); } // the final result line is exact; per-message sums (stopped run) undercount output
      let output = null, error = null;
      try { output = JSON.parse(fs.readFileSync(path.join(work, 'output.json'), 'utf8')); if (!Array.isArray(output)) throw new Error('not an array'); } catch (e) { error = 'output.json: ' + e.message; }
      const got = new Set((output || []).map(x => x.id)), missing = ids.filter(i => !got.has(i));
      const valid = !error && !missing.length;
      const rec = { model, effort, chunk: n, ids: ids.length, valid, error, missing, timedOut, exitCode: code, wallMs: Date.now() - t0, turns, usage,
        costUsd: result ? result.total_cost_usd : null, files: fs.readdirSync(work).filter(x => x !== 'input.json'), output };
      fs.writeFileSync(f, JSON.stringify(rec, null, 1) + '\n'); fs.rmSync(work, { recursive: true, force: true });
      console.log(`chunk ${n}: ${valid ? 'ok' : (error || `missing ${missing.length}`)} · ${(rec.wallMs / 6e4).toFixed(1)} min · out ${usage.output} (think ${usage.thinking}) · ${rec.costUsd != null ? '$' + rec.costUsd.toFixed(2) : 'cost ?'}${timedOut ? ' TIMEOUT' : ''}`);
      resolve();
    });
  });
}
(async () => {
  const queue = [...chunks];
  await Promise.all(Array.from({ length: conc }, async () => { while (queue.length) await runChunk(queue.shift()); }));
  // merge when every chunk of the file is valid
  const recs = [...Array(nChunks).keys()].map(i => path.join(DIR, `chunk-${i + 1}.json`)).map(f => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
  const tot = { wallMs: 0, costUsd: 0, usage: { input: 0, cacheWrite: 0, cacheRead: 0, output: 0, thinking: 0 }, turns: 0 };
  recs.forEach(r => { if (!r) return; tot.wallMs += r.wallMs; tot.costUsd += r.costUsd || 0; tot.turns += r.turns; for (const k in tot.usage) tot.usage[k] += r.usage[k]; });
  console.log(`so far: ${recs.filter(r => r && r.valid).length}/${nChunks} chunks valid · ${(tot.wallMs / 6e4).toFixed(1)} min of runs · out ${tot.usage.output} (think ${tot.usage.thinking}) · $${tot.costUsd.toFixed(2)} (chunks without a result line count 0)`);
  if (recs.every(r => r && r.valid)) {
    const merged = { model, modelId: MODELS[model], effort, run: `c${size}`, chunked: size, wallMs: tot.wallMs, error: null, parts: recs.map((_, i) => `chunk-${i + 1}`),
      cli: { total_cost_usd: tot.costUsd, usage: { input_tokens: tot.usage.input, cache_creation_input_tokens: tot.usage.cacheWrite, cache_read_input_tokens: tot.usage.cacheRead, output_tokens: tot.usage.output, output_tokens_details: { thinking_tokens: tot.usage.thinking } }, num_turns: tot.turns },
      output: recs.flatMap(r => r.output) };
    const name = `${model}-${effort}-c${size}.json`; fs.writeFileSync(path.join(__dirname, 'out', name), JSON.stringify(merged, null, 1) + '\n');
    console.log(`merged out/${name}: ${merged.output.length} entries`);
  }
})();
