// Shared helpers for the headless-browser tools (screenshots, audio dump, acceptance test).
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SITE = path.join(ROOT, 'site');
const require = createRequire(import.meta.url);

export function playwright() {
  for (const p of ['playwright', path.join(ROOT, 'node_modules/playwright'), '/opt/node22/lib/node_modules/playwright']) { try { return require(p); } catch (e) { /* next */ } }
  throw new Error('playwright not found: run `npm install`');
}

// Software-rendered WebGL2 (SwiftShader) so the tools also work on machines without a GPU.
export async function launch({ autoplay = true, extra = [] } = {}) {
  const { chromium } = playwright();
  const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', ...extra];
  if (autoplay) args.push('--autoplay-policy=no-user-gesture-required');
  return chromium.launch({ headless: true, args });
}

// BASE_URL=http://localhost:8080 runs the tools against a served copy (e.g. `CSP=1 npm run serve`) instead of file://
export const pageUrl = (params = {}) => (process.env.BASE_URL ? process.env.BASE_URL.replace(/\/$/, '') + '/' : 'file://' + path.join(ROOT, process.env.PAGE || 'site/index.html')) + '?' + new URLSearchParams(params);   // PAGE=dist/index.html tests the single-file build

// Opens one production in test mode (manual clock) and waits until its music has been rendered.
export async function openProduction(browser, id, { w = 960, h = 540, q = 1, params = {}, timeout = 120000 } = {}) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const logs = [], requests = [];
  // SwiftShader reports every forced read-back ('GPU stall due to ReadPixels'); that is the harness, not the page
  page.on('console', m => { if (!/GPU stall|GL Driver Message/.test(m.text())) logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', e => logs.push('[pageerror] ' + e.message));
  page.on('request', r => requests.push(r.url()));
  await page.goto(pageUrl({ anim: id, test: 1, q, ...params }));
  await page.waitForFunction(() => window.Dream && (window.Dream.test || window.Dream.state.error), null, { timeout });
  const err = await page.evaluate(() => window.Dream.state.error);
  if (err) throw Object.assign(new Error(`production ${id} failed: ${err}\n${logs.join('\n')}`), { logs });
  const t0 = Date.now();
  await page.evaluate(() => window.Dream.test.ready);
  const audioMs = Date.now() - t0;
  return { page, logs, requests, audioMs };
}

export async function seekShot(page, t, file) {
  await page.evaluate(t => window.Dream.test.seek(t), t);
  await page.screenshot({ path: file });
}

export function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const s = argv[i];
    if (s.startsWith('--')) {
      const k = s.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      a[k] = v;
    } else a._.push(s);
  }
  return a;
}

export function mkdir(p) { fs.mkdirSync(p, { recursive: true }); return p; }

export function wavHeader(n, sr, ch = 2) {
  const b = Buffer.alloc(44), bytes = n * ch * 2;
  b.write('RIFF', 0); b.writeUInt32LE(36 + bytes, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(ch, 22); b.writeUInt32LE(sr, 24);
  b.writeUInt32LE(sr * ch * 2, 28); b.writeUInt16LE(ch * 2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(bytes, 40);
  return b;
}
