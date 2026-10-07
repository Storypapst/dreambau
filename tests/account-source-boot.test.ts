import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/server/app.js";
import { createDatabase } from "../src/server/db.js";
import { createPasskeyStore } from "../src/server/passkey-store.js";

// The catalogue is read synchronously while createApp is still running, long
// before Infisical can answer. Production crash-looped twice on this: the
// fallback file no longer validates, and an earlier version reached it before
// the Infisical source had been wired up.

const KEYS = [
  "TEST_ACCESS_PROVIDER", "TESTMAILS_ACCOUNTS_SOURCE", "TESTMAILS_ACCOUNTS_PATH",
  "INFISICAL_BASE_URL", "INFISICAL_ORGANIZATION_SLUG", "INFISICAL_CLIENT_ID", "INFISICAL_CLIENT_SECRET",
  "TEST_ACCESS_INFISICAL_ORISO_PROJECT_ID", "TEST_ACCESS_INFISICAL_ORIMO_PROJECT_ID", "TEST_ACCESS_INFISICAL_DREAMBAU_PROJECT_ID"
] as const;
const saved = new Map<string, string | undefined>();

function setEnv(values: Record<string, string>) {
  for (const key of KEYS) if (!saved.has(key)) saved.set(key, process.env[key]);
  Object.assign(process.env, values);
}

afterEach(() => {
  for (const [key, value] of saved) value === undefined ? delete process.env[key] : (process.env[key] = value);
  saved.clear();
});

function unusableAccountsFile() {
  const dir = mkdtempSync(path.join(tmpdir(), "boot-accounts-"));
  const file = path.join(dir, "accounts.json");
  // An OTP mailbox marked encrypted — exactly the drift that was live.
  writeFileSync(file, JSON.stringify([{
    displayName: "Abe Simpson", email: "abe.simpson@dreambau.de", password: "x", domain: "dreambau.de",
    imap: "mail.dreambau.com:993", smtp: "mail.dreambau.com:465",
    jmap: "https://box.dreambau.com/.well-known/jmap",
    caldav: "https://box.dreambau.com/dav/cal/abe/", carddav: "https://box.dreambau.com/dav/card/abe/",
    encryption: { state: "encrypted", format: "S/MIME", symmetricMode: "AES-256", encryptOnAppend: true, allowSpamTraining: false }
  }]));
  return file;
}

function bootWithInfisicalCatalogue() {
  setEnv({
    TEST_ACCESS_PROVIDER: "infisical",
    TESTMAILS_ACCOUNTS_SOURCE: "infisical",
    TESTMAILS_ACCOUNTS_PATH: unusableAccountsFile(),
    // Refused immediately, so the background refresh fails fast and loudly.
    INFISICAL_BASE_URL: "https://127.0.0.1:1",
    INFISICAL_ORGANIZATION_SLUG: "dreambau-test-access",
    INFISICAL_CLIENT_ID: "test-client-id",
    INFISICAL_CLIENT_SECRET: "test-client-secret",
    TEST_ACCESS_INFISICAL_ORISO_PROJECT_ID: "p-oriso",
    TEST_ACCESS_INFISICAL_ORIMO_PROJECT_ID: "p-orimo",
    TEST_ACCESS_INFISICAL_DREAMBAU_PROJECT_ID: "p-dreambau"
  });
  return createApp({
    passwordHash: "unused", sessionSecret: "unused-session-secret", secureCookies: false,
    database: createDatabase(":memory:"),
    passkeyStore: createPasskeyStore(path.join(mkdtempSync(path.join(tmpdir(), "boot-passkeys-")), "auth.sqlite")),
    exportPath: null,
    machineIdentities: []
  });
}

describe("booting with the Infisical catalogue", () => {
  it("refuses to start when the flag is set without an Infisical registry", () => {
    setEnv({
      TEST_ACCESS_PROVIDER: "file",
      TESTMAILS_ACCOUNTS_SOURCE: "infisical",
      TESTMAILS_ACCOUNTS_PATH: unusableAccountsFile()
    });
    expect(() => createApp({
      passwordHash: "unused", sessionSecret: "unused-session-secret", secureCookies: false,
      database: createDatabase(":memory:"),
      passkeyStore: createPasskeyStore(path.join(mkdtempSync(path.join(tmpdir(), "boot-passkeys-")), "auth.sqlite")),
      exportPath: null, machineIdentities: []
    })).toThrow(/requires TEST_ACCESS_PROVIDER=infisical/);
  });

  it("starts even though the fallback file no longer validates", () => {
    expect(() => bootWithInfisicalCatalogue()).not.toThrow();
  });

  it("reports itself unready instead of serving an empty catalogue in silence", async () => {
    const response = await request(bootWithInfisicalCatalogue()).get("/testmails/health/ready");
    expect(response.status).toBe(503);
    expect(response.body.accounts).toMatchObject({ source: "none", degraded: true, count: 0, failing: true });
    // The upstream message names a mailbox and internal validation detail, and
    // this endpoint is public and unauthenticated.
    expect(response.body.accounts).not.toHaveProperty("lastFailure");
    expect(JSON.stringify(response.body)).not.toMatch(/abe\.simpson/);
  });
});
