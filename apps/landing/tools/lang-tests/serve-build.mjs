// serveBuild (tools/lib.mjs): the local stand-in for the start page answers as the live server does (spec section 4, 8.2).
// The expected values are the ones measured live on 2026-10-05 and written down in the spec, not read back from the code.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { serveBuild } from '../lib.mjs';

const LIVE_POLICY = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'";
const PREFIX = '/homepage-assets/';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'serve-build-'));
fs.mkdirSync(path.join(dir, 'i18n'));
fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>x</title>');
fs.writeFileSync(path.join(dir, 'a.js'), 'window.a = 1;');
fs.writeFileSync(path.join(dir, 'style.css'), 'body { margin: 0 }');
fs.writeFileSync(path.join(dir, 'i18n', 'de.js'), 'Dream.lang("de", { "k": "ü" });');
fs.writeFileSync(path.join(dir, 'data.bin'), Buffer.from([1, 2, 3]));
const sibling = dir + '-secret';                     // a folder next to the build: the traversal target
fs.mkdirSync(sibling);
fs.writeFileSync(path.join(sibling, 'x.js'), 'secret');

const started = [];
const start = async () => { const s = await serveBuild({ dir, prefix: PREFIX }); started.push(s.server); return s; };
test.after(async () => {
  await Promise.all(started.map(s => new Promise(res => s.close(res))));
  fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(sibling, { recursive: true, force: true });
});

test('returns { server, base } on a free port; two servers never collide', async () => {
  const [one, two] = await Promise.all([start(), start()]);
  assert.match(one.base, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.notEqual(one.base, two.base);
  assert.equal(typeof one.server.close, 'function');
});

test('"/" is index.html, typed text/html with no charset', async () => {
  const { base } = await start();
  const r = await fetch(base + '/');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'text/html');
  assert.equal(await r.text(), '<!doctype html><title>x</title>');
});

test('files under the prefix: .js is application/javascript, .css is text/css, none with a charset', async () => {
  const { base } = await start();
  const js = await fetch(base + PREFIX + 'a.js'), css = await fetch(base + PREFIX + 'style.css'), nested = await fetch(base + PREFIX + 'i18n/de.js');
  assert.equal(js.headers.get('content-type'), 'application/javascript');
  assert.equal(css.headers.get('content-type'), 'text/css');
  assert.equal(nested.headers.get('content-type'), 'application/javascript');
  assert.deepEqual([...new Uint8Array(await nested.arrayBuffer())], [...Buffer.from('Dream.lang("de", { "k": "ü" });')]);   // the bytes as they are
  assert.equal((await fetch(base + PREFIX + 'data.bin')).headers.get('content-type'), 'application/octet-stream');
});

test('every answer, the 404 included, carries the live policy, no-store, nosniff and the referrer policy', async () => {
  const { base } = await start();
  for (const url of ['/', PREFIX + 'a.js', PREFIX + 'style.css', PREFIX + 'missing.js', '/elsewhere']) {
    const r = await fetch(base + url);
    assert.equal(r.headers.get('content-security-policy'), LIVE_POLICY, url);
    assert.equal(r.headers.get('cache-control'), 'no-store', url);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff', url);
    assert.equal(r.headers.get('referrer-policy'), 'strict-origin-when-cross-origin', url);
  }
});

test('a missing file is a 404 typed text/html, inside and outside the prefix', async () => {
  const { base } = await start();
  for (const url of [PREFIX + 'missing.js', PREFIX + 'i18n/xx.js', '/elsewhere', '/a.js']) {
    const r = await fetch(base + url);
    assert.equal(r.status, 404, url);
    assert.equal(r.headers.get('content-type'), 'text/html', url);
  }
});

test('the files of the build only: no way out of the folder', async () => {
  const { base } = await start();
  const r = await fetch(base + PREFIX + '..%2F' + path.basename(sibling) + '%2Fx.js');
  assert.equal(r.status, 404);
  assert.equal((await fetch(base + '/%')).status, 400);           // a broken escape is a bad request, not a crash
});

test('/health answers ok, as the start page does', async () => {
  const { base } = await start();
  const r = await fetch(base + '/health');
  assert.equal(r.status, 200);
  assert.equal(await r.text(), 'ok');
});
