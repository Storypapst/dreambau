import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { encryptedAccounts, encryptionFor, loadAccounts, parseAccounts, type AccountRecord } from "../src/server/accounts.js";

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
  it("describes every mailbox as unencrypted, as Stalwart stores them", () => {
    // 217 of 218 Stalwart accounts are Disabled; the fixture has none of the
    // named exceptions, so every record must say so.
    const accounts = loadAccounts(write(fixture()));
    expect(accounts.every((a) => a.encryption.state === "disabled")).toBe(true);
  });
  it("keeps AES-256 S/MIME for the one mailbox Stalwart really encrypts", () => {
    const accounts = fixture();
    const index = accounts.findIndex((account) => account.email === "person1@dreambau.com");
    accounts[index] = { ...accounts[index], email: "homer.simpson@dreambau.com", encryption: encryptionFor("homer.simpson@dreambau.com") };
    const homer = loadAccounts(write(accounts)).find((a) => a.email === "homer.simpson@dreambau.com");
    expect(homer?.encryption).toMatchObject({ state: "encrypted", symmetricMode: "AES-256" });
    expect([...encryptedAccounts]).toEqual(["homer.simpson@dreambau.com"]);
  });
  it("keeps the 2FA email-OTP mailboxes unencrypted so the code stays readable", () => {
    const accounts = loadAccounts(write(withOtpMailbox()));
    const otpMailbox = accounts.find((a) => a.email === "abe.simpson@dreambau.de");
    expect(otpMailbox?.encryption.state).toBe("disabled");
    for (const name of ["abe", "homer", "lisa", "maggie"]) {
      expect(encryptionFor(`${name}.simpson@dreambau.de`).state).toBe("disabled");
    }
  });
  it("rejects a file that claims encryption Stalwart does not have, in either direction", () => {
    // The drift this policy change corrects: a stored flag saying encrypted for
    // a mailbox that is not. The file fallback still stores the flag, so it must
    // still be refused rather than served as truth.
    const claimsEncrypted = fixture();
    const index = claimsEncrypted.findIndex((a) => a.email === "person2@dreambau.de");
    claimsEncrypted[index] = { ...claimsEncrypted[index], encryption: encryptionFor("homer.simpson@dreambau.com") };
    expect(() => loadAccounts(write(claimsEncrypted))).toThrow(/disabled: person2@dreambau\.de/);

    const claimsDisabled = fixture();
    const homerIndex = claimsDisabled.findIndex((a) => a.email === "person1@dreambau.com");
    claimsDisabled[homerIndex] = { ...claimsDisabled[homerIndex], email: "homer.simpson@dreambau.com", encryption: { state: "disabled" } };
    expect(() => loadAccounts(write(claimsDisabled))).toThrow(/encrypted: homer\.simpson@dreambau\.com/);
  });
});
