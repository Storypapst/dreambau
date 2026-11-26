import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuards, clientAddress } from '../src/guards.mjs';
import { config } from './helpers.mjs';

test('S7: Nth entry from the right of X-Forwarded-For; a forged first entry gives nothing', () => {
  const req = h => ({ headers: { 'x-forwarded-for': h }, socket: { remoteAddress: '127.0.0.1' } });
  assert.equal(clientAddress(req('198.51.100.1, 203.0.113.9'), 1), '203.0.113.9');
  assert.equal(clientAddress(req('203.0.113.9'), 2), '127.0.0.1');
  assert.equal(clientAddress(req(''), 1), '127.0.0.1');
});
test('S7: client key is a 16-hex keyed hash, not the address', () => {
  const g = createGuards(config(), () => 0);
  const k = g.keyOf('203.0.113.9');
  assert.match(k, /^[0-9a-f]{16}$/);
  assert.notEqual(k, createGuards(config(), () => 0).keyOf('203.0.113.9'));
});
test('S5: 5 posts per window, then Retry-After until the oldest leaves', () => {
  let now = 1000;
  const g = createGuards(config(), () => now);
  for (let i = 0; i < 5; i++) { assert.equal(g.countPost('a').ok, true); now += 10; }
  const r = g.countPost('a');
  assert.equal(r.ok, false);
  assert.equal(r.retryAfter, 1000 + 600 - now);
  assert.equal(g.countPost('b').ok, true);
});
test('S7/H11: entries leave memory within 60 s after their window ends', () => {
  let now = 1000;
  const g = createGuards(config(), () => now);
  g.countPost('a'); g.markInFlight('n', 1100);
  now = 1000 + 600 + 61; g.sweep();
  assert.deepEqual(g.sizes(), { clients: 0, nonces: 0 });
});
