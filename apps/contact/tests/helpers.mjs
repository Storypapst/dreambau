// Shared test helpers: a config, a handler on a free port, a controllable clock and a recording mailer.
import { loadConfig } from '../src/config.mjs';
import { createServer } from '../src/server.mjs';

export const SECRET = Buffer.alloc(32, 7).toString('base64');

export function config(extra = {}) {
  return loadConfig({ CONTACT_SIGNING_SECRET: SECRET, CONTACT_MAIL_TO: 'info@dreambau.com', CONTACT_MAIL_FROM: 'info@dreambau.com',
    CONTACT_SMTP_HOST: '127.0.0.1', CONTACT_SMTP_SECURITY: 'none', CONTACT_TRUSTED_PROXIES: '1', ...extra });
}

export async function start({ env = {}, mailer, startMs = 1_800_000_000_000 } = {}) {
  const clock = { ms: startMs };
  const sent = [];
  const logs = [];
  const m = mailer === null ? null : (mailer || { send: async msg => { sent.push(msg); return { accepted: [msg.to] }; } });
  const log = new Proxy({}, { get: (_, k) => (...a) => logs.push([k, ...a]) });
  const server = createServer(config(env), { mailer: m, now: () => clock.ms, log });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, clock, sent, logs, server, advance: s => { clock.ms += s * 1000; }, close: () => new Promise(r => { server.closeAllConnections(); server.close(r); }) };
}

export async function getToken(base, path = '/kontakt/') {
  const html = await (await fetch(base + path)).text();
  return /name="t" value="([^"]+)"/.exec(html)[1];
}

export function post(base, fields, { headers = {}, path = '/kontakt/' } = {}) {
  return fetch(base + path, { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': '203.0.113.9', ...headers },
    body: new URLSearchParams(fields).toString() });
}

export const VALID = { name: 'Erika Mustermann', email: 'erika@example.test', message: 'Guten Tag,\r\nich habe eine Frage.', website: '' };
