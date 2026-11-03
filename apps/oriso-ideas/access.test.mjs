import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createAccess } from './access.mjs';

test('password and an exact allowed domain precede one-time email verification', async () => {
  const db = new DatabaseSync(':memory:');
  const sent = [];
  const access = createAccess(db, { password: 'a shared word', initialDomains: ['ORISO.org'],
    sendCode: async message => sent.push(message) });
  assert.equal((await access.request({ name: 'Frank', email: 'frank@oriso.org', password: 'wrong' })).status, 403);
  assert.equal((await access.request({ name: 'Frank', email: 'frank@evil-oriso.org', password: 'a shared word' })).status, 403);
  assert.equal(sent.length, 0);
  const created = await access.request({ name: ' Frank ', email: 'Frank@ORISO.org', password: 'a shared word' });
  assert.equal(created.status, 202);
  assert.equal(sent[0].email, 'Frank@oriso.org');
  const wrong = sent[0].code === '000000' ? '000001' : '000000';
  assert.equal(access.verify({ challenge: created.challenge, code: wrong }), null);
  const token = access.verify({ challenge: created.challenge, code: sent[0].code });
  assert.deepEqual(access.identity(token), { name: 'Frank', email: 'Frank@oriso.org' });
  assert.equal(access.verify({ challenge: created.challenge, code: sent[0].code }), null);
  access.setDomains(['example.org']);
  assert.equal(access.identity(token), null);
  assert.deepEqual(createAccess(db, { password: 'a shared word', initialDomains: ['oriso.org'],
    sendCode: async () => {} }).domains(), ['example.org']);
  db.close();
});

test('codes expire, lock after five attempts and are removed if delivery fails', async () => {
  const db = new DatabaseSync(':memory:');
  let now = 0;
  let delivered;
  const access = createAccess(db, { password: 'shared', initialDomains: ['oriso.org'], now: () => now,
    sendCode: async ({ code }) => { delivered = code; } });
  const form = { name: 'Test', email: 'test@oriso.org', password: 'shared' };
  let challenge = (await access.request(form)).challenge;
  now += 10 * 60_000;
  assert.equal(access.verify({ challenge, code: delivered }), null);
  challenge = (await access.request(form)).challenge;
  const wrong = delivered === '000000' ? '000001' : '000000';
  for (let attempt = 0; attempt < 5; attempt++) assert.equal(access.verify({ challenge, code: wrong }), null);
  assert.equal(access.verify({ challenge, code: delivered }), null);
  const failing = createAccess(db, { password: 'shared', initialDomains: ['oriso.org'], now: () => now,
    sendCode: async () => { throw new Error('SMTP error'); } });
  assert.equal((await failing.request({ ...form, email: 'other@oriso.org' })).status, 502);
  assert.equal(db.prepare("SELECT count(*) AS count FROM email_codes WHERE email = 'other@oriso.org'").get().count, 0);
  db.close();
});
