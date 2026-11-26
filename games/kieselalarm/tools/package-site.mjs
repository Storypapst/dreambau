// Convert the web build and profile API into a single Cloudflare Worker for Sites.
import { build } from 'esbuild';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
if (!process.argv[2]) throw new Error('Supply the existing Sites checkout path.');
const site = resolve(process.argv[2]);
const manifestPath = join(site, '.openai/hosting.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (!manifest.project_id) throw new Error('Existing Site identity required.');
delete manifest.static;
manifest.d1 = 'DB';
const output = join(site, 'dist');
await mkdir(join(output, 'server'), {recursive:true});
await mkdir(join(output, '.openai'), {recursive:true});
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
await cp(manifestPath, join(output, '.openai/hosting.json'));
await cp(join(root, 'backend/drizzle'), join(site, 'drizzle'), {recursive:true});
await cp(join(root, 'backend/drizzle'), join(output, '.openai/drizzle'), {recursive:true});

const entry = `
import {handleProfileRequest} from "./backend/worker.mjs";
import game from "./dist/index.html";
import lab from "./prototype.html";
export default {
  async fetch(request, env) {
    const {pathname} = new URL(request.url);
    if (pathname.startsWith('/api/')) return handleProfileRequest(request, env.DB);
    if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, {status: 405, headers:{Allow:'GET, HEAD'}});
    let page;
    if (pathname === '/' || pathname === '/index.html') page = game;
    else if (pathname === '/prototype.html') page = lab;
    else return new Response(null, {status:404});
    return new Response(request.method === 'HEAD' ? null : page, {headers:{
      'Content-Type':'text/html; charset=utf-8',
      'Cache-Control':'private, no-cache',
      'X-Content-Type-Options':'nosniff'
    }});
  }
};`;
await build({
  stdin:{contents:entry, resolveDir:root, sourcefile:'kieselalarm-worker.mjs'},
  loader:{'.html':'text'}, bundle:true, minify:true, platform:'browser', format:'esm',
  target:'es2022', outfile:join(output, 'server/index.js'),
});
