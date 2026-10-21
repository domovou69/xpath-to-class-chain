#!/usr/bin/env node
// Adds the GitHub part of the R corpus (Phase 7) to ios-locators.json from a local cache of
// downloaded test files: runs the scanner over it (dry run), anonymizes the literals and merges them
// after the production entries (L001–L573), which keep their ids and get `project` / `lang`.
// Also writes scanner-misses.json: quoted strings with an iOS type that the scanner did not pick up.
//
//   node audit/corpus/harvest.js <cacheDir>
//
// <cacheDir> holds one folder per repository, named owner__repo, with the files at their repo paths,
// and pins.txt ("owner/repo sha license" per line). The anonymization salt is kept in
// <cacheDir>/.salt and never committed. Ported from xpath-to-uiselector's audit/corpus/build.js.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const scanner = require('../../lib/scanner');
const STATUS = require('../../lib/status');

const PRODUCTION = { project: 'production-codeceptjs', lang: 'JavaScript' };

const LANG = {
  '.java': 'Java', '.kt': 'Kotlin', '.kts': 'Kotlin', '.groovy': 'Groovy', '.py': 'Python', '.cs': 'C#',
  '.js': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript', '.ts': 'TypeScript', '.tsx': 'TypeScript',
  '.rb': 'Ruby', '.php': 'PHP',
};

// ---------------------------------------------------------------------------------------------------
// Anonymization, as in the Android corpus: every letter run in a quoted value becomes a pseudo-word of
// the same length, script and case pattern, with one salted mapping for the whole harvest. Words of one
// or two letters, `true` / `false`, digits, punctuation, quotes, backslashes and interpolations are kept.
// Names outside quoted values (types, attributes, functions, axes) are XPath structure and are kept.

const KEEP = new Set(['true', 'false']);
const LATIN = { c: 'bcdfghjklmnprstvwz', v: 'aeiou' };
const CYRILLIC = { c: 'бвгджзклмнпрстфхцчш', v: 'аеиоуя' };

function makeAnonymizer(salt) {
  const map = new Map();
  const used = new Set();
  const pools = new Map();

  function hashInts(s, n) {
    const out = [];
    let i = 0;
    while (out.length < n) {
      const h = crypto.createHmac('sha256', salt).update(`${s}#${i++}`).digest();
      for (const b of h) out.push(b);
    }
    return out.slice(0, n);
  }

  function scriptOf(ch) {
    if (/[A-Za-z]/.test(ch)) return 'latin';
    if (/\p{Script=Cyrillic}/u.test(ch)) return 'cyrillic';
    return 'other';
  }

  function register(text) {
    for (const ch of text) {
      if (!/\p{L}|\p{M}/u.test(ch) || /[A-Za-z]/.test(ch) || /\p{Script=Cyrillic}/u.test(ch)) continue;
      const block = ch.codePointAt(0) >> 7;
      if (!pools.has(block)) pools.set(block, new Set());
      pools.get(block).add(ch);
    }
  }

  function pseudo(word, attempt) {
    const chars = [...word.toLowerCase()];
    const rnd = hashInts(`${word.toLowerCase()}:${attempt}`, chars.length);
    return chars.map((ch, i) => {
      const s = scriptOf(ch);
      if (s === 'latin' || s === 'cyrillic') {
        const set = s === 'latin' ? LATIN : CYRILLIC;
        const letters = i % 2 === 0 ? set.c : set.v;
        return [...letters][rnd[i] % [...letters].length];
      }
      const pool = [...(pools.get(ch.codePointAt(0) >> 7) || [ch])].sort();
      return pool[rnd[i] % pool.length];
    }).join('');
  }

  function word(w) {
    if (KEEP.has(w.toLowerCase()) || [...w].length <= 2) return w;
    const key = w.toLowerCase();
    let base = map.get(key);
    if (!base) {
      for (let attempt = 0; ; attempt++) {
        base = pseudo(w, attempt);
        if ((!used.has(base) && base !== key) || attempt >= 20) break;
      }
      map.set(key, base);
      used.add(base);
    }
    const orig = [...w];
    return [...base].map((ch, i) => (orig[i] && orig[i] !== orig[i].toLowerCase() ? ch.toUpperCase() : ch)).join('');
  }

  // ${x}, #{x} (Ruby), $x, {x} / {0} (Python, C#), %s / %d (printf).
  const INTERP = /(\$\{[^}]*\}|#\{[^}]*\}|\$[A-Za-z_]\w*|\{[A-Za-z_]?\w*\}|%[sdf]|\{\d+\})/;

  function text(value) {
    return value.split(INTERP).map((part, i) => (i % 2 ? part : part.replace(/[\p{L}\p{M}]+/gu, word))).join('');
  }

  // Values are quoted with ', ", \" or \' (Java / C# / Kotlin strings).
  const LITERAL = /(\\"(?:(?!\\")[\s\S])*\\"|\\'(?:(?!\\')[\s\S])*\\'|"[^"]*"|'[^']*')/;

  function xpath(source) {
    return source.split(LITERAL).map((part, i) => {
      if (!(i % 2)) return part;
      const q = part.startsWith('\\') ? part.slice(0, 2) : part[0];
      const inner = part.slice(q.length, part.length - q.length);
      return q + (/^XCUIElementType\w+$/.test(inner) ? inner : text(inner)) + q;
    }).join('');
  }

  return { register, xpath, text };
}

// ---------------------------------------------------------------------------------------------------
// Kinds. The harness scores `xpath`, `xpath-dynamic` and `xpath-mixed-classchain`. Literals the scanner
// takes for iOS but that are Android or web XPaths are kept with their own kind (a scanner finding),
// and are not scored.

function structure(source) {
  return source.replace(/\\?(["'])(?:(?!\1)[^\\]|\\.)*?\\?\1/g, '""');
}

function kindOf(rec) {
  if (rec.source.startsWith('-ios class chain:')) return 'class-chain';
  const s = structure(rec.source);
  const ios = /XCUIElementType|@(name|label|value|type|visible|accessible|hittable|placeholderValue)\b/.test(s);
  if (!ios && /android\.|@(text|content-desc|resource-id|class|package|checkable|checked|clickable|focusable|long-clickable|scrollable|displayed)\b/.test(s)) return 'xpath-android';
  if (!ios && /(^|\/)(input|div|span|a|button|img|li|ul|label|form|h[1-6]|html|body|p|table|tr|td)(\[|\/|$)|@(id|class|href|aria-[\w-]+|placeholder|role|data-[\w-]+)\b/.test(s)) return 'xpath-web';
  // UIAutomation types (iOS 9 and older, before XCUITest) and XPaths with no iOS signal at all
  // (text(), report XML, generic //*[contains(@{},…)]) are kept for the scanner but not scored.
  if (!ios && /(^|\/)UIA[A-Z]/.test(s)) return 'xpath-uia';
  if (!ios) return 'xpath-other';
  if (/\$\{|#\{|\$[A-Za-z_]|\{[A-Za-z_]?\w*\}|%[sdf]|\{\d+\}/.test(rec.source)) return 'xpath-dynamic';
  return 'xpath';
}

// ---------------------------------------------------------------------------------------------------
// Scanner misses: quoted strings that name an XCUIElementType and look like an XPath (start with `/`
// or `(/`, or hold a predicate or a path step) but produced no scanner record. Concatenated pieces
// ("//XCUIElementTypeCell[@name='" + x + "']") are reported too: the scanner skips them by design.

const QUOTED = /(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g;

function misses(content, seen) {
  const out = [];
  for (const m of content.matchAll(QUOTED)) {
    const s = m[2];
    if (!/XCUIElementType/.test(s) || seen.has(s)) continue;
    if (!/^\(?\//.test(s) && !/[[\]/]/.test(s)) continue; // a bare class name (By.className), not an XPath
    out.push(s);
  }
  return out;
}

function missReason(s) {
  if (/`|\$[^{]|^\*\*\//.test(s) && !/@\w/.test(s)) return 'class chain or a piece of one (not an XPath)';
  if (/^\(?\/XCUIElementTypeApplication/.test(s)) return 'absolute path (/XCUIElementTypeApplication/…)';
  if (/^\(?\/[^/]/.test(s)) return 'path piece starting with one / (appended to another string)';
  if (!/^\(?\//.test(s)) return 'piece of a concatenation or a format string';
  const open = (s.match(/\[/g) || []).length;
  const close = (s.match(/\]/g) || []).length;
  if (open !== close) return 'unbalanced brackets (concatenated XPath)';
  return 'whole XPath not picked up by the scanner';
}

// ---------------------------------------------------------------------------------------------------

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (!e.name.startsWith('.')) out.push(p);
  }
  return out;
}

function main() {
  const cacheDir = process.argv[2];
  if (!cacheDir) {
    console.error('usage: node audit/corpus/harvest.js <cacheDir>');
    process.exit(2);
  }
  const pins = fs.readFileSync(path.join(cacheDir, 'pins.txt'), 'utf8').trim().split('\n').map((l) => l.split(' '));
  const saltFile = path.join(cacheDir, '.salt');
  if (!fs.existsSync(saltFile)) fs.writeFileSync(saltFile, crypto.randomBytes(32).toString('hex'));
  const anon = makeAnonymizer(fs.readFileSync(saltFile, 'utf8').trim());

  const raw = [];
  const missed = [];
  const files = new Map(); // project → { downloaded, withLocator }
  for (const [repo] of pins) {
    const root = path.join(cacheDir, repo.replace('/', '__'));
    const tally = { downloaded: 0, withLocator: 0 };
    files.set(repo, tally);
    if (!fs.existsSync(root)) continue;
    for (const file of walk(root)) {
      tally.downloaded++;
      const records = [];
      scanner.processFile(file, {
        dryRun: true, quiet: true, rootDir: root, convert: () => ({ status: STATUS.SKIPPED_NO_CHANGE }),
      }, records, scanner.makeStats());
      const content = fs.readFileSync(file, 'utf8');
      const ext = path.extname(file).toLowerCase();
      const lang = LANG[ext] || ext.slice(1);
      for (const s of misses(content, new Set(records.map((r) => r.old)))) {
        anon.register(s);
        missed.push({ project: repo, file: path.relative(root, file), lang, source: s, reason: missReason(s) });
      }
      if (!records.length) continue;
      tally.withLocator++;
      for (const r of records) {
        anon.register(r.old);
        raw.push({
          project: repo,
          lang,
          quote: ["'", '"', '`'].find((q) => content.includes(q + r.old + q)) || '"',
          source: r.old,
          strategy: r.status === STATUS.SKIPPED_XPATH_STRATEGY ? r.reason.replace(/^xpath strategy: /, '').trim() : null,
        });
      }
    }
  }

  // One entry per (project, quote, literal), in project order then first appearance.
  const entries = new Map();
  for (const r of raw) {
    const source = anon.xpath(r.source);
    const key = `${r.project}\u0000${r.quote}\u0000${source}`;
    const e = entries.get(key);
    if (e) {
      e.count++;
      continue;
    }
    entries.set(key, { kind: kindOf({ source: r.source }), quote: r.quote, source, count: 1, project: r.project, lang: r.lang, strategy: r.strategy });
  }

  const corpusFile = path.join(__dirname, 'ios-locators.json');
  const production = JSON.parse(fs.readFileSync(corpusFile, 'utf8'))
    .filter((e) => e.id.startsWith('L'))
    .map((e) => ({ ...e, ...PRODUCTION, strategy: e.strategy ?? null }));
  const github = [...entries.values()].map((e, i) => ({ id: `G${String(i + 1).padStart(4, '0')}`, ...e }));
  fs.writeFileSync(corpusFile, JSON.stringify([...production, ...github], null, 2) + '\n');

  const missFile = path.join(__dirname, 'scanner-misses.json');
  const missEntries = new Map();
  for (const m of missed) {
    const source = anon.xpath(m.source);
    const key = `${m.project}\u0000${source}`;
    if (missEntries.has(key)) missEntries.get(key).count++;
    else missEntries.set(key, { project: m.project, file: m.file, lang: m.lang, reason: m.reason, source, count: 1 });
  }
  fs.writeFileSync(missFile, JSON.stringify([...missEntries.values()], null, 2) + '\n');

  const filesFile = path.join(__dirname, 'harvest-files.json');
  fs.writeFileSync(filesFile, JSON.stringify(Object.fromEntries(pins.map(([repo, sha, license]) => [repo, { sha, license, ...files.get(repo) }])), null, 2) + '\n');

  console.log(`${raw.length} occurrences, ${github.length} GitHub entries, ${missEntries.size} scanner misses`);
}

if (require.main === module) main();

module.exports = { makeAnonymizer, kindOf, missReason };
