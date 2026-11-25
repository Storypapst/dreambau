// The handler end to end over HTTP with an injected mailer and clock (spec 5.4, 7.3, X1-X4).
import test from 'node:test';
import assert from 'node:assert/strict';
import { start, getToken, post, VALID } from './helpers.mjs';
import { CSP } from '../src/server.mjs';

const H = r => Object.fromEntries(r.headers);
const sendable = async (s, extra = {}) => { const t = await getToken(s.base); s.advance(5); return post(s.base, { ...VALID, t, ...extra }); };

test('X1, X3, X4: headers on every answer; no cookie; noindex only on thanks and errors', async () => {
  const s = await start();
  try {
    for (const p of ['/kontakt/', '/kontakt/kontakt.css', '/kontakt/danke/', '/nope']) {
      const r = await fetch(s.base + p); const h = H(r);
      assert.equal(h['content-security-policy'], CSP);
      assert.equal(h['cache-control'], 'no-store');
      assert.equal(h['x-content-type-options'], 'nosniff');
      assert.equal(h['referrer-policy'], 'strict-origin-when-cross-origin');
      assert.equal(h['set-cookie'], undefined);
      assert.equal(h['x-robots-tag'], p === '/kontakt/' || p === '/kontakt/kontakt.css' ? undefined : 'noindex', p);
    }
  } finally { await s.close(); }
});

test('5.4 routes: redirects keep the query, other paths 404, methods 405', async () => {
  const s = await start();
  try {
    let r = await fetch(s.base + '/kontakt?lang=en', { redirect: 'manual' });
    assert.equal(r.status, 308); assert.equal(r.headers.get('location'), '/kontakt/?lang=en');
    r = await fetch(s.base + '/kontakt/danke', { redirect: 'manual' });
    assert.equal(r.status, 308); assert.equal(r.headers.get('location'), '/kontakt/danke/');
    for (const p of ['/kontakt//', '/kontakt/x', '/']) assert.equal((await fetch(s.base + p)).status, 404, p);
    assert.equal((await post(s.base, VALID, { path: '/kontakt' })).status, 404);
    r = await fetch(s.base + '/kontakt/', { method: 'PUT' });
    assert.equal(r.status, 405); assert.equal(r.headers.get('allow'), 'GET, HEAD, POST');
    r = await fetch(s.base + '/kontakt/danke/', { method: 'DELETE' });
    assert.equal(r.status, 405); assert.equal(r.headers.get('allow'), 'GET, HEAD');
    const css = await fetch(s.base + '/kontakt/kontakt.css');
    assert.equal(css.headers.get('content-type'), 'text/css; charset=utf-8');
    const head = await fetch(s.base + '/kontakt/', { method: 'HEAD' });
    assert.equal(head.status, 200); assert.equal((await head.text()).length, 0);
  } finally { await s.close(); }
});

test('happy path: one mail, 303 to thanks with receipt and valid lang only, thanks confirms', async () => {
  const s = await start();
  try {
    const t = await getToken(s.base, '/kontakt/?lang=en');
    s.advance(5);
    const r = await post(s.base, { ...VALID, t }, { path: '/kontakt/?lang=en' });
    assert.equal(r.status, 303);
    const loc = r.headers.get('location');
    assert.match(loc, /^\/kontakt\/danke\/\?r=r1\.\d{10}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{43}&lang=en$/);
    assert.equal(s.sent.length, 1);
    assert.equal(s.sent[0].replyTo, 'erika@example.test');
    const thanks = await (await fetch(s.base + loc)).text();
    assert.match(thanks, /Die Nachricht ist abgeschickt\./);
    s.advance(901);
    assert.match(await (await fetch(s.base + loc)).text(), /Hier gibt es nichts zu bestätigen\./);
    assert.match(await (await fetch(s.base + '/kontakt/danke/?r=nonsense')).text(), /nichts zu bestätigen/);
  } finally { await s.close(); }
});

test('L4: an invalid lang is dropped and never echoed', async () => {
  const s = await start();
  try {
    const html = await (await fetch(s.base + '/kontakt/?lang=%3Cscript%3E')).text();
    assert.match(html, /action="\/kontakt\/"/);
    assert.doesNotMatch(html, /script%3E|<script>/i);
  } finally { await s.close(); }
});

test('S4: a repeated sent post answers 303 again and mails nothing', async () => {
  const s = await start();
  try {
    const t = await getToken(s.base); s.advance(5);
    assert.equal((await post(s.base, { ...VALID, t })).status, 303);
    assert.equal((await post(s.base, { ...VALID, t })).status, 303);
    assert.equal(s.sent.length, 1);
  } finally { await s.close(); }
});

test('steps 1-3: foreign origin 403, wrong type 415, too big 413', async () => {
  const s = await start();
  try {
    const t = await getToken(s.base); s.advance(5);
    assert.equal((await post(s.base, { ...VALID, t }, { headers: { origin: 'https://evil.example.test' } })).status, 403);
    assert.equal((await post(s.base, { ...VALID, t }, { headers: { origin: 'null' } })).status, 303);
    const r = await fetch(s.base + '/kontakt/', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x' });
    assert.equal(r.status, 415);
    const big = await fetch(s.base + '/kontakt/', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'message=' + 'a'.repeat(70000) });
    assert.equal(big.status, 413);
    assert.equal(s.sent.length, 1);
  } finally { await s.close(); }
});

test('steps 8-10: honeypot 422, bad token 400, too early and too late 422; values kept, honeypot not echoed', async () => {
  const s = await start();
  try {
    let t = await getToken(s.base); s.advance(5);
    let r = await post(s.base, { ...VALID, t, website: 'spam' });
    assert.equal(r.status, 422);
    const html = await r.text();
    assert.match(html, /Bitte das Formular noch einmal senden/);
    assert.match(html, /value="erika@example.test"/);
    assert.doesNotMatch(html, /value="spam"/);
    assert.equal((await post(s.base, { ...VALID, t: 'f1.x' })).status, 400);
    t = await getToken(s.base); s.advance(1);
    assert.equal((await post(s.base, { ...VALID, t })).status, 422);
    s.advance(7300);
    assert.equal((await post(s.base, { ...VALID, t })).status, 422);
    assert.equal(s.sent.length, 0);
  } finally { await s.close(); }
});

test('S3: the fresh token of a refusal keeps the old issue time, so no second wait', async () => {
  const s = await start();
  try {
    const t = await getToken(s.base); s.advance(5);
    const html = await (await post(s.base, { ...VALID, t, email: 'kaputt' })).text();
    const t2 = /name="t" value="([^"]+)"/.exec(html)[1];
    assert.equal(t2.split('.')[1], t.split('.')[1]);
    assert.notEqual(t2, t);
    assert.equal((await post(s.base, { ...VALID, t: t2 })).status, 303);
  } finally { await s.close(); }
});

test('step 13 / P12: field errors 422 with aria-invalid, describedby, autofocus on the first, escaped values', async () => {
  const s = await start();
  try {
    const t = await getToken(s.base); s.advance(5);
    const r = await post(s.base, { ...VALID, t, email: '<b>x', message: '' });
    assert.equal(r.status, 422);
    const html = await r.text();
    assert.match(html, /id="f-email"[^>]*aria-invalid="true" aria-describedby="e-email" autofocus/);
    assert.match(html, /id="e-message"/);
    assert.match(html, /value="&lt;b&gt;x"/);
    assert.match(html, /role="alert"/);
    assert.equal(s.sent.length, 0);
  } finally { await s.close(); }
});

test('S5 / step 7: sixth post from one client within 600 s answers 429 with Retry-After', async () => {
  const s = await start();
  try {
    const codes = [];
    for (let i = 0; i < 6; i++) { const t = await getToken(s.base); s.advance(5); codes.push((await post(s.base, { ...VALID, t })).status); }
    assert.deepEqual(codes, [303, 303, 303, 303, 303, 429]);
  } finally { await s.close(); }
});

test('S6: global cap answers 503 and logs at most once per 600 s', async () => {
  const s = await start({ env: { CONTACT_RATE_GLOBAL_PER_HOUR: '2', CONTACT_RATE_KEY_MAX: '100' } });
  try {
    const codes = [];
    for (let i = 0; i < 4; i++) { const t = await getToken(s.base); s.advance(5); codes.push((await post(s.base, { ...VALID, t })).status); }
    assert.deepEqual(codes, [303, 303, 503, 503]);
    assert.equal(s.logs.filter(l => l[0] === 'globalCap').length, 1);
  } finally { await s.close(); }
});

test('D5 / H8: without mail settings GET works and a valid post answers 503 with the input kept', async () => {
  const s = await start({ mailer: null });
  try {
    assert.equal((await fetch(s.base + '/kontakt/')).status, 200);
    const t = await getToken(s.base); s.advance(5);
    const r = await post(s.base, { ...VALID, t });
    assert.equal(r.status, 503);
    assert.match(await r.text(), /value="erika@example.test"/);
  } finally { await s.close(); }
});

test('H8 / X8: a failing mail server answers 503, releases the nonce, logs codes only', async () => {
  let fail = true;
  const s = await start({ mailer: { send: async () => { if (fail) { const e = new Error('Erika erika@example.test'); e.code = 'EENVELOPE'; e.responseCode = 554; throw e; } } } });
  try {
    const t = await getToken(s.base); s.advance(5);
    assert.equal((await post(s.base, { ...VALID, t })).status, 503);
    assert.deepEqual(s.logs, [['smtpFailed', 'EENVELOPE', 554]]);
    fail = false;
    assert.equal((await post(s.base, { ...VALID, t })).status, 303);
  } finally { await s.close(); }
});
