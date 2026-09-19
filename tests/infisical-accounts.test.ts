import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { accountFromMailboxRecord, accountsFromRecords, createInfisicalAccountSource } from "../src/server/infisical-accounts.js";
import type { RegistryProvider, TestAccessRecord } from "../src/server/infisical-provider.js";

const DOMAINS = ["dreambau.com", "dreambau.de", "getme.global", "openresilience.cc", "oriso.org", "trail.ist"];

function mailbox(email: string, overrides: Partial<TestAccessRecord> = {}): TestAccessRecord {
  const domain = email.split("@")[1];
  return {
    id: `mailbox-${email}`,
    project: domain === "trail.ist" ? "orimo" : domain === "oriso.org" || domain === "openresilience.cc" ? "oriso" : "dreambau",
    environment: "production-test",
    kind: "mailbox",
    displayName: email,
    username: email,
    email,
    roles: [],
    permissionsDescription: "mailbox",
    loginUrl: "https://mail.dreambau.com/",
    secret: `secret-for-${email}`,
    responsiblePerson: "Frank Gerhardt",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: null,
    shared: true,
    rotationStatus: "unknown",
    documentationUrl: "https://dreambau.com/testmails/",
    ...overrides
  };
}

const sixDomains = () => DOMAINS.map((domain) => mailbox(`bart.simpson@${domain}`));

function fallbackFile(records: unknown) {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "accounts-fallback-")), "accounts.json");
  writeFileSync(file, JSON.stringify(records));
  return file;
}

const fileShaped = () => DOMAINS.map((domain) => {
  const email = `marge.simpson@${domain}`;
  const encoded = encodeURIComponent(email);
  return {
    displayName: email, email, password: "from-the-file", domain,
    imap: "mail.dreambau.com:993", smtp: "mail.dreambau.com:465",
    jmap: "https://box.dreambau.com/.well-known/jmap",
    caldav: `https://box.dreambau.com/dav/cal/${encoded}/`,
    carddav: `https://box.dreambau.com/dav/card/${encoded}/`,
    encryption: domain === "oriso.org"
      ? { state: "disabled" }
      : { state: "encrypted", format: "S/MIME", symmetricMode: "AES-256", encryptOnAppend: true, allowSpamTraining: false }
  };
});

describe("mailbox records become catalogue accounts", () => {
  it("maps the record and derives everything the record does not carry", () => {
    const account = accountFromMailboxRecord(mailbox("bart.simpson@dreambau.com"));
    expect(account).toMatchObject({
      email: "bart.simpson@dreambau.com",
      password: "secret-for-bart.simpson@dreambau.com",
      domain: "dreambau.com",
      imap: "mail.dreambau.com:993",
      caldav: "https://box.dreambau.com/dav/cal/bart.simpson%40dreambau.com/"
    });
    expect(account.encryption.state).toBe("encrypted");
  });

  it("derives encryption from the policy, so a stale flag cannot exist", () => {
    // The four OTP mailboxes must come out unencrypted even though nothing in
    // the Infisical record says so — that drift is what broke the file.
    for (const name of ["abe", "homer", "lisa", "maggie"]) {
      expect(accountFromMailboxRecord(mailbox(`${name}.simpson@dreambau.de`)).encryption.state).toBe("disabled");
    }
    expect(accountFromMailboxRecord(mailbox("bart.simpson@dreambau.de")).encryption.state).toBe("encrypted");
    expect(accountFromMailboxRecord(mailbox("bart.simpson@oriso.org")).encryption.state).toBe("disabled");
  });

  it("ignores everything that is not a production-test mailbox", () => {
    const records = [
      ...sixDomains(),
      mailbox("admin@dreambau.com", { kind: "admin", id: "admin-1" }),
      mailbox("stale@dreambau.com", { environment: "dev", id: "stale-1" })
    ];
    expect(accountsFromRecords(records).map((account) => account.email)).toEqual(sixDomains().map((record) => record.email));
  });

  it("refuses a catalogue that does not cover all six domains", () => {
    expect(() => accountsFromRecords(sixDomains().slice(0, 5))).toThrow(/six domains/);
  });

  it("refuses an empty result rather than serving an empty catalogue", () => {
    expect(() => accountsFromRecords([])).toThrow(/no mailbox records/);
  });
});

describe("the catalogue source falls back to the file", () => {
  const provider = (list: () => Promise<TestAccessRecord[]>): RegistryProvider =>
    ({ list, async get() { return null; } });

  it("serves the file until Infisical has answered once", async () => {
    const source = createInfisicalAccountSource({
      registryProvider: provider(async () => sixDomains()),
      fallbackPath: fallbackFile(fileShaped())
    });

    expect(source.status().source).toBe("file");
    expect(source.load()[0].password).toBe("from-the-file");

    await source.refresh();
    expect(source.status().source).toBe("infisical");
    expect(source.load()[0].password).toMatch(/^secret-for-/);
  });

  it("keeps the last good catalogue when a later refresh fails", async () => {
    let fail = false;
    const source = createInfisicalAccountSource({
      registryProvider: provider(async () => {
        if (fail) throw new Error("Infisical secret lookup failed");
        return sixDomains();
      }),
      fallbackPath: fallbackFile(fileShaped())
    });

    await source.refresh();
    fail = true;
    await expect(source.refresh()).rejects.toThrow(/lookup failed/);

    const status = source.status();
    expect(status.source).toBe("infisical");
    expect(status.lastFailure).toMatch(/lookup failed/);
    expect(status.lastRefreshAt).not.toBeNull();
    expect(source.load()[0].password).toMatch(/^secret-for-/);
  });

  it("boots on an unusable file instead of crash-looping, and says so", async () => {
    // The file is a drifting copy. The drift that started this work made it fail
    // validation outright, and load() runs synchronously during createApp — so
    // throwing here would take the whole hub down before the first refresh runs.
    const broken = fallbackFile(fileShaped().map((account, index) =>
      index === 0 ? { ...account, encryption: { state: "disabled" } } : account));
    const source = createInfisicalAccountSource({
      registryProvider: provider(async () => { throw new Error("unreachable"); }),
      fallbackPath: broken
    });

    expect(() => source.load()).not.toThrow();
    expect(source.load()).toEqual([]);
    const status = source.status();
    expect(status.source).toBe("none");
    expect(status.degraded).toBe(true);
    expect(status.lastFailure).toMatch(/Encryption must be encrypted/);
  });

  it("leaves the degraded state behind once Infisical answers", async () => {
    const broken = fallbackFile(fileShaped().map((account, index) =>
      index === 0 ? { ...account, encryption: { state: "disabled" } } : account));
    const source = createInfisicalAccountSource({
      registryProvider: provider(async () => sixDomains()),
      fallbackPath: broken
    });

    expect(source.status().degraded).toBe(true);
    await source.refresh();
    expect(source.status()).toMatchObject({ source: "infisical", degraded: false, count: 6 });
  });

  it("stays on the file when Infisical never answers", async () => {
    const source = createInfisicalAccountSource({
      registryProvider: provider(async () => { throw new Error("unreachable"); }),
      fallbackPath: fallbackFile(fileShaped())
    });

    await expect(source.refresh()).rejects.toThrow(/unreachable/);
    expect(source.status().source).toBe("file");
    expect(source.status().lastFailure).toBe("unreachable");
    expect(source.load()[0].password).toBe("from-the-file");
  });
});
