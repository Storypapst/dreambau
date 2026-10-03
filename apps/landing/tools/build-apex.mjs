#!/usr/bin/env node
// Builds the variant of the page that the start page of dreambau.com can serve.
//
// The start page is delivered by an nginx pod that answers only "/" and one asset prefix, under a policy without inline
// styles (docs/NEXT-STEPS.md, section 4.5). The source in site/ stays as it is; this script
//   - moves the two inline <style> blocks of index.html into files (style.css, noscript.css),
//   - points the stylesheets and the script at the asset prefix,
//   - lets the runtime load the productions from where it was loaded itself instead of relative to the page.
// It fails instead of guessing when index.html or shell.js no longer look the way it expects.
//
//   node tools/build-apex.mjs [--assets /landing-assets/] [--out dist/apex]
//
// Output: <out>/ (what the server serves: index.html, style.css, noscript.css, shell.js, p/<id>.js) and <out>.json
// (prefix, productions, size and sha256 of every file; the deploy checks the files on the server against it).
// The result depends only on site/, so building twice gives identical bytes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, SITE, parseArgs } from './lib.mjs';

const fail = msg => { console.error('build-apex: ' + msg); process.exit(1); };
const a = parseArgs(process.argv.slice(2));
const prefix = typeof a.assets === 'string' ? a.assets : '/landing-assets/';
if (!/^\/[A-Za-z0-9._~-]+(\/[A-Za-z0-9._~-]+)*\/$/.test(prefix)) fail(`--assets must look like /name/ (got ${JSON.stringify(prefix)})`);
const distRoot = path.join(ROOT, 'dist');
const out = path.resolve(ROOT, typeof a.out === 'string' ? a.out : 'dist/apex');
if (!out.startsWith(distRoot + path.sep)) fail(`--out must be inside ${distRoot} (it is emptied first)`);

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
once(html, '<script src="shell.js"></script>', 'index.html: the shell script tag');
html = html.replace('<script src="shell.js"></script>', () => `<script src="${prefix}shell.js"></script>`);
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

// --- write
const files = new Map([['index.html', html], ['style.css', styleCss], ['noscript.css', noscriptCss], ['shell.js', shell]]);
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
fs.writeFileSync(out + '.json', JSON.stringify({ assets: prefix, productions, totalBytes: total, files: manifest }, null, 2) + '\n');

console.log(`apex build: ${manifest.length} files, ${total} bytes, assets under ${prefix}  ->  ${path.relative(ROOT, out)}/`);
for (const f of manifest) console.log(`  ${f.path.padEnd(14)} ${String(f.bytes).padStart(6)} bytes  ${f.sha256.slice(0, 12)}`);
