// Every shipped script, linted for names that are not defined (a typo, or a
// helper moved to another file) and names defined but never used; and the
// page script's parts (content/page*.js), which call each other through
// one-line stubs (`const goTop = (...a) => P.goTop(...a)`): every P.<name>
// called has exactly one part that provides it. A missing stub or provider
// is a ReferenceError only on the path that uses it, so the other suites
// can pass without reaching it.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { T } from '../../firefox-tools/harness/lib.mjs';

// eslint and globals are installed with the shared tools, not in this repo.
const requireTool = createRequire(path.join(T.harnessDir, 'lib.mjs'));
const { ESLint } = requireTool('eslint');
const globals = requireTool('globals');

function scripts(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = path.join(rel, e.name);
    if (e.isDirectory()) {
      if (!e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'web-ext-artifacts' && !(rel === '' && e.name === 'tests')) out.push(...scripts(dir, r));
    } else if (e.name.endsWith('.js')) out.push(r);
  }
  return out.sort();
}

const FILES = scripts(T.extDir);

T.runAsync('no undefined names, no unused ones, in any shipped script', async () => {
  const eslint = new ESLint({
    cwd: T.extDir,
    overrideConfigFile: true,
    overrideConfig: [{
      files: ['**/*.js'],
      languageOptions: {
        ecmaVersion: 2024,
        sourceType: 'script',
        globals: { ...globals.browser, ...globals.webextensions, cloneInto: 'readonly', exportFunction: 'readonly' }
      },
      rules: {
        'no-undef': 'error',
        'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
        'no-redeclare': ['error', { builtinGlobals: false }],
        'no-dupe-keys': 'error',
        'no-unreachable': 'error'
      }
    }]
  });
  const results = await eslint.lintFiles(FILES);
  const problems = results.flatMap((r) => r.messages.map((m) => `${path.relative(T.extDir, r.filePath)}:${m.line} ${m.message}`));
  T.ok(FILES.length > 20, `found ${FILES.length} scripts`);
  T.eq(problems, []);
}, 60000);

T.run('the page script\'s parts: every P.<name> called has exactly one provider', () => {
  const parts = FILES.filter((f) => /^content\/page(-[a-z]+)?\.js$/.test(f));
  T.ok(parts.length >= 9, `found ${parts.length} parts`);
  const used = new Map();
  const provided = new Map();
  const add = (m, k, f) => m.set(k, (m.get(k) || []).concat(f));
  for (const f of parts) {
    const s = fs.readFileSync(T.extFile(f), 'utf8');
    for (const m of s.matchAll(/\bP\.([A-Za-z_]+)\b(?!\s*=[^=])/g)) if (m[1] !== 'state') add(used, m[1], f);
    for (const block of s.matchAll(/Object\.assign\(P, \{([^}]*)\}\)/g)) for (const n of block[1].match(/[A-Za-z_]+/g) || []) add(provided, n, f);
    for (const m of s.matchAll(/\bP\.([A-Za-z_]+)\s*=[^=]/g)) add(provided, m[1], f);
  }
  T.eq([...used.keys()].filter((n) => !provided.has(n)).sort(), [], 'called, but no part provides it');
  T.eq([...provided].filter(([, fs2]) => fs2.length > 1).map(([n, fs2]) => `${n}: ${fs2.join(', ')}`), [], 'provided twice');
  const manifest = JSON.parse(fs.readFileSync(T.extFile('manifest.json'), 'utf8'));
  const loaded = manifest.content_scripts.flatMap((c) => c.js || []);
  T.eq(parts.filter((f) => !loaded.includes(f)), [], 'every part is in the manifest');
  const page = fs.readFileSync(T.extFile('content/page.js'), 'utf8');
  const installed = (page.match(/for \(const part of \[([^\]]*)\]\)/) || [])[1] || '';
  for (const f of parts.filter((f) => f !== 'content/page.js')) {
    const g = (fs.readFileSync(T.extFile(f), 'utf8').match(/globalThis\.(TenfootPage[A-Za-z]+) = /) || [])[1];
    T.ok(g && installed.includes(`globalThis.${g}`), `${f} (${g}) is installed by page.js`);
  }
});

await T.exit();
