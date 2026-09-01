import argon2 from "argon2";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server/app.js";
import { createPasskeyStore } from "../src/server/passkey-store.js";
import type { WebAuthnAdapter } from "../src/server/passkey-auth.js";
import type { AccountRecord } from "../src/server/accounts.js";
import {
  createInfisicalHumanAccessProvider,
  type HumanAccessFetch,
  type HumanAccessProvider
} from "../src/server/infisical-human-access.js";

let passwordHash = "";
beforeAll(async () => { passwordHash = await argon2.hash("bootstrap-password", { type: argon2.argon2id }); });

function account(email: string): AccountRecord {
  const domain = email.split("@")[1];
  return {
    displayName: email, email, password: `password-${email}`, domain,
    imap: "mail.dreambau.com:993", smtp: "mail.dreambau.com:465", jmap: "https://box.dreambau.com/.well-known/jmap",
    caldav: `https://box.dreambau.com/dav/cal/${encodeURIComponent(email)}/`, carddav: `https://box.dreambau.com/dav/card/${encodeURIComponent(email)}/`,
    encryption: domain === "oriso.org" ? { state: "disabled" } : { state: "encrypted", format: "S/MIME", symmetricMode: "AES-256", encryptOnAppend: true, allowSpamTraining: false }
  };
}

function setup(accounts: AccountRecord[] = [], humanAccessProvider?: HumanAccessProvider, humanAccessTimeoutMs?: number) {
  const passkeyStore = createPasskeyStore(path.join(mkdtempSync(path.join(tmpdir(), "passkey-auth-")), "auth.sqlite"));
  const user = passkeyStore.createUser({ email: "frank@dreambau.com", name: "Frank", projects: ["oriso", "dreambau"], role: "admin" });
  const webauthn: WebAuthnAdapter = {
    generateRegistrationOptions: vi.fn(async () => ({ challenge: "registration-challenge", rp: { id: "dreambau.com" } })),
    verifyRegistrationResponse: vi.fn(async (options) => {
      expect(options.expectedChallenge).toBe("registration-challenge");
      expect(options.expectedOrigin).toBe("https://dreambau.com");
      return {
        verified: true,
        registrationInfo: {
          credential: { id: "credential-id", publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: ["internal"] },
          credentialDeviceType: "multiDevice",
          credentialBackedUp: true
        }
      };
    }),
    generateAuthenticationOptions: vi.fn(async () => ({ challenge: "authentication-challenge", allowCredentials: [{ id: "credential-id" }] })),
    verifyAuthenticationResponse: vi.fn(async (options) => {
      expect(options.expectedChallenge).toBe("authentication-challenge");
      expect(options.credential.id).toBe(options.response.id);
      return { verified: true, authenticationInfo: { newCounter: options.credential.counter + 1 } };
    })
  };
  const app = createApp({
    passwordHash, secureCookies: false, loadAccounts: () => accounts, passkeyStore, webauthn,
    rpId: "dreambau.com", expectedOrigin: "https://dreambau.com",
    bootstrapUser: { email: user.email, name: user.name, projects: user.projects, role: "admin" },
    humanAccessProvider, humanAccessTimeoutMs
  });
  return { app, passkeyStore, user, webauthn };
}

function infisicalProvider(mode: "project-failure" | "malformed-memberships") {
  const fetch: HumanAccessFetch = vi.fn(async (input: string | URL) => {
    const url = String(input);
    if (url.endsWith("/auth/universal-auth/login")) {
      return Response.json({ accessToken: "access-token", expiresIn: 3600, accessTokenMaxTTL: 3600, tokenType: "Bearer" });
    }
    if (url.endsWith("/projects/p-orimo/memberships")) {
      return mode === "project-failure"
        ? Response.json({ message: "upstream-secret-marker" }, { status: 503 })
        : Response.json({ memberships: [{ user: { username: "member@dreambau.com" }, upstreamSecret: "upstream-secret-marker" }] });
    }
    return Response.json({ memberships: [] });
  });
  return createInfisicalHumanAccessProvider({
    baseUrl: "https://secrets.dreambau.com",
    organizationSlug: "dreambau-test-access",
    clientId: "client-id",
    clientSecret: "client-secret-marker",
    projectIds: { oriso: "p-oriso", orimo: "p-orimo", dreambau: "p-dreambau" },
    fetch
  });
}

describe("passkey authentication", () => {
  it("registers a passkey only through an authenticated bootstrap session", async () => {
    const { app, passkeyStore, user } = setup();
    const anonymous = await request(app).post("/testmails/api/auth/passkeys/registration/options").send({ userId: user.id });
    expect(anonymous.status).toBe(401);

    const agent = request.agent(app);
    await agent.post("/testmails/api/auth/login").send({ password: "bootstrap-password" });
    const options = await agent.post("/testmails/api/auth/passkeys/registration/options").send({ userId: user.id });
    expect(options.status).toBe(200);
    expect(options.body.options.challenge).toBe("registration-challenge");
    const verified = await agent.post("/testmails/api/auth/passkeys/registration/verify").send({
      flowId: options.body.flowId,
      response: { id: "credential-id", response: { transports: ["internal"] } }
    });
    expect(verified.status).toBe(200);
    expect(verified.body).toEqual({ verified: true, email: user.email });
    expect(passkeyStore.getCredential("credential-id")?.userId).toBe(user.id);
    expect((await agent.get("/testmails/api/auth/session")).body).toEqual({ authenticated: true, method: "passkey", userId: user.id });
    await agent.post("/testmails/api/auth/logout");
    expect((await agent.post("/testmails/api/auth/login").send({ password: "bootstrap-password" })).status).toBe(410);
    expect((await agent.get("/testmails/api/auth/bootstrap-status")).body).toEqual({ enabled: false });
    passkeyStore.close();
  });

  it("rejects a bootstrap registration challenge owned by another user", async () => {
    const { app, passkeyStore } = setup();
    const other = passkeyStore.createUser({
      email: "other@dreambau.com", name: "Other", projects: ["oriso"], role: "member"
    });
    const agent = request.agent(app);
    await agent.post("/testmails/api/auth/login").send({ password: "bootstrap-password" });
    passkeyStore.putChallenge({
      sessionId: "00000000-0000-4000-8000-000000000001",
      kind: "registration",
      challenge: "foreign-registration-challenge",
      userId: other.id,
      expiresAt: "2099-01-01T00:00:00.000Z"
    });

    const response = await agent.post("/testmails/api/auth/passkeys/registration/verify").send({
      flowId: "00000000-0000-4000-8000-000000000001",
      response: { id: "foreign-credential", response: { transports: ["internal"] } }
    });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "scope_denied" });
    expect(passkeyStore.getCredential("foreign-credential")).toBeNull();
    passkeyStore.close();
  });

  it("logs in passwordlessly and consumes the authentication challenge once", async () => {
    const { app, passkeyStore, user } = setup();
    passkeyStore.addCredential({ id: "credential-id", userId: user.id, publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: ["internal"], deviceType: "multiDevice", backedUp: true });
    const agent = request.agent(app);
    const options = await agent.post("/testmails/api/auth/passkeys/authentication/options").send({ email: user.email });
    expect(options.status).toBe(200);
    const body = { flowId: options.body.flowId, response: { id: "credential-id" } };
    const verified = await agent.post("/testmails/api/auth/passkeys/authentication/verify").send(body);
    expect(verified.status).toBe(200);
    expect((await agent.get("/testmails/api/auth/session")).body).toEqual({ authenticated: true, method: "passkey", userId: user.id });
    expect(passkeyStore.getCredential("credential-id")?.counter).toBe(1);
    expect((await request(app).post("/testmails/api/auth/passkeys/authentication/verify").send(body)).status).toBe(400);
    passkeyStore.close();
  });

  it("issues one-time recovery codes to a passkey session and recovery can only bootstrap a new passkey", async () => {
    const { app, passkeyStore, user } = setup();
    passkeyStore.addCredential({ id: "credential-id", userId: user.id, publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: ["internal"], deviceType: "multiDevice", backedUp: true });
    const agent = request.agent(app);
    const options = await agent.post("/testmails/api/auth/passkeys/authentication/options").send({ email: user.email });
    await agent.post("/testmails/api/auth/passkeys/authentication/verify").send({ flowId: options.body.flowId, response: { id: "credential-id" } });
    const generated = await agent.post("/testmails/api/auth/recovery-codes");
    expect(generated.status).toBe(200);
    expect(generated.body.codes).toHaveLength(10);
    expect(generated.headers["cache-control"]).toBe("no-store");

    const recovery = request.agent(app);
    expect((await recovery.post("/testmails/api/auth/recovery").send({ email: user.email, code: generated.body.codes[0] })).status).toBe(200);
    expect((await recovery.get("/testmails/api/accounts")).status).toBe(403);
    expect((await recovery.post("/testmails/api/auth/passkeys/registration/options").send({})).status).toBe(200);
    expect((await request(app).post("/testmails/api/auth/recovery").send({ email: user.email, code: generated.body.codes[0] })).status).toBe(401);
    expect(JSON.stringify(passkeyStore.debugRecoveryCodes(user.id))).not.toContain(generated.body.codes[1]);
    passkeyStore.close();
  });

  it("lets only a passkey admin create and immediately disable project-scoped members", async () => {
    const { app, passkeyStore, user } = setup();
    passkeyStore.addCredential({ id: "credential-id", userId: user.id, publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: ["internal"], deviceType: "multiDevice", backedUp: true });
    const admin = request.agent(app);
    const options = await admin.post("/testmails/api/auth/passkeys/authentication/options").send({ email: user.email });
    await admin.post("/testmails/api/auth/passkeys/authentication/verify").send({ flowId: options.body.flowId, response: { id: "credential-id" } });
    const created = await admin.post("/testmails/api/auth/users").send({ email: "employee@dreambau.com", name: "Employee", projects: ["oriso"] });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ email: "employee@dreambau.com", role: "member", projects: ["oriso"], status: "active" });
    expect(created.body.enrollmentCode).toBeTypeOf("string");
    passkeyStore.addCredential({ id: "employee-credential", userId: created.body.id, publicKey: new Uint8Array([4, 5, 6]), counter: 0, transports: ["internal"], deviceType: "multiDevice", backedUp: true });
    const employee = request.agent(app);
    const employeeOptions = await employee.post("/testmails/api/auth/passkeys/authentication/options").send({ email: created.body.email });
    await employee.post("/testmails/api/auth/passkeys/authentication/verify").send({ flowId: employeeOptions.body.flowId, response: { id: "employee-credential" } });
    expect((await employee.get("/testmails/api/accounts")).status).toBe(200);
    const disabled = await admin.patch(`/testmails/api/auth/users/${created.body.id}/status`).send({ status: "disabled" });
    expect(disabled.status).toBe(200);
    expect(disabled.body.status).toBe("disabled");
    const listed = await admin.get("/testmails/api/auth/users");
    expect(listed.body.users).toHaveLength(2);
    expect(listed.body.sourceStatus).toEqual({ infisical: "available" });
    expect((await employee.get("/testmails/api/accounts")).status).toBe(403);
    passkeyStore.close();
  });

  it("limits a member's human account list to assigned projects", async () => {
    const { app, passkeyStore, user } = setup([account("oriso-user@oriso.org"), account("orimo-user@trail.ist")]);
    passkeyStore.addCredential({ id: "admin-credential", userId: user.id, publicKey: new Uint8Array([1]), counter: 0, transports: ["internal"], deviceType: "multiDevice", backedUp: true });
    const admin = request.agent(app);
    const adminOptions = await admin.post("/testmails/api/auth/passkeys/authentication/options").send({ email: user.email });
    await admin.post("/testmails/api/auth/passkeys/authentication/verify").send({ flowId: adminOptions.body.flowId, response: { id: "admin-credential" } });
    const created = await admin.post("/testmails/api/auth/users").send({ email: "oriso-member@dreambau.com", name: "ORISO Member", projects: ["oriso"] });
    passkeyStore.addCredential({ id: "member-credential", userId: created.body.id, publicKey: new Uint8Array([2]), counter: 0, transports: ["internal"], deviceType: "multiDevice", backedUp: true });
    const member = request.agent(app);
    const memberOptions = await member.post("/testmails/api/auth/passkeys/authentication/options").send({ email: created.body.email });
    await member.post("/testmails/api/auth/passkeys/authentication/verify").send({ flowId: memberOptions.body.flowId, response: { id: "member-credential" } });
    const response = await member.get("/testmails/api/accounts");
    expect(response.status).toBe(200);
    expect(response.body.map((entry: AccountRecord) => entry.email)).toEqual(["oriso-user@oriso.org"]);
    expect(JSON.stringify(response.body)).not.toContain("orimo-user@trail.ist");
    const projectEscape = await member.patch("/testmails/api/accounts/oriso-user%40oriso.org").send({ project: "ORIMO" });
    expect(projectEscape.status).toBe(403);
    expect(projectEscape.body).toEqual({ error: "scope_denied" });
    expect((await member.get("/testmails/api/machine-identities/usage")).status).toBe(403);
    expect((await member.put("/testmails/api/taxonomies/topics").send({ values: ["member-write"] })).status).toBe(403);
    passkeyStore.close();
  });

  it("synchronizes non-admin project scopes from Infisical before listing users and accounts", async () => {
    const humanAccessProvider: HumanAccessProvider = { projectsFor: vi.fn(async () => ["orimo"]) };
    const { app, passkeyStore, user } = setup([account("oriso-user@oriso.org"), account("orimo-user@trail.ist")], humanAccessProvider);
    passkeyStore.addCredential({ id: "admin-credential", userId: user.id, publicKey: new Uint8Array([1]), counter: 0, transports: ["internal"], deviceType: "multiDevice", backedUp: true });
    const member = passkeyStore.createUser({ email: "member@dreambau.com", name: "Member", projects: ["oriso"], role: "member" });
    passkeyStore.addCredential({ id: "member-credential", userId: member.id, publicKey: new Uint8Array([2]), counter: 0, transports: ["internal"], deviceType: "multiDevice", backedUp: true });

    const admin = request.agent(app);
    const adminOptions = await admin.post("/testmails/api/auth/passkeys/authentication/options").send({ email: user.email });
    await admin.post("/testmails/api/auth/passkeys/authentication/verify").send({ flowId: adminOptions.body.flowId, response: { id: "admin-credential" } });
    const listed = await admin.get("/testmails/api/auth/users");
    // The member was invited with a local "oriso" grant and Infisical reports
    // "orimo". The effective scope is the union of both sources: a sync adds and
    // removes Infisical-derived access and never touches a local grant. This
    // previously returned ["orimo"], silently discarding what an administrator
    // had granted — the defect behind the "0 of 0 accounts" report.
    expect(listed.body.users.find((entry: { email: string }) => entry.email === member.email).projects).toEqual(["orimo", "oriso"]);
    expect(listed.body.sourceStatus).toEqual({ infisical: "available" });

    const agent = request.agent(app);
    const options = await agent.post("/testmails/api/auth/passkeys/authentication/options").send({ email: member.email });
    await agent.post("/testmails/api/auth/passkeys/authentication/verify").send({ flowId: options.body.flowId, response: { id: "member-credential" } });
    const accounts = await agent.get("/testmails/api/accounts");
    expect(accounts.status).toBe(200);
    expect(accounts.body.map((entry: AccountRecord) => entry.email).sort()).toEqual(["orimo-user@trail.ist", "oriso-user@oriso.org"]);
    expect(passkeyStore.getUser(member.id)?.projects).toEqual(["orimo", "oriso"]);
    passkeyStore.close();
  });

  it("fails closed for member access when Infisical synchronization fails but preserves admin access", async () => {
    const humanAccessProvider: HumanAccessProvider = { projectsFor: vi.fn(async () => { throw new Error("offline"); }) };
    const { app, passkeyStore, user } = setup([account("oriso-user@oriso.org")], humanAccessProvider);
    passkeyStore.addCredential({ id: "admin-credential", userId: user.id, publicKey: new Uint8Array([1]), counter: 0, transports: ["internal"], deviceType: "multiDevice", backedUp: true });
    const member = passkeyStore.createUser({ email: "member@dreambau.com", name: "Member", projects: ["oriso"], role: "member" });
    passkeyStore.addCredential({ id: "member-credential", userId: member.id, publicKey: new Uint8Array([2]), counter: 0, transports: ["internal"], deviceType: "multiDevice", backedUp: true });

    const admin = request.agent(app);
    const adminOptions = await admin.post("/testmails/api/auth/passkeys/authentication/options").send({ email: user.email });
    await admin.post("/testmails/api/auth/passkeys/authentication/verify").send({ flowId: adminOptions.body.flowId, response: { id: "admin-credential" } });
    expect((await admin.get("/testmails/api/accounts")).status).toBe(200);

    const agent = request.agent(app);
    const options = await agent.post("/testmails/api/auth/passkeys/authentication/options").send({ email: member.email });
    await agent.post("/testmails/api/auth/passkeys/authentication/verify").send({ flowId: options.body.flowId, response: { id: "member-credential" } });
    expect((await agent.get("/testmails/api/accounts")).status).toBe(503);
    passkeyStore.close();
  });

  it("aborts a timed-out human access lookup and releases the synchronization queue", async () => {
    let calls = 0;
    let aborted = false;
    const humanAccessProvider: HumanAccessProvider = {
      projectsFor: vi.fn((_email, options) => {
        calls += 1;
        if (calls > 1) return Promise.resolve([]);
        return new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => {
            aborted = true;
            reject(new DOMException("Aborted", "AbortError"));
          }, { once: true });
        });
      })
    };
    const { app, passkeyStore } = setup([], humanAccessProvider, 100);
    const member = passkeyStore.createUser({ email: "member@dreambau.com", name: "Member", projects: ["oriso"], role: "member" });
    passkeyStore.addCredential({ id: "member-credential", userId: member.id, publicKey: new Uint8Array([2]), counter: 0, transports: ["internal"], deviceType: "multiDevice", backedUp: true });
    const employee = request.agent(app);
    const options = await employee.post("/testmails/api/auth/passkeys/authentication/options").send({ email: member.email });
    await employee.post("/testmails/api/auth/passkeys/authentication/verify").send({ flowId: options.body.flowId, response: { id: "member-credential" } });

    const timedOut = await employee.get("/testmails/api/auth/me");
    const retried = await employee.get("/testmails/api/auth/me");

    expect(timedOut.status).toBe(503);
    expect(timedOut.body).toEqual({ error: "human_access_unavailable" });
    expect(aborted).toBe(true);
    expect(retried.status).toBe(200);
    expect(humanAccessProvider.projectsFor).toHaveBeenCalledTimes(2);
    passkeyStore.close();
  });

  it("keeps the employee list fail-closed for anonymous and non-admin passkey sessions", async () => {
    const { app, passkeyStore } = setup();
    expect((await request(app).get("/testmails/api/auth/users")).status).toBe(401);

    const member = passkeyStore.createUser({ email: "member@dreambau.com", name: "Member", projects: ["oriso"], role: "member" });
    passkeyStore.addCredential({ id: "member-credential", userId: member.id, publicKey: new Uint8Array([2]), counter: 0, transports: ["internal"], deviceType: "multiDevice", backedUp: true });
    const agent = request.agent(app);
    const options = await agent.post("/testmails/api/auth/passkeys/authentication/options").send({ email: member.email });
    await agent.post("/testmails/api/auth/passkeys/authentication/verify").send({ flowId: options.body.flowId, response: { id: "member-credential" } });

    const forbidden = await agent.get("/testmails/api/auth/users");
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toEqual({ error: "admin_required" });
    passkeyStore.close();
  });

  for (const mode of ["project-failure", "malformed-memberships"] as const) {
    it(`serves locally stored employees with degraded source status after ${mode}`, async () => {
      const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const { app, passkeyStore, user } = setup([], infisicalProvider(mode));
      const member = passkeyStore.createUser({ email: "member@dreambau.com", name: "Member", projects: ["oriso"], role: "member" });
      passkeyStore.addCredential({ id: "admin-credential", userId: user.id, publicKey: new Uint8Array([1]), counter: 0, transports: ["internal"], deviceType: "multiDevice", backedUp: true });
      try {
        const admin = request.agent(app);
        const options = await admin.post("/testmails/api/auth/passkeys/authentication/options").send({ email: user.email });
        await admin.post("/testmails/api/auth/passkeys/authentication/verify").send({ flowId: options.body.flowId, response: { id: "admin-credential" } });

        const listed = await admin.get("/testmails/api/auth/users");

        expect(listed.status).toBe(200);
        expect(listed.body.sourceStatus.infisical).toBe("degraded");
        expect(listed.body.sourceStatus.correlationId).toMatch(/^[0-9a-f-]{36}$/);
        expect(listed.body.users.find((entry: { email: string }) => entry.email === member.email)).toMatchObject({
          projects: ["oriso"],
          accessSources: ["local"]
        });
        const logged = JSON.stringify(warning.mock.calls);
        expect(logged).toContain(listed.body.sourceStatus.correlationId);
        expect(logged).toContain("human access synchronization failed");
        expect(logged).not.toContain("member@dreambau.com");
        expect(logged).not.toContain("upstream-secret-marker");
        expect(logged).not.toContain("client-secret-marker");
      } finally {
        warning.mockRestore();
        passkeyStore.close();
      }
    });
  }

  it("rolls back every Infisical grant when one employee synchronization fails", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const humanAccessProvider: HumanAccessProvider = {
      projectsFor: vi.fn(async (email) => {
        if (email === "alpha@dreambau.com") return ["orimo"];
        throw new Error("offline");
      })
    };
    const { app, passkeyStore, user } = setup([], humanAccessProvider);
    const alpha = passkeyStore.createUser({ email: "alpha@dreambau.com", name: "Alpha", projects: ["oriso"], role: "member" });
    passkeyStore.createUser({ email: "zeta@dreambau.com", name: "Zeta", projects: ["dreambau"], role: "member" });
    passkeyStore.addCredential({ id: "admin-credential", userId: user.id, publicKey: new Uint8Array([1]), counter: 0, transports: ["internal"], deviceType: "multiDevice", backedUp: true });
    try {
      const admin = request.agent(app);
      const options = await admin.post("/testmails/api/auth/passkeys/authentication/options").send({ email: user.email });
      await admin.post("/testmails/api/auth/passkeys/authentication/verify").send({ flowId: options.body.flowId, response: { id: "admin-credential" } });

      const listed = await admin.get("/testmails/api/auth/users");

      expect(listed.status).toBe(200);
      expect(listed.body.sourceStatus.infisical).toBe("degraded");
      expect(listed.body.users.find((entry: { email: string }) => entry.email === alpha.email)).toMatchObject({
        projects: ["oriso"],
        accessSources: ["local"]
      });
      expect(passkeyStore.grants.list(alpha.id).map(({ project, source, status }) => ({ project, source, status }))).toEqual([
        { project: "oriso", source: "local", status: "active" }
      ]);
    } finally {
      warning.mockRestore();
      passkeyStore.close();
    }
  });

  it("does not let a failed employee-list sync roll back newer grants from auth/me", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let rejectFirst!: (error: Error) => void;
    let calls = 0;
    const humanAccessProvider: HumanAccessProvider = {
      projectsFor: vi.fn(() => {
        calls += 1;
        if (calls === 1) return new Promise((_, reject) => { rejectFirst = reject; });
        return Promise.resolve(["orimo"]);
      })
    };
    const { app, passkeyStore, user } = setup([], humanAccessProvider);
    const member = passkeyStore.createUser({ email: "member@dreambau.com", name: "Member", projects: ["oriso"], role: "member" });
    passkeyStore.addCredential({ id: "admin-credential", userId: user.id, publicKey: new Uint8Array([1]), counter: 0, transports: ["internal"], deviceType: "multiDevice", backedUp: true });
    passkeyStore.addCredential({ id: "member-credential", userId: member.id, publicKey: new Uint8Array([2]), counter: 0, transports: ["internal"], deviceType: "multiDevice", backedUp: true });
    try {
      const admin = request.agent(app);
      const options = await admin.post("/testmails/api/auth/passkeys/authentication/options").send({ email: user.email });
      await admin.post("/testmails/api/auth/passkeys/authentication/verify").send({ flowId: options.body.flowId, response: { id: "admin-credential" } });
      const employee = request.agent(app);
      const employeeOptions = await employee.post("/testmails/api/auth/passkeys/authentication/options").send({ email: member.email });
      await employee.post("/testmails/api/auth/passkeys/authentication/verify").send({ flowId: employeeOptions.body.flowId, response: { id: "member-credential" } });

      const employeeListRequest = admin.get("/testmails/api/auth/users").then((response) => response);
      await vi.waitFor(() => expect(humanAccessProvider.projectsFor).toHaveBeenCalledTimes(1));
      let currentUserSettled = false;
      const currentUserRequest = employee.get("/testmails/api/auth/me")
        .then((response) => response)
        .finally(() => { currentUserSettled = true; });
      await new Promise((resolve) => setImmediate(resolve));
      expect(humanAccessProvider.projectsFor).toHaveBeenCalledTimes(1);
      expect(currentUserSettled).toBe(false);
      rejectFirst(new Error("offline"));
      const [employeeList, currentUser] = await Promise.all([employeeListRequest, currentUserRequest]);

      expect(employeeList.body.sourceStatus.infisical).toBe("degraded");
      expect(currentUser.status).toBe(200);
      expect(currentUser.body.projects).toEqual(["orimo", "oriso"]);
      expect(passkeyStore.grants.list(member.id).map(({ project, source, status }) => ({ project, source, status }))).toEqual([
        { project: "orimo", source: "infisical", status: "active" },
        { project: "oriso", source: "local", status: "active" }
      ]);
    } finally {
      warning.mockRestore();
      passkeyStore.close();
    }
  });

  it("keeps the local grant when no Infisical access group remains", async () => {
    const humanAccessProvider: HumanAccessProvider = { projectsFor: vi.fn(async () => []) };
    const { app, passkeyStore } = setup([account("oriso-user@oriso.org")], humanAccessProvider);
    const member = passkeyStore.createUser({ email: "member@dreambau.com", name: "Member", projects: ["oriso"], role: "member" });
    passkeyStore.addCredential({ id: "member-credential", userId: member.id, publicKey: new Uint8Array([2]), counter: 0, transports: ["internal"], deviceType: "multiDevice", backedUp: true });
    const agent = request.agent(app);
    const options = await agent.post("/testmails/api/auth/passkeys/authentication/options").send({ email: member.email });
    await agent.post("/testmails/api/auth/passkeys/authentication/verify").send({ flowId: options.body.flowId, response: { id: "member-credential" } });

    const accounts = await agent.get("/testmails/api/accounts");

    // An Infisical sync may only add and remove Infisical-derived access. The
    // invitation's local grant survives a sync that reports nothing, which is
    // what stops an authenticated employee from dropping to an empty catalog.
    // Removing this member's access means revoking the local grant as well.
    expect(accounts.status).toBe(200);
    expect(accounts.body.map((entry: AccountRecord) => entry.email)).toEqual(["oriso-user@oriso.org"]);
    passkeyStore.close();
  });

  it("removes all visibility once both grant sources are revoked", async () => {
    const humanAccessProvider: HumanAccessProvider = { projectsFor: vi.fn(async () => []) };
    const { app, passkeyStore } = setup([account("oriso-user@oriso.org")], humanAccessProvider);
    const member = passkeyStore.createUser({ email: "member@dreambau.com", name: "Member", projects: ["oriso"], role: "member" });
    passkeyStore.addCredential({ id: "member-credential", userId: member.id, publicKey: new Uint8Array([2]), counter: 0, transports: ["internal"], deviceType: "multiDevice", backedUp: true });
    const agent = request.agent(app);
    const options = await agent.post("/testmails/api/auth/passkeys/authentication/options").send({ email: member.email });
    await agent.post("/testmails/api/auth/passkeys/authentication/verify").send({ flowId: options.body.flowId, response: { id: "member-credential" } });
    expect((await agent.get("/testmails/api/accounts")).body).toHaveLength(1);

    passkeyStore.grants.revoke(member.id, "local");

    // Revocation takes effect on the next request of an already-active session,
    // not only at the next sign-in.
    const afterRevocation = await agent.get("/testmails/api/accounts");
    expect(afterRevocation.status).toBe(200);
    expect(afterRevocation.body).toEqual([]);
    passkeyStore.close();
  });
});
