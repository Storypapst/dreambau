#!/usr/bin/env node
// Single-file build: dist/index.html contains the page, the runtime and all three productions inline.
// Handy for a quick upload to any host (one file, no folders) and for previews. The multi-file site/ stays the
// reference: it loads only the production that is played (4 to 64 KB instead of all three).
//
//   node tools/bundle.mjs            (run `npm run build` first)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, SITE, mkdir } from './lib.mjs';
import { IDS } from './budget.mjs';

const inline = js => js.replace(/<\/script/gi, '<\\/script');
const ids = IDS;
let html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
const boot = '<script>window.Dream={prods:{},add:function(d){this.prods[d.id]=d}}</script>';
const prods = ids.map(id => `<script>${inline(fs.readFileSync(path.join(SITE, 'p', id + '.js'), 'utf8'))}</script>`).join('\n');
const shell = `<script>${inline(fs.readFileSync(path.join(SITE, 'shell.js'), 'utf8'))}</script>`;
if (!html.includes('<script src="shell.js"></script>')) throw new Error('index.html: shell.js script tag not found');
html = html.replace('<script src="shell.js"></script>', `${boot}\n${prods}\n${shell}`);
const out = path.join(mkdir(path.join(ROOT, 'dist')), 'index.html');
fs.writeFileSync(out, html);
console.log(`dist/index.html  ${(Buffer.byteLength(html) / 1024).toFixed(1)} KiB`);
