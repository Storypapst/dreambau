import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AccountRecord } from "../src/server/accounts.js";
import { testAccessRecordSchema } from "../src/server/infisical-provider.js";
import { buildRecoveryPayload, writeEncryptedRecoveryExport } from "../src/server/recovery-export.js";

const account: AccountRecord = {
  displayName: "Spider Pig",
  email: "spider.pig@oriso.org",
  password: "fake-recovery-password",
  domain: "oriso.org",
  imap: "mail.dreambau.com:993",
  smtp: "mail.dreambau.com:465",
  jmap: "https://box.dreambau.com/.well-known/jmap",
  caldav: "https://box.dreambau.com/dav/cal/spider.pig%40oriso.org/",
  carddav: "https://box.dreambau.com/dav/card/spider.pig%40oriso.org/",
  encryption: { state: "disabled" }
};

describe("SOPS recovery export", () => {
  it("maps test mailboxes only to non-production records", () => {
    const payload = buildRecoveryPayload([account], "2026-07-12T06:30:00.000Z");
    expect(payload.records[0]).toMatchObject({
      id: "mailbox:spider.pig@oriso.org",
      project: "oriso",
      environment: "production-test",
      kind: "mailbox"
    });
    expect(JSON.stringify(payload)).not.toContain('"environment":"production"');
    expect(() => testAccessRecordSchema.parse(payload.records[0])).not.toThrow();
  });

  it("requires two recipients and writes only atomic mode-0600 ciphertext", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "recovery-export-"));
    const output = path.join(directory, "test-access.enc.json");
    expect(() => writeEncryptedRecoveryExport({
      accounts: [account],
      output,
      recipients: ["age1m4only"],
      encrypt: () => "ciphertext"
    })).toThrow(/two distinct age recipients/i);

    writeEncryptedRecoveryExport({
      accounts: [account],
      output,
      recipients: ["age1m4", "age1mini"],
      encrypt: (plaintext, recipients) => {
        expect(plaintext).toContain(account.password);
        expect(recipients).toEqual(["age1m4", "age1mini"]);
        return '{"sops":{"age":[]},"encrypted":"ENC[AES256_GCM,data:test]"}\n';
      }
    });
    const stored = readFileSync(output, "utf8");
    expect(stored).toContain("ENC[AES256_GCM");
    expect(stored).not.toContain(account.password);
    expect(statSync(output).mode & 0o777).toBe(0o600);
  });

  it("rejects an encryptor that leaks a plaintext secret", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "recovery-export-leak-"));
    const output = path.join(directory, "test-access.enc.json");
    expect(() => writeEncryptedRecoveryExport({
      accounts: [account],
      output,
      recipients: ["age1m4", "age1mini"],
      encrypt: () => `not encrypted: ${account.password}`
    })).toThrow(/plaintext secret/i);
    expect(() => readFileSync(output, "utf8")).toThrow();
  });
});
