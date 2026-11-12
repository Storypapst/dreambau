// 7.4 / 7.5 through the real mail library and a fake SMTP server: one envelope, one recipient, headers, no injection.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startFakeSmtp } from '../tools/fake-smtp.mjs';
import { createMailer, buildMessage } from '../src/mail.mjs';
import { config } from './helpers.mjs';

async function sendOne(values) {
  const smtp = await startFakeSmtp();
  try {
    const cfg = config({ CONTACT_SMTP_PORT: String(smtp.port) });
    await createMailer(cfg.mail).send(buildMessage(cfg.mail, values, new Date(Date.UTC(2026, 9, 6, 3, 20, 30))));
    return smtp.messages;
  } finally { await smtp.close(); }
}

test('7.4: one message, envelope and the ten header names, German body', async () => {
  const msgs = await sendOne({ name: 'Erika Mustermann', email: 'erika@example.test', message: 'Guten Tag,\nich habe eine Frage.' });
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].from, '<info@dreambau.com>');
  assert.deepEqual(msgs[0].to, ['<info@dreambau.com>']);
  const cut = msgs[0].data.indexOf('\r\n\r\n'), head = msgs[0].data.slice(0, cut), body = msgs[0].data.slice(cut + 4);
  const names = new Set(head.split('\r\n').filter(l => /^[A-Za-z-]+:/.test(l)).map(l => l.split(':')[0].toLowerCase()));
  assert.deepEqual([...names].sort(), ['content-transfer-encoding', 'content-type', 'date', 'from', 'message-id', 'mime-version', 'reply-to', 'subject', 'to', 'x-dreambau-form'].sort());
  assert.match(head, /Subject: Kontaktformular dreambau.com \(2026-10-06 03:20 UTC\)/);
  assert.match(head, /Reply-To: erika@example.test/);
  assert.match(head, /Content-Type: text\/plain; charset=utf-8/);
  assert.match(head, /Message-ID: <[^>]+@dreambau\.com>/);
  assert.match(body, /Nachricht =C3=BCber das Kontaktformular/);
  assert.match(body, /Name:       Erika Mustermann/);
});

test('7.5: SMTP commands and headers typed into the message stay body text; empty name reads (nicht angegeben)', async () => {
  const msgs = await sendOne({ name: '', email: 'erika@example.test', message: 'Bcc: x@example.test\n.\nMAIL FROM:<x@example.test>\nRCPT TO:<x@example.test>' });
  assert.equal(msgs.length, 1);
  assert.deepEqual(msgs[0].to, ['<info@dreambau.com>']);
  const cut = msgs[0].data.indexOf('\r\n\r\n'), head = msgs[0].data.slice(0, cut), body = msgs[0].data.slice(cut + 4);
  assert.doesNotMatch(head, /Bcc/i);
  assert.match(body, /Bcc: x@example\.test/);
  assert.match(body, /\(nicht angegeben\)/);
});
