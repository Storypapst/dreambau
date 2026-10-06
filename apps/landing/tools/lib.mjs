// Shared helpers for the headless-browser tools (screenshots, audio dump, acceptance test).
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
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
// CHROMIUM_EXECUTABLE=/path/to/chromium starts that Chromium instead of the build that Playwright pins.
export async function launch({ autoplay = true, extra = [] } = {}) {
  const { chromium } = playwright();
  const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', ...extra];
  if (autoplay) args.push('--autoplay-policy=no-user-gesture-required');
  const executablePath = process.env.CHROMIUM_EXECUTABLE;
  return chromium.launch({ headless: true, args, ...(executablePath ? { executablePath } : {}) });
}

// A stand-in for the start page of dreambau.com, serving a build directory (dist/apex or dist/apex-drafts) under the headers and the
// types that the live server sends (spec section 4, measured with curl on 2026-10-05): the page at "/", the files under the asset
// prefix, "/health"; everything else is a 404. .js is application/javascript, .html text/html, .css text/css, none with a charset
// (the page's own <meta charset="utf-8"> governs how scripts are read), and a 404 is typed text/html. It listens on a free port.
export const APEX_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'";
const LIVE_TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
export function serveBuild({ dir, prefix }) {
  const send = (res, code, body, type = 'text/html') => res.writeHead(code, {
    'content-type': type, 'content-security-policy': APEX_CSP, 'x-content-type-options': 'nosniff',
    'cache-control': 'no-store', 'referrer-policy': 'strict-origin-when-cross-origin',
  }).end(body);
  const server = http.createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { return send(res, 400, 'bad request'); }
    if (p === '/health') return send(res, 200, 'ok', 'text/plain');
    let file = null;
    if (p === '/') file = path.join(dir, 'index.html');
    else if (p.startsWith(prefix)) file = path.join(dir, p.slice(prefix.length));
    if (!file) return send(res, 404, 'not found');
    const rel = path.relative(dir, file);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return send(res, 404, 'not found');
    fs.readFile(file, (err, data) => err ? send(res, 404, 'not found') : send(res, 200, data, LIVE_TYPES[path.extname(file)] || 'application/octet-stream'));
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` })));
}

// Injecting languages into one page of a test (spec 7.12). Call it before the first navigation. The spec:
//   manifest   a string: the body that replaces i18n/index.js | null: 404 | undefined: the real file
//   files      { "<code>": { body, status, type, delayMs } }  replaces one language file, German included; only delayMs: the real file, late
//   runtime    null: i18n.js answers 404 | undefined: the real file
//   page       "previous": the page without #blind, without .sw and without the two script tags of the language mechanism, that is the
//              markup of the previous Release (FIL-10) | undefined: the real file
// Returns { requests: [ { url, status } ] }, a live list of the requests for i18n.js and for files under i18n/ (status is null until the answer is there).
// An answer made here carries the live headers: no charset, X-Content-Type-Options: nosniff, so a wrong type fails like it does on the server.
const sleep = ms => new Promise(res => setTimeout(res, ms));
const isLangUrl = u => { const p = new URL(u).pathname; return /\/i18n\.js$/.test(p) || /\/i18n\/[^/]+$/.test(p); };
const answer = (status, type, body) => ({ status, contentType: type, headers: { 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' }, body });
const notFound = () => answer(404, 'text/html', 'not found');

function previousMarkup(html) {
  const steps = [
    [/<p id="blind"[^>]*><\/p>\s*/, '#blind'],
    [/<span class="sw" hidden>[\s\S]*?<\/button>\s*<\/span>\s*/, '.sw'],
    [/<script src="[^"]*i18n\.js"><\/script>\s*/, 'the script tag of i18n.js'],
    [/<script src="[^"]*i18n\/index\.js"><\/script>\s*/, 'the script tag of i18n/index.js'],
  ];
  for (const [re, what] of steps) {
    if (!re.test(html)) throw new Error(`injectLangs: page "previous": ${what} is not in the page; it no longer looks the way this helper expects`);
    html = html.replace(re, '');
  }
  return html;
}

export async function injectLangs(page, spec = {}) {
  if (spec.runtime !== undefined && spec.runtime !== null) throw new Error('injectLangs: spec.runtime must be null (i18n.js answers 404) or undefined (the real file)');
  if (spec.page !== undefined && spec.page !== 'previous') throw new Error('injectLangs: spec.page must be "previous" or undefined');
  const requests = [], entries = new Map();
  page.on('request', r => { if (isLangUrl(r.url())) { const e = { url: r.url(), status: null }; requests.push(e); entries.set(r, e); } });
  page.on('response', r => { const e = entries.get(r.request()); if (e) e.status = r.status(); });
  const safely = fn => async route => { try { await fn(route); } catch (e) { /* the page was closed while an answer was held back */ } };

  await page.route('**/i18n/**', safely(async route => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^.*\/i18n\//, '');
    if (name === 'index.js') {
      if (spec.manifest === undefined) return route.continue();
      return route.fulfill(spec.manifest === null ? notFound() : answer(200, 'application/javascript', spec.manifest));
    }
    const f = spec.files && spec.files[name.replace(/\.js$/, '')];
    if (!f) return route.continue();
    if (f.delayMs) await sleep(f.delayMs);
    if (f.body === undefined && f.status === undefined && f.type === undefined) return route.continue();
    const status = f.status === undefined ? 200 : f.status;
    return route.fulfill(answer(status, f.type || (status === 200 ? 'application/javascript' : 'text/html'), f.body === undefined ? (status === 200 ? '' : 'not found') : f.body));
  }));
  if (spec.runtime === null) await page.route('**/i18n.js', safely(route => route.fulfill(notFound())));
  if (spec.page === 'previous') {
    await page.route(u => u.pathname === '/' || u.pathname.endsWith('/index.html'), safely(async route => {
      if (!route.request().isNavigationRequest()) return route.fallback();
      try {
        const u = new URL(route.request().url());
        const res = u.protocol === 'file:' ? null : await route.fetch();
        const body = previousMarkup(res ? await res.text() : fs.readFileSync(fileURLToPath(u), 'utf8'));
        await route.fulfill(res ? { response: res, body } : { status: 200, contentType: 'text/html', body });
      } catch (e) { await route.fulfill({ status: 500, contentType: 'text/plain', body: String(e.message) }); }
    }));
  }
  return { requests };
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
