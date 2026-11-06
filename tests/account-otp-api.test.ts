import path from "node:path";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
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
import type { OrisoProvisioningService } from "../src/server/oriso-provisioning.js";

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

function crossEnvironmentRecords(email: string) {
  const preDevConsultant = {
    ...appRecord(email),
    id: "oriso/pre-dev/abe.simpson-dreambau.de",
    environment: "pre-dev" as const,
    kind: "app-user" as const,
    roles: ["consultant"]
  };
  const devAdviceSeeker = {
    ...appRecord(email),
    id: "oriso/dev/dev_ai_202823_r2_02",
    environment: "dev" as const,
    kind: "app-user" as const,
    roles: ["user"]
  };
  return { preDevConsultant, devAdviceSeeker };
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
  orisoProvisioning?: OrisoProvisioningService;
  exportPath?: string;
} = {}) {
  const abe = mailbox();
  const records = options.records ?? [appRecord(abe.email)];
  const record = records[0];
  const registryProvider: RegistryProvider = {
    async list() { return records; },
    async get(id) { return records.find((candidate) => candidate.id === id) ?? null; }
  };
  const root = mkdtempSync(path.join(tmpdir(), "account-otp-"));
  const databasePath = path.join(root, "catalog.sqlite");
  const database = createDatabase(databasePath);
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
    orisoProvisioning: options.orisoProvisioning,
    exportPath: options.exportPath,
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
  return { agent, database, databasePath, abe, record };
}

describe("ORISO delete candidate cleanup", () => {
  const endpoint = "/testmails/api/accounts/delete-candidate-cleanup";

  it("removes approved links atomically and preserves the mailbox and typed access history", async () => {
    const email = "abe.simpson@dreambau.de";
    const { preDevConsultant, devAdviceSeeker } = crossEnvironmentRecords(email);
    const records = [preDevConsultant, devAdviceSeeker];
    const { agent, database, databasePath } = await authenticatedSetup({ records });
    database.upsertMetadata(email, { lifecycleStatus: "delete_candidate" });
    database.recordAccountAccess({
      accountId: preDevConsultant.id, email, actorId: "qa", action: "otp_requested",
      createdAt: "2026-07-18T00:00:00.000Z", context: { environment: "pre-dev" }
    });

    const preview = await agent.get(endpoint).expect(200);
    expect(preview.body.links).toEqual([
      { id: devAdviceSeeker.id, email, environment: "dev" },
      { id: preDevConsultant.id, email, environment: "pre-dev" }
    ]);
    await agent.post(endpoint).send({ revision: preview.body.revision }).expect(200, { count: 2 });

    const catalogue = await agent.get("/testmails/api/accounts").expect(200);
    expect(catalogue.body[0]).toMatchObject({ email, linkedAccess: [], metadata: { lifecycleStatus: "unused" } });
    expect(catalogue.body[0].access.events.map((event: { action: string }) => event.action)).toEqual(["otp_requested"]);
    const sqlite = new Database(databasePath);
    try {
      const audit = sqlite.prepare("SELECT record_id, email FROM test_access_unlink_audit ORDER BY id").all();
      expect(audit).toEqual([{ record_id: devAdviceSeeker.id, email }, { record_id: preDevConsultant.id, email }]);
    } finally { sqlite.close(); }
    expect(records).toHaveLength(2);
    await agent.post(endpoint).send({ revision: preview.body.revision }).expect(409);
    await request(createApp({ passwordHash: "unused", secureCookies: false, loadAccounts: () => [] }))
      .get(endpoint).expect(401);
  });

  it("rejects stale previews and never unlinks a candidate whose status changed", async () => {
    const { agent, database, abe } = await authenticatedSetup();
    database.upsertMetadata(abe.email, { lifecycleStatus: "delete_candidate" });
    const preview = await agent.get(endpoint).expect(200);
    database.upsertMetadata(abe.email, { lifecycleStatus: "active" });
    await agent.post(endpoint).send({ revision: preview.body.revision }).expect(409);
    expect(database.getTestAccessLinks(abe.email)).toHaveLength(1);
  });

  it("protects a mailbox lease only for the matching project and target environment", async () => {
    const email = "abe.simpson@dreambau.de";
    const { preDevConsultant, devAdviceSeeker } = crossEnvironmentRecords(email);
    const { agent, database } = await authenticatedSetup({ records: [preDevConsultant, devAdviceSeeker] });
    database.upsertMetadata(email, { lifecycleStatus: "delete_candidate" });
    const previous = await agent.get(endpoint).expect(200);
    database.testRuns.create({
      project: "oriso", targetEnvironment: "pre-dev", poolEnvironment: "dev", applicationVersion: "1",
      commitSha: "a".repeat(40), scenario: "smoke", roles: [{ role: "consultant", count: 1 }]
    }, [{ accountId: `mailbox:${email}`, email: ` ${email.toUpperCase()} `, roles: ["consultant"] }],
    { id: "qa", type: "human" }, new Date().toISOString(), "leased-run");
    expect(() => database.unlinkTestAccessCandidates([devAdviceSeeker, preDevConsultant], "qa", new Date().toISOString()))
      .toThrow("cleanup_preview_stale");
    expect(database.getTestAccessLinks(email)).toHaveLength(2);
    await agent.post(endpoint).send({ revision: previous.body.revision }).expect(409);
    const current = await agent.get(endpoint).expect(200);
    expect(current.body.skipped).toBe(1);
    expect(current.body.links).toEqual([{ id: devAdviceSeeker.id, email, environment: "dev" }]);
    await agent.post(endpoint).send({ revision: current.body.revision }).expect(200, { count: 1 });
    expect(database.getTestAccessLinks(email).map((link) => link.recordId)).toEqual([preDevConsultant.id]);
    expect(database.getMetadata(email).lifecycleStatus).toBe("delete_candidate");
  });

  it("blocks a rollback-era link insert and clears suppression when the record ID is reused", async () => {
    const records = [appRecord("abe.simpson@dreambau.de")];
    const { agent, database, databasePath, abe, record } = await authenticatedSetup({ records });
    database.upsertMetadata(abe.email, { lifecycleStatus: "delete_candidate" });
    const preview = await agent.get(endpoint).expect(200);
    await agent.post(endpoint).send({ revision: preview.body.revision }).expect(200, { count: 1 });

    const sqlite = new Database(databasePath);
    try {
      const legacyInsert = sqlite.prepare(`INSERT INTO test_access_record_links
        (record_id,email,secret_name,project,environment,kind,last_seen_at) VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(record_id) DO UPDATE SET last_seen_at=excluded.last_seen_at`);
      expect(legacyInsert.run(record.id, abe.email, "secret-name", record.project, record.environment, record.kind, record.updatedAt).changes)
        .toBe(0);
      records[0] = { ...record, createdAt: "2026-07-18T00:00:00.000Z" };
      database.allowTestAccessRelink(records[0]);
      const older = await agent.get("/testmails/api/accounts").expect(200);
      expect(older.body[0].linkedAccess).toEqual([]);
      expect(sqlite.prepare("SELECT record_created_at FROM test_access_unlinked_records").get())
        .toEqual({ record_created_at: record.createdAt });
      records[0] = { ...record, createdAt: "2026-11-31T00:00:00.000Z" };
      const invalid = await agent.get("/testmails/api/accounts").expect(200);
      expect(invalid.body[0].linkedAccess).toEqual([]);
      records[0] = { ...record, createdAt: "2026-07-20T00:00:00.000Z", updatedAt: "2026-07-20T00:00:00.000Z" };
      const catalogue = await agent.get("/testmails/api/accounts").expect(200);
      expect(catalogue.body[0].linkedAccess).toMatchObject([{ id: record.id }]);
      expect(sqlite.prepare("SELECT record_id FROM test_access_unlinked_records").all()).toEqual([]);
    } finally { sqlite.close(); }
  });

  it("reports committed cleanup even when refreshing the disk export fails", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "candidate-export-"));
    const exportPath = path.join(directory, "accounts.md");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { agent, database, abe } = await authenticatedSetup({ exportPath });
      await vi.waitFor(() => expect(existsSync(exportPath)).toBe(true));
      rmSync(exportPath);
      mkdirSync(exportPath);
      database.upsertMetadata(abe.email, { lifecycleStatus: "delete_candidate" });
      const preview = await agent.get(endpoint).expect(200);
      await agent.post(endpoint).send({ revision: preview.body.revision }).expect(200, { count: 1 });
      expect(database.getTestAccessLinks(abe.email)).toEqual([]);
      expect(database.getMetadata(abe.email).lifecycleStatus).toBe("unused");
      expect(readdirSync(directory)).toEqual(["accounts.md"]);
      expect(log).toHaveBeenCalled();
    } finally {
      log.mockRestore();
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it("rejects provisioning before reaching ORISO or Infisical when the matching record is unlinked", async () => {
    const service: OrisoProvisioningService = {
      target: {
        environment: "pre-dev", apiBaseUrl: "https://api.example.test", tokenUrl: "https://auth.example.test",
        clientId: "test", adminRecordId: "different-admin", adminBaseUrl: "https://admin.example.test",
        appBaseUrl: "https://app.example.test", defaultTenantId: 1, defaultAgencyId: 1,
        defaultConsultingType: "1", defaultPostcode: "10115", defaultMainTopicId: 1
      },
      status: vi.fn(async () => null), ensureInvite: vi.fn(), provision: vi.fn()
    };
    const writer: RegistryWriter = { enrollTotp: vi.fn(), createRecord: vi.fn(), updateRecord: vi.fn() };
    const { agent, database, abe } = await authenticatedSetup({ orisoProvisioning: service, registryWriter: writer });
    database.upsertMetadata(abe.email, { lifecycleStatus: "delete_candidate" });
    const preview = await agent.get(endpoint).expect(200);
    await agent.post(endpoint).send({ revision: preview.body.revision }).expect(200, { count: 1 });
    await agent.post(`/testmails/api/accounts/${encodeURIComponent(abe.email)}/oriso-provisioning`)
      .send({ environment: "pre-dev", role: "platform-admin" })
      .expect(409, { error: "test_access_record_unlinked" });
    expect(service.provision).not.toHaveBeenCalled();
    expect(service.status).not.toHaveBeenCalled();
    expect(writer.updateRecord).not.toHaveBeenCalled();
  });
});

describe("human Springfield OTP access", () => {
  it("keeps Dev roles out of a PreDev mailbox row with the same email", async () => {
    const email = "abe.simpson@dreambau.de";
    const { preDevConsultant, devAdviceSeeker } = crossEnvironmentRecords(email);
    const { agent } = await authenticatedSetup({ records: [preDevConsultant, devAdviceSeeker] });

    const response = await agent.get("/testmails/api/accounts");

    expect(response.status).toBe(200);
    expect(response.body[0].metadata.roles).toEqual(["Berater"]);
    expect(response.body[0].linkedAccess).toHaveLength(1);
    expect(response.body[0].linkedAccess[0]).toMatchObject({
      id: preDevConsultant.id,
      environment: "pre-dev",
      roles: ["consultant"]
    });
  });

  it("does not expose a Dev credential through the matching PreDev mailbox row", async () => {
    const email = "abe.simpson@dreambau.de";
    const { preDevConsultant, devAdviceSeeker } = crossEnvironmentRecords(email);
    const { agent } = await authenticatedSetup({ records: [preDevConsultant, devAdviceSeeker] });

    const response = await agent.get(
      `/testmails/api/accounts/${encodeURIComponent(email)}/application-secret?accountId=${encodeURIComponent(devAdviceSeeker.id)}`
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "linked_account_not_found" });
  });

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
      loginUrl: "https://predev.oriso.org/admin",
      hasTotp: true
    }]);
    expect(before.body[0].metadata.roles).toEqual(["platform-admin"]);
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
