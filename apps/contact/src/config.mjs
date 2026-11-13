// Reads the environment once at start (spec 7.6, H10). Throws ConfigError naming the variable, never its value.
import fs from 'node:fs';

export class ConfigError extends Error {
  constructor(variable, what) { super(`${variable} ${what}`); this.variable = variable; this.what = what; }
}

const LINK = /^\/[A-Za-z0-9._~/-]{1,100}$/;
const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);

function int(env, name, def, min, max) {
  const raw = env[name];
  if (raw === undefined || raw === '') return def;
  if (!/^\d+$/.test(raw)) throw new ConfigError(name, 'is not a whole number');
  const n = Number(raw);
  if (n < min || n > max) throw new ConfigError(name, `is outside ${min}..${max}`);
  return n;
}

function secretValue(env, name) {
  const file = env[name + '_FILE'];
  if (file) {
    try { return fs.readFileSync(file, 'utf8').trim(); } catch { throw new ConfigError(name + '_FILE', 'cannot be read'); }
  }
  return env[name] ? String(env[name]).trim() : '';
}

export function loadConfig(env = process.env) {
  const secretText = secretValue(env, 'CONTACT_SIGNING_SECRET');
  if (!secretText) throw new ConfigError('CONTACT_SIGNING_SECRET', 'is missing');
  const secret = /^[A-Za-z0-9+/]+={0,2}$/.test(secretText) ? Buffer.from(secretText, 'base64') : Buffer.alloc(0);
  if (secret.length < 32) throw new ConfigError('CONTACT_SIGNING_SECRET', 'must be base64 of at least 32 bytes');

  const security = env.CONTACT_SMTP_SECURITY || 'starttls';
  if (!['starttls', 'tls', 'none'].includes(security)) throw new ConfigError('CONTACT_SMTP_SECURITY', 'must be starttls, tls or none');
  const smtpHost = env.CONTACT_SMTP_HOST || '';
  if (security === 'none' && smtpHost && !LOOPBACK.has(smtpHost)) throw new ConfigError('CONTACT_SMTP_SECURITY', 'none is allowed only for a loopback host');

  const links = {};
  for (const [key, name, def] of [['imprint', 'CONTACT_LINK_IMPRINT', '/homepage-assets/impressum.html'], ['privacy', 'CONTACT_LINK_PRIVACY', '/homepage-assets/datenschutz.html']]) {
    const v = env[name] || def;
    if (!LINK.test(v) || v.includes('//')) throw new ConfigError(name, 'must be a same-origin path');
    links[key] = v;
  }
  const i18n = env.CONTACT_I18N || 'off';
  if (!['on', 'off'].includes(i18n)) throw new ConfigError('CONTACT_I18N', 'must be on or off');

  const mailTo = env.CONTACT_MAIL_TO || '', mailFrom = env.CONTACT_MAIL_FROM || '';
  const smtpUser = env.CONTACT_SMTP_USER || '';
  const smtpPassword = secretValue(env, 'CONTACT_SMTP_PASSWORD');
  // CONTACT_SMTP_AUTH=none: hand the message to our own mail server like any inbound sender (port 25, TLS still per
  // CONTACT_SMTP_SECURITY), for when the recipient domain is our own and no sending account exists
  const smtpAuth = env.CONTACT_SMTP_AUTH || 'login';
  if (!['login', 'none'].includes(smtpAuth)) throw new ConfigError('CONTACT_SMTP_AUTH', 'must be login or none');
  const mailConfigured = !!(mailTo && mailFrom && smtpHost && (security === 'none' || smtpAuth === 'none' || (smtpUser && smtpPassword)));

  const minAge = int(env, 'CONTACT_MIN_AGE_S', 4, 0, 3600);
  const maxAge = int(env, 'CONTACT_MAX_AGE_S', 7200, 60, 86400);
  if (maxAge <= minAge) throw new ConfigError('CONTACT_MAX_AGE_S', 'must be larger than CONTACT_MIN_AGE_S');

  return Object.freeze({
    port: int(env, 'CONTACT_PORT', 8080, 0, 65535),
    host: env.CONTACT_LISTEN_HOST || '0.0.0.0',
    secret,
    mail: Object.freeze({ configured: mailConfigured, to: mailTo, from: mailFrom, host: smtpHost,
      port: int(env, 'CONTACT_SMTP_PORT', 587, 1, 65535), security, user: smtpAuth === 'none' ? '' : smtpUser, password: smtpAuth === 'none' ? '' : smtpPassword,
      servername: env.CONTACT_SMTP_SERVERNAME || '', timeoutMs: int(env, 'CONTACT_SMTP_TIMEOUT_MS', 15000, 100, 120000) }),
    trustedProxies: int(env, 'CONTACT_TRUSTED_PROXIES', 1, 0, 10),
    minAge, maxAge,
    rateKeyMax: int(env, 'CONTACT_RATE_KEY_MAX', 5, 1, 1000),
    rateWindow: int(env, 'CONTACT_RATE_WINDOW_S', 600, 1, 86400),
    globalPerHour: int(env, 'CONTACT_RATE_GLOBAL_PER_HOUR', 60, 1, 100000),
    maxEntries: int(env, 'CONTACT_MAX_ENTRIES', 50000, 1, 1000000),
    i18n: i18n === 'on',
    links: Object.freeze(links),
  });
}
