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
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, launch, parseArgs, mkdir, serveBuild } from './lib.mjs';

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

const external = !!process.env.BASE_URL;
const local = external ? null : await serveBuild({ dir, prefix });      // the stand-in for the start page (tools/lib.mjs): the live headers and types
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

  console.log('\n== legal pages ==');
  const rootHtml = await (await fetch(base + '/')).text();
  const legalLinks = [...new Set([...rootHtml.matchAll(/href="([^"]*(?:impressum|datenschutz)[^"]*)"/g)].map(m => m[1]))];
  check('the start page links Impressum and Datenschutz under the asset prefix', ['impressum.html', 'datenschutz.html'].every(f => legalLinks.includes(prefix + f)), legalLinks.join(' '));
  for (const href of legalLinks) {
    const r = await fetch(base + href); const t = await r.text();
    check(`${href} answers 200 with HTML, no script, no inline style`, r.status === 200 && /text\/html/.test(r.headers.get('content-type') || '') && !/<script\b|<style[\s>]|\sstyle\s*=/i.test(t), `status ${r.status}`);
  }
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
    for (const vp of [{ width: 1280, height: 720 }, { width: 960, height: 540 }, { width: 620, height: 700 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
      const page = await browser.newPage({ viewport: vp });
      const problems = [];
      page.on('console', m => { if (m.type() === 'error' && !/GPU stall|GL Driver Message/.test(m.text())) problems.push(m.text().slice(0, 160)); });
      page.on('response', r => { if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`); });
      await page.goto(`${base}/`, { waitUntil: 'load' });
      const early = await page.evaluate(() => { const f = document.getElementById('legal'), r = f && f.getBoundingClientRect(), cs = f && getComputedStyle(f);
        return f ? { visible: r.width > 0 && r.height > 0 && r.bottom <= innerHeight && cs.visibility === 'visible' && +cs.opacity >= .99, size: parseFloat(cs.fontSize), alpha: cs.color } : null; });
      // the closing line and the skip button are only shown during or after the animation; measure where they sit, not whether they are visible yet
      const boxes = await page.evaluate(() => { const box = id => { const n = document.getElementById(id); if (!n) return null; const r = n.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; };
        const links = [...document.querySelectorAll('#legal a')].map(a => { const r = a.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; });
        const hc = document.querySelector('.home-controls'), capsule = getComputedStyle(hc).position === 'fixed' ? hc.getBoundingClientRect().toJSON() : null;
        return { links, cta: document.querySelector('#cta a') && document.querySelector('#cta').getBoundingClientRect().toJSON(), skip: box('skip'), capsule, w: innerWidth }; });
      const hit = (a, b) => a && b && a.l < (b.r ?? b.right) && a.r > (b.l ?? b.left) && a.t < (b.b ?? b.bottom) && a.b > (b.t ?? b.top);
      const clash = boxes.links.filter(l => hit(l, boxes.cta) || hit(l, boxes.skip) || hit(l, boxes.capsule) || l.l < 0 || l.r > boxes.w);
      check(`${vp.width}x${vp.height}: legal footer visible at once, 14 px or more, opaque enough`, !!early && early.visible && early.size >= 14, JSON.stringify(early));
      check(`${vp.width}x${vp.height}: legal links do not overlap the closing line, the skip button or the control capsule`, clash.length === 0, JSON.stringify(boxes));
      check(`${vp.width}x${vp.height}: links tappable (44 px)`, boxes.links.every(l => l.b - l.t >= 44), JSON.stringify(boxes.links));
      await page.screenshot({ path: path.join(ROOT, `dist/apex-check/home-${vp.width}.png`) });
      await page.click('#legal a[href$="impressum.html"]');
      await page.waitForLoadState('load');
      const imp = await page.evaluate(() => ({ h1: document.querySelector('h1') && document.querySelector('h1').textContent, bg: getComputedStyle(document.documentElement).backgroundColor, back: !!document.querySelector('a.back[href="/"]') }));
      check(`${vp.width}x${vp.height}: Impressum opens styled, with a way back`, imp.h1 === 'Impressum' && imp.bg === 'rgb(6, 8, 13)' && imp.back, JSON.stringify(imp));
      await page.screenshot({ path: path.join(ROOT, `dist/apex-check/impressum-${vp.width}.png`), fullPage: true });
      await page.click('.foot a[href="datenschutz.html"]');
      await page.waitForLoadState('load');
      check(`${vp.width}x${vp.height}: Datenschutz opens from the Impressum footer`, (await page.locator('h1').textContent()) === 'Datenschutz');
      check(`${vp.width}x${vp.height}: no console error or HTTP error on the legal path`, problems.length === 0, [...new Set(problems)].join(' | '));
      await page.close();
    }
  } finally { await browser.close(); }
} finally { if (local) local.server.close(); }

console.log(failed ? `\napex-check: ${failed} check(s) failed` : '\napex-check: all checks passed');
process.exit(failed ? 1 : 0);
