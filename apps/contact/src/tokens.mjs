// Signed tokens (spec 7.5): "<prefix>.<issued>.<nonce>.<mac>", 74 characters. f1 = form token, r1 = receipt.
import crypto from 'node:crypto';

const SHAPE = /^(f1|r1)\.(\d{10})\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{43})$/;
const mac = (secret, text) => crypto.createHmac('sha256', secret).update(text, 'ascii').digest('base64url');

export function makeToken(secret, prefix, issued, nonce = crypto.randomBytes(12).toString('base64url')) {
  const head = `${prefix}.${String(Math.floor(issued)).padStart(10, '0')}.${nonce}`;
  return `${head}.${mac(secret, head)}`;
}

// { ok, prefix, issued, nonce } when shape, prefix and signature are right; { ok: false } otherwise
export function readToken(secret, token, prefix) {
  const m = typeof token === 'string' ? SHAPE.exec(token) : null;
  if (!m || m[1] !== prefix) return { ok: false };
  const expected = Buffer.from(mac(secret, `${m[1]}.${m[2]}.${m[3]}`));
  const given = Buffer.from(m[4]);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return { ok: false };
  return { ok: true, prefix: m[1], issued: Number(m[2]), nonce: m[3] };
}
