import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadAccounts, parseAccounts, type AccountRecord } from "../src/server/accounts.js";

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
    encryption: domain === "oriso.org" ? { state: "disabled" as const } : { state: "encrypted" as const, format: "S/MIME" as const, symmetricMode: "AES-256" as const, encryptOnAppend: true, allowSpamTraining: false }
  })));
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
});
