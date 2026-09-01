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
import type { RegistryWriter } from "../src/server/infisical-writer.js";
import {
  OrisoProvisioningError,
  publicInviteState,
  type OrisoProvisioningService
} from "../src/server/oriso-provisioning.js";

function mailbox(email: string, displayName: string): AccountRecord {
  const domain = email.split("@")[1];
  return {
    displayName,
    email,
    password: "mailbox-password",
    domain,
    imap: "mail.dreambau.com:993",
    smtp: "mail.dreambau.com:465",
    jmap: "https://box.dreambau.com/.well-known/jmap",
    caldav: `https://box.dreambau.com/dav/cal/${encodeURIComponent(email)}/`,
    carddav: `https://box.dreambau.com/dav/card/${encodeURIComponent(email)}/`,
    encryption: { state: "disabled" }
  };
}

function managedRecord(patch: Partial<TestAccessRecord> = {}): TestAccessRecord {
  return {
    id: "oriso/pre-dev/lisa.simpson-dreambau.de",
    project: "oriso",
    environment: "pre-dev",
    kind: "admin",
    displayName: "Lisa Simpson — ORISO PreDev tenant-admin",
    username: "lisa.simpson@dreambau.de",
    email: "lisa.simpson@dreambau.de",
    roles: ["tenant-admin"],
    permissionsDescription: "Managed PreDev tenant administrator",
    loginUrl: "https://admin.oriso-dev.site",
    secret: "Gener4ted-Application*Pass",
    totpSecret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
    responsiblePerson: "qa",
    createdAt: "2026-07-29T08:00:00.000Z",
    updatedAt: "2026-07-29T08:00:00.000Z",
    expiresAt: null,
    shared: true,
    rotationStatus: "current",
    documentationUrl: "https://dreambau.com/testmails/",
    provisioningStatus: "ready",
    ...patch
  };
}

const webauthn: WebAuthnAdapter = {
  generateRegistrationOptions: vi.fn(async () => ({ challenge: "registration" })),
  verifyRegistrationResponse: vi.fn(async () => ({ verified: false })),
  generateAuthenticationOptions: vi.fn(async () => ({ challenge: "authentication-challenge", allowCredentials: [{ id: "credential-id" }] })),
  verifyAuthenticationResponse: vi.fn(async () => ({ verified: true, authenticationInfo: { newCounter: 1 } }))
};

function inviteFixture(patch: Record<string, unknown> = {}) {
  return publicInviteState({
    id: 41,
    targetRole: "TENANT_ADMIN",
    recipientEmail: "lisa.simpson@dreambau.de",
    inviteStatus: "EMAIL_SENT",
    emailVerificationStatus: "PENDING",
    twoFactorStatus: "PENDING_SETUP",
    accessGateStatus: "BLOCKED_INVITE",
    createDate: "2026-07-29T14:00:00",
    expiresAt: "2026-08-28T14:00:00",
    acceptedAt: null,
    ...patch
  } as never);
}

function fakeService(overrides: Partial<OrisoProvisioningService> = {}): OrisoProvisioningService {
  return {
    target: {
      environment: "pre-dev",
      apiBaseUrl: "https://api.oriso-dev.site/service",
      tokenUrl: "https://auth.oriso-dev.site/realms/online-beratung/protocol/openid-connect/token",
      clientId: "app",
      adminRecordId: "oriso/pre-dev/e2e-platform-admin-predev",
      adminBaseUrl: "https://admin.oriso-dev.site",
      appBaseUrl: "https://app.oriso-dev.site",
      defaultTenantId: 7,
      defaultAgencyId: 12,
      defaultConsultingType: "1",
      defaultPostcode: "10115",
      defaultMainTopicId: 31
    },
    status: vi.fn(async () => null),
    ensureInvite: vi.fn(async () => ({ created: true, state: inviteFixture() })),
    provision: vi.fn(async ({ record, role, storeTotp }) => {
      const alreadyManaged = Boolean(record.totpSecret);
      const totpSecret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
      if (!record.totpSecret) await storeTotp(totpSecret);
      return {
        created: !alreadyManaged,
        state: inviteFixture({
          targetRole: role === "tenant-admin" ? "TENANT_ADMIN" : "COUNSELLOR",
          inviteStatus: "DIRECT_CREATED",
          twoFactorStatus: "ACTIVE",
          accessGateStatus: "READY"
        })
      };
    }),
    ...overrides
  };
}

function fakeDevService(overrides: Partial<OrisoProvisioningService> = {}): OrisoProvisioningService {
  return fakeService({
    target: {
      environment: "dev",
      apiBaseUrl: "https://dev.oriso.org/service",
      tokenUrl: "https://dev.oriso.org/auth/realms/online-beratung/protocol/openid-connect/token",
      clientId: "app",
      adminRecordId: "oriso/dev/e2e-platform-admin-dev",
      adminBaseUrl: "https://dev.oriso.org/admin",
      appBaseUrl: "https://dev.oriso.org",
      defaultTenantId: 7,
      defaultAgencyId: 12,
      defaultConsultingType: "1",
      defaultPostcode: "10115",
      defaultMainTopicId: 31
    },
    ...overrides
  });
}

async function setup(options: {
  service?: OrisoProvisioningService;
  services?: Partial<Record<"pre-dev" | "dev", OrisoProvisioningService>>;
  writer?: RegistryWriter | null;
  records?: TestAccessRecord[];
  role?: "admin" | "member";
  projects?: Array<"oriso" | "orimo" | "dreambau">;
  grantEnvironments?: Array<"local" | "pre-dev" | "dev" | "production-test">;
} = {}) {
  const lisa = mailbox("lisa.simpson@dreambau.de", "Lisa Simpson");
  const bart = mailbox("bart.simpson@oriso.org", "Bart Simpson");
  const moe = mailbox("moe.szyslak@getme.global", "Moe Szyslak");
  const records = options.records ?? [];
  const registryProvider: RegistryProvider = {
    async list() { return [...records]; },
    async get(id) { return records.find((record) => record.id === id) ?? null; }
  };
  const createdRecords: TestAccessRecord[] = [];
  const writer = options.writer === null ? undefined : options.writer ?? {
    enrollTotp: vi.fn(async (record: TestAccessRecord, totpSecret: string, updatedAt: string) => {
      Object.assign(record, { totpSecret, updatedAt });
      return { recordId: record.id, updatedAt };
    }),
    createRecord: vi.fn(async (record: TestAccessRecord) => {
      createdRecords.push(record);
      records.push(record);
      return { recordId: record.id };
    }),
    updateRecord: vi.fn(async (record: TestAccessRecord) => {
      const index = records.findIndex((candidate) => candidate.id === record.id);
      if (index >= 0) records[index] = record;
      return { recordId: record.id, updatedAt: record.updatedAt };
    }),
    updateApplicationPassword: vi.fn(async (record: TestAccessRecord, secret: string, updatedAt: string) => {
      const index = records.findIndex((candidate) => candidate.id === record.id);
      if (index >= 0) records[index] = { ...records[index], secret, provisioningStatus: "pending", updatedAt };
      return { recordId: record.id, updatedAt };
    })
  };
  const root = mkdtempSync(path.join(tmpdir(), "oriso-provisioning-"));
  const database = createDatabase(path.join(root, "catalog.sqlite"));
  database.upsertMetadata(lisa.email, { project: "ORISO", roles: [], lifecycleStatus: "unused" });
  database.upsertMetadata(bart.email, { project: "ORISO", roles: [], lifecycleStatus: "unused" });
  const passkeyStore = createPasskeyStore(path.join(root, "auth.sqlite"));
  const projects = options.projects ?? ["oriso", "dreambau"];
  const user = passkeyStore.createUser({
    email: "frank@dreambau.com",
    name: "Frank",
    projects,
    role: options.role ?? "admin"
  });
  if (options.grantEnvironments) {
    passkeyStore.grants.replaceLocal(user.id, projects.map((project) => ({
      userId: user.id,
      project,
      environments: options.grantEnvironments!,
      source: "local" as const
    })));
  }
  passkeyStore.addCredential({ id: "credential-id", userId: user.id, publicKey: new Uint8Array([1]), counter: 0, transports: ["internal"], deviceType: "multiDevice", backedUp: true });
  const service = options.service ?? fakeService();
  const emailOtpCodes: string[] = [];
  const app = createApp({
    passwordHash: "unused",
    secureCookies: false,
    loadAccounts: () => [lisa, bart, moe],
    database,
    passkeyStore,
    registryProvider,
    registryWriter: writer,
    orisoProvisioning: service,
    orisoProvisioningServices: options.services,
    webauthn,
    emailOtpSender: { async send(message) { emailOtpCodes.push(message.code); } },
    emailOtpHmacKey: "issue-88-email-otp-test-key-with-enough-entropy",
    now: () => new Date("2026-07-29T16:00:00.000Z"),
    rpId: "dreambau.com",
    expectedOrigin: "https://dreambau.com",
    bootstrapUser: { email: user.email, name: user.name, projects: ["oriso", "dreambau"], role: "admin" }
  });
  const agent = request.agent(app);
  const authOptions = await agent.post("/testmails/api/auth/passkeys/authentication/options").send({ email: user.email });
  await agent.post("/testmails/api/auth/passkeys/authentication/verify").send({ flowId: authOptions.body.flowId, response: { id: "credential-id" } });
  return { agent, app, database, lisa, bart, moe, service, writer, createdRecords, user, passkeyStore, emailOtpCodes };
}

describe("human self-service ORISO PreDev provisioning", () => {
  it("links an existing onboarding account with its real password without direct provisioning", async () => {
    const existingState = inviteFixture({
      inviteStatus: "ACCEPTED",
      emailVerificationStatus: "VERIFIED",
      twoFactorStatus: "PENDING_SETUP",
      accessGateStatus: "BLOCKED_TWO_FACTOR",
      acceptedAt: "2026-07-29T15:30:00.000Z"
    });
    const service = fakeService({
      status: vi.fn(async () => existingState),
      provision: vi.fn()
    });
    const { agent, lisa, createdRecords, writer } = await setup({ service });
    const applicationPassword = "Password-Actually-Used-In-ORISO";

    const response = await agent
      .post(`/testmails/api/accounts/${encodeURIComponent(lisa.email)}/oriso-provisioning`)
      .send({ environment: "pre-dev", role: "tenant-admin", applicationPassword });

    expect(response.status).toBe(201);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toMatchObject({
      created: false,
      recordCreated: true,
      state: { state: "two-factor-pending", nextStep: "store-totp" },
      linked: {
        id: "oriso/pre-dev/lisa.simpson-dreambau.de",
        hasTotp: false,
        roles: ["tenant-admin"]
      }
    });
    expect(JSON.stringify(response.body)).not.toContain(applicationPassword);
    expect(createdRecords).toHaveLength(1);
    expect(createdRecords[0].secret).toBe(applicationPassword);
    expect(createdRecords[0].provisioningStatus).toBe("pending");
    expect(service.provision).not.toHaveBeenCalled();
    expect(writer?.updateRecord).not.toHaveBeenCalled();
  });

  it("does not create a misleading random-password record for an existing onboarding account", async () => {
    const existingState = inviteFixture({
      inviteStatus: "ACCEPTED",
      emailVerificationStatus: "VERIFIED",
      twoFactorStatus: "PENDING_SETUP",
      accessGateStatus: "BLOCKED_TWO_FACTOR"
    });
    const service = fakeService({
      status: vi.fn(async () => existingState),
      provision: vi.fn()
    });
    const { agent, lisa, writer } = await setup({ service });

    const response = await agent
      .post(`/testmails/api/accounts/${encodeURIComponent(lisa.email)}/oriso-provisioning`)
      .send({ environment: "pre-dev", role: "tenant-admin" });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: "application_password_required" });
    expect(writer?.createRecord).not.toHaveBeenCalled();
    expect(writer?.updateRecord).not.toHaveBeenCalled();
    expect(service.provision).not.toHaveBeenCalled();
  });

  it("repairs the password of an incomplete linked record without direct provisioning", async () => {
    const incomplete = managedRecord({ totpSecret: undefined, provisioningStatus: "failed" });
    const service = fakeService({
      status: vi.fn(async () => null),
      provision: vi.fn()
    });
    const { agent, lisa, writer, database } = await setup({ records: [incomplete], service });
    const applicationPassword = "Password-Actually-Used-In-ORISO";

    const response = await agent
      .post(`/testmails/api/accounts/${encodeURIComponent(lisa.email)}/oriso-provisioning`)
      .send({ environment: "pre-dev", role: "tenant-admin", applicationPassword });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      created: false,
      recordCreated: false,
      state: null,
      provisioningRole: "tenant-admin",
      linked: { id: incomplete.id, hasTotp: false }
    });
    expect(JSON.stringify(response.body)).not.toContain(applicationPassword);
    expect(writer?.updateApplicationPassword).toHaveBeenCalledWith(
      expect.objectContaining({ id: incomplete.id, provisioningStatus: "failed" }),
      applicationPassword,
      "2026-07-29T16:00:00.000Z"
    );
    expect(service.provision).not.toHaveBeenCalled();
    expect(database.getAccountAccess(lisa.email).events).toEqual(expect.arrayContaining([
        expect.objectContaining({ action: "application_password_updated", accountId: incomplete.id })
      ]));
  });

  it.each([
    ["stored TOTP", managedRecord({ provisioningStatus: "failed" })],
    ["ready status", managedRecord({ totpSecret: undefined, provisioningStatus: "ready" })]
  ])("locks password replacement for a managed record with %s", async (_case, existing) => {
    const service = fakeService({ status: vi.fn(async () => null), provision: vi.fn() });
    const { agent, lisa, writer } = await setup({ records: [existing], service });

    const response = await agent
      .post(`/testmails/api/accounts/${encodeURIComponent(lisa.email)}/oriso-provisioning`)
      .send({ environment: "pre-dev", role: "tenant-admin", applicationPassword: "Replacement-Password" });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: "managed_record_password_locked" });
    expect(writer?.updateApplicationPassword).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", null],
    ["wrong role", inviteFixture({ targetRole: "COUNSELLOR" })]
  ])("rejects a %s onboarding state before storing a supplied password", async (_case, state) => {
    const service = fakeService({ status: vi.fn(async () => state), provision: vi.fn() });
    const { agent, lisa, writer } = await setup({ service });

    const response = await agent
      .post(`/testmails/api/accounts/${encodeURIComponent(lisa.email)}/oriso-provisioning`)
      .send({ environment: "pre-dev", role: "tenant-admin", applicationPassword: "Onboarding-Password" });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: "oriso_onboarding_state_mismatch" });
    expect(writer?.createRecord).not.toHaveBeenCalled();
  });

  it("fails closed when an incomplete record cannot update its application password", async () => {
    const incomplete = managedRecord({ totpSecret: undefined, provisioningStatus: "failed" });
    const state = inviteFixture({ inviteStatus: "ACCEPTED", accessGateStatus: "BLOCKED_TWO_FACTOR" });
    const writer: RegistryWriter = {
      enrollTotp: vi.fn(),
      createRecord: vi.fn(),
      updateRecord: vi.fn()
    };
    const { agent, lisa } = await setup({ records: [incomplete], service: fakeService({ status: vi.fn(async () => state) }), writer });

    const response = await agent
      .post(`/testmails/api/accounts/${encodeURIComponent(lisa.email)}/oriso-provisioning`)
      .send({ environment: "pre-dev", role: "tenant-admin", applicationPassword: "Onboarding-Password" });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: "record_password_update_unavailable" });
  });

  it("rejects whitespace-only application passwords without changing valid password bytes", async () => {
    const state = inviteFixture({ inviteStatus: "ACCEPTED", accessGateStatus: "BLOCKED_TWO_FACTOR" });
    const service = fakeService({ status: vi.fn(async () => state), provision: vi.fn() });
    const { agent, lisa, createdRecords, writer } = await setup({ service });

    const rejected = await agent
      .post(`/testmails/api/accounts/${encodeURIComponent(lisa.email)}/oriso-provisioning`)
      .send({ environment: "pre-dev", role: "tenant-admin", applicationPassword: "   " });
    expect(rejected.status).toBe(400);
    expect(writer?.createRecord).not.toHaveBeenCalled();

    const exact = "  exact password bytes  ";
    const accepted = await agent
      .post(`/testmails/api/accounts/${encodeURIComponent(lisa.email)}/oriso-provisioning`)
      .send({ environment: "pre-dev", role: "tenant-admin", applicationPassword: exact });
    expect(accepted.status).toBe(201);
    expect(createdRecords[0].secret).toBe(exact);
  });

  it("persists password and TOTP across a fresh status load before reporting the account ready", async () => {
    const pendingState = inviteFixture({
      inviteStatus: "ACCEPTED",
      emailVerificationStatus: "VERIFIED",
      twoFactorStatus: "PENDING_SETUP",
      accessGateStatus: "BLOCKED_TWO_FACTOR",
      acceptedAt: "2026-07-29T15:30:00.000Z"
    });
    const incomplete = managedRecord({ totpSecret: undefined, provisioningStatus: "failed" });
    const service = fakeService({ status: vi.fn(async () => pendingState) });
    const { agent, lisa } = await setup({ records: [incomplete], service });
    const applicationPassword = "Password-Actually-Used-In-ORISO";
    const totpSecret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

    expect((await agent
      .post(`/testmails/api/accounts/${encodeURIComponent(lisa.email)}/oriso-provisioning`)
      .send({ environment: "pre-dev", role: "tenant-admin", applicationPassword })).status).toBe(200);

    const enrolled = await agent
      .post(`/testmails/api/accounts/${encodeURIComponent(lisa.email)}/totp`)
      .send({ accountId: incomplete.id, totpSecret });
    expect(enrolled.status).toBe(200);
    expect(JSON.stringify(enrolled.body)).not.toContain(totpSecret);

    const verified = await agent
      .post(`/testmails/api/accounts/${encodeURIComponent(lisa.email)}/oriso-provisioning`)
      .send({ environment: "pre-dev", role: "tenant-admin" });
    expect(verified.status).toBe(200);
    expect(verified.body).toMatchObject({
      created: false,
      recordCreated: false,
      state: { state: "ready", nextStep: "none" },
      linked: { id: incomplete.id, hasTotp: true }
    });

    const fresh = await agent.get(`/testmails/api/accounts/${encodeURIComponent(lisa.email)}/oriso-provisioning`);
    expect(fresh.status).toBe(200);
    expect(fresh.body).toMatchObject({
      state: { state: "ready", nextStep: "none" },
      linked: { id: incomplete.id, hasTotp: true }
    });
    expect(JSON.stringify(fresh.body)).not.toContain(applicationPassword);
    expect(JSON.stringify(fresh.body)).not.toContain(totpSecret);
  });

  it("creates the account, links a stable record and never leaks generated secrets", async () => {
    const { agent, database, lisa, service, createdRecords } = await setup();

    const response = await agent
      .post(`/testmails/api/accounts/${encodeURIComponent(lisa.email)}/oriso-provisioning`)
      .send({ environment: "pre-dev", role: "tenant-admin" });

    expect(response.status).toBe(201);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(service.provision).toHaveBeenCalledWith(expect.objectContaining({
      record: expect.objectContaining({ email: lisa.email, roles: ["tenant-admin"] }),
      firstName: "Lisa",
      lastName: "Simpson",
      role: "tenant-admin",
      storeTotp: expect.any(Function)
    }));
    expect(response.body).toMatchObject({
      created: true,
      recordCreated: true,
      state: { state: "ready", nextStep: "none" },
      linked: {
        id: "oriso/pre-dev/lisa.simpson-dreambau.de",
        project: "oriso",
        environment: "pre-dev",
        kind: "admin",
        email: lisa.email,
        roles: ["tenant-admin"],
        hasTotp: true
      }
    });

    expect(createdRecords).toHaveLength(1);
    const secret = createdRecords[0].secret;
    expect(secret).toHaveLength(24);
    expect(JSON.stringify(response.body)).not.toContain(secret);

    const links = database.getTestAccessLinks(lisa.email);
    expect(links.map((link) => link.recordId)).toContain("oriso/pre-dev/lisa.simpson-dreambau.de");
    const access = database.getAccountAccess(lisa.email);
    expect(access.events.map((event) => event.action).sort()).toEqual(["oriso_account_provisioned", "record_linked"]);
    expect(JSON.stringify(access)).not.toContain(secret);
  });

  it("is idempotent: reports the existing ready account and record instead of duplicating them", async () => {
    const { agent, lisa, service, writer } = await setup();
    await agent
      .post(`/testmails/api/accounts/${encodeURIComponent(lisa.email)}/oriso-provisioning`)
      .send({ environment: "pre-dev", role: "tenant-admin" });

    const second = await agent
      .post(`/testmails/api/accounts/${encodeURIComponent(lisa.email)}/oriso-provisioning`)
      .send({ environment: "pre-dev", role: "tenant-admin" });

    expect(second.status).toBe(200);
    expect(second.body.created).toBe(false);
    expect(second.body.recordCreated).toBe(false);
    expect(second.body.state.state).toBe("ready");
    expect(vi.mocked(writer!.createRecord!)).toHaveBeenCalledTimes(1);
  });

  it("reuses a stale ready platform-admin record when the live service restores its account", async () => {
    const existing = managedRecord({
      id: "oriso/pre-dev/lisa.simpson-dreambau.de",
      displayName: "Lisa Simpson — ORISO PreDev platform-admin",
      roles: ["platform-admin"]
    });
    const restoredState = inviteFixture({
      targetRole: "PLATFORM_ADMIN",
      inviteStatus: "DIRECT_CREATED",
      emailVerificationStatus: "VERIFIED",
      twoFactorStatus: "ACTIVE",
      accessGateStatus: "READY"
    });
    const service = fakeService({
      provision: vi.fn(async () => ({ created: true, state: restoredState }))
    });
    const { agent, lisa, writer } = await setup({ records: [existing], service });

    const response = await agent
      .post(`/testmails/api/accounts/${encodeURIComponent(lisa.email)}/oriso-provisioning`)
      .send({ environment: "pre-dev", role: "platform-admin" });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      created: true,
      recordCreated: false,
      linked: { id: existing.id, roles: ["platform-admin"], hasTotp: true }
    });
    expect(service.provision).toHaveBeenCalledWith(expect.objectContaining({
      record: expect.objectContaining({ id: existing.id, roles: ["platform-admin"] }),
      role: "platform-admin"
    }));
    expect(vi.mocked(writer!.createRecord!)).not.toHaveBeenCalled();
  });

  it("refuses to re-provision a mailbox with a different role than its linked record", async () => {
    const { agent, lisa, service, writer } = await setup();
    await agent
      .post(`/testmails/api/accounts/${encodeURIComponent(lisa.email)}/oriso-provisioning`)
      .send({ environment: "pre-dev", role: "tenant-admin" });

    const conflict = await agent
      .post(`/testmails/api/accounts/${encodeURIComponent(lisa.email)}/oriso-provisioning`)
      .send({ environment: "pre-dev", role: "counsellor" });

    expect(conflict.status).toBe(409);
    expect(conflict.body).toMatchObject({
      error: "record_role_conflict",
      linked: { id: "oriso/pre-dev/lisa.simpson-dreambau.de", roles: ["tenant-admin"] }
    });
    expect(service.provision).toHaveBeenCalledTimes(1);
    expect(vi.mocked(writer!.createRecord!)).toHaveBeenCalledTimes(1);
  });

  it("maps record-write failures to a dedicated error after the invite succeeded", async () => {
    const { agent, lisa } = await setup({
      writer: {
        enrollTotp: vi.fn(),
        createRecord: vi.fn(async () => { throw new Error("Infisical record creation failed"); }),
        updateRecord: vi.fn()
      }
    });
    const response = await agent
      .post(`/testmails/api/accounts/${encodeURIComponent(lisa.email)}/oriso-provisioning`)
      .send({ environment: "pre-dev", role: "tenant-admin" });
    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: "record_creation_failed" });
  });

  it("rejects every environment that conflicts with the mailbox domain before any ORISO call", async () => {
    const { agent, lisa, service } = await setup();
    for (const environment of ["production-test", "dev", "local"]) {
      const response = await agent
        .post(`/testmails/api/accounts/${encodeURIComponent(lisa.email)}/oriso-provisioning`)
        .send({ environment, role: "tenant-admin" });
      expect(response.status).toBe(422);
      expect(response.body).toEqual({ error: "environment_mismatch", environment: "pre-dev" });
    }
    const invalid = await agent
      .post(`/testmails/api/accounts/${encodeURIComponent(lisa.email)}/oriso-provisioning`)
      .send({ environment: "production", role: "tenant-admin" });
    expect(invalid.status).toBe(400);
    expect(service.provision).not.toHaveBeenCalled();
  });

  it("rejects unsupported roles and mailboxes outside the ORISO scope", async () => {
    const { agent, lisa, moe, service } = await setup();
    const badRole = await agent
      .post(`/testmails/api/accounts/${encodeURIComponent(lisa.email)}/oriso-provisioning`)
      .send({ environment: "pre-dev", role: "super-admin" });
    expect(badRole.status).toBe(400);

    const wrongProject = await agent
      .post(`/testmails/api/accounts/${encodeURIComponent(moe.email)}/oriso-provisioning`)
      .send({ environment: "pre-dev", role: "tenant-admin" });
    expect(wrongProject.status).toBe(422);
    expect(wrongProject.body).toEqual({ error: "environment_not_supported" });
    expect(service.provision).not.toHaveBeenCalled();
  });

  it("reports an unsupported mailbox domain consistently on GET", async () => {
    const { agent, moe, service } = await setup();
    const response = await agent.get(
      `/testmails/api/accounts/${encodeURIComponent(moe.email)}/oriso-provisioning`
    );
    expect(response.status).toBe(422);
    expect(response.body).toEqual({ error: "environment_not_supported" });
    expect(service.status).not.toHaveBeenCalled();
  });

  it("grants an ORISO-scoped member the same provisioning entitlement exposed by /auth/me", async () => {
    const member = await setup({ role: "member" });
    const currentUser = await member.agent.get("/testmails/api/auth/me");
    expect(currentUser.status).toBe(200);
    expect(currentUser.body.entitlements).toEqual({
      orisoProvisioning: { environments: ["pre-dev", "dev"] }
    });
    const status = await member.agent.get(
      `/testmails/api/accounts/${encodeURIComponent(member.lisa.email)}/oriso-provisioning`
    );
    expect(status.status).toBe(200);

    const provisioned = await member.agent
      .post(`/testmails/api/accounts/${encodeURIComponent(member.lisa.email)}/oriso-provisioning`)
      .send({ environment: "pre-dev", role: "tenant-admin" });
    expect(provisioned.status).toBe(201);

    const { lisa } = await setup();
    const anonymous = await request(createApp({ passwordHash: "unused", secureCookies: false, loadAccounts: () => [lisa] }))
      .post(`/testmails/api/accounts/${encodeURIComponent(lisa.email)}/oriso-provisioning`)
      .send({ environment: "pre-dev", role: "tenant-admin" });
    expect(anonymous.status).toBe(401);

    const recoveryCodes = await member.agent.post("/testmails/api/auth/recovery-codes");
    const recovery = request.agent(member.app);
    expect((await recovery.post("/testmails/api/auth/recovery").send({
      email: member.user.email,
      code: recoveryCodes.body.codes[0]
    })).status).toBe(200);
    const bootstrapDenied = await recovery
      .post(`/testmails/api/accounts/${encodeURIComponent(member.lisa.email)}/oriso-provisioning`)
      .send({ environment: "pre-dev", role: "tenant-admin" });
    expect(bootstrapDenied.status).toBe(403);
    expect(bootstrapDenied.body).toEqual({ error: "strong_auth_required" });
  });

  it("denies foreign-project members and ORISO environments outside their server grant", async () => {
    const foreign = await setup({ role: "member", projects: ["dreambau"] });
    const foreignResponse = await foreign.agent
      .post(`/testmails/api/accounts/${encodeURIComponent(foreign.lisa.email)}/oriso-provisioning`)
      .send({ environment: "pre-dev", role: "tenant-admin" });
    expect(foreignResponse.status).toBe(403);
    expect(foreignResponse.body).toEqual({ error: "oriso_provisioning_required" });
    expect(foreign.service.provision).not.toHaveBeenCalled();

    const devOnly = await setup({ role: "member", projects: ["oriso"], grantEnvironments: ["dev"] });
    const currentUser = await devOnly.agent.get("/testmails/api/auth/me");
    expect(currentUser.body.entitlements).toEqual({
      orisoProvisioning: { environments: ["dev"] }
    });
    const preDevResponse = await devOnly.agent
      .post(`/testmails/api/accounts/${encodeURIComponent(devOnly.lisa.email)}/oriso-provisioning`)
      .send({ environment: "pre-dev", role: "tenant-admin" });
    expect(preDevResponse.status).toBe(403);
    expect(preDevResponse.body).toEqual({ error: "oriso_provisioning_environment_denied" });
    expect(devOnly.service.provision).not.toHaveBeenCalled();
  });

  it("keeps email-OTP sessions read-only and hides the provisioning entitlement", async () => {
    const member = await setup({ role: "member", projects: ["oriso"] });
    const emailOtp = request.agent(member.app);
    expect((await emailOtp.post("/testmails/api/auth/email-otp/request").send({ email: member.user.email })).status).toBe(202);
    await vi.waitFor(() => expect(member.emailOtpCodes).toHaveLength(1));
    expect((await emailOtp.post("/testmails/api/auth/email-otp/verify").send({
      email: member.user.email,
      code: member.emailOtpCodes[0]
    })).status).toBe(200);

    const currentUser = await emailOtp.get("/testmails/api/auth/me");
    expect(currentUser.body.entitlements).toEqual({ orisoProvisioning: { environments: [] } });
    const status = await emailOtp.get(
      `/testmails/api/accounts/${encodeURIComponent(member.lisa.email)}/oriso-provisioning`
    );
    expect(status.status).toBe(403);
    expect(status.body).toEqual({ error: "passkey_required" });
    const mutation = await emailOtp
      .post(`/testmails/api/accounts/${encodeURIComponent(member.lisa.email)}/oriso-provisioning`)
      .send({ environment: "pre-dev", role: "tenant-admin" });
    expect(mutation.status).toBe(403);
    expect(mutation.body).toEqual({ error: "passkey_required" });
    expect(member.service.provision).not.toHaveBeenCalled();
  });

  it("fails closed when an entitled human is disabled after authentication", async () => {
    const disabled = await setup({ role: "member", projects: ["oriso"] });
    disabled.passkeyStore.setUserStatus(disabled.user.id, "disabled");
    const response = await disabled.agent
      .post(`/testmails/api/accounts/${encodeURIComponent(disabled.lisa.email)}/oriso-provisioning`)
      .send({ environment: "pre-dev", role: "tenant-admin" });
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "user_disabled" });
    expect(disabled.service.provision).not.toHaveBeenCalled();
  });

  it("fails closed without a provisioning service or record writer", async () => {
    const { agent, lisa } = await setup({ writer: null });
    const noWriter = await agent
      .post(`/testmails/api/accounts/${encodeURIComponent(lisa.email)}/oriso-provisioning`)
      .send({ environment: "pre-dev", role: "tenant-admin" });
    expect(noWriter.status).toBe(503);
    expect(noWriter.body).toEqual({ error: "record_creation_unavailable" });
  });

  it("maps provisioning failures to safe machine-readable errors", async () => {
    const { agent, lisa } = await setup({
      service: fakeService({
        provision: vi.fn(async () => { throw new OrisoProvisioningError("account_credentials_mismatch"); })
      })
    });
    const missingTemplate = await agent
      .post(`/testmails/api/accounts/${encodeURIComponent(lisa.email)}/oriso-provisioning`)
      .send({ environment: "pre-dev", role: "counsellor" });
    expect(missingTemplate.status).toBe(409);
    expect(missingTemplate.body).toEqual({ error: "account_credentials_mismatch" });

    const failing = await setup({
      service: fakeService({
        provision: vi.fn(async () => { throw new OrisoProvisioningError("oriso_authentication_failed"); })
      })
    });
    const upstream = await failing.agent
      .post(`/testmails/api/accounts/${encodeURIComponent(failing.lisa.email)}/oriso-provisioning`)
      .send({ environment: "pre-dev", role: "tenant-admin" });
    expect(upstream.status).toBe(502);
    expect(upstream.body).toEqual({ error: "oriso_authentication_failed" });
  });

  it("marks a newly created Test Access record as failed when ORISO provisioning fails", async () => {
    const { agent, lisa, writer } = await setup({
      service: fakeService({
        provision: vi.fn(async () => { throw new OrisoProvisioningError("account_create_failed"); })
      })
    });
    const response = await agent
      .post(`/testmails/api/accounts/${encodeURIComponent(lisa.email)}/oriso-provisioning`)
      .send({ environment: "pre-dev", role: "tenant-admin" });
    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: "account_create_failed" });
    expect(writer?.updateRecord).toHaveBeenLastCalledWith(expect.objectContaining({
      id: "oriso/pre-dev/lisa.simpson-dreambau.de",
      provisioningStatus: "failed"
    }));
  });

  it("preserves a ready record when a retry fails transiently", async () => {
    const linked = managedRecord();
    const { agent, lisa, writer } = await setup({
      records: [linked],
      service: fakeService({
        provision: vi.fn(async () => { throw new OrisoProvisioningError("oriso_authentication_failed"); })
      })
    });

    const response = await agent
      .post(`/testmails/api/accounts/${encodeURIComponent(lisa.email)}/oriso-provisioning`)
      .send({ environment: "pre-dev", role: "tenant-admin" });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: "oriso_authentication_failed" });
    expect(linked.provisioningStatus).toBe("ready");
    expect(writer?.updateRecord).not.toHaveBeenCalled();
  });

  it("marks a new record failed when persisting the ready state fails", async () => {
    const updateRecord = vi.fn()
      .mockRejectedValueOnce(new Error("ready persistence failed"))
      .mockResolvedValueOnce({ recordId: "oriso/pre-dev/lisa.simpson-dreambau.de", updatedAt: "2026-07-29T16:00:00.000Z" });
    const writer: RegistryWriter = {
      createRecord: vi.fn(async (record) => ({ recordId: record.id })),
      enrollTotp: vi.fn(async (record, _totpSecret, updatedAt) => ({ recordId: record.id, updatedAt })),
      updateRecord
    };
    const { agent, lisa } = await setup({ writer });

    const response = await agent
      .post(`/testmails/api/accounts/${encodeURIComponent(lisa.email)}/oriso-provisioning`)
      .send({ environment: "pre-dev", role: "tenant-admin" });

    expect(response.status).toBe(500);
    expect(updateRecord).toHaveBeenCalledTimes(2);
    expect(updateRecord).toHaveBeenLastCalledWith(expect.objectContaining({
      id: "oriso/pre-dev/lisa.simpson-dreambau.de",
      provisioningStatus: "failed"
    }));
  });

  it("does not report ready from a generic local TOTP record without a successful provisioning marker", async () => {
    const linked = managedRecord({
      permissionsDescription: "Legacy manually enrolled record",
      provisioningStatus: undefined
    });
    const remoteState = inviteFixture();
    const { agent, lisa, service } = await setup({
      records: [linked],
      service: fakeService({ status: vi.fn(async () => remoteState) })
    });
    const response = await agent.get(`/testmails/api/accounts/${encodeURIComponent(lisa.email)}/oriso-provisioning`);
    expect(response.status).toBe(200);
    expect(response.body.state.state).toBe("invited");
    expect(service.status).toHaveBeenCalledWith(lisa.email);
  });

  it("requires password repair only for failed linked records without TOTP", async () => {
    const failed = await setup({
      records: [managedRecord({ totpSecret: undefined, provisioningStatus: "failed" })],
      service: fakeService({ status: vi.fn(async () => null) })
    });
    const failedStatus = await failed.agent.get(
      `/testmails/api/accounts/${encodeURIComponent(failed.lisa.email)}/oriso-provisioning`
    );
    expect(failedStatus.body.requiresApplicationPassword).toBe(true);
    expect(failedStatus.body.provisioningRole).toBe("tenant-admin");

    const remoteState = inviteFixture({ inviteStatus: "ACCEPTED", accessGateStatus: "BLOCKED_TWO_FACTOR" });
    const pending = await setup({
      records: [managedRecord({ totpSecret: undefined, provisioningStatus: "pending" })],
      service: fakeService({ status: vi.fn(async () => remoteState) })
    });
    const pendingStatus = await pending.agent.get(
      `/testmails/api/accounts/${encodeURIComponent(pending.lisa.email)}/oriso-provisioning`
    );
    expect(pendingStatus.body.requiresApplicationPassword).toBe(false);
  });

  it("returns the live onboarding state and linked record on GET", async () => {
    const state = inviteFixture({ inviteStatus: "ACCEPTED", accessGateStatus: "READY", acceptedAt: "2026-07-29T15:00:00" });
    const { agent, lisa } = await setup({ service: fakeService({ status: vi.fn(async () => state) }) });
    const response = await agent.get(`/testmails/api/accounts/${encodeURIComponent(lisa.email)}/oriso-provisioning`);
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toMatchObject({
      configured: true,
      environment: "pre-dev",
      supportedRoles: ["platform-admin", "tenant-admin", "agency-admin", "counsellor", "advice-seeker"],
      state: { state: "ready", nextStep: "none" },
      linked: null
    });
  });

  it("routes an oriso.org identity exclusively through the Dev service and record namespace", async () => {
    const preDev = fakeService();
    const dev = fakeDevService();
    const { agent, bart, createdRecords } = await setup({
      services: { "pre-dev": preDev, dev }
    });

    const mismatch = await agent
      .post(`/testmails/api/accounts/${encodeURIComponent(bart.email)}/oriso-provisioning`)
      .send({ environment: "pre-dev", role: "platform-admin" });
    expect(mismatch.status).toBe(422);
    expect(mismatch.body).toEqual({ error: "environment_mismatch", environment: "dev" });

    const response = await agent
      .post(`/testmails/api/accounts/${encodeURIComponent(bart.email)}/oriso-provisioning`)
      .send({ environment: "dev", role: "platform-admin" });

    expect(response.status).toBe(201);
    expect(dev.provision).toHaveBeenCalledWith(expect.objectContaining({
      record: expect.objectContaining({
        id: "oriso/dev/bart.simpson",
        environment: "dev",
        email: bart.email,
        loginUrl: "https://dev.oriso.org/admin"
      }),
      role: "platform-admin"
    }));
    expect(preDev.provision).not.toHaveBeenCalled();
    expect(createdRecords[0]).toMatchObject({
      id: "oriso/dev/bart.simpson",
      environment: "dev",
      permissionsDescription: "Self-service provisioned ORISO Dev platform-admin"
    });

    const status = await agent.get(`/testmails/api/accounts/${encodeURIComponent(bart.email)}/oriso-provisioning`);
    expect(status.body).toMatchObject({
      configured: true,
      environment: "dev",
      linked: { id: "oriso/dev/bart.simpson", environment: "dev" }
    });
  });
});
