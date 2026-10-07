#!/usr/bin/env node
// Builds the variant of the page that the start page of dreambau.com can serve.
//
// The start page is delivered by an nginx container that answers only "/" and one asset prefix, under a policy without inline
// styles (docs/NEXT-STEPS.md, section 4.5). The source in site/ stays as it is; this script
//   - moves the two inline <style> blocks of index.html into files (style.css, noscript.css),
//   - points the stylesheets and the three scripts (i18n.js, i18n/index.js, shell.js) at the asset prefix,
//   - lets the runtime load the productions from where it was loaded itself instead of relative to the page,
//   - writes the languages: i18n.js, the manifest in its published form (German and the offered languages, no "o") and their files.
// It fails instead of guessing when index.html or shell.js no longer look the way it expects.
//
//   node tools/build-apex.mjs [--assets /homepage-assets/] [--out dist/apex] [--drafts]
//
// --drafts (only with --out, only for tests, never published): the manifest in its source form and every file of site/i18n/, drafts included.
//
// Output: <out>/ (what the server serves: index.html, style.css, noscript.css, shell.js, i18n.js, i18n/index.js, i18n/<code>.js, p/<id>.js)
// and <out>.json (prefix, productions, languages, size and sha256 of every file; the deploy checks the files on the server against it).
// The result depends only on site/, so building twice gives identical bytes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, SITE, parseArgs } from './lib.mjs';
import { parseManifest, publishedManifest } from './lib-languages.mjs';
import { checkLanguages } from './check-languages.mjs';

const fail = msg => { console.error('build-apex: ' + msg); process.exit(1); };
const a = parseArgs(process.argv.slice(2));
const prefix = typeof a.assets === 'string' ? a.assets : '/homepage-assets/';
if (!/^\/[A-Za-z0-9._~-]+(\/[A-Za-z0-9._~-]+)*\/$/.test(prefix)) fail(`--assets must look like /name/ (got ${JSON.stringify(prefix)})`);
const distRoot = path.join(ROOT, 'dist');
const out = path.resolve(ROOT, typeof a.out === 'string' ? a.out : 'dist/apex');
if (!out.startsWith(distRoot + path.sep)) fail(`--out must be inside ${distRoot} (it is emptied first)`);
const drafts = !!a.drafts;
if (drafts && typeof a.out !== 'string') fail('--drafts needs --out: the drafts form is never written to the folder that is published');

const read = rel => fs.readFileSync(path.join(SITE, rel), 'utf8');
const count = (s, needle) => s.split(needle).length - 1;
const once = (s, needle, what) => { const n = count(s, needle); if (n !== 1) fail(`${what}: expected exactly one match, found ${n}`); };
const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');

// --- index.html: no inline style, no inline script, everything under the prefix
let html = read('index.html');
const takeBlock = (re, what) => {
  const found = [...html.matchAll(re)];
  if (found.length !== 1) fail(`index.html: expected exactly one ${what}, found ${found.length}`);
  html = html.replace(found[0][0], () => '\u0000');          // placeholder, filled below
  return found[0][1].trim() + '\n';
};
const noscriptCss = takeBlock(/<noscript><style>([\s\S]*?)<\/style><\/noscript>/g, '<noscript><style> block');
html = html.replace('\u0000', () => `<noscript><link rel="stylesheet" href="${prefix}noscript.css"></noscript>`);
const styleCss = takeBlock(/<style>([\s\S]*?)<\/style>/g, '<style> block');
html = html.replace('\u0000', () => `<link rel="stylesheet" href="${prefix}style.css">`);
for (const src of ['i18n.js', 'i18n/index.js', 'shell.js']) {
  once(html, `<script src="${src}"></script>`, `index.html: the script tag of ${src}`);
  html = html.replace(`<script src="${src}"></script>`, () => `<script src="${prefix}${src}"></script>`);
}
for (const [re, what] of [[/<style[\s>]/i, 'an inline <style>'], [/\sstyle\s*=/i, 'a style attribute'], [/\son[a-z]+\s*=/i, 'an event handler attribute'],
                          [/<script(?![^>]*\ssrc=)[^>]*>/i, 'an inline <script>']]) {
  if (re.test(html)) fail(`index.html still contains ${what}; the policy of the start page forbids it`);
}

// --- shell.js: productions are loaded relative to the script, not to the page
let shell = read('shell.js');
const anchorTop = "(() => {\n'use strict';\n";
const anchorLoad = 's.src = `p/${id}.js`;';
once(shell, anchorTop, 'shell.js: the start of the runtime');
once(shell, anchorLoad, 'shell.js: the line that loads a production');
shell = shell.replace(anchorTop, () => anchorTop + "const BASE = document.currentScript && document.currentScript.src ? document.currentScript.src.replace(/[^/]*$/, '') : '';   // apex build: where this script came from\n");
shell = shell.replace(anchorLoad, () => 's.src = `${BASE}p/${id}.js`;');
const ids = (shell.match(/D\.ids\s*=\s*\[([^\]]*)\]/) || [])[1];
if (!ids) fail('shell.js: cannot read D.ids');
const productions = [...ids.matchAll(/'([A-Za-z0-9]+)'/g)].map(m => m[1]);
if (!productions.length) fail('shell.js: D.ids is empty');

// --- the languages: the manifest in its published form (German and the offered languages) and the file of each; the drafts form has every row and every file
let manifestText, languages, langFiles;
try {
  const source = read('i18n/index.js');
  manifestText = drafts ? source : publishedManifest(parseManifest(source));
  languages = parseManifest(manifestText).langs.map(l => l.c);
  langFiles = drafts ? fs.readdirSync(path.join(SITE, 'i18n')).filter(f => f.endsWith('.js') && f !== 'index.js').sort() : languages.map(c => c + '.js');
} catch (e) { fail('site/i18n/index.js: ' + e.message); }
for (const f of langFiles) if (!fs.existsSync(path.join(SITE, 'i18n', f))) fail(`site/i18n/${f} is missing, but the manifest names it`);

if (!drafts) {
 const checked = checkLanguages(ROOT, { release: true });
 const problems = checked.problems.filter(p => !p.startsWith('FAIL R5 ') && !p.includes('dist/apex/index.html'));
 if (problems.length) fail(problems.join('\n'));
}
// --- write
const files = new Map([['index.html', html], ['style.css', styleCss], ['noscript.css', noscriptCss], ['shell.js', shell], ['i18n.js', read('i18n.js')], ['i18n/index.js', manifestText]]);
for (const f of langFiles) files.set('i18n/' + f, read('i18n/' + f));
for (const id of productions) {
  const f = path.join(SITE, 'p', id + '.js');
  if (!fs.existsSync(f)) fail(`site/p/${id}.js is missing: run \`npm run build\` first`);
  files.set(`p/${id}.js`, fs.readFileSync(f, 'utf8'));
}
fs.rmSync(out, { recursive: true, force: true });
const manifest = [];
for (const [rel, text] of [...files].sort(([x], [y]) => x < y ? -1 : 1)) {
  const buf = Buffer.from(text, 'utf8');
  fs.mkdirSync(path.dirname(path.join(out, rel)), { recursive: true });
  fs.writeFileSync(path.join(out, rel), buf);
  manifest.push({ path: rel, bytes: buf.length, sha256: sha(buf) });
}
const total = manifest.reduce((s, f) => s + f.bytes, 0);
fs.writeFileSync(out + '.json', JSON.stringify({ assets: prefix, productions, languages, ...(drafts ? { drafts: true } : {}), totalBytes: total, files: manifest }, null, 2) + '\n');

console.log(`apex build${drafts ? ' (drafts form, never published)' : ''}: ${manifest.length} files, ${total} bytes, assets under ${prefix}, languages ${languages.join(',')}  ->  ${path.relative(ROOT, out)}/`);
for (const f of manifest) console.log(`  ${f.path.padEnd(14)} ${String(f.bytes).padStart(6)} bytes  ${f.sha256.slice(0, 12)}`);

if (!drafts) { const checked = checkLanguages(ROOT, { release: true, buildDir: out }); if (checked.problems.length) fail(checked.problems.join('\n')); }
