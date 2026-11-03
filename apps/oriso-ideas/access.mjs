import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { domainToASCII } from 'node:url';

const digest = value => createHash('sha256').update(value).digest();
const token = () => randomBytes(32).toString('base64url');
const codeLifetime = 10 * 60_000;
const sessionLifetime = 8 * 60 * 60_000;

function domain(value) {
  if (typeof value !== 'string' || value.length > 253) throw new TypeError('Invalid domain');
  const candidate = value.trim().toLowerCase();
  if (!/^[\p{L}\p{N}.\p{M}-]+$/u.test(candidate)) throw new TypeError('Invalid domain');
  const normalized = domainToASCII(candidate);
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(normalized)) {
    throw new TypeError('Invalid domain');
  }
  return normalized;
}

function contact(name, email) {
  if (typeof name !== 'string' || !name.trim() || name.length > 120 || /[\r\n]/.test(name)
    || typeof email !== 'string' || email.length > 254) throw new TypeError('Invalid contact');
  const [local, host, extra] = email.trim().split('@');
  if (extra !== undefined || !/^[a-z0-9_+.-]{1,64}$/i.test(local) || !host) throw new TypeError('Invalid email');
  return { name: name.trim(), email: local + '@' + domain(host) };
}

export function createAccess(db, { password, initialDomains = [], sendCode, now = Date.now }) {
  if (!password || typeof sendCode !== 'function') throw new Error('Email access requires a password and a sender');
  const passwordDigest = digest(password);
  const codeDigest = (challenge, code) => createHmac('sha256', passwordDigest).update(challenge + ':' + code).digest();
  db.exec(`
    CREATE TABLE IF NOT EXISTS intake_domains (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS email_codes (
      challenge TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL,
      digest BLOB NOT NULL, expires INTEGER NOT NULL, attempts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS email_codes_email ON email_codes(email COLLATE NOCASE);
    CREATE TABLE IF NOT EXISTS email_sessions (
      digest BLOB PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL, expires INTEGER NOT NULL
    );
  `);
  const readDomains = db.prepare('SELECT data FROM intake_domains WHERE id = 1');
  const writeDomains = db.prepare('INSERT OR REPLACE INTO intake_domains VALUES (1, ?)');
  const domains = () => JSON.parse(readDomains.get().data);
  function setDomains(values) {
    if (!Array.isArray(values) || values.length < 1 || values.length > 100) throw new TypeError('Invalid domain list');
    const normalized = [...new Set(values.map(domain))].sort();
    writeDomains.run(JSON.stringify(normalized));
    return normalized;
  }
  if (!readDomains.get()) setDomains(initialDomains);
  const allowed = email => domains().includes(email.split('@')[1]);

  return {
    domains, setDomains,
    async request(body) {
      if (typeof body.password !== 'string' || !timingSafeEqual(digest(body.password), passwordDigest)) return { status: 403 };
      const { name, email } = contact(body.name, body.email);
      if (!allowed(email)) return { status: 403 };
      const time = now();
      db.prepare('DELETE FROM email_codes WHERE expires <= ?').run(time);
      db.prepare('DELETE FROM email_sessions WHERE expires <= ?').run(time);
      const recent = db.prepare('SELECT expires FROM email_codes WHERE email = ? COLLATE NOCASE ORDER BY expires DESC LIMIT 1').get(email);
      if (recent && recent.expires - codeLifetime + 60_000 > time) return { status: 429 };
      db.prepare('DELETE FROM email_codes WHERE email = ? COLLATE NOCASE').run(email);
      const challenge = token();
      const code = String(randomInt(1_000_000)).padStart(6, '0');
      db.prepare('INSERT INTO email_codes VALUES (?, ?, ?, ?, ?, 0)')
        .run(challenge, email, name, codeDigest(challenge, code), time + codeLifetime);
      try {
        await sendCode({ email, code });
        return { status: 202, challenge };
      } catch {
        db.prepare('DELETE FROM email_codes WHERE challenge = ?').run(challenge);
        return { status: 502 };
      }
    },
    verify({ challenge, code }) {
      if (typeof challenge !== 'string' || typeof code !== 'string' || !/^\d{6}$/.test(code)) return null;
      const row = db.prepare('SELECT * FROM email_codes WHERE challenge = ?').get(challenge);
      const time = now();
      if (!row || row.expires <= time || row.attempts >= 5 || !allowed(row.email)) return null;
      if (!timingSafeEqual(row.digest, codeDigest(challenge, code))) {
        db.prepare('UPDATE email_codes SET attempts = attempts + 1 WHERE challenge = ?').run(challenge);
        return null;
      }
      if (!db.prepare('DELETE FROM email_codes WHERE challenge = ?').run(challenge).changes) return null;
      const session = token();
      db.prepare('INSERT INTO email_sessions VALUES (?, ?, ?, ?)').run(digest(session), row.email, row.name, time + sessionLifetime);
      return session;
    },
    identity(session) {
      if (!session) return null;
      const row = db.prepare('SELECT name, email FROM email_sessions WHERE digest = ? AND expires > ?').get(digest(session), now());
      return row && allowed(row.email) ? { name: row.name, email: row.email } : null;
    },
    logout(session) {
      if (session) db.prepare('DELETE FROM email_sessions WHERE digest = ?').run(digest(session));
    },
  };
}
