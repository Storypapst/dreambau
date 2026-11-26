import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanName, cleanEmail, cleanMessage, validateFields } from '../src/validate.mjs';

test('7.2 email: accepted cases, IDN to punycode, local part kept as typed', () => {
  assert.equal(cleanEmail('erika@example.test').value, 'erika@example.test');
  assert.equal(cleanEmail('Max+Tag@example.test').value, 'Max+Tag@example.test');
  assert.equal(cleanEmail('mueller@bücher.example.test').value, 'mueller@xn--bcher-kva.example.test');
});
test('7.2 email: refused cases', () => {
  for (const v of ['a@b', 'erika@example.test, x@example.test', '<erika@example.test>', 'Erika <erika@example.test>', '"q"@example.test',
    'erika\u0000@example.test', 'erika@example.test\r\nBcc: x@example.test', '.a@example.test', 'a..b@example.test', 'a@-x.example.test', ''])
    assert.equal(cleanEmail(v).error, 'contact.err.email', JSON.stringify(v));
});
test('7.2 name: ZWNJ and empty accepted; CR LF, bare LF, RLO and 81 code points refused', () => {
  assert.equal(cleanName('م‌ن').error, undefined);
  assert.equal(cleanName('').value, '');
  for (const v of ['Erika\r\nBcc: x@example.test', 'Erika\nX', 'Erika‮', 'a'.repeat(81)]) assert.equal(cleanName(v).error, 'contact.err.name');
});
test('7.2 message: normalised, control characters removed, 4000 code points max', () => {
  assert.equal(cleanMessage('a\r\nb\rc d\u0007').value, 'a\nb\nc\nd');
  assert.equal(cleanMessage('😀'.repeat(4000)).value.length, 8000);
  assert.equal(cleanMessage('😀'.repeat(4001)).error, 'contact.err.message_long');
  assert.equal(cleanMessage('\u0001\u0002 ').error, 'contact.err.message_empty');
  assert.equal(cleanMessage('Bcc: x@example.test\n.\nMAIL FROM:<x@example.test>').value.startsWith('Bcc:'), true);
});
test('7.2: all errors at once', () => {
  const r = validateFields({ name: 'a\nb', email: 'x', message: '' });
  assert.deepEqual(r.errors, { name: 'contact.err.name', email: 'contact.err.email', message: 'contact.err.message_empty' });
});
