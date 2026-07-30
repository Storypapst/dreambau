import path from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server/app.js";
import type { AccountRecord } from "../src/server/accounts.js";
import { createDatabase } from "../src/server/db.js";
import type { RegistryProvider, TestAccessRecord } from "../src/server/infisical-provider.js";
import { createPasskeyStore } from "../src/server/passkey-store.js";
import type { WebAuthnAdapter } from "../src/server/passkey-auth.js";
import type { TestMailReader } from "../src/server/test-mail.js";
import type { RegistryWriter } from "../src/server/infisical-writer.js";

function mailbox(email = "abe.simpson@dreambau.de"): AccountRecord {
  const domain = email.split("@")[1];
  return {
    displayName: "Abe Simpson",
    email,
    password: "mailbox-password",
    domain,
    imap: "mail.dreambau.com:993",
    smtp: "mail.dreambau.com:465",
    jmap: "https://box.dreambau.com/.well-known/jmap",
    caldav: `https://box.dreambau.com/dav/cal/${encodeURIComponent(email)}/`,
    carddav: `https://box.dreambau.com/dav/card/${encodeURIComponent(email)}/`,
    encryption: { state: "encrypted", format: "S/MIME", symmetricMode: "AES-256", encryptOnAppend: true, allowSpamTraining: false }
  };
}

function appRecord(email: string): TestAccessRecord {
  return {
    id: "oriso/pre-dev/e2e-platform-admin-predev",
    project: "oriso",
    environment: "pre-dev",
    kind: "admin",
    displayName: "Abe Simpson",
    username: email,
    email,
    roles: ["platform-admin"],
    permissionsDescription: "Dedicated PreDev E2E platform administrator",
    loginUrl: "https://pre-dev.oriso.example.test",
    secret: "application-password",
    totpSecret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
    responsiblePerson: "qa",
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
    expiresAt: null,
    shared: true,
    rotationStatus: "current",
    documentationUrl: "https://dreambau.com/testmails/"
  };
}

const webauthn: WebAuthnAdapter = {
  generateRegistrationOptions: vi.fn(async () => ({ challenge: "registration" })),
  verifyRegistrationResponse: vi.fn(async () => ({ verified: false })),
  generateAuthenticationOptions: vi.fn(async () => ({ challenge: "authentication-challenge", allowCredentials: [{ id: "credential-id" }] })),
  verifyAuthenticationResponse: vi.fn(async () => ({ verified: true, authenticationInfo: { newCounter: 1 } }))
};

async function authenticatedSetup(options: {
  records?: TestAccessRecord[];
  mailReader?: TestMailReader;
  registryWriter?: RegistryWriter;
} = {}) {
  const abe = mailbox();
  const records = options.records ?? [appRecord(abe.email)];
  const record = records[0];
  const registryProvider: RegistryProvider = {
    async list() { return records; },
    async get(id) { return records.find((candidate) => candidate.id === id) ?? null; }
  };
  const root = mkdtempSync(path.join(tmpdir(), "account-otp-"));
  const database = createDatabase(path.join(root, "catalog.sqlite"));
  database.upsertMetadata(abe.email, { project: "ORISO", roles: [], shippedVersion: "2.02", lifecycleStatus: "active" });
  const passkeyStore = createPasskeyStore(path.join(root, "auth.sqlite"));
  const user = passkeyStore.createUser({ email: "frank@dreambau.com", name: "Frank", projects: ["oriso"], role: "admin" });
  passkeyStore.addCredential({ id: "credential-id", userId: user.id, publicKey: new Uint8Array([1]), counter: 0, transports: ["internal"], deviceType: "multiDevice", backedUp: true });
  const app = createApp({
    passwordHash: "unused",
    secureCookies: false,
    loadAccounts: () => [abe],
    database,
    passkeyStore,
    registryProvider,
    registryWriter: options.registryWriter,
    mailReader: options.mailReader,
    webauthn,
    now: () => new Date(59_000),
    rpId: "dreambau.com",
    expectedOrigin: "https://dreambau.com",
    bootstrapUser: { email: user.email, name: user.name, projects: ["oriso"], role: "admin" }
  });
  const agent = request.agent(app);
  const authOptions = await agent.post("/testmails/api/auth/passkeys/authentication/options").send({ email: user.email });
  await agent.post("/testmails/api/auth/passkeys/authentication/verify").send({ flowId: authOptions.body.flowId, response: { id: "credential-id" } });
  return { agent, database, abe, record };
}

describe("human Springfield OTP access", () => {
  it("shows the linked app login and returns a short-lived TOTP without exposing its seed", async () => {
    const { agent, database, abe, record } = await authenticatedSetup();

    const before = await agent.get("/testmails/api/accounts");
    expect(before.status).toBe(200);
    expect(before.body[0].linkedAccess).toEqual([{
      id: record.id,
      project: "oriso",
      environment: "pre-dev",
      kind: "admin",
      displayName: "Abe Simpson",
      username: abe.email,
      email: abe.email,
      roles: ["platform-admin"],
      loginUrl: "https://pre-dev.oriso.example.test",
      hasTotp: true
    }]);
    expect(before.body[0].metadata.roles).toEqual(["Admin"]);
    expect(before.body[0].access.latest).toBeNull();
    expect(JSON.stringify(before.body)).not.toContain(record.totpSecret);
    expect(JSON.stringify(before.body)).not.toContain(record.secret);

    const otp = await agent.get(`/testmails/api/accounts/${encodeURIComponent(abe.email)}/otp`);
    expect(otp.status).toBe(200);
    expect(otp.headers["cache-control"]).toBe("no-store");
    expect(otp.body).toEqual({
      accountId: record.id,
      source: "totp",
      code: "287082",
      generatedAt: "1970-01-01T00:00:59.000Z",
      expiresAt: "1970-01-01T00:01:00.000Z"
    });
    expect(JSON.stringify(otp.body)).not.toContain(record.totpSecret);
    expect(database.getAccountAccess(abe.email).latest).toMatchObject({ actorId: expect.any(String), action: "otp_requested", accountId: record.id });
  });

  it("falls back to the latest matching mailbox OTP when no app TOTP exists", async () => {
    const emailOtpAppRecord = { ...appRecord("abe.simpson@dreambau.de"), kind: "app-user" as const, totpSecret: undefined };
    const mailReader: TestMailReader = {
      async latest() { return null; },
      async otp(account, query) {
        expect(account.email).toBe("abe.simpson@dreambau.de");
        expect(query).toBe("ORISO");
        return { code: "654321", receivedAt: "2026-07-19T17:00:00.000Z", messageId: "mail-1", subject: "ORISO login code" };
      }
    };
    const { agent, abe } = await authenticatedSetup({ records: [emailOtpAppRecord], mailReader });
    const otp = await agent.get(`/testmails/api/accounts/${encodeURIComponent(abe.email)}/otp?query=ORISO`);
    expect(otp.status).toBe(200);
    expect(otp.body).toMatchObject({ accountId: emailOtpAppRecord.id, source: "mail", code: "654321" });
  });

  it("does not present a mailbox-only record as an application login or search arbitrary mail for an OTP", async () => {
    const mailboxRecord = {
      ...appRecord("abe.simpson@dreambau.de"),
      id: "mailbox:abe.simpson@dreambau.de",
      kind: "mailbox" as const,
      roles: ["mailbox"],
      totpSecret: undefined
    };
    const mailReader: TestMailReader = {
      async latest() { return null; },
      otp: vi.fn(async () => ({ code: "654321", receivedAt: "2026-07-19T17:00:00.000Z", messageId: "unrelated-mail", subject: "Unrelated code" }))
    };
    const { agent, abe } = await authenticatedSetup({ records: [mailboxRecord], mailReader });

    const accounts = await agent.get("/testmails/api/accounts");
    expect(accounts.status).toBe(200);
    expect(accounts.body[0].linkedAccess).toEqual([]);

    const otp = await agent.get(`/testmails/api/accounts/${encodeURIComponent(abe.email)}/otp`);
    expect(otp.status).toBe(404);
    expect(otp.body).toEqual({ error: "linked_account_not_found" });
    expect(mailReader.otp).not.toHaveBeenCalled();
  });

  it("retrieves an application password only on demand for the exact scoped linked account", async () => {
    const { agent, abe, record } = await authenticatedSetup();
    const accounts = await agent.get("/testmails/api/accounts");
    expect(JSON.stringify(accounts.body)).not.toContain(record.secret);

    const secret = await agent.get(`/testmails/api/accounts/${encodeURIComponent(abe.email)}/application-secret?accountId=${encodeURIComponent(record.id)}`);
    expect(secret.status).toBe(200);
    expect(secret.headers["cache-control"]).toBe("no-store");
    expect(secret.body).toEqual({ accountId: record.id, secret: record.secret });
  });

  it("requires a strong human session", async () => {
    const { abe } = await authenticatedSetup();
    const anonymous = await request(createApp({ passwordHash: "unused", secureCookies: false, loadAccounts: () => [abe] }))
      .get(`/testmails/api/accounts/${encodeURIComponent(abe.email)}/otp`);
    expect(anonymous.status).toBe(401);
  });

  it("enrolls a missing app TOTP without returning or auditing its seed", async () => {
    const pending = { ...appRecord("abe.simpson@dreambau.de"), totpSecret: undefined };
    const registryWriter: RegistryWriter = {
      async enrollTotp(expected, secret, updatedAt) {
        expect(expected.id).toBe(pending.id);
        expect(secret).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
        Object.assign(pending, { totpSecret: secret, updatedAt });
        return { recordId: expected.id, updatedAt };
      }
    };
    const { agent, database, abe } = await authenticatedSetup({
      records: [pending],
      registryWriter
    });
    await agent.get("/testmails/api/accounts");

    const response = await agent
      .post(`/testmails/api/accounts/${encodeURIComponent(abe.email)}/totp`)
      .send({
        accountId: pending.id,
        totpSecret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
      });

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toEqual({
      accountId: pending.id,
      enrolled: true,
      updatedAt: "1970-01-01T00:00:59.000Z"
    });
    expect(JSON.stringify(response.body)).not.toContain("GEZDGNBV");
    expect(JSON.stringify(database.getAccountAccess(abe.email))).not.toContain("GEZDGNBV");
    expect(database.getAccountAccess(abe.email).latest).toMatchObject({
      accountId: pending.id,
      action: "totp_enrolled"
    });

    const otp = await agent.get(`/testmails/api/accounts/${encodeURIComponent(abe.email)}/otp?accountId=${encodeURIComponent(pending.id)}`);
    expect(otp.body).toMatchObject({ accountId: pending.id, source: "totp", code: "287082" });
  });

  it("refuses to replace an existing app TOTP", async () => {
    const enrolled = appRecord("abe.simpson@dreambau.de");
    const writer: RegistryWriter = { enrollTotp: vi.fn() };
    const { agent, abe } = await authenticatedSetup({
      records: [enrolled],
      registryWriter: writer
    });
    await agent.get("/testmails/api/accounts");

    const response = await agent
      .post(`/testmails/api/accounts/${encodeURIComponent(abe.email)}/totp`)
      .send({
        accountId: enrolled.id,
        totpSecret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP"
      });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: "totp_already_enrolled" });
    expect(writer.enrollTotp).not.toHaveBeenCalled();
  });

  it("rejects malformed enrollment and fails closed without a writer", async () => {
    const pending = { ...appRecord("abe.simpson@dreambau.de"), totpSecret: undefined };
    const writer: RegistryWriter = { enrollTotp: vi.fn() };
    const withWriter = await authenticatedSetup({ records: [pending], registryWriter: writer });
    await withWriter.agent.get("/testmails/api/accounts");
    const invalid = await withWriter.agent
      .post(`/testmails/api/accounts/${encodeURIComponent(withWriter.abe.email)}/totp`)
      .send({ accountId: pending.id, totpSecret: "not-base32!" });
    expect(invalid.status).toBe(400);
    expect(invalid.body).toEqual({ error: "validation_failed" });
    expect(writer.enrollTotp).not.toHaveBeenCalled();

    const withoutWriter = await authenticatedSetup({ records: [pending] });
    await withoutWriter.agent.get("/testmails/api/accounts");
    const unavailable = await withoutWriter.agent
      .post(`/testmails/api/accounts/${encodeURIComponent(withoutWriter.abe.email)}/totp`)
      .send({ accountId: pending.id, totpSecret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ" });
    expect(unavailable.status).toBe(503);
    expect(unavailable.body).toEqual({ error: "totp_enrollment_unavailable" });
  });
});
