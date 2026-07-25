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

const webauthn: WebAuthnAdapter = {
  generateRegistrationOptions: vi.fn(async () => ({ challenge: "registration-challenge" })),
  verifyRegistrationResponse: vi.fn(async () => ({ verified: false })),
  generateAuthenticationOptions: vi.fn(async () => ({ challenge: "authentication-challenge", allowCredentials: [{ id: "admin-credential" }] })),
  verifyAuthenticationResponse: vi.fn(async () => ({ verified: true, authenticationInfo: { newCounter: 1 } }))
};

async function adminSession() {
  const passkeyStore = createPasskeyStore(path.join(mkdtempSync(path.join(tmpdir(), "invitation-")), "auth.sqlite"));
  const admin = passkeyStore.createUser({ email: "frank@dreambau.com", name: "Frank", projects: ["oriso", "orimo", "dreambau"], role: "admin" });
  passkeyStore.addCredential({ id: "admin-credential", userId: admin.id, publicKey: new Uint8Array([1]), counter: 0, transports: ["internal"], deviceType: "multiDevice", backedUp: true });
  const app = createApp({
    passwordHash, secureCookies: false, loadAccounts: () => [], passkeyStore, webauthn,
    rpId: "dreambau.com", expectedOrigin: "https://dreambau.com",
    bootstrapUser: { email: admin.email, name: admin.name, projects: admin.projects, role: "admin" }
  });
  const agent = request.agent(app);
  const options = await agent.post("/testmails/api/auth/passkeys/authentication/options").send({ email: admin.email });
  const verification = await agent.post("/testmails/api/auth/passkeys/authentication/verify").send({ flowId: options.body.flowId, response: { id: "admin-credential" } });
  expect(verification.status).toBe(200);
  return { agent, passkeyStore };
}

describe("employee invitation", () => {
  it("grants the requested projects locally at invitation time", async () => {
    const { agent, passkeyStore } = await adminSession();

    const created = await agent.post("/testmails/api/auth/users").send({ email: "New.Employee@dreambau.com", name: "New Employee", projects: ["oriso"] });

    expect(created.status).toBe(201);
    const user = passkeyStore.getUserByEmail("new.employee@dreambau.com");
    expect(user).not.toBeNull();
    const local = passkeyStore.grants.list(user!.id).filter((grant) => grant.source === "local");
    expect(local.map((grant) => grant.project)).toEqual(["oriso"]);
  });

  it("updates the grants of an existing invitation instead of creating a second user", async () => {
    const { agent, passkeyStore } = await adminSession();
    await agent.post("/testmails/api/auth/users").send({ email: "repeat@dreambau.com", name: "Repeat", projects: ["oriso"] });

    const reinvited = await agent.post("/testmails/api/auth/users").send({ email: "  Repeat@dreambau.com ", name: "Repeat", projects: ["oriso", "dreambau"] });

    expect(reinvited.status).toBe(200);
    expect(passkeyStore.listUsers().filter((user) => user.email === "repeat@dreambau.com")).toHaveLength(1);
    const user = passkeyStore.getUserByEmail("repeat@dreambau.com")!;
    expect(passkeyStore.grants.effective(user.id).map((grant) => grant.project).sort()).toEqual(["dreambau", "oriso"]);
  });

  it("refuses to reinvite a disabled identity", async () => {
    const { agent, passkeyStore } = await adminSession();
    await agent.post("/testmails/api/auth/users").send({ email: "gone@dreambau.com", name: "Gone", projects: ["oriso"] });
    const user = passkeyStore.getUserByEmail("gone@dreambau.com")!;
    passkeyStore.setUserStatus(user.id, "disabled");

    const reinvited = await agent.post("/testmails/api/auth/users").send({ email: "gone@dreambau.com", name: "Gone", projects: ["oriso"] });

    // Silently re-granting access to a disabled identity would turn an
    // invitation into an undocumented reactivation.
    expect(reinvited.status).toBe(409);
    expect(reinvited.body).toEqual({ error: "user_disabled" });
    expect(passkeyStore.getUser(user.id)?.status).toBe("disabled");
  });

  it("does not remove Infisical-derived grants when an invitation is repeated", async () => {
    const { agent, passkeyStore } = await adminSession();
    await agent.post("/testmails/api/auth/users").send({ email: "mixed@dreambau.com", name: "Mixed", projects: ["oriso"] });
    const user = passkeyStore.getUserByEmail("mixed@dreambau.com")!;
    passkeyStore.grants.replaceInfisical(user.id, [{ userId: user.id, project: "orimo", environments: ["pre-dev"], source: "infisical" }]);

    await agent.post("/testmails/api/auth/users").send({ email: "mixed@dreambau.com", name: "Mixed", projects: ["dreambau"] });

    expect(passkeyStore.grants.effective(user.id).map((grant) => grant.project).sort()).toEqual(["dreambau", "orimo"]);
  });

  it("reports the access source for each employee", async () => {
    const { agent, passkeyStore } = await adminSession();
    await agent.post("/testmails/api/auth/users").send({ email: "both@dreambau.com", name: "Both", projects: ["oriso"] });
    const user = passkeyStore.getUserByEmail("both@dreambau.com")!;
    passkeyStore.grants.replaceInfisical(user.id, [{ userId: user.id, project: "orimo", environments: ["pre-dev"], source: "infisical" }]);

    const listed = await agent.get("/testmails/api/auth/users");

    const entry = listed.body.find((row: { email: string }) => row.email === "both@dreambau.com");
    expect(entry.accessSources.sort()).toEqual(["infisical", "local"]);
    expect(JSON.stringify(listed.body)).not.toContain("clientSecret");
  });
});
