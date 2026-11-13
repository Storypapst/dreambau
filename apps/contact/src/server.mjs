// The contact form handler (spec 5.4): serves /kontakt/, /kontakt/danke/, /kontakt/kontakt.css and turns one valid post into one e-mail.
// Nothing is stored or logged beyond the five log lines (X7, X8). createServer(config, deps) lets tests inject a mailer, a clock and a log.
import http from 'node:http';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadConfig, ConfigError } from './config.mjs';
import { makeToken, readToken } from './tokens.mjs';
import { createGuards, clientAddress } from './guards.mjs';
import { validateFields } from './validate.mjs';
import { buildMessage, createMailer } from './mail.mjs';
import { createLog } from './log.mjs';
import { formPage, thanksPage, errorPage } from './page.mjs';

export const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
const MAX_BODY = 65536;
const RECEIPT_MAX_AGE = 900;
const LANG = /^[A-Za-z0-9_-]{1,16}$/;
const CSS = fs.readFileSync(new URL('../public/kontakt.css', import.meta.url));

export function createServer(cfg, deps = {}) {
  const log = deps.log || createLog();
  const nowMs = deps.now || (() => Date.now());
  const nowS = () => Math.floor(nowMs() / 1000);
  const mailer = deps.mailer !== undefined ? deps.mailer : createMailer(cfg.mail);
  const guards = createGuards(cfg, nowS);

  function send(res, status, body, extra = {}) {
    const headers = {
      'Content-Security-Policy': CSP, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin', ...extra,
    };
    if (status >= 400 && !headers['X-Robots-Tag']) headers['X-Robots-Tag'] = 'noindex';
    if (body !== null && body !== undefined) {
      if (!headers['Content-Type']) headers['Content-Type'] = 'text/html; charset=utf-8';
      headers['Content-Length'] = Buffer.byteLength(body);
    } else headers['Content-Length'] = 0;
    res.writeHead(status, headers);
    res.end(res.req.method === 'HEAD' ? undefined : body ?? undefined);
  }
  const freshToken = (issued = nowS()) => makeToken(cfg.secret, 'f1', issued);
  const showForm = (res, status, opts, extra) => send(res, status, formPage(cfg, { ...opts, token: opts.token || freshToken() }), extra);
  const errPage = (res, status, extra) => send(res, status, errorPage(cfg), extra);

  async function handlePost(req, res, lang) {
    // 1 origin
    const origin = req.headers.origin;
    if (origin && origin !== 'null') {
      let host = null; try { host = new URL(origin).host; } catch { /* unparsable origin counts as foreign */ }
      if (host !== req.headers.host) return errPage(res, 403);
    }
    // 2 content type
    const ctype = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (ctype !== 'application/x-www-form-urlencoded') return errPage(res, 415);
    // 3 declared length
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > MAX_BODY) { res.shouldKeepAlive = false; return errPage(res, 413, { Connection: 'close' }); }
    // 4 count the post (verdict at 7)
    const budget = guards.countPost(clientAddress(req, cfg.trustedProxies));
    // 5 read the body
    const chunks = []; let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > MAX_BODY) { res.shouldKeepAlive = false; return errPage(res, 413, { Connection: 'close' }); }
      chunks.push(c);
    }
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); } catch { return errPage(res, 400); }
    const params = new URLSearchParams(text);
    const field = k => params.get(k) ?? '';               // first value per name counts
    const values = { name: field('name'), email: field('email'), message: field('message') };
    // 6 issue time to carry over (S3)
    const old = readToken(cfg.secret, field('t'), 'f1');
    const age = old.ok ? nowS() - old.issued : null;
    const carry = old.ok && age >= 0 && age <= cfg.maxAge ? old.issued : nowS();
    const again = (status, notice, extra, errors) => showForm(res, status, { values, notice, errors, lang, token: freshToken(carry) }, extra);
    // 7 budget
    if (!budget.ok) return again(429, 'contact.err.rate', { 'Retry-After': String(budget.retryAfter) });
    // 8 honeypot
    if (field('website') !== '') return again(422, 'contact.err.retry');
    // 9 token
    if (!old.ok) return again(400, 'contact.err.retry');
    // 10 age
    if (age < cfg.minAge || age > cfg.maxAge) return again(422, 'contact.err.retry');
    // 11 nonce seen
    const state = guards.nonceState(old.nonce);
    if (state === 'sent') return redirectSent(res, lang);
    if (state === 'flight') return again(422, 'contact.err.retry');
    // 12 table full
    if (guards.nonceTableFull()) return again(503, 'contact.err.unavailable');
    // 13 in flight, validate
    const until = old.issued + cfg.maxAge;
    guards.markInFlight(old.nonce, until);
    const checked = validateFields(values);
    if (!checked.ok) { guards.release(old.nonce); return again(422, null, {}, checked.errors); }
    // 14 global cap
    if (guards.globalCapReached()) {
      guards.release(old.nonce);
      if (guards.shouldLogCap()) log.globalCap(cfg.globalPerHour);
      return again(503, 'contact.err.unavailable');
    }
    // 15 mail
    if (!mailer) { guards.release(old.nonce); return again(503, 'contact.err.unavailable'); }
    try {
      await mailer.send(buildMessage(cfg.mail, checked.values, new Date(nowMs())));
    } catch (err) {
      guards.release(old.nonce);
      log.smtpFailed(err && err.code, err && err.responseCode);
      return again(503, 'contact.err.unavailable');
    }
    // 16 sent
    guards.markSent(old.nonce, until);
    return redirectSent(res, lang);
  }

  function redirectSent(res, lang) {
    const receipt = makeToken(cfg.secret, 'r1', nowS());
    return send(res, 303, null, { Location: `/kontakt/danke/?r=${receipt}${lang ? `&lang=${lang}` : ''}` });
  }

  async function route(req, res) {
    const u = new URL(req.url, 'http://x');
    const p = u.pathname;
    const langRaw = u.searchParams.get('lang');
    const lang = langRaw && LANG.test(langRaw) ? langRaw : '';
    const m = req.method;
    const readOnly = m === 'GET' || m === 'HEAD';
    if (p === '/kontakt' || p === '/kontakt/danke') {
      if (!readOnly) return errPage(res, 404);
      return send(res, 308, null, { Location: p + '/' + u.search });
    }
    if (p === '/kontakt/') {
      if (readOnly) return showForm(res, 200, { lang });
      if (m === 'POST') return handlePost(req, res, lang);
      return errPage(res, 405, { Allow: 'GET, HEAD, POST' });
    }
    if (p === '/kontakt/danke/') {
      if (!readOnly) return errPage(res, 405, { Allow: 'GET, HEAD' });
      const r = readToken(cfg.secret, u.searchParams.get('r'), 'r1');
      const age = r.ok ? nowS() - r.issued : -1;
      const ok = r.ok && age >= 0 && age <= RECEIPT_MAX_AGE;
      return send(res, 200, thanksPage(cfg, ok, lang), { 'X-Robots-Tag': 'noindex' });
    }
    if (p === '/kontakt/kontakt.css') {
      if (!readOnly) return errPage(res, 405, { Allow: 'GET, HEAD' });
      return send(res, 200, CSS, { 'Content-Type': 'text/css; charset=utf-8' });
    }
    return errPage(res, 404);
  }

  const server = http.createServer((req, res) => {
    route(req, res).catch(err => {
      log.error(err && err.code || 'unexpected');
      if (!res.headersSent) { try { errPage(res, 500); } catch { res.destroy(); } } else res.destroy();
    });
  });
  server.headersTimeout = 10000;
  server.requestTimeout = 15000;
  server.keepAliveTimeout = 5000;
  server.guards = guards;
  return server;
}

// started as a program: read the environment, listen, stop cleanly on SIGTERM (D9)
if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const log = createLog();
  let cfg;
  try { cfg = loadConfig(); } catch (e) {
    if (e instanceof ConfigError) { log.config(e.variable, e.what); process.exit(1); }
    log.error('config'); process.exit(1);
  }
  const server = createServer(cfg, { log });
  server.listen(cfg.port, cfg.host, () => log.listening(server.address().port, cfg.mail.configured));
  const stop = () => { server.close(() => process.exit(0)); server.closeIdleConnections(); setTimeout(() => process.exit(0), 2000).unref(); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  const sweep = setInterval(() => server.guards.sweep(), 60000); sweep.unref();
}
