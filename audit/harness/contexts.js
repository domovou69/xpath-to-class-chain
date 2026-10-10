// Scanner contexts: runs the real CLI over a copy of audit/corpus/contexts/ and checks
// (1) every emitted chain parses in mini-WDA, (2) no rewrite lands inside an XPath-strategy call,
// (3) each rewritten file still parses in its own language. The corpus copy is never modified.
const fs = require('fs'), path = require('path'), { execFileSync, spawnSync } = require('child_process');
const { ROOT, EMU, out } = require('./paths');
const { unescapeJs, substitute } = require('./runtime');
const CLI = path.join(ROOT, 'xpath-to-class-chain.js');
const SRC = path.join(ROOT, 'audit/corpus/contexts');

const tree = out('contexts');
fs.rmSync(tree, { recursive: true, force: true });
fs.cpSync(SRC, tree, { recursive: true, filter: f => path.basename(f) !== 'expected.json' });

// (1) dry run → report (lands in the cwd) → feed every new chain to mini-WDA
execFileSync('node', [CLI, tree, '--json'], { cwd: out('.') });
const rep = JSON.parse(fs.readFileSync(out('xpath-to-class-chain.report.json'), 'utf8'));
const xml = '<XCUIElementTypeApplication name="AppRoot"><XCUIElementTypeWindow/></XCUIElementTypeApplication>';
const cases = rep.updated.map((u, i) => {
  let s = u.new; const tmpl = /\\`/.test(s);
  s = tmpl ? unescapeJs(substitute(s, new Map([['message', 'm'], ['line', '1'], ['round', '2'], ['name', 'n']]))) : unescapeJs(s);
  return { id: `${i}|${path.basename(u.file)}`, xml, chain: s.replace(/^-ios class chain:/, '') };
});
fs.writeFileSync(out('ctxcases.json'), JSON.stringify(cases));
const res = JSON.parse(execFileSync(EMU, [out('ctxcases.json')]));
const perFile = {};
for (const r of res) { const f = r.id.split('|')[1]; (perFile[f] ??= { converted: 0, parses: 0, rejected: 0 }); perFile[f].converted++; Array.isArray(r.chain) ? perFile[f].parses++ : perFile[f].rejected++; }

// (2) + (3) write mode on the copy, then inspect the rewritten files
execFileSync('node', [CLI, tree, '--write', '--quiet'], { cwd: out('.') });
const XPATH_STRATEGY = /\b(?:AppiumBy|MobileBy|By)\.(?:xpath|XPATH)\b|@iOSXCUITFindBy\s*\(\s*xpath\s*=/;
const syntax = {
  '.js': f => spawnSync('node', ['--check', f]),
  '.ts': f => spawnSync('node', ['--no-warnings', f]), // `--check` does not strip types; the fixture only defines locators, so run it
  '.py': f => spawnSync('python3', ['-c', 'import ast, sys; ast.parse(open(sys.argv[1]).read())', f]), // parse only: never writes __pycache__ next to the corpus
  '.json': f => { try { JSON.parse(fs.readFileSync(f, 'utf8')); return { status: 0 }; } catch (e) { return { status: 1, stderr: e.message }; } },
  '.java': f => spawnSync('javac', ['-d', out('javac'), f]),
};
for (const name of fs.readdirSync(tree)) {
  const f = path.join(tree, name), row = perFile[name] ??= { converted: 0, parses: 0, rejected: 0 };
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  // a rewrite on the same line as, or within 2 lines after, an XPath-strategy marker
  row.insideXpathStrategy = lines.filter((l, i) => l.includes('-ios class chain:') && lines.slice(Math.max(0, i - 2), i + 1).some(x => XPATH_STRATEGY.test(x))).length;
  const chk = syntax[path.extname(name)];
  const verdict = r => !r ? 'n/a' : r.error || /Unable to locate a Java Runtime/.test(String(r.stderr)) ? 'tool unavailable' : r.status === 0 ? 'ok' : 'fails: ' + String(r.stderr).trim().split('\n').find(l => /Error|error/.test(l))?.slice(0, 100);
  const before = verdict(chk && chk(path.join(SRC, name))), after = verdict(chk && chk(f));
  row.syntax = before === after || before !== 'ok' ? after + (before !== 'ok' && before !== 'n/a' && before !== 'tool unavailable' ? ' (original fails too)' : '') : 'BROKEN by rewrite: ' + after;
}
console.table(perFile);
for (const r of res.filter(r => !Array.isArray(r.chain))) console.log(r.id, '=>', r.chain.error.slice(0, 110).replace(/\n/g, ' '), '\n   ', cases.find(c => c.id === r.id).chain.slice(0, 120));
fs.writeFileSync(out('contexts.json'), JSON.stringify(perFile, null, 1));
