#!/usr/bin/env node
// Phase 6, deterministic part: compares the versions in audit/upstream.json `checked` with the latest
// npm releases and collects the changes to the watched upstream files. No dependencies, Node 20+.
// Usage: node audit/upstream/check.js [--wda-base 16.10.0] [--driver-base ...] [--appium-base ...]
// (the same overrides as env WDA_BASE, DRIVER_BASE, APPIUM_BASE; empty means `checked`).
// Writes out/upstream-meta.json always and out/upstream-input.md only when a watched file changed.
// Sets the GitHub Actions output `has_input=true|false`. Exit 1 on any registry or API failure.
const fs = require('fs'), path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const OUT = process.env.UPSTREAM_OUT || path.join(ROOT, 'out');
const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, 'audit/upstream.json'), 'utf8'));
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const PATCH_LIMIT = 40000; // characters per file in the LLM input

const args = process.argv.slice(2);
const override = id => {
  const i = args.indexOf(`--${id}-base`);
  return ((i >= 0 ? args[i + 1] : process.env[`${id.toUpperCase()}_BASE`]) || '').trim().replace(/^v|^appium@/, '');
};

async function get(url) {
  const headers = { 'User-Agent': 'xpath-to-class-chain-upstream-schedule', Accept: 'application/json' };
  if (url.startsWith('https://api.github.com/')) {
    headers.Accept = 'application/vnd.github+json';
    if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GET ${url}: ${res.status} ${res.statusText} ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

const cmp = (a, b) => {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
};
const globRe = g => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$');

async function component(id, spec) {
  const base = override(id) || baseline.checked[id];
  const latest = (await get(`https://registry.npmjs.org/${spec.npm}/latest`)).version;
  const tag = v => spec.tag.replace('{version}', v);
  const r = { id, name: spec.name, repo: spec.repo, base, latest, newer: cmp(latest, base) > 0, files: [], commits: [] };
  if (!r.newer) return r;
  r.compareUrl = `https://github.com/${spec.repo}/compare/${tag(base)}...${tag(latest)}`;

  const api = `https://api.github.com/repos/${spec.repo}`, B = encodeURIComponent(tag(base)), L = encodeURIComponent(tag(latest));

  // 1. which watched files changed: blob SHAs of both trees (the compare API lists at most 300 files)
  const tree = async t => {
    const x = await get(`${api}/git/trees/${t}?recursive=1`);
    if (x.truncated) throw new Error(`${spec.repo} tree ${decodeURIComponent(t)} is truncated: watch files cannot be checked`);
    return new Map(x.tree.filter(e => e.type === 'blob').map(e => [e.path, e.sha]));
  };
  const [oldTree, newTree] = [await tree(B), await tree(L)];
  const watch = spec.files.map(f => typeof f === 'string' ? { path: f } : f);
  const watchOf = p => watch.find(w => globRe(w.path).test(p));
  const changed = [...new Set([...oldTree.keys(), ...newTree.keys()])].filter(p => watchOf(p) && oldTree.get(p) !== newTree.get(p)).sort();

  // 2. commits in the range (pages of 100) and the compare patches (first page only, 300 files max)
  let compareFiles = [];
  const commitList = [];
  for (let page = 1; ; page++) {
    const c = await get(`${api}/compare/${B}...${L}?per_page=100&page=${page}`);
    if (page === 1) { r.totalCommits = c.total_commits; compareFiles = c.files || []; }
    commitList.push(...c.commits.map(k => ({ sha: k.sha, title: k.commit.message.split('\n')[0], url: k.html_url })));
    if (c.commits.length < 100) break;
  }
  const inRange = new Map(commitList.map(k => [k.sha, k]));

  // 3. per file: the commits that touched it, and its patch (from compare, else from each commit)
  const seen = new Set();
  for (const p of changed) {
    const status = !oldTree.has(p) ? 'added' : !newTree.has(p) ? 'removed' : 'modified';
    const list = [];
    for (let page = 1; page <= 5; page++) {
      const chunk = await get(`${api}/commits?sha=${L}&path=${encodeURIComponent(p)}&per_page=100&page=${page}`);
      list.push(...chunk);
      if (chunk.length < 100 || !chunk.some(k => inRange.has(k.sha))) break;
    }
    const commits = list.filter(k => inRange.has(k.sha)).map(k => inRange.get(k.sha)).reverse();
    const cf = compareFiles.find(f => f.filename === p);
    let patch = cf && cf.patch, additions = cf ? cf.additions : 0, deletions = cf ? cf.deletions : 0, perCommit = false;
    if (!cf && status !== 'removed') {
      perCommit = true;
      const parts = [];
      for (const k of commits) {
        const f = ((await get(`${api}/commits/${k.sha}`)).files || []).find(f => f.filename === p);
        if (!f) continue;
        additions += f.additions; deletions += f.deletions;
        parts.push(f.patch ? `# commit ${k.sha.slice(0, 8)}: ${k.title}\n${f.patch}` : `# commit ${k.sha.slice(0, 8)}: ${k.title}\n# (no patch: too large)`);
      }
      patch = parts.length ? parts.join('\n') : undefined;
    }
    const w = watchOf(p);
    if (w.match && patch && !new RegExp(w.match).test(patch)) continue;
    r.files.push({ filename: p, status, additions, deletions, perCommit, commits, patch,
      url: `https://github.com/${spec.repo}/blob/${tag(status === 'removed' ? base : latest)}/${p}`,
      truncated: !patch && status !== 'removed' });
    for (const k of commits) if (!seen.has(k.sha)) { seen.add(k.sha); r.commits.push(k); }
  }
  return r;
}

function inputMd(results) {
  const L = [`# Upstream changes to analyse`, '', `Baseline: audit/upstream.json \`checked\` (${baseline.checked.date}). Generated ${new Date().toISOString()}.`, ''];
  for (const r of results) {
    L.push(`## ${r.name}: ${r.base} → ${r.latest}`, '');
    if (r.base !== baseline.checked[r.id]) L.push(`Test run: the base ${r.base} replaces \`checked\` ${baseline.checked[r.id]}; judge the whole range ${r.base} → ${r.latest}.`, '');
    if (!r.newer) { L.push('No newer release.', ''); continue; }
    L.push(`Compare: ${r.compareUrl} (${r.totalCommits} commits in total).`, '');
    if (!r.files.length) { L.push('No watched file changed.', ''); continue; }
    for (const f of r.files) {
      L.push(`### ${f.filename} (${f.status}, +${f.additions} −${f.deletions})`, '', `File: ${f.url}`, '');
      if (f.perCommit && f.patch) L.push('The compare API did not list this file (more than 300 files changed); the patch below is the change of each commit, oldest first.', '');
      L.push('Commits:', ...(f.commits.length ? f.commits.map(k => `- [${k.title}](${k.url})`) : ['- (none found by path; see the compare link)']), '');
      if (f.truncated) L.push('The compare API did not return a patch for this file (too large). Read the file at the link above.', '');
      else if (f.patch) {
        const p = f.patch.length > PATCH_LIMIT ? f.patch.slice(0, PATCH_LIMIT) : f.patch;
        if (p !== f.patch) L.push(`The patch below is cut at ${PATCH_LIMIT} characters of ${f.patch.length}; the rest is at the link above.`, '');
        L.push('```diff', p, '```', '');
      }
    }
  }
  return L.join('\n');
}

(async () => {
  const results = [];
  for (const [id, spec] of Object.entries(baseline.watch)) results.push(await component(id, spec));
  const hasInput = results.some(r => r.files.length);
  fs.mkdirSync(OUT, { recursive: true });
  const meta = { checkedDate: baseline.checked.date, components: results.map(({ commits, ...r }) =>
    ({ ...r, files: r.files.map(f => f.filename), commits: commits.map(k => k.url) })) };
  fs.writeFileSync(path.join(OUT, 'upstream-meta.json'), JSON.stringify(meta, null, 2) + '\n');
  fs.rmSync(path.join(OUT, 'upstream-input.md'), { force: true });
  for (const r of results)
    console.log(`${r.name}: ${r.base} → ${r.latest}: ${!r.newer ? 'no newer release' : r.files.length ? `${r.files.length} watched file(s) changed: ${r.files.map(f => f.filename).join(', ')}` : 'no watched file changed'}`);
  if (hasInput) {
    fs.writeFileSync(path.join(OUT, 'upstream-input.md'), inputMd(results));
    console.log(`wrote ${path.relative(ROOT, path.join(OUT, 'upstream-input.md'))}`);
  } else console.log('nothing to analyse');
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `has_input=${hasInput}\n`);
})().catch(e => { console.error(e.message); process.exit(1); });
