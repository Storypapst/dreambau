import { readFileSync } from "node:fs";
import { z } from "zod";

const encryptedSchema = z.object({
  state: z.literal("encrypted"),
  format: z.literal("S/MIME"),
  symmetricMode: z.literal("AES-256"),
  encryptOnAppend: z.literal(true),
  allowSpamTraining: z.literal(false)
});
const disabledSchema = z.object({ state: z.literal("disabled") });
const accountSchema = z.object({
  displayName: z.string().min(1), email: z.string().email(), password: z.string().min(1), domain: z.string().min(1),
  imap: z.literal("mail.dreambau.com:993"), smtp: z.literal("mail.dreambau.com:465"),
  jmap: z.literal("https://box.dreambau.com/.well-known/jmap"), caldav: z.string().url(), carddav: z.string().url(),
  encryption: z.discriminatedUnion("state", [encryptedSchema, disabledSchema])
});
export type AccountRecord = z.infer<typeof accountSchema>;

const expectedDomains = new Set(["dreambau.com", "dreambau.de", "getme.global", "openresilience.cc", "oriso.org", "trail.ist"]);

export const unencryptedDomains = new Set(["oriso.org"]);
// Mailboxes that carry a 2FA email OTP for a product realm. Encryption at rest turns every
// delivered mail into an S/MIME enveloped-data blob, so the OTP code becomes unreadable.
export const unencryptedAccounts = new Set([
  "abe.simpson@dreambau.de",
  "homer.simpson@dreambau.de",
  "lisa.simpson@dreambau.de",
  "maggie.simpson@dreambau.de"
]);

export function encryptionFor(email: string): AccountRecord["encryption"] {
  const domain = email.split("@").at(-1) ?? "";
  return unencryptedDomains.has(domain) || unencryptedAccounts.has(email)
    ? { state: "disabled" }
    : { state: "encrypted", format: "S/MIME", symmetricMode: "AES-256", encryptOnAppend: true, allowSpamTraining: false };
}

export function parseAccounts(raw: string): AccountRecord[] {
  const parsed = z.array(accountSchema).parse(JSON.parse(raw));
  const emails = new Set<string>();
  for (const account of parsed) {
    if (emails.has(account.email)) throw new Error(`Duplicate email: ${account.email}`);
    emails.add(account.email);
    if (account.email.split("@").at(-1) !== account.domain) throw new Error(`Domain mismatch: ${account.email}`);
    if (!expectedDomains.has(account.domain)) throw new Error(`Unexpected domain: ${account.domain}`);
    const expected = encryptionFor(account.email).state;
    if (account.encryption.state !== expected) throw new Error(`Encryption must be ${expected}: ${account.email}`);
  }
  if (new Set(parsed.map((account) => account.domain)).size !== 6) throw new Error("Exactly six domains are required");
  return parsed;
}

export function loadAccounts(filePath: string): AccountRecord[] {
  return parseAccounts(readFileSync(filePath, "utf8"));
}
