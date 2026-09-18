import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { encryptionFor, loadAccounts, parseAccounts, unencryptedAccounts, type AccountRecord } from "../src/server/accounts.js";

const domains = ["dreambau.com", "dreambau.de", "getme.global", "openresilience.cc", "oriso.org", "trail.ist"];
function fixture(): AccountRecord[] {
  return domains.flatMap((domain) => Array.from({ length: 30 }, (_, i) => ({
    displayName: `Person ${i + 1}`,
    email: `person${i + 1}@${domain}`,
    password: `Password-${i + 1}!`,
    domain,
    imap: "mail.dreambau.com:993",
    smtp: "mail.dreambau.com:465",
    jmap: "https://box.dreambau.com/.well-known/jmap",
    caldav: `https://box.dreambau.com/dav/cal/person${i + 1}%40${domain}/`,
    carddav: `https://box.dreambau.com/dav/card/person${i + 1}%40${domain}/`,
    encryption: encryptionFor(`person${i + 1}@${domain}`)
  })));
}
function withOtpMailbox(): AccountRecord[] {
  const accounts = fixture();
  const index = accounts.findIndex((account) => account.email === "person1@dreambau.de");
  accounts[index] = { ...accounts[index], email: "abe.simpson@dreambau.de", encryption: { state: "disabled" } };
  return accounts;
}
function write(accounts: unknown) {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "testmails-")), "accounts.json");
  writeFileSync(file, JSON.stringify(accounts)); return file;
}

describe("account secret loader", () => {
  it("loads 180 unique records across exactly six domains", () => {
    const accounts = loadAccounts(write(fixture()));
    expect(accounts).toHaveLength(180);
    expect(new Set(accounts.map((a) => a.email)).size).toBe(180);
    expect(new Set(accounts.map((a) => a.domain))).toEqual(new Set(domains));
  });
  it("rejects duplicate emails", () => expect(() => loadAccounts(write([...fixture(), fixture()[0]]))).toThrow(/duplicate/i));
  it("parses the same validated account format directly from a pipe payload", () => expect(parseAccounts(JSON.stringify(fixture()))).toEqual(fixture()));
  it("rejects missing passwords", () => {
    const accounts = fixture(); accounts[0].password = "";
    expect(() => loadAccounts(write(accounts))).toThrow(/password/i);
  });
  it("requires disabled encryption for ORISO and AES-256 S/MIME elsewhere", () => {
    const accounts = loadAccounts(write(fixture()));
    expect(accounts.filter((a) => a.domain === "oriso.org").every((a) => a.encryption.state === "disabled")).toBe(true);
    expect(accounts.filter((a) => a.domain !== "oriso.org").every((a) => a.encryption.state === "encrypted" && a.encryption.symmetricMode === "AES-256")).toBe(true);
  });
  it("keeps the 2FA email-OTP mailboxes unencrypted so the code stays readable", () => {
    const accounts = loadAccounts(write(withOtpMailbox()));
    const otpMailbox = accounts.find((a) => a.email === "abe.simpson@dreambau.de");
    expect(otpMailbox?.encryption.state).toBe("disabled");
    expect([...unencryptedAccounts].every((email) => encryptionFor(email).state === "disabled")).toBe(true);
  });
  it("rejects an encrypted OTP mailbox and an unencrypted ordinary mailbox", () => {
    const encryptedOtp = withOtpMailbox();
    const otpIndex = encryptedOtp.findIndex((a) => a.email === "abe.simpson@dreambau.de");
    encryptedOtp[otpIndex] = { ...encryptedOtp[otpIndex], encryption: encryptionFor("person2@dreambau.de") };
    expect(() => loadAccounts(write(encryptedOtp))).toThrow(/disabled: abe\.simpson@dreambau\.de/);

    const plaintextOrdinary = fixture();
    const ordinaryIndex = plaintextOrdinary.findIndex((a) => a.email === "person2@dreambau.de");
    plaintextOrdinary[ordinaryIndex] = { ...plaintextOrdinary[ordinaryIndex], encryption: { state: "disabled" } };
    expect(() => loadAccounts(write(plaintextOrdinary))).toThrow(/encrypted: person2@dreambau\.de/);
  });
});
