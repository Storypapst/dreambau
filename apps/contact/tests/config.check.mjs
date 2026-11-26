import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, ConfigError } from '../src/config.mjs';
import { SECRET } from './helpers.mjs';

const bad = (env, variable) => assert.throws(() => loadConfig(env), e => e instanceof ConfigError && e.variable === variable && !e.message.includes(SECRET));

test('H10: missing or short signing secret stops the start and names only the variable', () => {
  bad({}, 'CONTACT_SIGNING_SECRET');
  bad({ CONTACT_SIGNING_SECRET: Buffer.alloc(31).toString('base64') }, 'CONTACT_SIGNING_SECRET');
});
test('H10: SMTP security values and none only on loopback', () => {
  bad({ CONTACT_SIGNING_SECRET: SECRET, CONTACT_SMTP_SECURITY: 'ssl' }, 'CONTACT_SMTP_SECURITY');
  bad({ CONTACT_SIGNING_SECRET: SECRET, CONTACT_SMTP_SECURITY: 'none', CONTACT_SMTP_HOST: 'mail.example.test' }, 'CONTACT_SMTP_SECURITY');
});
test('H10: link targets must be same-origin paths', () => {
  bad({ CONTACT_SIGNING_SECRET: SECRET, CONTACT_LINK_IMPRINT: 'https://example.test/x' }, 'CONTACT_LINK_IMPRINT');
  bad({ CONTACT_SIGNING_SECRET: SECRET, CONTACT_LINK_PRIVACY: '//example.test/x' }, 'CONTACT_LINK_PRIVACY');
});
test('D5: starts without mail settings; mail counts as configured only with recipient, sender, host and login', () => {
  assert.equal(loadConfig({ CONTACT_SIGNING_SECRET: SECRET }).mail.configured, false);
  const env = { CONTACT_SIGNING_SECRET: SECRET, CONTACT_MAIL_TO: 'info@dreambau.com', CONTACT_MAIL_FROM: 'info@dreambau.com', CONTACT_SMTP_HOST: 'mail.example.test' };
  assert.equal(loadConfig(env).mail.configured, false);
  assert.equal(loadConfig({ ...env, CONTACT_SMTP_USER: 'u', CONTACT_SMTP_PASSWORD: 'p' }).mail.configured, true);
});
test('CONTACT_SMTP_AUTH=none: configured without login, keeps TLS, drops any user or password; other values refused', () => {
  const env = { CONTACT_SIGNING_SECRET: SECRET, CONTACT_MAIL_TO: 'info@dreambau.com', CONTACT_MAIL_FROM: 'kontakt-form@dreambau.com', CONTACT_SMTP_HOST: 'mail.example.test', CONTACT_SMTP_PORT: '25' };
  const c = loadConfig({ ...env, CONTACT_SMTP_AUTH: 'none', CONTACT_SMTP_USER: 'u', CONTACT_SMTP_PASSWORD: 'p' });
  assert.equal(c.mail.configured, true);
  assert.equal(c.mail.security, 'starttls');
  assert.equal(c.mail.user, '');
  assert.equal(c.mail.password, '');
  bad({ ...env, CONTACT_SMTP_AUTH: 'plain' }, 'CONTACT_SMTP_AUTH');
});
test('defaults of 7.6', () => {
  const c = loadConfig({ CONTACT_SIGNING_SECRET: SECRET });
  assert.deepEqual([c.port, c.minAge, c.maxAge, c.rateKeyMax, c.rateWindow, c.globalPerHour, c.maxEntries, c.mail.port, c.mail.security, c.i18n],
    [8080, 4, 7200, 5, 600, 60, 50000, 587, 'starttls', false]);
  assert.equal(c.links.imprint, '/homepage-assets/impressum.html');
});
