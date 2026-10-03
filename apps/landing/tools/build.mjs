#!/usr/bin/env node
// Builds the productions: src/p/<id>.js → site/p/<id>.js (minified, GLSL blocks compacted) and checks the size budgets.
//
//   node tools/build.mjs            all productions, minified
//   node tools/build.mjs 4k         only one
//   node tools/build.mjs --dev      keep the code readable (no minification), budgets are reported but not enforced
//
// Shader sources are written as   /*glsl*/`...`   in the production; the build compacts them (comments and
// whitespace removed) and turns them into plain strings. They must not contain ${} or backticks.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { BUDGET } from './budget.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src', 'p'), OUT = path.join(ROOT, 'site', 'p');

const require = createRequire(import.meta.url);
function esbuild() {
  try { return require('esbuild'); } catch (e) { /* fall through */ }
  for (const p of ['/opt/node22/lib/node_modules/esbuild', path.join(ROOT, 'node_modules/esbuild')]) { try { return require(p); } catch (e) { /* next */ } }
  throw new Error('esbuild not found: run `npm install` first');
}

// GLSL compaction: strip comments, collapse whitespace, keep preprocessor lines on their own line.
export function minGLSL(src) {
  src = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, '');
  const out = []; let chunk = [];
  const flush = () => {
    if (!chunk.length) return;
    const toks = chunk.join('\n').match(/[A-Za-z_]\w*|\d+\.?\d*(?:[eE][+-]?\d+)?[fFuU]?|\.\d+(?:[eE][+-]?\d+)?[fF]?|\S/g) || [];
    let s = '';
    const word = t => /^[A-Za-z0-9_]/.test(t) || /^\.\d/.test(t);
    for (let i = 0; i < toks.length; i++) {
      const p = toks[i - 1], t = toks[i];
      if (p !== undefined && ((word(p) && word(t)) || ((p === '+' || p === '-') && p === t))) s += ' ';
      s += t;
    }
    out.push(s); chunk = [];
  };
  for (const line of src.split('\n')) {
    if (/^\s*#/.test(line)) { flush(); out.push(line.trim().replace(/\s+/g, ' ')); } else chunk.push(line);
  }
  flush();
  return out.join('\n') + '\n';
}

function prepare(source, file) {
  return source.replace(/\/\*glsl\*\/\s*`([^`]*)`/g, (m, body) => {
    if (body.includes('${')) throw new Error(`${file}: ${'${'} is not allowed inside a /*glsl*/ block`);
    return JSON.stringify(minGLSL(body));
  });
}

const args = process.argv.slice(2);
const dev = args.includes('--dev');
const only = args.filter(a => !a.startsWith('--'));
const ids = only.length ? only : Object.keys(BUDGET);          // src/p/test.js (the skeleton) is only built when asked for by name
fs.mkdirSync(OUT, { recursive: true });
const es = esbuild();
let bad = 0;
const rows = [];
for (const id of ids) {
  const file = path.join(SRC, id + '.js');
  if (!fs.existsSync(file)) { console.error('missing', file); bad++; continue; }
  const code = `(()=>{${prepare(fs.readFileSync(file, 'utf8'), file)}\n})();`;
  let res;
  try {
    res = es.transformSync(code, { minify: !dev, target: 'es2020', legalComments: 'none', sourcefile: id + '.js' });
  } catch (e) { console.error(`${id}: ${e.message}`); bad++; continue; }
  const out = res.code;
  fs.writeFileSync(path.join(OUT, id + '.js'), out);
  const bytes = Buffer.byteLength(out), gz = zlib.gzipSync(out, { level: 9 }).length, budget = BUDGET[id];
  const ok = !budget || bytes <= budget;
  if (!ok && !dev) bad++;
  rows.push({ id, bytes, gz, budget, ok });
}
for (const r of rows) {
  console.log(`${r.id.padEnd(6)} ${String(r.bytes).padStart(6)} bytes  (gzip ${String(r.gz).padStart(6)})  budget ${r.budget ? String(r.budget).padStart(6) : '     -'}  ${r.budget ? Math.round(r.bytes / r.budget * 100) + '%' : ''}  ${r.ok ? 'OK' : 'OVER BUDGET'}`);
}
process.exit(bad ? 1 : 0);
