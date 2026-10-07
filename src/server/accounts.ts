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

// The six domains the catalogue has always carried. They must all be present —
// a catalogue that lost one is truncated, and silently serving a short list is
// worse than refusing. Additional domains are allowed: a new mailbox on a new
// domain used to throw here and take every other account down with it.
export const requiredDomains = new Set(["dreambau.com", "dreambau.de", "getme.global", "openresilience.cc", "oriso.org", "trail.ist"]);

// Encryption at rest as Stalwart actually has it, measured on 2026-09-21 across
// all 218 accounts: every mailbox is Disabled except one. The policy used to
// say the opposite — encrypted everywhere except oriso.org and four OTP
// mailboxes — and 145 of the 180 catalogue accounts claimed S/MIME that did not
// exist. Once #120 made this value derived instead of stored, nothing would
// ever have flagged it again. The test mailboxes are read through IMAP and
// JMAP, and encryption at rest turns every delivered mail, including 2FA codes,
// into an unreadable S/MIME blob, so unencrypted is also the right default.
export const encryptedAccounts = new Set(["homer.simpson@dreambau.com"]);

export function encryptionFor(email: string): AccountRecord["encryption"] {
  return encryptedAccounts.has(email.trim().toLowerCase())
    ? { state: "encrypted", format: "S/MIME", symmetricMode: "AES-256", encryptOnAppend: true, allowSpamTraining: false }
    : { state: "disabled" };
}

export function parseAccounts(raw: string): AccountRecord[] {
  return validateAccounts(z.array(accountSchema).parse(JSON.parse(raw)));
}

// The same catalogue rules apply however the records arrived — parsed from the
// secret file or mapped from Infisical mailbox records — so both paths run this.
export function validateAccounts(parsed: AccountRecord[]): AccountRecord[] {
  const emails = new Set<string>();
  for (const account of parsed) {
    if (emails.has(account.email)) throw new Error(`Duplicate email: ${account.email}`);
    emails.add(account.email);
    if (account.email.split("@").at(-1) !== account.domain) throw new Error(`Domain mismatch: ${account.email}`);
    const expected = encryptionFor(account.email).state;
    if (account.encryption.state !== expected) throw new Error(`Encryption must be ${expected}: ${account.email}`);
  }
  const present = new Set(parsed.map((account) => account.domain));
  const missing = [...requiredDomains].filter((domain) => !present.has(domain));
  if (missing.length > 0) throw new Error(`Catalogue is missing: ${missing.join(", ")}`);
  return parsed;
}

export function loadAccounts(filePath: string): AccountRecord[] {
  return parseAccounts(readFileSync(filePath, "utf8"));
}
