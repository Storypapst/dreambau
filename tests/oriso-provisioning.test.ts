import { describe, expect, it, vi } from "vitest";
import type { RegistryProvider, TestAccessRecord } from "../src/server/infisical-provider.js";
import {
  createOrisoProvisioningService,
  environmentForOrisoEmail,
  generateApplicationPassword,
  buildProvisionedRecord,
  publicInviteState,
  OrisoProvisioningError,
  type ProvisioningFetch
} from "../src/server/oriso-provisioning.js";

describe("ORISO environment routing", () => {
  it.each([
    ["abe.simpson@dreambau.com", "pre-dev"],
    ["abe.simpson@dreambau.de", "pre-dev"],
    ["abe.simpson@oriso.org", "dev"],
    ["abe.simpson@openresilience.cc", "dev"]
  ] as const)("routes %s to %s", (email, environment) => {
    expect(environmentForOrisoEmail(email)).toBe(environment);
  });

  it.each([
    "abe.simpson@getme.global",
    "abe.simpson@trail.ist"
  ])("routes %s to dev", (email) => {
    // Both domains were deliberately excluded until 2026-09-19. Being routed
    // here is not permission on its own: the account still has to carry project
    // ORISO, which viewProject checks before provisioning is allowed.
    expect(environmentForOrisoEmail(email)).toBe("dev");
  });

  it.each([
    "abe.simpson@example.invalid",
    "abe@simpson@oriso.org",
    "not-an-email"
  ])("fails closed for unsupported identity %s", (email) => {
    expect(environmentForOrisoEmail(email)).toBeNull();
  });
});

describe("bound first-password setup inside Testmails", () => {
  function harness(patch: Record<string, unknown> = {}, setupOutcome: "completed" | "timeout" = "completed") {
    const invite = {
      id: 119, targetRole: "COUNSELLOR", onboardingPurpose: "EXISTING_ACCOUNT_SETUP",
      tenantId: 7, recipientEmail: "marge.simpson@dreambau.de", provisionedUserId: "new-marge-id",
      inviteStatus: "EMAIL_SENT", createDate: "2026-07-30T05:00:01", expiresAt: "2026-07-31T05:00:01"
    };
    const calls: string[] = [];
    const fetch: ProvisioningFetch = async (input, init) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${new URL(url).pathname}`);
      const json = (value: unknown) => ({ ok: true, status: 200, async json() { return value; } });
      if (url.includes("/protocol/openid-connect/token")) return json({ access_token: "admin-token", expires_in: 300 });
      if (url.includes("/useradmin/account-invites")) return json({ content: [invite], totalPages: 1 });
      if (url.endsWith("/users/account-invites/fixture-token") && !init?.method) return json({ ...invite, ...patch });
      if (url.endsWith("/users/account-invites/fixture-token/setup") && init?.method === "POST") {
        if (setupOutcome === "timeout") throw new Error("upstream network details must not escape");
        return json({ phase: "COMPLETED" });
      }
      throw new Error("Unexpected setup request");
    };
    const subject = service(fetch);
    const record = buildProvisionedRecord({ email: invite.recipientEmail, displayName: "Marge Simpson", role: "counsellor", adminBaseUrl: subject.target.adminBaseUrl, appBaseUrl: subject.target.appBaseUrl, responsiblePerson: "qa", now: new Date("2026-07-30T05:00:00Z"), secret: "Temporary-Initial4*" });
    const readMail = vi.fn(async () => "Set up your account: https://admin.oriso-dev.site/counsellor-onboarding/fixture-token");
    const storePassword = vi.fn(async () => { calls.push("STORE private password before POST"); });
    return { subject, record, readMail, storePassword, calls };
  }

  it("classifies mandatory first-password setup without exposing the mailed token", () => {
    const state = publicInviteState({ id: 119, targetRole: "COUNSELLOR", recipientEmail: "marge.simpson@dreambau.de", inviteStatus: "EMAIL_SENT", onboardingPurpose: "EXISTING_ACCOUNT_SETUP", provisionedUserId: "new-marge-id", tenantId: 7 });
    expect(state.nextStep).toBe("complete-account-setup");
    expect(state).not.toHaveProperty("rawToken");
  });

  it("stores a different permanent credential before the one-shot normal setup request", async () => {
    const h = harness();
    expect(h.subject.completeAccountSetup).toBeTypeOf("function");
    const updated = await h.subject.completeAccountSetup!({ record: h.record, readMail: h.readMail, storePassword: h.storePassword });
    expect(updated.secret).not.toBe(h.record.secret);
    expect(updated.provisioningStatus).toBe("pending");
    expect(updated.accountSetup).toMatchObject({ inviteId: 119, provisionedUserId: "new-marge-id" });
    expect(h.calls.indexOf("STORE private password before POST")).toBeLessThan(h.calls.findIndex((call) => call.endsWith("/setup")));
    expect(h.calls.filter((call) => call.startsWith("POST") && call.endsWith("/setup"))).toHaveLength(1);
    expect(h.calls.some((call) => call.includes("/consultants") || call.includes("reset-password"))).toBe(false);
  });

  it.each([
    { id: 120 }, { recipientEmail: "herb.powell@dreambau.de" }, { tenantId: 8 },
    { provisionedUserId: "other-id" }, { targetRole: "AGENCY_ADMIN" },
    { onboardingPurpose: "NEW_ACCOUNT" }, { inviteStatus: "ACCEPTED" }
  ])("rejects a foreign or consumed setup binding before writing: %j", async (patch) => {
    const h = harness(patch);
    expect(h.subject.completeAccountSetup).toBeTypeOf("function");
    await expect(h.subject.completeAccountSetup!({ record: h.record, readMail: h.readMail, storePassword: h.storePassword })).rejects.toMatchObject({ code: "account_setup_binding_mismatch" });
    expect(h.storePassword).not.toHaveBeenCalled();
    expect(h.calls.some((call) => call.endsWith("/setup"))).toBe(false);
  });

  it("rejects a foreign mail origin without fetching it or storing a credential", async () => {
    const h = harness();
    expect(h.subject.completeAccountSetup).toBeTypeOf("function");
    await expect(h.subject.completeAccountSetup!({ record: h.record, readMail: async () => "https://evil.invalid/counsellor-onboarding/fixture-token", storePassword: h.storePassword })).rejects.toMatchObject({ code: "account_setup_mail_unavailable" });
    expect(h.storePassword).not.toHaveBeenCalled();
  });

  it("never sends setup when the protected password write fails", async () => {
    const h = harness();
    await expect(h.subject.completeAccountSetup!({ record: h.record, readMail: h.readMail, storePassword: async () => { throw new Error("writer unavailable"); } })).rejects.toMatchObject({ code: "account_setup_store_failed" });
    expect(h.calls.some((call) => call.endsWith("/setup"))).toBe(false);
  });

  it("never falls back to creation when an existing-only continuation cannot authenticate", async () => {
    const h = harness();
    const calls: string[] = [];
    const subject = service(async (url) => {
      calls.push(new URL(url).pathname);
      return { ok: false, status: 401, async json() { return {}; } };
    });
    await expect(subject.provision({ record: h.record, role: "counsellor", firstName: "Marge", lastName: "Simpson", existingAccountOnly: true, storeTotp: vi.fn() })).rejects.toMatchObject({ code: "account_setup_outcome_unknown" });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("openid-connect/token");
  });

  it("reports setup-required after a fresh counsellor is created with a temporary password", async () => {
    const h = harness();
    let creates = 0;
    const subject = service(async (input, init) => {
      const url = String(input);
      const json = (value: unknown) => ({ ok: true, status: 200, async json() { return value; } });
      if (url.includes("openid-connect/token")) return new URLSearchParams(init?.body).get("username") === "abe.simpson@dreambau.de"
        ? json({ access_token: "admin-token", expires_in: 300 }) : { ok: false, status: 400, async json() { return {}; } };
      if (url.endsWith("/agencyadmin/agencies/12")) return json({ _embedded: { id: 12, tenantId: 7, name: "Debt advice Berlin", consultingType: 1, topics: [{ id: 31 }], deleteDate: null } });
      if (url.endsWith("/useradmin/consultants") && init?.method === "POST") { creates += 1; return json({ _embedded: { id: "new-marge-id" } }); }
      if (url.endsWith("/new-marge-id/agencies") && init?.method === "PUT") return json({});
      if (url.includes("/useradmin/account-invites")) return json({ content: [{ id: 119, targetRole: "COUNSELLOR", recipientEmail: h.record.email, inviteStatus: "EMAIL_SENT", onboardingPurpose: "EXISTING_ACCOUNT_SETUP" }], totalPages: 1 });
      throw new Error("Unexpected fixture request");
    });
    const storeTotp = vi.fn();
    await expect(subject.provision({ record: h.record, firstName: "Marge", lastName: "Simpson", role: "counsellor", storeTotp })).rejects.toMatchObject({ code: "account_setup_required" });
    expect(creates).toBe(1);
    expect(storeTotp).not.toHaveBeenCalled();
  });

  it("keeps the private staged credential and never repeats an uncertain setup POST", async () => {
    const h = harness({}, "timeout");
    expect(h.subject.completeAccountSetup).toBeTypeOf("function");
    await expect(h.subject.completeAccountSetup!({ record: h.record, readMail: h.readMail, storePassword: h.storePassword })).rejects.toMatchObject({ code: "account_setup_outcome_unknown" });
    expect(h.storePassword).toHaveBeenCalledTimes(1);
    expect(h.calls.filter((call) => call.startsWith("POST") && call.endsWith("/setup"))).toHaveLength(1);
    const [password, binding] = h.storePassword.mock.calls[0];
    const staged = { ...h.record, secret: password, accountSetup: binding };
    const resumed = await h.subject.completeAccountSetup!({ record: staged, readMail: h.readMail, storePassword: h.storePassword });
    expect(resumed.secret).toBe(password);
    expect(h.storePassword).toHaveBeenCalledTimes(1);
    expect(h.calls.filter((call) => call.startsWith("POST") && call.endsWith("/setup"))).toHaveLength(1);
  });
});

const adminSecret = "platform-admin-password-never-log";
const adminTotpSecret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const generatedOrisoTotpSecret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const generatedPreDevRawTotpSecret = "TiytwMC3QVofH3fD6v9B0I7eefb7eEJ0";
const generatedDevTotpSecret = "zYxWvUtSrQpOnMlKjIhGfEdCbA987654";

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

function service(
  fetch: ProvisioningFetch,
  registryProvider = provider(),
  now = () => new Date(59_000),
  retry: {
    sleep?: (milliseconds: number) => Promise<void>;
    provisioningRetryDelaysMs?: readonly number[];
  } = {},
  environment: "pre-dev" | "dev" = "pre-dev"
) {
  return createOrisoProvisioningService({
    environment,
    apiBaseUrl: environment === "pre-dev" ? "https://api.oriso-dev.site/service" : "https://dev.oriso.org/service",
    tokenUrl: environment === "pre-dev"
      ? "https://auth.oriso-dev.site/realms/online-beratung/protocol/openid-connect/token"
      : "https://dev.oriso.org/auth/realms/online-beratung/protocol/openid-connect/token",
    clientId: "app",
    adminRecordId: environment === "pre-dev" ? "oriso/pre-dev/e2e-platform-admin-predev" : "oriso/dev/e2e-platform-admin-dev",
    adminBaseUrl: environment === "pre-dev" ? "https://admin.oriso-dev.site" : "https://dev.oriso.org/admin",
    appBaseUrl: environment === "pre-dev" ? "https://app.oriso-dev.site" : "https://dev.oriso.org",
    defaultTenantId: 7,
    defaultAgencyId: 12,
    defaultConsultingType: "1",
    defaultPostcode: "10115",
    defaultMainTopicId: 31,
    registryProvider,
    fetch,
    now,
    sleep: retry.sleep ?? (async () => {}),
    provisioningRetryDelaysMs: retry.provisioningRetryDelaysMs ?? [1, 2, 3]
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
  it("builds a Dev record in the isolated Dev namespace with Dev URLs", () => {
    const record = buildProvisionedRecord({
      email: "bart.simpson@oriso.org",
      displayName: "Bart Simpson",
      role: "platform-admin",
      adminBaseUrl: "https://dev.oriso.org/admin",
      appBaseUrl: "https://dev.oriso.org",
      responsiblePerson: "qa@dreambau.com",
      now: new Date("2026-07-30T05:00:00.000Z"),
      secret: "Fixed-Test-Password",
      environment: "dev"
    });

    expect(record).toMatchObject({
      id: "oriso/dev/bart.simpson",
      environment: "dev",
      displayName: "Bart Simpson — ORISO Dev platform-admin",
      loginUrl: "https://dev.oriso.org/admin",
      permissionsDescription: "Self-service provisioned ORISO Dev platform-admin"
    });
  });

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
      email: "Lisa.Simpson@dreambau.de",
      displayName: "Lisa Simpson",
      role: "tenant-admin",
      adminBaseUrl: "https://admin.oriso-dev.site",
      appBaseUrl: "https://app.oriso-dev.site",
      responsiblePerson: "fg@dreambau.com",
      now: new Date("2026-07-29T16:00:00.000Z"),
      secret: "Gener4ted-Application*Pass"
    });
    expect(record).toMatchObject({
      id: "oriso/pre-dev/lisa.simpson-dreambau.de",
      project: "oriso",
      environment: "pre-dev",
      kind: "admin",
      username: "lisa.simpson@dreambau.de",
      email: "lisa.simpson@dreambau.de",
      roles: ["tenant-admin"],
      loginUrl: "https://admin.oriso-dev.site",
      shared: true,
      rotationStatus: "current"
    });
    const counsellor = buildProvisionedRecord({
      email: "bart.simpson@dreambau.de",
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

describe("reusable ORISO PreDev account factory", () => {
  it("reprovisions a same-role ready record when auth survives but the ORISO user profile is stale", async () => {
    let accountCreated = false;
    let createCalls = 0;
    const storedTotp = generatedOrisoTotpSecret;
    const fetch: ProvisioningFetch = async (input, init) => {
      const url = String(input);
      const ok = (value: unknown = {}) => ({ ok: true, status: 200, async json() { return value; } });
      if (url.endsWith("/agencyadmin/agencies/12")) return ok({ _embedded: { id: 12, tenantId: 7, consultingType: 1, topics: [{ id: 31 }], deleteDate: "null" } });
      if (url.includes("/protocol/openid-connect/token")) {
        const form = new URLSearchParams(init?.body);
        if (form.get("username") === "abe.simpson@dreambau.de") {
          return ok({ access_token: "admin-token", expires_in: 300 });
        }
        if (!form.get("otp")) return { ok: false, status: 401, async json() { return {}; } };
        return ok({ access_token: "user-token", expires_in: 300 });
      }
      if (url.endsWith("/users/data") && init?.method === "GET") {
        return accountCreated
          ? ok({ twoFactorAuth: { secret: storedTotp } })
          : { ok: false, status: 404, async json() { return {}; } };
      }
      if (url.endsWith("/useradmin/tenantadmins") && init?.method === "POST") {
        createCalls += 1;
        const body = JSON.parse(String(init.body));
        expect(body).toMatchObject({
          username: "maggie.simpson@dreambau.de",
          password: "fixed-same-role-password",
          tenantId: 7
        });
        accountCreated = true;
        return ok({ _embedded: { id: "recreated-tenant-admin" } });
      }
      if (url.endsWith("/users/2fa/app") && init?.method === "PUT") return ok();
      return { ok: false, status: 404, async json() { return {}; } };
    };
    const subject = service(fetch, provider(), () => new Date("2026-07-30T05:00:00.000Z"), {
      provisioningRetryDelaysMs: []
    });
    const record = buildProvisionedRecord({
      email: "maggie.simpson@dreambau.de",
      displayName: "Maggie Simpson",
      role: "tenant-admin",
      adminBaseUrl: subject.target.adminBaseUrl,
      appBaseUrl: subject.target.appBaseUrl,
      responsiblePerson: "qa",
      now: new Date("2026-07-30T05:00:00.000Z"),
      secret: "fixed-same-role-password"
    });
    Object.assign(record, { totpSecret: storedTotp, provisioningStatus: "ready" as const });

    const result = await subject.provision({
      record,
      firstName: "Maggie",
      lastName: "Simpson",
      role: "tenant-admin",
      storeTotp: vi.fn()
    });

    expect(result).toMatchObject({
      created: true,
      state: { state: "ready", inviteStatus: "DIRECT_CREATED", role: "tenant-admin" }
    });
    expect(createCalls).toBe(1);
  });

  it.each([
    [401, 1],
    [403, 2]
  ] as const)("reactivates a same-role advice seeker through the privileged deletion endpoint after a %i managed probe", async (managedProbeStatus, expectedProfileCalls) => {
    let accountReactivated = false;
    let createCalls = 0;
    let reactivateCalls = 0;
    let profileCalls = 0;
    const storedTotp = generatedOrisoTotpSecret;
    const fetch: ProvisioningFetch = async (input, init) => {
      const url = String(input);
      const ok = (value: unknown = {}) => ({ ok: true, status: 200, async json() { return value; } });
      if (url.endsWith("/agencyadmin/agencies/12")) return ok({ _embedded: { id: 12, tenantId: 7, consultingType: 1, topics: [{ id: 31 }], deleteDate: "null" } });
      if (url.includes("/protocol/openid-connect/token")) {
        const form = new URLSearchParams(init?.body);
        if (form.get("username") === "abe.simpson@dreambau.de") {
          return ok({ access_token: "admin-token", expires_in: 300 });
        }
        if (!accountReactivated && managedProbeStatus === 401) {
          return { ok: false, status: 401, async json() { return {}; } };
        }
        if (!form.get("otp")) return { ok: false, status: 401, async json() { return {}; } };
        return ok({ access_token: "asker-token", expires_in: 300 });
      }
      if (url.endsWith("/users/data") && init?.method === "GET") {
        profileCalls += 1;
        return accountReactivated
          ? ok({ twoFactorAuth: { secret: storedTotp } })
          : { ok: false, status: 403, async json() { return { message: "profile deleted" }; } };
      }
      if (url.endsWith("/useradmin/askers/deletion/reactivate") && init?.method === "POST") {
        reactivateCalls += 1;
        expect(init.headers?.Authorization).toBe("Bearer admin-token");
        const body = JSON.parse(String(init.body));
        expect(body).toEqual({
          username: "marge.simpson@dreambau.de",
          email: "marge.simpson@dreambau.de",
          tenantId: 7,
          password: "fixed-deleted-asker-password"
        });
        accountReactivated = true;
        return { ok: true, status: 204, async json() { return {}; } };
      }
      if (url.endsWith("/users/askers/new") && init?.method === "POST") {
        createCalls += 1;
        return { ok: false, status: 409, async json() { return {}; } };
      }
      return { ok: false, status: 404, async json() { return {}; } };
    };
    const subject = service(fetch, provider(), () => new Date("2026-07-30T05:00:00.000Z"), {
      provisioningRetryDelaysMs: []
    });
    const record = buildProvisionedRecord({
      email: "marge.simpson@dreambau.de",
      displayName: "Marge Simpson",
      role: "advice-seeker",
      adminBaseUrl: subject.target.adminBaseUrl,
      appBaseUrl: subject.target.appBaseUrl,
      responsiblePerson: "qa",
      now: new Date("2026-07-30T05:00:00.000Z"),
      secret: "fixed-deleted-asker-password"
    });
    Object.assign(record, { username: "marge.simpson@dreambau.de", totpSecret: storedTotp, provisioningStatus: "ready" as const });

    const result = await subject.provision({
      record,
      firstName: "Marge",
      lastName: "Simpson",
      role: "advice-seeker",
      storeTotp: vi.fn()
    });

    expect(result).toMatchObject({
      created: false,
      state: { state: "ready", inviteStatus: "DIRECT_RECONCILED", role: "advice-seeker" }
    });
    expect(reactivateCalls).toBe(1);
    expect(profileCalls).toBe(expectedProfileCalls);
    expect(createCalls).toBe(0);
  });

  it("maps an active wrong-password 401 to the privileged reactivation conflict without public creation", async () => {
    let reactivateCalls = 0;
    let createCalls = 0;
    const fetch: ProvisioningFetch = async (input, init) => {
      const url = String(input);
      const ok = (value: unknown = {}) => ({ ok: true, status: 200, async json() { return value; } });
      if (url.endsWith("/agencyadmin/agencies/12")) return ok({ _embedded: { id: 12, tenantId: 7, consultingType: 1, topics: [{ id: 31 }], deleteDate: "null" } });
      if (url.includes("/protocol/openid-connect/token")) {
        const form = new URLSearchParams(init?.body);
        if (form.get("username") === "abe.simpson@dreambau.de") {
          return ok({ access_token: "admin-token", expires_in: 300 });
        }
        return { ok: false, status: 401, async json() { return {}; } };
      }
      if (url.endsWith("/useradmin/askers/deletion/reactivate") && init?.method === "POST") {
        reactivateCalls += 1;
        return { ok: false, status: 409, async json() { return {}; } };
      }
      if (url.endsWith("/users/askers/new") && init?.method === "POST") {
        createCalls += 1;
      }
      return { ok: false, status: 404, async json() { return {}; } };
    };
    const subject = service(fetch);
    const record = buildProvisionedRecord({
      email: "marge.simpson@dreambau.de",
      displayName: "Marge Simpson",
      role: "advice-seeker",
      adminBaseUrl: subject.target.adminBaseUrl,
      appBaseUrl: subject.target.appBaseUrl,
      responsiblePerson: "qa",
      now: new Date("2026-07-30T05:00:00.000Z"),
      secret: "stale-wrong-password"
    });
    Object.assign(record, { totpSecret: generatedOrisoTotpSecret, provisioningStatus: "ready" as const });

    await expect(subject.provision({
      record,
      firstName: "Marge",
      lastName: "Simpson",
      role: "advice-seeker",
      storeTotp: vi.fn()
    })).rejects.toMatchObject({ code: "account_credentials_mismatch" });
    expect(reactivateCalls).toBe(1);
    expect(createCalls).toBe(0);
  });

  it("keeps a pending advice-seeker 401 on the normal creation flow", async () => {
    let accountCreated = false;
    let reactivateCalls = 0;
    let createCalls = 0;
    const fetch: ProvisioningFetch = async (input, init) => {
      const url = String(input);
      const ok = (value: unknown = {}) => ({ ok: true, status: 200, async json() { return value; } });
      if (url.endsWith("/agencyadmin/agencies/12")) return ok({ _embedded: { id: 12, tenantId: 7, consultingType: 1, topics: [{ id: 31 }], deleteDate: "null" } });
      if (url.includes("/protocol/openid-connect/token")) {
        const form = new URLSearchParams(init?.body);
        if (form.get("username") === "abe.simpson@dreambau.de") {
          return ok({ access_token: "admin-token", expires_in: 300 });
        }
        if (!accountCreated) return { ok: false, status: 401, async json() { return {}; } };
        return ok({ access_token: "asker-token", expires_in: 300 });
      }
      if (url.endsWith("/useradmin/askers/deletion/reactivate") && init?.method === "POST") {
        reactivateCalls += 1;
      }
      if (url.endsWith("/users/askers/new") && init?.method === "POST") {
        createCalls += 1;
        accountCreated = true;
        return ok({ _embedded: { id: "created-asker" } });
      }
      if (url.endsWith("/users/email") && init?.method === "PUT") return ok();
      if (url.endsWith("/users/2fa/app") && init?.method === "PUT") return ok();
      if (url.endsWith("/users/data") && init?.method === "GET") {
        return ok({ twoFactorAuth: { secret: generatedOrisoTotpSecret } });
      }
      return { ok: false, status: 404, async json() { return {}; } };
    };
    const subject = service(fetch, provider(), () => new Date("2026-07-30T05:00:00.000Z"), {
      provisioningRetryDelaysMs: []
    });
    const record = buildProvisionedRecord({
      email: "marge.simpson@dreambau.de",
      displayName: "Marge Simpson",
      role: "advice-seeker",
      adminBaseUrl: subject.target.adminBaseUrl,
      appBaseUrl: subject.target.appBaseUrl,
      responsiblePerson: "qa",
      now: new Date("2026-07-30T05:00:00.000Z"),
      secret: "pending-password"
    });
    Object.assign(record, { totpSecret: generatedOrisoTotpSecret, provisioningStatus: "pending" as const });

    const result = await subject.provision({
      record,
      firstName: "Marge",
      lastName: "Simpson",
      role: "advice-seeker",
      storeTotp: vi.fn()
    });

    expect(result.created).toBe(true);
    expect(reactivateCalls).toBe(0);
    expect(createCalls).toBe(1);
  });

  it("does not route another READY role with a 401 probe through asker reactivation", async () => {
    let reactivateCalls = 0;
    let tenantAdminCreateCalls = 0;
    const fetch: ProvisioningFetch = async (input, init) => {
      const url = String(input);
      const ok = (value: unknown = {}) => ({ ok: true, status: 200, async json() { return value; } });
      if (url.endsWith("/agencyadmin/agencies/12")) return ok({ _embedded: { id: 12, tenantId: 7, consultingType: 1, topics: [{ id: 31 }], deleteDate: "null" } });
      if (url.includes("/protocol/openid-connect/token")) {
        const form = new URLSearchParams(init?.body);
        if (form.get("username") === "abe.simpson@dreambau.de") {
          return ok({ access_token: "admin-token", expires_in: 300 });
        }
        return { ok: false, status: 401, async json() { return {}; } };
      }
      if (url.endsWith("/useradmin/askers/deletion/reactivate") && init?.method === "POST") {
        reactivateCalls += 1;
      }
      if (url.endsWith("/useradmin/tenantadmins") && init?.method === "POST") {
        tenantAdminCreateCalls += 1;
        return { ok: false, status: 409, async json() { return {}; } };
      }
      return { ok: false, status: 404, async json() { return {}; } };
    };
    const subject = service(fetch);
    const record = buildProvisionedRecord({
      email: "maggie.simpson@dreambau.de",
      displayName: "Maggie Simpson",
      role: "tenant-admin",
      adminBaseUrl: subject.target.adminBaseUrl,
      appBaseUrl: subject.target.appBaseUrl,
      responsiblePerson: "qa",
      now: new Date("2026-07-30T05:00:00.000Z"),
      secret: "tenant-admin-password"
    });
    Object.assign(record, { totpSecret: generatedOrisoTotpSecret, provisioningStatus: "ready" as const });

    await expect(subject.provision({
      record,
      firstName: "Maggie",
      lastName: "Simpson",
      role: "tenant-admin",
      storeTotp: vi.fn()
    })).rejects.toMatchObject({ code: "account_creation_conflict" });
    expect(reactivateCalls).toBe(0);
    expect(tenantAdminCreateCalls).toBe(1);
  });

  it.each([
    [400, "account_create_failed"],
    [403, "account_create_failed"],
    [404, "account_create_failed"],
    [409, "account_credentials_mismatch"]
  ] as const)("fails closed when privileged advice-seeker reactivation returns %i", async (reactivationStatus, errorCode) => {
    let createCalls = 0;
    const fetch: ProvisioningFetch = async (input, init) => {
      const url = String(input);
      const ok = (value: unknown = {}) => ({ ok: true, status: 200, async json() { return value; } });
      if (url.endsWith("/agencyadmin/agencies/12")) return ok({ _embedded: { id: 12, tenantId: 7, consultingType: 1, topics: [{ id: 31 }], deleteDate: "null" } });
      if (url.includes("/protocol/openid-connect/token")) {
        return ok({ access_token: url.includes("admin") ? "admin-token" : "asker-token", expires_in: 300 });
      }
      if (url.endsWith("/users/data") && init?.method === "GET") {
        return { ok: false, status: 403, async json() { return {}; } };
      }
      if (url.endsWith("/useradmin/askers/deletion/reactivate") && init?.method === "POST") {
        return { ok: false, status: reactivationStatus, async json() { return {}; } };
      }
      if (url.endsWith("/users/askers/new") && init?.method === "POST") {
        createCalls += 1;
      }
      return { ok: false, status: 404, async json() { return {}; } };
    };
    const subject = service(fetch);
    const record = buildProvisionedRecord({
      email: "marge.simpson@dreambau.de",
      displayName: "Marge Simpson",
      role: "advice-seeker",
      adminBaseUrl: subject.target.adminBaseUrl,
      appBaseUrl: subject.target.appBaseUrl,
      responsiblePerson: "qa",
      now: new Date("2026-07-30T05:00:00.000Z"),
      secret: "fixed-deleted-asker-password"
    });
    Object.assign(record, { totpSecret: generatedOrisoTotpSecret, provisioningStatus: "ready" as const });

    await expect(subject.provision({
      record,
      firstName: "Marge",
      lastName: "Simpson",
      role: "advice-seeker",
      storeTotp: vi.fn()
    })).rejects.toMatchObject({ code: errorCode });
    expect(createCalls).toBe(0);
  });

  it("fails closed when advice-seeker reactivation is not visible in the product profile readback", async () => {
    let profileCalls = 0;
    let createCalls = 0;
    const fetch: ProvisioningFetch = async (input, init) => {
      const url = String(input);
      const ok = (value: unknown = {}) => ({ ok: true, status: 200, async json() { return value; } });
      if (url.endsWith("/agencyadmin/agencies/12")) return ok({ _embedded: { id: 12, tenantId: 7, consultingType: 1, topics: [{ id: 31 }], deleteDate: "null" } });
      if (url.includes("/protocol/openid-connect/token")) {
        return ok({ access_token: "token", expires_in: 300 });
      }
      if (url.endsWith("/users/data") && init?.method === "GET") {
        profileCalls += 1;
        return { ok: false, status: 403, async json() { return {}; } };
      }
      if (url.endsWith("/useradmin/askers/deletion/reactivate") && init?.method === "POST") {
        return { ok: true, status: 204, async json() { return {}; } };
      }
      if (url.endsWith("/users/askers/new") && init?.method === "POST") {
        createCalls += 1;
      }
      return { ok: false, status: 404, async json() { return {}; } };
    };
    const subject = service(fetch, provider(), () => new Date("2026-07-30T05:00:00.000Z"), {
      provisioningRetryDelaysMs: []
    });
    const record = buildProvisionedRecord({
      email: "marge.simpson@dreambau.de",
      displayName: "Marge Simpson",
      role: "advice-seeker",
      adminBaseUrl: subject.target.adminBaseUrl,
      appBaseUrl: subject.target.appBaseUrl,
      responsiblePerson: "qa",
      now: new Date("2026-07-30T05:00:00.000Z"),
      secret: "fixed-deleted-asker-password"
    });
    Object.assign(record, { totpSecret: generatedOrisoTotpSecret, provisioningStatus: "ready" as const });

    await expect(subject.provision({
      record,
      firstName: "Marge",
      lastName: "Simpson",
      role: "advice-seeker",
      storeTotp: vi.fn()
    })).rejects.toMatchObject({ code: "totp_verification_failed" });
    expect(profileCalls).toBe(2);
    expect(createCalls).toBe(0);
  });

  it("keeps a same-role ready account idempotent only after token and user-profile probes succeed", async () => {
    let createCalls = 0;
    let profileCalls = 0;
    const fetch: ProvisioningFetch = async (input, init) => {
      const url = String(input);
      const ok = (value: unknown = {}) => ({ ok: true, status: 200, async json() { return value; } });
      if (url.endsWith("/agencyadmin/agencies/12")) return ok({ _embedded: { id: 12, tenantId: 7, consultingType: 1, topics: [{ id: 31 }], deleteDate: "null" } });
      if (url.includes("/protocol/openid-connect/token")) {
        return ok({ access_token: "verified-user-token", expires_in: 300 });
      }
      if (url.endsWith("/users/data") && init?.method === "GET") {
        profileCalls += 1;
        return ok({ twoFactorAuth: { secret: generatedOrisoTotpSecret } });
      }
      if (url.endsWith("/useradmin/tenantadmins") && init?.method === "POST") {
        createCalls += 1;
      }
      return { ok: false, status: 404, async json() { return {}; } };
    };
    const subject = service(fetch);
    const record = buildProvisionedRecord({
      email: "maggie.simpson@dreambau.de",
      displayName: "Maggie Simpson",
      role: "tenant-admin",
      adminBaseUrl: subject.target.adminBaseUrl,
      appBaseUrl: subject.target.appBaseUrl,
      responsiblePerson: "qa",
      now: new Date("2026-07-30T05:00:00.000Z"),
      secret: "fixed-same-role-password"
    });
    Object.assign(record, { totpSecret: generatedOrisoTotpSecret, provisioningStatus: "ready" as const });

    const result = await subject.provision({
      record,
      firstName: "Maggie",
      lastName: "Simpson",
      role: "tenant-admin",
      storeTotp: vi.fn()
    });

    expect(result).toMatchObject({
      created: false,
      state: { state: "ready", inviteStatus: "DIRECT_RECONCILED" }
    });
    expect(profileCalls).toBe(1);
    expect(createCalls).toBe(0);
  });

  it("fails closed when a same-role account appears while stale-state reprovisioning starts", async () => {
    let createCalls = 0;
    const fetch: ProvisioningFetch = async (input, init) => {
      const url = String(input);
      const ok = (value: unknown = {}) => ({ ok: true, status: 200, async json() { return value; } });
      if (url.endsWith("/agencyadmin/agencies/12")) return ok({ _embedded: { id: 12, tenantId: 7, consultingType: 1, topics: [{ id: 31 }], deleteDate: "null" } });
      if (url.includes("/protocol/openid-connect/token")) {
        const form = new URLSearchParams(init?.body);
        if (form.get("username") === "abe.simpson@dreambau.de") {
          return ok({ access_token: "admin-token", expires_in: 300 });
        }
        return ok({ access_token: "orphaned-user-token", expires_in: 300 });
      }
      if (url.endsWith("/users/data") && init?.method === "GET") {
        return { ok: false, status: 404, async json() { return {}; } };
      }
      if (url.endsWith("/useradmin/tenantadmins") && init?.method === "POST") {
        createCalls += 1;
        return { ok: false, status: 409, async json() { return {}; } };
      }
      return { ok: false, status: 404, async json() { return {}; } };
    };
    const subject = service(fetch);
    const record = buildProvisionedRecord({
      email: "maggie.simpson@dreambau.de",
      displayName: "Maggie Simpson",
      role: "tenant-admin",
      adminBaseUrl: subject.target.adminBaseUrl,
      appBaseUrl: subject.target.appBaseUrl,
      responsiblePerson: "qa",
      now: new Date("2026-07-30T05:00:00.000Z"),
      secret: "fixed-same-role-password"
    });
    Object.assign(record, { totpSecret: generatedOrisoTotpSecret, provisioningStatus: "ready" as const });

    await expect(subject.provision({
      record,
      firstName: "Maggie",
      lastName: "Simpson",
      role: "tenant-admin",
      storeTotp: vi.fn()
    })).rejects.toMatchObject({ code: "account_creation_conflict" });
    expect(createCalls).toBe(1);
  });

  it("runs the real account factory against the configured Dev target", async () => {
    let accountCreated = false;
    let totpActive = false;
    const devAdmin = adminRecord({
      id: "oriso/dev/e2e-platform-admin-dev",
      environment: "dev",
      username: "abe.simpson@oriso.org",
      email: "abe.simpson@oriso.org",
      totpSecret: "aBcDeFgHiJkLmNoPqRsTuVwXyZ123456",
      loginUrl: "https://dev.oriso.org/admin"
    });
    const fetch: ProvisioningFetch = async (input, init) => {
      const url = String(input);
      const ok = (value: unknown = {}) => ({ ok: true, status: 200, async json() { return value; } });
      if (url.endsWith("/agencyadmin/agencies/12")) return ok({ _embedded: { id: 12, tenantId: 7, consultingType: 1, topics: [{ id: 31 }], deleteDate: "null" } });
      if (url.includes("/protocol/openid-connect/token")) {
        const form = new URLSearchParams(init?.body);
        if (form.get("username") === devAdmin.username) {
          return ok({ access_token: "dev-admin-token", expires_in: 300 });
        }
        if (!accountCreated || (totpActive && !form.get("otp"))) {
          return { ok: false, status: 401, async json() { return {}; } };
        }
        return ok({ access_token: "dev-user-token", expires_in: 300 });
      }
      if (url.endsWith("/useradmin/tenantadmins") && init?.method === "POST") {
        accountCreated = true;
        return ok({ _embedded: { id: "dev-created-user-id" } });
      }
      if (url.endsWith("/users/data") && init?.method === "GET") {
        return ok({ twoFactorAuth: { secret: generatedDevTotpSecret } });
      }
      if (url.endsWith("/users/2fa/app") && init?.method === "PUT") {
        expect(init.headers?.["X-U25-CSRF-TOKEN"]).toBe("dreambau-test-access");
        expect(init.headers?.["X-CSRF-Token"]).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        );
        expect(init.headers?.Cookie).toBe(`CSRF-TOKEN=${init.headers?.["X-CSRF-Token"]}`);
        totpActive = true;
        return ok();
      }
      return { ok: false, status: 404, async json() { return {}; } };
    };
    const subject = service(
      fetch,
      provider(devAdmin),
      () => new Date("2026-07-30T05:00:00.000Z"),
      { provisioningRetryDelaysMs: [] },
      "dev"
    );
    const record = buildProvisionedRecord({
      email: "bart.simpson@oriso.org",
      displayName: "Bart Simpson",
      role: "platform-admin",
      adminBaseUrl: subject.target.adminBaseUrl,
      appBaseUrl: subject.target.appBaseUrl,
      responsiblePerson: "qa",
      now: new Date("2026-07-30T05:00:00.000Z"),
      secret: "Gener4ted-Application*Pass",
      environment: "dev"
    });

    const result = await subject.provision({
      record,
      firstName: "Bart",
      lastName: "Simpson",
      role: "platform-admin",
      storeTotp: vi.fn()
    });

    expect(result).toMatchObject({ created: true, state: { state: "ready" } });
    expect(subject.target).toMatchObject({
      environment: "dev",
      apiBaseUrl: "https://dev.oriso.org/service",
      adminRecordId: "oriso/dev/e2e-platform-admin-dev"
    });
  });

  it("retries a delayed post-create credential until ORISO exposes the account", async () => {
    let accountCreated = false;
    let userTokenAttempts = 0;
    let totpActive = false;
    const sleep = vi.fn(async () => {});
    const fetch: ProvisioningFetch = async (input, init) => {
      const url = String(input);
      const ok = (value: unknown = {}) => ({ ok: true, status: 200, async json() { return value; } });
      if (url.endsWith("/agencyadmin/agencies/12")) return ok({ _embedded: { id: 12, tenantId: 7, consultingType: 1, topics: [{ id: 31 }], deleteDate: "null" } });
      if (url.includes("/protocol/openid-connect/token")) {
        const form = new URLSearchParams(init?.body);
        if (form.get("username") === "abe.simpson@dreambau.de") {
          return ok({ access_token: "admin-token", expires_in: 300 });
        }
        userTokenAttempts += 1;
        if (!accountCreated || userTokenAttempts < 4) {
          return { ok: false, status: 401, async json() { return {}; } };
        }
        if (totpActive && !form.get("otp")) {
          return { ok: false, status: 401, async json() { return {}; } };
        }
        return ok({ access_token: "user-token", expires_in: 300 });
      }
      if (url.endsWith("/useradmin/consultants") && init?.method === "POST") {
        accountCreated = true;
        return ok({ _embedded: { id: "created-user-id" } });
      }
      if (url.includes("/created-user-id/agencies") && init?.method === "PUT") return ok();
      if (url.endsWith("/users/data") && init?.method === "GET") {
        return ok({ twoFactorAuth: { secret: generatedOrisoTotpSecret } });
      }
      if (url.endsWith("/users/2fa/app") && init?.method === "PUT") {
        totpActive = true;
        return ok();
      }
      return { ok: false, status: 404, async json() { return {}; } };
    };
    const subject = service(fetch, provider(), () => new Date("2026-07-29T16:00:00.000Z"), {
      sleep,
      provisioningRetryDelaysMs: [10, 20, 30]
    });
    const record = buildProvisionedRecord({
      email: "apu.nahasapeemapetilon@oriso.org",
      displayName: "Apu Nahasapeemapetilon",
      role: "counsellor",
      adminBaseUrl: subject.target.adminBaseUrl,
      appBaseUrl: subject.target.appBaseUrl,
      responsiblePerson: "qa",
      now: new Date("2026-07-29T16:00:00.000Z"),
      secret: "Gener4ted-Application*Pass"
    });

    const result = await subject.provision({
      record,
      firstName: "Apu",
      lastName: "Nahasapeemapetilon",
      role: "counsellor",
      storeTotp: vi.fn()
    });

    expect(result.state.state).toBe("ready");
    expect(sleep).toHaveBeenNthCalledWith(1, 10);
    expect(sleep).toHaveBeenNthCalledWith(2, 20);
  });

  it("activates a newly returned raw PreDev seed while retaining Base32 admin authentication", async () => {
    let accountCreated = false;
    let totpActive = false;
    let activationOtp = "";
    const fetch: ProvisioningFetch = async (input, init) => {
      const url = String(input);
      const ok = (value: unknown = {}) => ({ ok: true, status: 200, async json() { return value; } });
      if (url.endsWith("/agencyadmin/agencies/12")) return ok({ _embedded: { id: 12, tenantId: 7, consultingType: 1, topics: [{ id: 31 }], deleteDate: "null" } });
      if (url.includes("/protocol/openid-connect/token")) {
        const form = new URLSearchParams(init?.body);
        if (form.get("username") === "abe.simpson@dreambau.de") {
          return ok({ access_token: "admin-token", expires_in: 300 });
        }
        if (!accountCreated || (totpActive && !form.get("otp"))) {
          return { ok: false, status: 401, async json() { return {}; } };
        }
        return ok({ access_token: "user-token", expires_in: 300 });
      }
      if (url.endsWith("/useradmin/tenantadmins") && init?.method === "POST") {
        accountCreated = true;
        return ok({ _embedded: { id: "created-user-id" } });
      }
      if (url.endsWith("/users/data") && init?.method === "GET") {
        return ok({ twoFactorAuth: { secret: generatedPreDevRawTotpSecret } });
      }
      if (url.endsWith("/users/2fa/app") && init?.method === "PUT") {
        activationOtp = String(JSON.parse(String(init.body)).otp);
        totpActive = true;
        return ok();
      }
      return { ok: false, status: 404, async json() { return {}; } };
    };
    const subject = service(fetch, provider(), () => new Date("2026-07-30T05:00:00.000Z"), {
      provisioningRetryDelaysMs: []
    });
    const record = buildProvisionedRecord({
      email: "pinchy.lobster@dreambau.de",
      displayName: "Pinchy Lobster",
      role: "platform-admin",
      adminBaseUrl: subject.target.adminBaseUrl,
      appBaseUrl: subject.target.appBaseUrl,
      responsiblePerson: "qa",
      now: new Date("2026-07-30T05:00:00.000Z"),
      secret: "Gener4ted-Application*Pass"
    });

    const result = await subject.provision({
      record,
      firstName: "Pinchy",
      lastName: "Lobster",
      role: "platform-admin",
      storeTotp: vi.fn()
    });

    expect(result.state.state).toBe("ready");
    expect(activationOtp).toMatch(/^\d{6}$/);
  });

  it("refreshes the user token and retries a transient TOTP activation failure", async () => {
    let userTokenNumber = 0;
    let activationAttempts = 0;
    let totpActive = false;
    const sleep = vi.fn(async () => {});
    const fetch: ProvisioningFetch = async (input, init) => {
      const url = String(input);
      const ok = (value: unknown = {}) => ({ ok: true, status: 200, async json() { return value; } });
      if (url.endsWith("/agencyadmin/agencies/12")) return ok({ _embedded: { id: 12, tenantId: 7, consultingType: 1, topics: [{ id: 31 }], deleteDate: "null" } });
      if (url.includes("/protocol/openid-connect/token")) {
        const form = new URLSearchParams(init?.body);
        if (form.get("username") === "abe.simpson@dreambau.de") {
          return ok({ access_token: "admin-token", expires_in: 300 });
        }
        if (totpActive && !form.get("otp")) {
          return { ok: false, status: 401, async json() { return {}; } };
        }
        userTokenNumber += 1;
        return ok({ access_token: `user-token-${userTokenNumber}`, expires_in: 300 });
      }
      if (url.endsWith("/users/data") && init?.method === "GET") {
        return ok({ twoFactorAuth: { secret: generatedOrisoTotpSecret } });
      }
      if (url.endsWith("/users/2fa/app") && init?.method === "PUT") {
        activationAttempts += 1;
        const authorization = init?.headers?.Authorization;
        if (activationAttempts === 1) {
          expect(authorization).toBe("Bearer user-token-1");
          return { ok: false, status: 401, async json() { return {}; } };
        }
        expect(authorization).toBe("Bearer user-token-2");
        totpActive = true;
        return ok();
      }
      return { ok: false, status: 404, async json() { return {}; } };
    };
    const subject = service(fetch, provider(), () => new Date("2026-07-29T16:00:00.000Z"), {
      sleep,
      provisioningRetryDelaysMs: [25]
    });
    const record = buildProvisionedRecord({
      email: "bart.simpson@oriso.org",
      displayName: "Bart Simpson",
      role: "tenant-admin",
      adminBaseUrl: subject.target.adminBaseUrl,
      appBaseUrl: subject.target.appBaseUrl,
      responsiblePerson: "qa",
      now: new Date("2026-07-29T16:00:00.000Z"),
      secret: "Gener4ted-Application*Pass"
    });

    const result = await subject.provision({
      record,
      firstName: "Bart",
      lastName: "Simpson",
      role: "tenant-admin",
      storeTotp: vi.fn()
    });

    expect(result.state.state).toBe("ready");
    expect(activationAttempts).toBe(2);
    expect(sleep).toHaveBeenCalledOnce();
  });

  it("stops after the bounded post-create retry window is exhausted", async () => {
    let accountCreated = false;
    const sleep = vi.fn(async () => {});
    const fetch: ProvisioningFetch = async (input, init) => {
      const url = String(input);
      const ok = (value: unknown = {}) => ({ ok: true, status: 200, async json() { return value; } });
      if (url.endsWith("/agencyadmin/agencies/12")) return ok({ _embedded: { id: 12, tenantId: 7, consultingType: 1, topics: [{ id: 31 }], deleteDate: "null" } });
      if (url.includes("/protocol/openid-connect/token")) {
        const form = new URLSearchParams(init?.body);
        if (form.get("username") === "abe.simpson@dreambau.de") {
          return ok({ access_token: "admin-token", expires_in: 300 });
        }
        return { ok: false, status: 401, async json() { return {}; } };
      }
      if (url.endsWith("/useradmin/tenantadmins") && init?.method === "POST") {
        accountCreated = true;
        return ok({ _embedded: { id: "created-user-id" } });
      }
      return { ok: false, status: 404, async json() { return {}; } };
    };
    const subject = service(fetch, provider(), () => new Date("2026-07-29T16:00:00.000Z"), {
      sleep,
      provisioningRetryDelaysMs: [10, 20]
    });
    const record = buildProvisionedRecord({
      email: "ralph.wiggum@oriso.org",
      displayName: "Ralph Wiggum",
      role: "tenant-admin",
      adminBaseUrl: subject.target.adminBaseUrl,
      appBaseUrl: subject.target.appBaseUrl,
      responsiblePerson: "qa",
      now: new Date("2026-07-29T16:00:00.000Z"),
      secret: "Gener4ted-Application*Pass"
    });

    await expect(subject.provision({
      record,
      firstName: "Ralph",
      lastName: "Wiggum",
      role: "tenant-admin",
      storeTotp: vi.fn()
    })).rejects.toMatchObject({ code: "account_credentials_mismatch" });
    expect(accountCreated).toBe(true);
    expect(sleep.mock.calls.map(([delay]) => delay)).toEqual([10, 20]);
  });

  it("does not retry a permanent TOTP activation conflict", async () => {
    const sleep = vi.fn(async () => {});
    const fetch: ProvisioningFetch = async (input) => {
      const url = String(input);
      if (url.includes("/protocol/openid-connect/token")) {
        return { ok: true, status: 200, async json() { return { access_token: "user", expires_in: 300 }; } };
      }
      if (url.endsWith("/users/data")) {
        return { ok: true, status: 200, async json() {
          return { twoFactorAuth: { secret: generatedOrisoTotpSecret } };
        } };
      }
      if (url.endsWith("/users/2fa/app")) {
        return { ok: false, status: 409, async json() { return {}; } };
      }
      return { ok: false, status: 404, async json() { return {}; } };
    };
    const subject = service(fetch, provider(), () => new Date("2026-07-29T16:00:00.000Z"), {
      sleep,
      provisioningRetryDelaysMs: [10, 20]
    });
    const record = buildProvisionedRecord({
      email: "bart.simpson@oriso.org",
      displayName: "Bart Simpson",
      role: "tenant-admin",
      adminBaseUrl: subject.target.adminBaseUrl,
      appBaseUrl: subject.target.appBaseUrl,
      responsiblePerson: "qa",
      now: new Date("2026-07-29T16:00:00.000Z"),
      secret: "Gener4ted-Application*Pass"
    });

    await expect(subject.provision({
      record,
      firstName: "Bart",
      lastName: "Simpson",
      role: "tenant-admin",
      storeTotp: vi.fn()
    })).rejects.toMatchObject({ code: "totp_setup_failed" });
    expect(sleep).not.toHaveBeenCalled();
  });

  it.each([
    ["platform-admin", "/useradmin/tenantadmins", { tenantId: 0 }, "admin", ["platform-admin"]],
    ["tenant-admin", "/useradmin/tenantadmins", { tenantId: 7 }, "admin", ["tenant-admin"]],
    ["agency-admin", "/useradmin/agencyadmins", { tenantId: 7 }, "admin", ["agency-admin"]],
    ["counsellor", "/useradmin/consultants", { tenantId: 7 }, "app-user", ["consultant"]],
    ["advice-seeker", "/users/askers/new", { agencyId: 12 }, "app-user", ["asker"]]
  ] as const)(
    "creates, protects and verifies a %s account without leaking credentials",
    async (role, expectedPath, expectedPayload, expectedKind, expectedRoles) => {
      const calls: Array<{ url: string; method: string; body?: string; headers?: Record<string, string> }> = [];
      let accountCreated = false;
      let totpActive = false;
      const storedTotp: string[] = [];
      const fetch: ProvisioningFetch = async (input, init) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        calls.push({ url, method, body: init?.body, headers: init?.headers });
        const ok = (value: unknown = {}) => ({ ok: true, status: 200, async json() { return value; } });
      if (url.endsWith("/agencyadmin/agencies/12")) return ok({ _embedded: { id: 12, name: "Debt advice Berlin", tenantId: 7, consultingType: 1, topics: [{ id: 31 }], deleteDate: "null" } });
        if (url.includes("/protocol/openid-connect/token")) {
          const form = new URLSearchParams(init?.body);
          const isAdmin = form.get("username") === "abe.simpson@dreambau.de";
          if (isAdmin) return ok({ access_token: "admin-token", expires_in: 300 });
          if (!accountCreated) return { ok: false, status: 401, async json() { return {}; } };
          if (totpActive && !form.get("otp")) return { ok: false, status: 401, async json() { return {}; } };
          return ok({ access_token: "user-token", expires_in: 300 });
        }
        if (url.endsWith(expectedPath) && method === "POST") {
          accountCreated = true;
          return ok({ _embedded: { id: "created-user-id" } });
        }
        if (url.includes("/created-user-id/agencies") && method === "PUT") return ok();
        if (url.endsWith("/users/email") && method === "PUT") return ok();
      if (url.endsWith("/users/data") && method === "GET") {
        return ok({ twoFactorAuth: { secret: generatedOrisoTotpSecret } });
      }
      if (url.endsWith("/users/2fa/app") && method === "PUT") {
        const body = JSON.parse(String(init?.body));
        expect(body.secret).toBe(storedTotp[0]);
        expect(body.otp).toMatch(/^\d{6}$/);
        expect(init?.headers?.["X-U25-CSRF-TOKEN"]).toBe("dreambau-test-access");
        expect(init?.headers?.Cookie).toBe(`CSRF-TOKEN=${init?.headers?.["X-CSRF-Token"]}`);
        totpActive = true;
        return ok();
        }
        return { ok: false, status: 404, async json() { return {}; } };
      };
      const subject = service(fetch, provider(), () => new Date("2026-07-29T16:00:00.000Z"));
      const record = buildProvisionedRecord({
        email: "lisa.simpson@oriso.org",
        displayName: "Lisa Simpson",
        role,
        adminBaseUrl: subject.target.adminBaseUrl,
        appBaseUrl: subject.target.appBaseUrl,
        responsiblePerson: "fg@dreambau.com",
        now: new Date("2026-07-29T16:00:00.000Z"),
        secret: "Gener4ted-Application*Pass"
      });

      const result = await subject.provision({
        record,
        firstName: "Lisa",
        lastName: "Simpson",
        role,
        storeTotp: async (secret) => { storedTotp.push(secret); }
      });

      expect(result).toMatchObject({
        created: true,
        state: {
          state: "ready",
          role,
          twoFactorStatus: "ACTIVE",
          accessGateStatus: "READY",
          nextStep: "none"
        }
      });
      expect(result.agencyNames).toEqual(role === "platform-admin" || role === "tenant-admin" ? undefined : ["Debt advice Berlin"]);
      expect(record).toMatchObject({ kind: expectedKind, roles: expectedRoles });
      expect(storedTotp).toHaveLength(1);
      expect(storedTotp[0]).toBe(generatedOrisoTotpSecret);
      const create = calls.find((call) => call.method === "POST" && call.url.endsWith(expectedPath));
      expect(create).toBeDefined();
      expect(JSON.parse(String(create?.body))).toMatchObject(expectedPayload);
      if (role === "advice-seeker" || role === "counsellor") {
        expect(record.username).toBe("lisa.simpson_at_oriso.org");
        expect(JSON.parse(String(create?.body))).toMatchObject({
          username: "lisa.simpson_at_oriso.org"
        });
        const postCreateToken = calls.find((call) => {
          if (!call.url.includes("/protocol/openid-connect/token") || !call.body) return false;
          return new URLSearchParams(call.body).get("username") === "lisa.simpson_at_oriso.org";
        });
        expect(postCreateToken).toBeDefined();
      }
      if (role === "advice-seeker") {
        expect(create?.headers?.Authorization).toBeUndefined();
        expect(create?.headers?.agencyId).toBe("12");
        expect(create?.headers?.["X-U25-CSRF-TOKEN"]).toBe("dreambau-test-access");
        expect(create?.headers?.["X-CSRF-Token"]).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        );
        expect(create?.headers?.Cookie).toBe(`CSRF-TOKEN=${create?.headers?.["X-CSRF-Token"]}`);
      }
      if (role === "agency-admin" || role === "counsellor") {
        const relation = calls.find((call) => call.method === "PUT" && call.url.includes("/created-user-id/agencies"));
        expect(relation).toBeDefined();
        expect(JSON.parse(String(relation?.body))).toEqual(role === "agency-admin"
          ? [{ agencyId: 12, role: "ADMIN_DEFAULT" }]
          : [{ agencyId: 12, roleSetKey: "CONSULTANT_DEFAULT" }]);
      }
      expect(JSON.stringify(result)).not.toContain(record.secret);
      expect(JSON.stringify(result)).not.toContain(storedTotp[0]);
    }
  );

  it("recovers an account whose TOTP seed was stored before activation", async () => {
    let totpActive = false;
    let totpStores = 0;
    const fetch: ProvisioningFetch = async (input, init) => {
      const url = String(input);
      const ok = (value: unknown = {}) => ({ ok: true, status: 200, async json() { return value; } });
      if (url.endsWith("/agencyadmin/agencies/12")) return ok({ _embedded: { id: 12, tenantId: 7, consultingType: 1, topics: [{ id: 31 }], deleteDate: "null" } });
      if (url.includes("/protocol/openid-connect/token")) {
        const form = new URLSearchParams(init?.body);
        if (form.get("username") === "abe.simpson@dreambau.de") {
          return ok({ access_token: "admin-token", expires_in: 300 });
        }
        if (totpActive && form.get("otp")) return ok({ access_token: "user-token", expires_in: 300 });
        if (!totpActive && !form.get("otp")) return ok({ access_token: "user-token", expires_in: 300 });
        return { ok: false, status: 401, async json() { return {}; } };
      }
      if (url.endsWith("/users/2fa/app") && init?.method === "PUT") {
        totpActive = true;
        return ok();
      }
      if (url.endsWith("/users/data") && init?.method === "GET") {
        return ok({ twoFactorAuth: { secret: adminTotpSecret } });
      }
      return { ok: false, status: 409, async json() { return {}; } };
    };
    const subject = service(fetch, provider(), () => new Date("2026-07-29T16:00:00.000Z"));
    const record = buildProvisionedRecord({
      email: "lisa.simpson@oriso.org",
      displayName: "Lisa Simpson",
      role: "tenant-admin",
      adminBaseUrl: subject.target.adminBaseUrl,
      appBaseUrl: subject.target.appBaseUrl,
      responsiblePerson: "fg@dreambau.com",
      now: new Date("2026-07-29T16:00:00.000Z"),
      secret: "Gener4ted-Application*Pass"
    });
    const stored = { ...record, totpSecret: adminTotpSecret };

    const result = await subject.provision({
      record: stored,
      firstName: "Lisa",
      lastName: "Simpson",
      role: "tenant-admin",
      storeTotp: async () => { totpStores += 1; }
    });

    expect(result.created).toBe(false);
    expect(result.state.state).toBe("ready");
    expect(totpStores).toBe(0);
    expect(totpActive).toBe(true);
  });

  it("fails closed when ORISO does not return its generated TOTP seed", async () => {
    const storeTotp = vi.fn(async () => {});
    const fetch: ProvisioningFetch = async (input) => {
      const url = String(input);
      if (url.includes("/protocol/openid-connect/token")) {
        return { ok: true, status: 200, async json() {
          return { access_token: "user-token", expires_in: 300 };
        } };
      }
      if (url.endsWith("/users/data")) {
        return { ok: true, status: 200, async json() {
          return { twoFactorAuth: { secret: "malformed-seed" } };
        } };
      }
      return { ok: false, status: 404, async json() { return {}; } };
    };
    const subject = service(fetch);
    const record = buildProvisionedRecord({
      email: "lisa.simpson@oriso.org",
      displayName: "Lisa Simpson",
      role: "tenant-admin",
      adminBaseUrl: subject.target.adminBaseUrl,
      appBaseUrl: subject.target.appBaseUrl,
      responsiblePerson: "fg@dreambau.com",
      now: new Date("2026-07-29T16:00:00.000Z"),
      secret: "Gener4ted-Application*Pass"
    });

    await expect(subject.provision({
      record,
      firstName: "Lisa",
      lastName: "Simpson",
      role: "tenant-admin",
      storeTotp
    })).rejects.toMatchObject({ code: "totp_setup_failed" });
    expect(storeTotp).not.toHaveBeenCalled();
  });

  it("does not create an account when the credential probe fails transiently", async () => {
    const calls: string[] = [];
    const fetch: ProvisioningFetch = async (input) => {
      calls.push(String(input));
      return { ok: false, status: 503, async json() { return {}; } };
    };
    const subject = service(fetch);
    const record = buildProvisionedRecord({
      email: "lisa.simpson@oriso.org",
      displayName: "Lisa Simpson",
      role: "tenant-admin",
      adminBaseUrl: subject.target.adminBaseUrl,
      appBaseUrl: subject.target.appBaseUrl,
      responsiblePerson: "fg@dreambau.com",
      now: new Date("2026-07-29T16:00:00.000Z"),
      secret: "Gener4ted-Application*Pass"
    });
    await expect(subject.provision({
      record,
      firstName: "Lisa",
      lastName: "Simpson",
      role: "tenant-admin",
      storeTotp: vi.fn()
    })).rejects.toMatchObject({ code: "oriso_authentication_failed" });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/protocol/openid-connect/token");
  });

  it.each([
    ["admin-auth", [], "oriso_authentication_failed"],
    ["create-conflict", ["started", "rejected"], "account_creation_conflict"],
    ["create-network", ["started"], undefined],
    ["post-create-auth", ["started"], "account_credentials_mismatch"]
  ] as const)("reports the creation safety boundary for %s", async (failure, expectedAttempts, code) => {
    const attempts: string[] = [];
    const fetch: ProvisioningFetch = async (input, init) => {
      const url = String(input);
      if (url.includes("/protocol/openid-connect/token")) {
        const form = new URLSearchParams(init?.body);
        if (form.get("username") === "abe.simpson@dreambau.de" && failure !== "admin-auth") {
          return { ok: true, status: 200, async json() { return { access_token: "admin", expires_in: 300 }; } };
        }
        return { ok: false, status: 401, async json() { return {}; } };
      }
      if (url.endsWith("/useradmin/tenantadmins")) {
        expect(attempts).toEqual(["started"]);
        if (failure === "create-network") throw new Error("creation response lost");
        return { ok: failure === "post-create-auth", status: failure === "post-create-auth" ? 201 : 409, async json() { return {}; } };
      }
      throw new Error("unexpected request");
    };
    const subject = service(fetch, provider(), undefined, { provisioningRetryDelaysMs: [] });
    const record = buildProvisionedRecord({
      email: "lisa.simpson@dreambau.de", displayName: "Lisa Simpson", role: "tenant-admin",
      adminBaseUrl: subject.target.adminBaseUrl, appBaseUrl: subject.target.appBaseUrl,
      responsiblePerson: "qa", now: new Date(), secret: "synthetic-application-password"
    });
    const result = subject.provision({
      record, firstName: "Lisa", lastName: "Simpson", role: "tenant-admin", storeTotp: vi.fn(),
      onCreationAttempt: (state) => attempts.push(state)
    });
    if (code) await expect(result).rejects.toMatchObject({ code });
    else await expect(result).rejects.toThrow("creation response lost");
    expect(attempts).toEqual(expectedAttempts);
  });

  it("does not mutate an authenticated direct account when stale-role replacement requires creation", async () => {
    const calls: string[] = [];
    const fetch: ProvisioningFetch = async (input) => {
      const url = String(input); calls.push(url);
      if (!url.includes("/protocol/openid-connect/token")) throw new Error("unexpected mutation");
      return { ok: true, status: 200, async json() { return { access_token: "existing-user", expires_in: 300 }; } };
    };
    const subject = service(fetch);
    const record = buildProvisionedRecord({
      email: "lisa.simpson@dreambau.de", displayName: "Lisa Simpson", role: "tenant-admin",
      adminBaseUrl: subject.target.adminBaseUrl, appBaseUrl: subject.target.appBaseUrl,
      responsiblePerson: "qa", now: new Date(), secret: "synthetic-application-password"
    });
    const storeTotp = vi.fn(), onCreationAttempt = vi.fn();
    const result = await subject.provision({
      record, firstName: "Lisa", lastName: "Simpson", role: "tenant-admin", storeTotp,
      rejectExistingAccount: true, onCreationAttempt
    });
    expect(result.created).toBe(false);
    expect(calls).toHaveLength(1);
    expect(storeTotp).not.toHaveBeenCalled();
    expect(onCreationAttempt).not.toHaveBeenCalled();
  });

  it("maps an existing unmanaged account to a creation conflict", async () => {
    const fetch: ProvisioningFetch = async (input, init) => {
      const url = String(input);
      if (url.includes("/protocol/openid-connect/token")) {
        const form = new URLSearchParams(init?.body);
        if (form.get("username") === "abe.simpson@dreambau.de") {
          return { ok: true, status: 200, async json() { return { access_token: "admin", expires_in: 300 }; } };
        }
        return { ok: false, status: 401, async json() { return {}; } };
      }
      if (url.endsWith("/useradmin/tenantadmins")) {
        return { ok: false, status: 409, async json() { return {}; } };
      }
      return { ok: false, status: 404, async json() { return {}; } };
    };
    const subject = service(fetch);
    const record = buildProvisionedRecord({
      email: "lisa.simpson@oriso.org",
      displayName: "Lisa Simpson",
      role: "tenant-admin",
      adminBaseUrl: subject.target.adminBaseUrl,
      appBaseUrl: subject.target.appBaseUrl,
      responsiblePerson: "fg@dreambau.com",
      now: new Date("2026-07-29T16:00:00.000Z"),
      secret: "Gener4ted-Application*Pass"
    });
    await expect(subject.provision({
      record,
      firstName: "Lisa",
      lastName: "Simpson",
      role: "tenant-admin",
      storeTotp: vi.fn()
    })).rejects.toMatchObject({ code: "account_creation_conflict" });
  });

  it.each([
    ["totp_store_failed", "store"],
    ["totp_setup_failed", "setup"],
    ["totp_verification_failed", "verify"]
  ] as const)("maps %s without exposing the TOTP seed", async (expectedCode, failure) => {
    let tokenCalls = 0;
    const fetch: ProvisioningFetch = async (input, init) => {
      const url = String(input);
      if (url.includes("/protocol/openid-connect/token")) {
        tokenCalls += 1;
        if (failure === "verify" && tokenCalls > 1) {
          return { ok: false, status: 401, async json() { return {}; } };
        }
        return { ok: true, status: 200, async json() { return { access_token: "user", expires_in: 300 }; } };
      }
      if (url.endsWith("/users/data")) {
        return { ok: true, status: 200, async json() {
          return { twoFactorAuth: { secret: generatedOrisoTotpSecret } };
        } };
      }
      if (url.endsWith("/users/2fa/app")) {
        return failure === "setup"
          ? { ok: false, status: 409, async json() { return {}; } }
          : { ok: true, status: 200, async json() { return {}; } };
      }
      return { ok: true, status: 200, async json() { return {}; } };
    };
    const subject = service(fetch);
    const record = buildProvisionedRecord({
      email: "lisa.simpson@oriso.org",
      displayName: "Lisa Simpson",
      role: "tenant-admin",
      adminBaseUrl: subject.target.adminBaseUrl,
      appBaseUrl: subject.target.appBaseUrl,
      responsiblePerson: "fg@dreambau.com",
      now: new Date("2026-07-29T16:00:00.000Z"),
      secret: "Gener4ted-Application*Pass"
    });
    const error = await subject.provision({
      record,
      firstName: "Lisa",
      lastName: "Simpson",
      role: "tenant-admin",
      storeTotp: async () => {
        if (failure === "store") throw new Error("writer failed");
      }
    }).catch((value: unknown) => value);
    expect(error).toMatchObject({ code: expectedCode });
    expect(JSON.stringify(error)).not.toContain(record.secret);
  });

  it("rejects a role that contradicts the Test Access record before any network call", async () => {
    const fetch = vi.fn<ProvisioningFetch>();
    const subject = service(fetch);
    const record = buildProvisionedRecord({
      email: "lisa.simpson@oriso.org",
      displayName: "Lisa Simpson",
      role: "tenant-admin",
      adminBaseUrl: subject.target.adminBaseUrl,
      appBaseUrl: subject.target.appBaseUrl,
      responsiblePerson: "fg@dreambau.com",
      now: new Date("2026-07-29T16:00:00.000Z"),
      secret: "Gener4ted-Application*Pass"
    });
    await expect(subject.provision({
      record,
      firstName: "Lisa",
      lastName: "Simpson",
      role: "counsellor",
      storeTotp: vi.fn()
    })).rejects.toMatchObject({ code: "account_create_failed" });
    expect(fetch).not.toHaveBeenCalled();
  });
});


describe("new-account provisioning prerequisites", () => {
  const validAgency = { _embedded: { id: 12, tenantId: 7, consultingType: 1, topics: [{ id: 31 }], deleteDate: "null" } };
  const recordFor = (role: "counsellor" | "agency-admin" | "advice-seeker") => buildProvisionedRecord({
    email: "New.Person+qa@oriso.org", displayName: "New Person", role,
    adminBaseUrl: "https://admin.oriso-dev.site", appBaseUrl: "https://app.oriso-dev.site",
    responsiblePerson: "qa", now: new Date(59_000), secret: "new-account-password"
  });

  it.each(["counsellor", "advice-seeker"] as const)("rejects incompatible legacy %s usernames before new product creation", async (role) => {
    const mutations: string[] = [];
    const fetch: ProvisioningFetch = async (input, init) => {
      if (init?.method !== "GET" && !String(input).includes("openid-connect/token")) mutations.push(String(input));
      return { ok: false, status: 401, async json() { return {}; } };
    };
    const record = { ...recordFor(role), username: role === "counsellor" ? "old@oriso.org" : "another_safe_username" };
    await expect(service(fetch).provision({ record, firstName: "New", lastName: "Person", role, storeTotp: vi.fn() })).rejects.toMatchObject({ code: "record_username_incompatible" });
    expect(mutations).toEqual([]);
    expect(record.username).toBe(role === "counsellor" ? "old@oriso.org" : "another_safe_username");
  });

  it.each(["counsellor", "advice-seeker"] as const)("keeps a new %s identity Matrix-safe without changing its email", (role) => {
    expect(recordFor(role)).toMatchObject({ username: "new.person+qa_at_oriso.org", email: "new.person+qa@oriso.org" });
  });

  it.each([
    [404, {}], [403, {}], [500, {}], [200, {}],
    [200, { _embedded: { ...validAgency._embedded, id: 99 } }],
    [200, { _embedded: { ...validAgency._embedded, tenantId: 99 } }],
    [200, { _embedded: { ...validAgency._embedded, deleteDate: "2026-01-01" } }],
    [200, { _embedded: { ...validAgency._embedded, consultingType: 99 } }],
    [200, { _embedded: { ...validAgency._embedded, topics: [] } }]
  ])("does not create a counsellor when agency lookup returns %i / %j", async (status, body) => {
    const mutations: string[] = [];
    const calls: string[] = [];
    const fetch: ProvisioningFetch = async (input, init) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("/agencyadmin/agencies/12")) {
        expect(init?.method).toBe("GET");
        expect(init?.headers?.Authorization).toBe("Bearer admin-token");
        return { ok: status === 200, status, async json() { return body; } };
      }
      if (url.includes("/protocol/openid-connect/token")) {
        const admin = new URLSearchParams(init?.body).get("username") === "abe.simpson@dreambau.de";
        return { ok: admin, status: admin ? 200 : 401, async json() { return { access_token: "admin-token", expires_in: 300 }; } };
      }
      if (init?.method !== "GET") mutations.push(url);
      return { ok: false, status: 409, async json() { return {}; } };
    };
    const storeTotp = vi.fn();
    await expect(service(fetch).provision({ record: recordFor("counsellor"), firstName: "New", lastName: "Person", role: "counsellor", storeTotp }))
      .rejects.toMatchObject({ code: "provisioning_agency_unavailable" });
    expect(calls.some((url) => url.endsWith("/agencyadmin/agencies/12"))).toBe(true);
    expect(mutations).toEqual([]);
    expect(storeTotp).not.toHaveBeenCalled();
  });

  it.each(["counsellor", "agency-admin", "advice-seeker"] as const)("checks the configured agency before a %s creation conflict", async (role) => {
    const calls: string[] = [];
    const stages: string[] = [];
    const fetch: ProvisioningFetch = async (input, init) => {
      const url = String(input);
      if (url.includes("/protocol/openid-connect/token")) {
        const admin = new URLSearchParams(init?.body).get("username") === "abe.simpson@dreambau.de";
        return { ok: admin, status: admin ? 200 : 401, async json() { return { access_token: "admin-token", expires_in: 300 }; } };
      }
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("/agencyadmin/agencies/12")) return { ok: true, status: 200, async json() { return validAgency; } };
      return { ok: false, status: 409, async json() { return {}; } };
    };
    const storeTotp = vi.fn();
    await expect(service(fetch).provision({ record: recordFor(role), firstName: "New", lastName: "Person", role, storeTotp, onCreationAttempt: (stage) => stages.push(stage) }))
      .rejects.toMatchObject({ code: "account_creation_conflict" });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("GET https://api.oriso-dev.site/service/agencyadmin/agencies/12");
    expect(calls[1]).toMatch(/^POST /);
    expect(stages).toEqual(["started", "rejected"]);
    expect(storeTotp).not.toHaveBeenCalled();
  });
});
