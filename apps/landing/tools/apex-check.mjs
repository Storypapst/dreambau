#!/usr/bin/env node
// Loads the apex build the way dreambau.com serves its start page and checks that every production starts.
//
//   node tools/apex-check.mjs                                  serves dist/apex itself, with the routes and the policy of the start page
//   BASE_URL=https://dreambau.com node tools/apex-check.mjs    the same checks against a running server (acceptance after the deploy)
//
// What the start page does (copied from ops/nginx.conf of Storypapst/bildungshaus, state 2026-09-07, and not read from the
// server: compare it with the live configuration before relying on it): it answers "/" with index.html, the asset prefix
// with the files of the release and /health; everything else is 404. The policy has no 'unsafe-inline' for styles.
//
// Checks: "/" and every file of the build come back with the bytes of dist/apex.json; a file that does not exist is a 404 and
// not the start page with a 200; each production reaches "ready" without a console error, a failed request, a policy violation or the
// static fallback. Screenshots go to dist/apex-check/ for a look with your own eyes.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, launch, parseArgs, mkdir } from './lib.mjs';

const APEX_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'";
const a = parseArgs(process.argv.slice(2));
const dir = path.resolve(ROOT, typeof a.dir === 'string' ? a.dir : 'dist/apex');
const manifestFile = dir + '.json';
if (!fs.existsSync(manifestFile)) { console.error(`apex-check: ${path.relative(ROOT, manifestFile)} is missing: run \`npm run build:apex\` first`); process.exit(1); }
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
const prefix = typeof a.assets === 'string' ? a.assets : manifest.assets;
const ids = typeof a.ids === 'string' ? a.ids.split(',') : manifest.productions;
const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');

let failed = 0;
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '  (' + detail + ')' : ''}`); };

// --- a stand-in for the start page
function serve() {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
  const send = (res, code, body, type = 'text/plain') => res.writeHead(code, {
    'content-type': type, 'content-security-policy': APEX_CSP, 'x-content-type-options': 'nosniff', 'cache-control': 'no-store',
  }).end(body);
  const server = http.createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { return send(res, 400, 'bad request'); }
    if (p === '/health') return send(res, 200, 'ok');
    let file = null;
    if (p === '/') file = path.join(dir, 'index.html');
    else if (p.startsWith(prefix)) file = path.join(dir, p.slice(prefix.length));
    if (!file) return send(res, 404, 'not found');
    const rel = path.relative(dir, file);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return send(res, 404, 'not found');
    fs.readFile(file, (err, data) => err ? send(res, 404, 'not found') : send(res, 200, data, types[path.extname(file)] || 'application/octet-stream'));
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` })));
}

const external = !!process.env.BASE_URL;
const local = external ? null : await serve();
const base = external ? process.env.BASE_URL.replace(/\/$/, '') : local.base;
console.log(`apex-check: ${base}  assets ${prefix}  productions ${ids.join(', ')}${external ? '' : '  (local stand-in for the start page)'}`);

try {
  console.log('\n== files ==');
  const root = await fetch(base + '/');
  const csp = root.headers.get('content-security-policy');
  check('/ answers 200 with HTML', root.status === 200 && /text\/html/.test(root.headers.get('content-type') || ''), `status ${root.status}, ${root.headers.get('content-type')}`);
  console.log(`  INFO  policy of /: ${csp || '(none)'}`);
  for (const f of manifest.files) {
    const r = await fetch(base + (f.path === 'index.html' ? '/' : prefix + f.path));
    const buf = Buffer.from(await r.arrayBuffer());
    check(`${f.path} is served unchanged`, r.status === 200 && sha(buf) === f.sha256, `status ${r.status}, ${buf.length} bytes`);
  }
  const miss = await fetch(base + prefix + 'does-not-exist.js');
  check('a missing file is a 404 (not the start page with a 200)', miss.status === 404, `status ${miss.status}, ${miss.headers.get('content-type')}`);

  console.log('\n== productions ==');
  mkdir(path.join(ROOT, 'dist/apex-check'));
  const browser = await launch();
  try {
    for (const id of ids) {
      const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
      const problems = [];
      // the graphics driver reports a forced read-back once per fresh browser ('GPU stall due to ReadPixels'); same filter as in lib.mjs
      page.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !/GPU stall|GL Driver Message/.test(m.text())) problems.push(`console.${m.type()}: ${m.text().slice(0, 160)}`); });
      page.on('pageerror', e => problems.push('pageerror: ' + String(e.message).slice(0, 160)));
      page.on('requestfailed', r => problems.push(`request failed: ${r.url()}`));
      page.on('response', r => { if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`); });
      await page.goto(`${base}/?anim=${id}`, { waitUntil: 'load' });
      const reached = await page.waitForFunction(() => { const c = document.documentElement.classList; return c.contains('ready') || c.contains('static'); }, null, { timeout: 90000 }).then(() => true, () => false);
      await page.waitForTimeout(3000);                    // a first frame that fails switches to the static page a moment later
      const s = await page.evaluate(() => {
        const c = document.getElementById('c'), cs = c && getComputedStyle(c), cl = document.documentElement.classList;
        return { ready: cl.contains('ready'), fallback: cl.contains('static'), error: window.Dream && window.Dream.state && window.Dream.state.error,
                 canvas: c ? { w: c.width, h: c.height, position: cs.position } : null, bg: getComputedStyle(document.body).backgroundColor };
      });
      await page.screenshot({ path: path.join(ROOT, `dist/apex-check/${id}.png`) });
      check(`${id}: starts (ready, no static fallback, no runtime error)`, reached && s.ready && !s.fallback && !s.error, JSON.stringify(s));
      check(`${id}: styled (canvas fixed and sized, dark page)`, !!s.canvas && s.canvas.position === 'fixed' && s.canvas.w > 0 && s.bg === 'rgb(6, 8, 13)', JSON.stringify(s.canvas) + ' ' + s.bg);
      check(`${id}: no console error, failed request, HTTP error or policy violation`, problems.length === 0, [...new Set(problems)].join(' | '));
      await page.close();
    }
  } finally { await browser.close(); }
} finally { if (local) local.server.close(); }

console.log(failed ? `\napex-check: ${failed} check(s) failed` : '\napex-check: all checks passed');
process.exit(failed ? 1 : 0);
