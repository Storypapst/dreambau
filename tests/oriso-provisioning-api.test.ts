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
    recipientEmail: "lisa.simpson@oriso.org",
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
      apiBaseUrl: "https://api.oriso-dev.site/service",
      tokenUrl: "https://auth.oriso-dev.site/realms/online-beratung/protocol/openid-connect/token",
      clientId: "app",
      adminRecordId: "oriso/pre-dev/e2e-platform-admin-predev",
      adminBaseUrl: "https://admin.oriso-dev.site",
      appBaseUrl: "https://app.oriso-dev.site"
    },
    status: vi.fn(async () => null),
    ensureInvite: vi.fn(async () => ({ created: true, state: inviteFixture() })),
    ...overrides
  };
}

async function setup(options: {
  service?: OrisoProvisioningService;
  writer?: RegistryWriter | null;
  records?: TestAccessRecord[];
  role?: "admin" | "member";
} = {}) {
  const lisa = mailbox("lisa.simpson@oriso.org", "Lisa Simpson");
  const moe = mailbox("moe.szyslak@dreambau.de", "Moe Szyslak");
  const records = options.records ?? [];
  const registryProvider: RegistryProvider = {
    async list() { return [...records]; },
    async get(id) { return records.find((record) => record.id === id) ?? null; }
  };
  const createdRecords: TestAccessRecord[] = [];
  const writer = options.writer === null ? undefined : options.writer ?? {
    enrollTotp: vi.fn(),
    createRecord: vi.fn(async (record: TestAccessRecord) => {
      createdRecords.push(record);
      records.push(record);
      return { recordId: record.id };
    })
  };
  const root = mkdtempSync(path.join(tmpdir(), "oriso-provisioning-"));
  const database = createDatabase(path.join(root, "catalog.sqlite"));
  database.upsertMetadata(lisa.email, { project: "ORISO", roles: [], lifecycleStatus: "unused" });
  const passkeyStore = createPasskeyStore(path.join(root, "auth.sqlite"));
  const user = passkeyStore.createUser({
    email: "frank@dreambau.com",
    name: "Frank",
    projects: ["oriso", "dreambau"],
    role: options.role ?? "admin"
  });
  passkeyStore.addCredential({ id: "credential-id", userId: user.id, publicKey: new Uint8Array([1]), counter: 0, transports: ["internal"], deviceType: "multiDevice", backedUp: true });
  const service = options.service ?? fakeService();
  const app = createApp({
    passwordHash: "unused",
    secureCookies: false,
    loadAccounts: () => [lisa, moe],
    database,
    passkeyStore,
    registryProvider,
    registryWriter: writer,
    orisoProvisioning: service,
    webauthn,
    now: () => new Date("2026-07-29T16:00:00.000Z"),
    rpId: "dreambau.com",
    expectedOrigin: "https://dreambau.com",
    bootstrapUser: { email: user.email, name: user.name, projects: ["oriso", "dreambau"], role: "admin" }
  });
  const agent = request.agent(app);
  const authOptions = await agent.post("/testmails/api/auth/passkeys/authentication/options").send({ email: user.email });
  await agent.post("/testmails/api/auth/passkeys/authentication/verify").send({ flowId: authOptions.body.flowId, response: { id: "credential-id" } });
  return { agent, database, lisa, moe, service, writer, createdRecords, user };
}

describe("human self-service ORISO PreDev provisioning", () => {
  it("creates the invitation, links a stable record and never leaks the generated secret", async () => {
    const { agent, database, lisa, service, createdRecords } = await setup();

    const response = await agent
      .post(`/testmails/api/accounts/${encodeURIComponent(lisa.email)}/oriso-provisioning`)
      .send({ environment: "pre-dev", role: "tenant-admin" });

    expect(response.status).toBe(201);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(service.ensureInvite).toHaveBeenCalledWith({
      recipientEmail: lisa.email,
      firstName: "Lisa",
      lastName: "Simpson",
      role: "tenant-admin"
    });
    expect(response.body).toMatchObject({
      created: true,
      recordCreated: true,
      state: { state: "invited", nextStep: "open-invitation-mail" },
      linked: {
        id: "oriso/pre-dev/lisa.simpson",
        project: "oriso",
        environment: "pre-dev",
        kind: "admin",
        email: lisa.email,
        roles: ["tenant-admin"],
        hasTotp: false
      }
    });

    expect(createdRecords).toHaveLength(1);
    const secret = createdRecords[0].secret;
    expect(secret).toHaveLength(24);
    expect(JSON.stringify(response.body)).not.toContain(secret);

    const links = database.getTestAccessLinks(lisa.email);
    expect(links.map((link) => link.recordId)).toContain("oriso/pre-dev/lisa.simpson");
    const access = database.getAccountAccess(lisa.email);
    expect(access.events.map((event) => event.action).sort()).toEqual(["oriso_invite_requested", "record_linked"]);
    expect(JSON.stringify(access)).not.toContain(secret);
  });

  it("is idempotent: reports the existing invitation and record instead of duplicating them", async () => {
    const { agent, lisa, service, writer } = await setup();
    await agent
      .post(`/testmails/api/accounts/${encodeURIComponent(lisa.email)}/oriso-provisioning`)
      .send({ environment: "pre-dev", role: "tenant-admin" });

    vi.mocked(service.ensureInvite).mockResolvedValueOnce({
      created: false,
      state: inviteFixture({ inviteStatus: "ACCEPTED", accessGateStatus: "BLOCKED_TWO_FACTOR" })
    });
    const second = await agent
      .post(`/testmails/api/accounts/${encodeURIComponent(lisa.email)}/oriso-provisioning`)
      .send({ environment: "pre-dev", role: "tenant-admin" });

    expect(second.status).toBe(200);
    expect(second.body.created).toBe(false);
    expect(second.body.recordCreated).toBe(false);
    expect(second.body.state.state).toBe("two-factor-pending");
    expect(vi.mocked(writer!.createRecord!)).toHaveBeenCalledTimes(1);
  });

  it("rejects production and every non-pre-dev environment before any ORISO call", async () => {
    const { agent, lisa, service } = await setup();
    for (const environment of ["production-test", "dev", "local"]) {
      const response = await agent
        .post(`/testmails/api/accounts/${encodeURIComponent(lisa.email)}/oriso-provisioning`)
        .send({ environment, role: "tenant-admin" });
      expect(response.status).toBe(422);
      expect(response.body).toEqual({ error: "environment_not_supported" });
    }
    const invalid = await agent
      .post(`/testmails/api/accounts/${encodeURIComponent(lisa.email)}/oriso-provisioning`)
      .send({ environment: "production", role: "tenant-admin" });
    expect(invalid.status).toBe(400);
    expect(service.ensureInvite).not.toHaveBeenCalled();
  });

  it("rejects unsupported roles and mailboxes outside the ORISO scope", async () => {
    const { agent, lisa, moe, service } = await setup();
    const badRole = await agent
      .post(`/testmails/api/accounts/${encodeURIComponent(lisa.email)}/oriso-provisioning`)
      .send({ environment: "pre-dev", role: "platform-admin" });
    expect(badRole.status).toBe(400);

    const wrongProject = await agent
      .post(`/testmails/api/accounts/${encodeURIComponent(moe.email)}/oriso-provisioning`)
      .send({ environment: "pre-dev", role: "tenant-admin" });
    expect(wrongProject.status).toBe(422);
    expect(wrongProject.body).toEqual({ error: "mailbox_project_mismatch" });
    expect(service.ensureInvite).not.toHaveBeenCalled();
  });

  it("requires an administrator passkey session", async () => {
    const member = await setup({ role: "member" });
    const forbidden = await member.agent
      .post(`/testmails/api/accounts/${encodeURIComponent(member.lisa.email)}/oriso-provisioning`)
      .send({ environment: "pre-dev", role: "tenant-admin" });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toEqual({ error: "admin_required" });

    const { lisa } = await setup();
    const anonymous = await request(createApp({ passwordHash: "unused", secureCookies: false, loadAccounts: () => [lisa] }))
      .post(`/testmails/api/accounts/${encodeURIComponent(lisa.email)}/oriso-provisioning`)
      .send({ environment: "pre-dev", role: "tenant-admin" });
    expect(anonymous.status).toBe(401);
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
        ensureInvite: vi.fn(async () => { throw new OrisoProvisioningError("invite_template_missing"); })
      })
    });
    const missingTemplate = await agent
      .post(`/testmails/api/accounts/${encodeURIComponent(lisa.email)}/oriso-provisioning`)
      .send({ environment: "pre-dev", role: "counsellor" });
    expect(missingTemplate.status).toBe(409);
    expect(missingTemplate.body).toEqual({ error: "invite_template_missing" });

    const failing = await setup({
      service: fakeService({
        ensureInvite: vi.fn(async () => { throw new OrisoProvisioningError("oriso_authentication_failed"); })
      })
    });
    const upstream = await failing.agent
      .post(`/testmails/api/accounts/${encodeURIComponent(failing.lisa.email)}/oriso-provisioning`)
      .send({ environment: "pre-dev", role: "tenant-admin" });
    expect(upstream.status).toBe(502);
    expect(upstream.body).toEqual({ error: "oriso_authentication_failed" });
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
      supportedRoles: ["tenant-admin", "agency-admin", "counsellor"],
      state: { state: "ready", nextStep: "none" },
      linked: null
    });
  });
});
