import test from 'node:test';
import assert from 'node:assert/strict';
import { makeToken, readToken } from '../src/tokens.mjs';

const secret = Buffer.alloc(32, 1), other = Buffer.alloc(32, 2);
test('7.5: shape is 74 characters and reads back', () => {
  const t = makeToken(secret, 'f1', 1800000000);
  assert.equal(t.length, 74);
  assert.match(t, /^(f1|r1)\.\d{10}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{43}$/);
  assert.deepEqual({ ...readToken(secret, t, 'f1'), nonce: 'x' }, { ok: true, prefix: 'f1', issued: 1800000000, nonce: 'x' });
});
test('7.5: wrong key, wrong prefix, tampering and garbage are refused', () => {
  const t = makeToken(secret, 'f1', 1800000000);
  assert.equal(readToken(other, t, 'f1').ok, false);
  assert.equal(readToken(secret, t, 'r1').ok, false);
  assert.equal(readToken(secret, t.replace('.18', '.19'), 'f1').ok, false);
  for (const g of ['', 'x', null, undefined, t + 'a', t.slice(0, -1)]) assert.equal(readToken(secret, g, 'f1').ok, false);
});
