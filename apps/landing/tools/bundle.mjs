#!/usr/bin/env node
// Single-file build: dist/index.html contains the page, the runtime, the languages and all three productions inline.
// Handy for a quick upload to any host (one file, no folders) and for previews. The multi-file site/ stays the
// reference: it loads only the production that is played (4 to 64 KB instead of all three).
//
// The order of the scripts: the boot script (it creates window.Dream, so it comes first), i18n.js, every language file that the published
// manifest names, the manifest in its published form (German and the offered languages, as for the apex build), the productions, shell.js.
// Every language is registered when the manifest arrives, so the page requests no language file (spec 7.11).
//
//   node tools/bundle.mjs [--out dist/index.html]            (run `npm run build` first)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, SITE, mkdir, parseArgs } from './lib.mjs';
import { IDS } from './budget.mjs';
import { parseManifest, publishedManifest } from './lib-languages.mjs';
import { checkLanguages } from './check-languages.mjs';

const checked = checkLanguages(ROOT, { release: true });
if (checked.problems.some(p => !p.startsWith('FAIL R5 ') && !p.includes('dist/apex/index.html'))) throw new Error(checked.problems.join('\n'));
const a = parseArgs(process.argv.slice(2));
const out = path.resolve(ROOT, typeof a.out === 'string' ? a.out : 'dist/index.html');
const read = rel => fs.readFileSync(path.join(SITE, rel), 'utf8');
const script = js => `<script>${js.replace(/<\/script/gi, '<\\/script')}</script>`;
const ids = IDS;
let html = read('index.html');
const boot = '<script>window.Dream={prods:{},add:function(d){this.prods[d.id]=d}}</script>';
const prods = ids.map(id => script(read(`p/${id}.js`))).join('\n');
const manifest = publishedManifest(parseManifest(read('i18n/index.js')));
const langs = parseManifest(manifest).langs.map(l => script(read(`i18n/${l.c}.js`)));
html=html.replace('<link rel="stylesheet" href="navigation.css">','<style>'+read('navigation.css')+'</style>');
html=html.replace('<script src="navigation.js"></script>',script(read('navigation.js')));
const tags = { runtime: '<script src="i18n.js"></script>', manifest: '<script src="i18n/index.js"></script>', shell: '<script src="shell.js"></script>' };
for (const tag of Object.values(tags)) if (!html.includes(tag)) throw new Error(`index.html: ${tag} not found`);
html = html.replace(tags.runtime, () => [boot, script(read('i18n.js')), ...langs].join('\n'))
  .replace(tags.manifest, () => script(manifest))
  .replace(tags.shell, () => [prods, script(read('shell.js'))].join('\n'));
mkdir(path.dirname(out));
fs.writeFileSync(out, html);
console.log(`${path.relative(ROOT, out)}  ${(Buffer.byteLength(html) / 1024).toFixed(1)} KiB`);
