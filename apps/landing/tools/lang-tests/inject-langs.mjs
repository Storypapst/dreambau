// injectLangs(page, spec) (tools/lib.mjs, spec 7.12): replace the manifest, language files, the language runtime or the page itself for
// one browser page. Tested on a tiny scratch page served by serveBuild, so that the harness is proven before any slice relies on it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, serveBuild, injectLangs } from '../lib.mjs';

const PREFIX = '/homepage-assets/';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inject-langs-'));
fs.mkdirSync(path.join(dir, 'i18n'));
fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>harness</title></head>
<body>
<p id="blind"></p>
<span class="sw" hidden><span class="dot" aria-hidden="true">·</span> <button id="lang" type="button"><span class="code">DE</span></button></span>
<script src="${PREFIX}i18n.js"></script>
<script src="${PREFIX}i18n/index.js"></script>
<script src="${PREFIX}other.js"></script>
</body></html>
`);
fs.writeFileSync(path.join(dir, 'i18n.js'), 'window.__runtime = "real";');
fs.writeFileSync(path.join(dir, 'i18n', 'index.js'), 'window.__manifest = "real";');
fs.writeFileSync(path.join(dir, 'i18n', 'de.js'), 'window.__de = "real";');
fs.writeFileSync(path.join(dir, 'other.js'), 'window.__other = "real";');

let served, browser;
test.before(async () => { served = await serveBuild({ dir, prefix: PREFIX }); browser = await launch(); });
test.after(async () => { if (browser) await browser.close(); if (served) await new Promise(res => served.server.close(res)); fs.rmSync(dir, { recursive: true, force: true }); });

// opens the scratch page with the injection; returns what the page and the harness saw
async function open(spec) {
  const page = await browser.newPage();
  const responses = [];
  page.on('response', r => responses.push({ url: new URL(r.url()).pathname, status: r.status(), type: r.headers()['content-type'] }));
  const injected = await injectLangs(page, spec);
  await page.goto(served.base + '/');
  const globals = () => page.evaluate(() => ({ runtime: window.__runtime, manifest: window.__manifest, de: window.__de, other: window.__other }));
  // what a language file inserted by script does: 'load' or 'error'
  const insert = (code) => page.evaluate(code => new Promise(res => {
    const s = document.createElement('script'); s.src = '/homepage-assets/i18n/' + code + '.js';
    s.onload = () => res('load'); s.onerror = () => res('error'); document.head.appendChild(s);
  }), code);
  return { page, injected, responses, globals, insert };
}
const urls = list => list.map(r => r.url.replace(served.base, ''));

test('with an empty spec the real files run and the live list holds the requests for i18n.js and i18n/ only, with their status', async () => {
  const t = await open({});
  try {
    assert.deepEqual(await t.globals(), { runtime: 'real', manifest: 'real', de: undefined, other: 'real' });
    assert.deepEqual(urls(t.injected.requests), [PREFIX + 'i18n.js', PREFIX + 'i18n/index.js']);   // not the page, not other.js
    assert.deepEqual(t.injected.requests.map(r => r.status), [200, 200]);
    assert.equal(await t.insert('de'), 'load');
    assert.deepEqual(urls(t.injected.requests), [PREFIX + 'i18n.js', PREFIX + 'i18n/index.js', PREFIX + 'i18n/de.js']);   // live: the file asked for later is in
    assert.equal(t.injected.requests[2].status, 200);
  } finally { await t.page.close(); }
});

test('manifest: a string replaces the file, null answers 404 typed text/html and the script does not run', async () => {
  let t = await open({ manifest: 'window.__manifest = "fake";' });
  try {
    assert.equal((await t.globals()).manifest, 'fake');
    assert.deepEqual(t.injected.requests.map(r => r.status), [200, 200]);
  } finally { await t.page.close(); }
  t = await open({ manifest: null });
  try {
    assert.equal((await t.globals()).manifest, undefined);
    assert.equal(t.injected.requests[1].status, 404);
    assert.deepEqual(t.responses.find(r => r.url === PREFIX + 'i18n/index.js'), { url: PREFIX + 'i18n/index.js', status: 404, type: 'text/html' });
  } finally { await t.page.close(); }
});

test('files: a body is the file, with the live type (no charset) and a non-ASCII text read as UTF-8 through the page charset', async () => {
  const t = await open({ files: { de: { body: 'window.__de = "ü…";' } } });
  try {
    assert.equal(await t.insert('de'), 'load');
    assert.equal((await t.globals()).de, 'ü…');
    const r = t.responses.find(x => x.url === PREFIX + 'i18n/de.js');
    assert.deepEqual([r.status, r.type], [200, 'application/javascript']);
  } finally { await t.page.close(); }
});

test('files: status 404 and a wrong type both make the script fail (the live nosniff answer), and a file that is not named stays real', async () => {
  const t = await open({ files: { ru: { status: 404 }, xx: { type: 'text/plain', body: 'window.__xx = 1;' } } });
  try {
    assert.equal(await t.insert('ru'), 'error');
    assert.equal(t.injected.requests.find(r => r.url.endsWith('/ru.js')).status, 404);
    assert.equal(await t.insert('xx'), 'error');
    assert.equal(await t.page.evaluate(() => window.__xx), undefined);
    assert.equal(await t.insert('de'), 'load');
    assert.equal((await t.globals()).de, 'real');
  } finally { await t.page.close(); }
});

test('files: delayMs holds the answer back, the real file is then passed on', async () => {
  const t = await open({ files: { de: { delayMs: 600 } } });
  try {
    const t0 = Date.now();
    assert.equal(await t.insert('de'), 'load');
    assert.ok(Date.now() - t0 >= 550, `answered after ${Date.now() - t0} ms`);
    assert.equal((await t.globals()).de, 'real');
  } finally { await t.page.close(); }
});

test('runtime: null answers 404 for i18n.js and it does not run; the other scripts still do', async () => {
  const t = await open({ runtime: null });
  try {
    assert.deepEqual(await t.globals(), { runtime: undefined, manifest: 'real', de: undefined, other: 'real' });
    assert.equal(t.injected.requests.find(r => r.url.endsWith('/i18n.js')).status, 404);
  } finally { await t.page.close(); }
});

test('runtime: anything but null or undefined is refused', async () => {
  const page = await browser.newPage();
  try { await assert.rejects(() => injectLangs(page, { runtime: 'x' }), /runtime/); } finally { await page.close(); }
});

test('page "previous": the page of the previous Release, with no #blind, no .sw and none of the two language script tags', async () => {
  const t = await open({ page: 'previous' });
  try {
    assert.deepEqual(await t.page.evaluate(() => ({ blind: !!document.getElementById('blind'), sw: !!document.querySelector('.sw'), lang: !!document.getElementById('lang'), scripts: [...document.scripts].map(s => s.getAttribute('src')) })),
      { blind: false, sw: false, lang: false, scripts: [PREFIX + 'other.js'] });
    assert.deepEqual(await t.globals(), { runtime: undefined, manifest: undefined, de: undefined, other: 'real' });
    assert.deepEqual(t.injected.requests, []);
  } finally { await t.page.close(); }
});

test('page "previous" fails loudly, with the cause, when the page no longer looks the way it expects', async () => {
  const odd = fs.mkdtempSync(path.join(os.tmpdir(), 'inject-langs-odd-'));
  const server = await serveBuild({ dir: odd, prefix: PREFIX });
  fs.writeFileSync(path.join(odd, 'index.html'), '<!doctype html><title>no blind, no switch</title><script src="' + PREFIX + 'i18n.js"></script>');
  const page = await browser.newPage();
  try {
    await injectLangs(page, { page: 'previous' });
    const res = await page.goto(server.base + '/');
    assert.equal(res.status(), 500);
    assert.match(await page.textContent('body'), /injectLangs.*previous.*#blind/s);
  } finally { await page.close(); await new Promise(res => server.server.close(res)); fs.rmSync(odd, { recursive: true, force: true }); }
});
