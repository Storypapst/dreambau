import { createHmac } from "node:crypto";

function decodeBase32(value: string) {
  const normalized = value.trim().toUpperCase().replace(/=+$/, "");
  if (!normalized || !/^[A-Z2-7]+$/.test(normalized)) throw new Error("Invalid Base32 TOTP secret");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of normalized) bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  if (bytes.length < 10) throw new Error("Base32 TOTP secret is too short");
  return Buffer.from(bytes);
}

export function generateTotp(secret: string, now = new Date(), digits = 6, periodSeconds = 30) {
  if (!Number.isInteger(digits) || digits < 6 || digits > 8) throw new Error("TOTP digits must be between 6 and 8");
  const timestamp = now.getTime();
  if (!Number.isFinite(timestamp)) throw new Error("Invalid TOTP timestamp");
  const counter = Math.floor(timestamp / 1000 / periodSeconds);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | (digest[offset + 1] << 16)
    | (digest[offset + 2] << 8)
    | digest[offset + 3];
  const code = String(binary % (10 ** digits)).padStart(digits, "0");
  const expiresAt = new Date((counter + 1) * periodSeconds * 1000);
  return { code, generatedAt: now.toISOString(), expiresAt: expiresAt.toISOString() };
}
