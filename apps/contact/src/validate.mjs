// Field validation (spec 7.2). Returns { ok, values, errors } where errors maps field -> text key.
import url from 'node:url';

const NAME_BAD = /[\u0000-\u001F\u007F-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069]/u;
const LOCAL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}$/;
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const codePoints = s => [...s].length;

export function cleanName(raw) {
  const v = String(raw ?? '').trim();
  if (codePoints(v) > 80 || NAME_BAD.test(v)) return { error: 'contact.err.name' };
  return { value: v };
}

export function cleanEmail(raw) {
  const v = String(raw ?? '').trim();
  const bad = { error: 'contact.err.email' };
  if (v.length < 1 || v.length > 254 || /\s/u.test(v) || /[,;<>()[\]\\":]/.test(v)) return bad;
  const at = v.lastIndexOf('@');
  if (at < 1) return bad;
  const local = v.slice(0, at), domainRaw = v.slice(at + 1);
  if (!LOCAL.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return bad;
  if (!domainRaw || /[\u0000-\u001F\u007F-\u009F]/.test(domainRaw)) return bad;
  const domain = url.domainToASCII(domainRaw.toLowerCase());
  if (!domain || domain.length > 253) return bad;
  const labels = domain.split('.');
  if (labels.length < 2 || !labels.every(l => LABEL.test(l))) return bad;
  const cleaned = `${local}@${domain}`;
  if (cleaned.length > 254) return bad;
  return { value: cleaned };
}

export function cleanMessage(raw) {
  let v = String(raw ?? '').replace(/\r\n?/g, '\n').replace(/[\u2028\u2029]/g, '\n');
  v = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '').trim();
  if (!v) return { error: 'contact.err.message_empty' };
  if (codePoints(v) > 4000) return { error: 'contact.err.message_long' };
  return { value: v };
}

export function validateFields(fields) {
  const out = { name: cleanName(fields.name), email: cleanEmail(fields.email), message: cleanMessage(fields.message) };
  const errors = {};
  for (const [k, r] of Object.entries(out)) if (r.error) errors[k] = r.error;
  const ok = Object.keys(errors).length === 0;
  return { ok, errors, values: ok ? { name: out.name.value, email: out.email.value, message: out.message.value } : null };
}
