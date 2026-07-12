import argon2 from "argon2";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server/app.js";
import { createPasskeyStore } from "../src/server/passkey-store.js";
import type { WebAuthnAdapter } from "../src/server/passkey-auth.js";

let passwordHash = "";
beforeAll(async () => { passwordHash = await argon2.hash("bootstrap-password", { type: argon2.argon2id }); });

function setup() {
  const passkeyStore = createPasskeyStore(path.join(mkdtempSync(path.join(tmpdir(), "passkey-auth-")), "auth.sqlite"));
  const user = passkeyStore.createUser({ email: "frank@dreambau.com", name: "Frank", projects: ["oriso", "dreambau"] });
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
      expect(options.credential.id).toBe("credential-id");
      return { verified: true, authenticationInfo: { newCounter: 1 } };
    })
  };
  const app = createApp({
    passwordHash, secureCookies: false, loadAccounts: () => [], passkeyStore, webauthn,
    rpId: "dreambau.com", expectedOrigin: "https://dreambau.com",
    bootstrapUser: { email: user.email, name: user.name, projects: user.projects }
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
});
