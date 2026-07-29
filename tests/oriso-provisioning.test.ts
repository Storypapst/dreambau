import { describe, expect, it, vi } from "vitest";
import type { RegistryProvider, TestAccessRecord } from "../src/server/infisical-provider.js";
import {
  createOrisoProvisioningService,
  generateApplicationPassword,
  buildProvisionedRecord,
  publicInviteState,
  OrisoProvisioningError,
  type ProvisioningFetch
} from "../src/server/oriso-provisioning.js";

const adminSecret = "platform-admin-password-never-log";
const adminTotpSecret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

function adminRecord(patch: Partial<TestAccessRecord> = {}): TestAccessRecord {
  return {
    id: "oriso/pre-dev/e2e-platform-admin-predev",
    project: "oriso",
    environment: "pre-dev",
    kind: "app-user",
    displayName: "Abe Simpson — ORISO PreDev Platform Admin",
    username: "abe.simpson@dreambau.de",
    email: "abe.simpson@dreambau.de",
    roles: ["platform-admin"],
    permissionsDescription: "Managed PreDev platform administrator",
    loginUrl: "https://admin.oriso-dev.site",
    secret: adminSecret,
    totpSecret: adminTotpSecret,
    responsiblePerson: "qa",
    createdAt: "2026-07-29T08:00:00.000Z",
    updatedAt: "2026-07-29T08:00:00.000Z",
    expiresAt: null,
    shared: true,
    rotationStatus: "current",
    documentationUrl: "https://dreambau.com/testmails/",
    ...patch
  };
}

function provider(record: TestAccessRecord | null = adminRecord()): RegistryProvider {
  return {
    async list() { return record ? [record] : []; },
    async get(id) { return record && record.id === id ? record : null; }
  };
}

interface FakeOrisoOptions {
  invites?: unknown[];
  templates?: unknown[];
  createdInvite?: Record<string, unknown>;
}

function fakeOriso(options: FakeOrisoOptions = {}) {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  const fetch: ProvisioningFetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? "GET", body: init?.body });
    const json = (value: unknown) => ({ ok: true, status: 200, async json() { return value; } });
    if (url.includes("/protocol/openid-connect/token")) {
      return json({ access_token: "oriso-access-token", expires_in: 300 });
    }
    if (url.includes("/useradmin/account-invites") && (init?.method ?? "GET") === "GET") {
      return json({ content: options.invites ?? [], totalPages: 1 });
    }
    if (url.includes("/useradmin/invite-email-templates")) {
      return json(options.templates ?? []);
    }
    if (url.includes("/useradmin/account-invites") && init?.method === "POST") {
      return json(options.createdInvite ?? {});
    }
    return { ok: false, status: 404, async json() { return {}; } };
  };
  return { calls, fetch };
}

function service(fetch: ProvisioningFetch, registryProvider = provider()) {
  return createOrisoProvisioningService({
    apiBaseUrl: "https://api.oriso-dev.site/service",
    tokenUrl: "https://auth.oriso-dev.site/realms/online-beratung/protocol/openid-connect/token",
    clientId: "app",
    adminRecordId: "oriso/pre-dev/e2e-platform-admin-predev",
    adminBaseUrl: "https://admin.oriso-dev.site",
    appBaseUrl: "https://app.oriso-dev.site",
    registryProvider,
    fetch,
    now: () => new Date(59_000)
  });
}

function invite(patch: Record<string, unknown> = {}) {
  return {
    id: 27,
    targetRole: "TENANT_ADMIN",
    recipientEmail: "lisa.simpson@oriso.org",
    inviteStatus: "EMAIL_SENT",
    emailVerificationStatus: "PENDING",
    twoFactorStatus: "PENDING_SETUP",
    accessGateStatus: "BLOCKED_INVITE",
    createDate: "2026-07-29T14:00:00",
    expiresAt: "2026-08-28T14:00:00",
    acceptedAt: null,
    rawToken: "raw-onboarding-token",
    acceptUrl: "https://admin.oriso-dev.site/admin/tenant-onboarding/raw-onboarding-token",
    ...patch
  };
}

describe("ORISO PreDev provisioning service", () => {
  it("creates an invitation as the managed platform admin and strips onboarding credentials", async () => {
    const oriso = fakeOriso({
      templates: [
        { id: 1, kind: "TENANT_INVITE", active: true, updateDate: "2026-07-18T12:00:00" },
        { id: 2, kind: "TENANT_INVITE", active: true, updateDate: "2026-07-28T11:00:00" },
        { id: 3, kind: "COUNSELLOR_INVITE", active: false, updateDate: "2026-07-29T09:00:00" }
      ],
      createdInvite: invite()
    });
    const result = await service(oriso.fetch).ensureInvite({
      recipientEmail: "Lisa.Simpson@oriso.org",
      firstName: "Lisa",
      lastName: "Simpson",
      role: "tenant-admin"
    });

    expect(result.created).toBe(true);
    expect(result.state).toMatchObject({
      state: "invited",
      role: "tenant-admin",
      targetRole: "TENANT_ADMIN",
      inviteId: 27,
      nextStep: "open-invitation-mail"
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("raw-onboarding-token");
    expect(serialized).not.toContain("acceptUrl");
    expect(serialized).not.toContain(adminSecret);

    const token = oriso.calls[0];
    expect(token.url).toContain("/protocol/openid-connect/token");
    const form = new URLSearchParams(token.body);
    expect(form.get("grant_type")).toBe("password");
    expect(form.get("client_id")).toBe("app");
    expect(form.get("username")).toBe("abe.simpson@dreambau.de");
    expect(form.get("password")).toBe(adminSecret);
    expect(form.get("otp")).toBe("287082");

    const create = oriso.calls.find((call) => call.method === "POST" && call.url.includes("/useradmin/account-invites"));
    expect(create).toBeDefined();
    expect(JSON.parse(String(create?.body))).toEqual({
      targetRole: "TENANT_ADMIN",
      recipientEmail: "lisa.simpson@oriso.org",
      firstName: "Lisa",
      lastName: "Simpson",
      templateId: 2
    });
  });

  it("reports an existing active invitation instead of creating a duplicate", async () => {
    const oriso = fakeOriso({
      invites: [invite({ inviteStatus: "ACCEPTED", accessGateStatus: "BLOCKED_TWO_FACTOR", acceptedAt: "2026-07-29T15:00:00" })]
    });
    const result = await service(oriso.fetch).ensureInvite({
      recipientEmail: "lisa.simpson@oriso.org",
      firstName: "Lisa",
      lastName: "Simpson",
      role: "tenant-admin"
    });
    expect(result.created).toBe(false);
    expect(result.state.state).toBe("two-factor-pending");
    expect(result.state.nextStep).toBe("store-totp");
    expect(oriso.calls.filter((call) => call.method === "POST" && call.url.includes("account-invites"))).toHaveLength(0);
  });

  it("ignores expired, revoked and superseded invitations when checking idempotency", async () => {
    const oriso = fakeOriso({
      invites: [
        invite({ id: 1, inviteStatus: "EXPIRED" }),
        invite({ id: 2, inviteStatus: "REVOKED" }),
        invite({ id: 3, inviteStatus: "SUPERSEDED" })
      ],
      templates: [{ id: 2, kind: "TENANT_INVITE", active: true, updateDate: "2026-07-28T11:00:00" }],
      createdInvite: invite({ id: 4 })
    });
    const result = await service(oriso.fetch).ensureInvite({
      recipientEmail: "lisa.simpson@oriso.org",
      firstName: "Lisa",
      lastName: "Simpson",
      role: "tenant-admin"
    });
    expect(result.created).toBe(true);
    expect(result.state.inviteId).toBe(4);
  });

  it("falls back to any active template when no kind matches the role", async () => {
    // ORISO resolves a template by id and never checks its kind, so a missing
    // COUNSELLOR_INVITE template must not block a counsellor invitation.
    const oriso = fakeOriso({
      templates: [{ id: 2, kind: "TENANT_INVITE", active: true, updateDate: "2026-07-28T11:00:00" }],
      createdInvite: invite({ id: 5, targetRole: "COUNSELLOR" })
    });
    const result = await service(oriso.fetch).ensureInvite({
      recipientEmail: "lisa.simpson@oriso.org",
      firstName: "Lisa",
      lastName: "Simpson",
      role: "counsellor"
    });
    expect(result.created).toBe(true);
    const create = oriso.calls.find((call) => call.method === "POST" && call.url.includes("account-invites"));
    expect(JSON.parse(String(create?.body))).toMatchObject({ targetRole: "COUNSELLOR", templateId: 2 });
  });

  it("still prefers a template whose kind matches the role", async () => {
    const oriso = fakeOriso({
      templates: [
        { id: 2, kind: "TENANT_INVITE", active: true, updateDate: "2026-07-29T11:00:00" },
        { id: 7, kind: "COUNSELLOR_INVITE", active: true, updateDate: "2026-07-20T11:00:00" },
        { id: 8, kind: "COUNSELLOR_INVITE", active: false, updateDate: "2026-07-29T12:00:00" }
      ],
      createdInvite: invite({ id: 6, targetRole: "COUNSELLOR" })
    });
    await service(oriso.fetch).ensureInvite({
      recipientEmail: "lisa.simpson@oriso.org",
      firstName: "Lisa",
      lastName: "Simpson",
      role: "counsellor"
    });
    const create = oriso.calls.find((call) => call.method === "POST" && call.url.includes("account-invites"));
    expect(JSON.parse(String(create?.body)).templateId).toBe(7);
  });

  it("refuses to create an invitation when no active template exists at all", async () => {
    const oriso = fakeOriso({
      templates: [{ id: 2, kind: "TENANT_INVITE", active: false, updateDate: "2026-07-28T11:00:00" }]
    });
    await expect(service(oriso.fetch).ensureInvite({
      recipientEmail: "lisa.simpson@oriso.org",
      firstName: "Lisa",
      lastName: "Simpson",
      role: "counsellor"
    })).rejects.toMatchObject({ code: "invite_template_missing" });
    expect(oriso.calls.filter((call) => call.method === "POST" && call.url.includes("account-invites"))).toHaveLength(0);
  });

  it("maps every ORISO access gate to one of the four onboarding states", () => {
    const base = invite();
    expect(publicInviteState({ ...base, accessGateStatus: "BLOCKED_INVITE" } as never).state).toBe("invited");
    expect(publicInviteState({ ...base, accessGateStatus: "BLOCKED_EMAIL" } as never).state).toBe("onboarding-pending");
    expect(publicInviteState({ ...base, accessGateStatus: "BLOCKED_TWO_FACTOR" } as never).state).toBe("two-factor-pending");
    expect(publicInviteState({ ...base, accessGateStatus: "READY" } as never).state).toBe("ready");
    expect(publicInviteState({ ...base, accessGateStatus: null, inviteStatus: "ACCEPTED" } as never).state).toBe("onboarding-pending");
  });

  it("reuses the cached ORISO token across calls", async () => {
    const oriso = fakeOriso({ invites: [invite()] });
    const subject = service(oriso.fetch);
    await subject.status("lisa.simpson@oriso.org");
    await subject.status("lisa.simpson@oriso.org");
    expect(oriso.calls.filter((call) => call.url.includes("/protocol/openid-connect/token"))).toHaveLength(1);
  });

  it("fails closed when the managed admin record is unavailable", async () => {
    const oriso = fakeOriso();
    await expect(service(oriso.fetch, provider(null)).status("lisa.simpson@oriso.org"))
      .rejects.toBeInstanceOf(OrisoProvisioningError);
    expect(oriso.calls).toHaveLength(0);
  });

  it("surfaces a generic authentication error without echoing credentials", async () => {
    const failing: ProvisioningFetch = async () => ({
      ok: false,
      status: 401,
      async json() { return { error: "invalid_grant", secret: adminSecret }; }
    });
    const error = await service(failing).status("lisa.simpson@oriso.org").catch((value: unknown) => value);
    expect(error).toMatchObject({ code: "oriso_authentication_failed" });
    expect(String(error)).not.toContain(adminSecret);
  });
});

describe("provisioned record and password", () => {
  it("generates a strong password containing all character classes", () => {
    for (let round = 0; round < 20; round += 1) {
      const password = generateApplicationPassword();
      expect(password).toHaveLength(24);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/[!$%*+\-=?]/);
    }
    expect(generateApplicationPassword()).not.toBe(generateApplicationPassword());
  });

  it("builds a stable pre-dev record for the chosen identity", () => {
    const record = buildProvisionedRecord({
      email: "Lisa.Simpson@oriso.org",
      displayName: "Lisa Simpson",
      role: "tenant-admin",
      adminBaseUrl: "https://admin.oriso-dev.site",
      appBaseUrl: "https://app.oriso-dev.site",
      responsiblePerson: "fg@dreambau.com",
      now: new Date("2026-07-29T16:00:00.000Z"),
      secret: "Gener4ted-Application*Pass"
    });
    expect(record).toMatchObject({
      id: "oriso/pre-dev/lisa.simpson",
      project: "oriso",
      environment: "pre-dev",
      kind: "admin",
      username: "lisa.simpson@oriso.org",
      email: "lisa.simpson@oriso.org",
      roles: ["tenant-admin"],
      loginUrl: "https://admin.oriso-dev.site",
      shared: true,
      rotationStatus: "current"
    });
    const counsellor = buildProvisionedRecord({
      email: "bart.simpson@oriso.org",
      displayName: "Bart Simpson",
      role: "counsellor",
      adminBaseUrl: "https://admin.oriso-dev.site",
      appBaseUrl: "https://app.oriso-dev.site",
      responsiblePerson: "fg@dreambau.com",
      now: new Date("2026-07-29T16:00:00.000Z"),
      secret: "Gener4ted-Application*Pass"
    });
    expect(counsellor.kind).toBe("app-user");
    expect(counsellor.roles).toEqual(["consultant"]);
    expect(counsellor.loginUrl).toBe("https://app.oriso-dev.site");
  });

  it("keeps record ids disjoint across mail domains with the same local part", () => {
    const base = {
      displayName: "Lisa Simpson",
      role: "tenant-admin" as const,
      adminBaseUrl: "https://admin.oriso-dev.site",
      appBaseUrl: "https://app.oriso-dev.site",
      responsiblePerson: "fg@dreambau.com",
      now: new Date("2026-07-29T16:00:00.000Z"),
      secret: "Gener4ted-Application*Pass"
    };
    expect(buildProvisionedRecord({ ...base, email: "lisa.simpson@oriso.org" }).id)
      .toBe("oriso/pre-dev/lisa.simpson");
    expect(buildProvisionedRecord({ ...base, email: "lisa.simpson@openresilience.cc" }).id)
      .toBe("oriso/pre-dev/lisa.simpson-openresilience.cc");
  });
});

describe("service construction", () => {
  it("keeps injected clocks and fetch out of module state", async () => {
    // Two independent services must not share token caches.
    const first = fakeOriso({ invites: [] });
    const second = fakeOriso({ invites: [] });
    const one = service(first.fetch);
    const two = service(second.fetch);
    await one.status("lisa.simpson@oriso.org");
    await two.status("lisa.simpson@oriso.org");
    expect(first.calls.filter((call) => call.url.includes("token"))).toHaveLength(1);
    expect(second.calls.filter((call) => call.url.includes("token"))).toHaveLength(1);
  });

  it("exposes the target so routes can build records with the right login URLs", () => {
    const oriso = fakeOriso();
    expect(service(oriso.fetch).target).toMatchObject({
      adminBaseUrl: "https://admin.oriso-dev.site",
      appBaseUrl: "https://app.oriso-dev.site"
    });
    expect(vi.isMockFunction(oriso.fetch)).toBe(false);
  });
});
