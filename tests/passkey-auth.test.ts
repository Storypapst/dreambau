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

function setup(accounts: AccountRecord[] = []) {
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
    bootstrapUser: { email: user.email, name: user.name, projects: user.projects, role: "admin" }
  });
  return { app, passkeyStore, user, webauthn };
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
    expect(verified.body).toEqual({ verified: true });
    expect(passkeyStore.getCredential("credential-id")?.userId).toBe(user.id);
    expect((await agent.get("/testmails/api/auth/session")).body).toEqual({ authenticated: true, method: "passkey", userId: user.id });
    await agent.post("/testmails/api/auth/logout");
    expect((await agent.post("/testmails/api/auth/login").send({ password: "bootstrap-password" })).status).toBe(410);
    expect((await agent.get("/testmails/api/auth/bootstrap-status")).body).toEqual({ enabled: false });
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
    expect((await admin.get("/testmails/api/auth/users")).body).toHaveLength(2);
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
    passkeyStore.close();
  });
});
