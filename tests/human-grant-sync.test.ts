import path from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server/app.js";
import type { AccountRecord } from "../src/server/accounts.js";
import { createDatabase } from "../src/server/db.js";
import type { RegistryProvider } from "../src/server/infisical-provider.js";
import type { HumanAccessProvider } from "../src/server/infisical-human-access.js";
import { createPasskeyStore } from "../src/server/passkey-store.js";
import { ALL_TEST_ENVIRONMENTS } from "../src/server/human-grants.js";
import type { WebAuthnAdapter } from "../src/server/passkey-auth.js";

function mailbox(email: string, domain = "oriso.org"): AccountRecord {
  return {
    displayName: "Springfield Person",
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

async function setup(humanAccessProvider: HumanAccessProvider) {
  const account = mailbox("marge.simpson@oriso.org");
  const registryProvider: RegistryProvider = { async list() { return []; }, async get() { return null; } };
  const root = mkdtempSync(path.join(tmpdir(), "grant-sync-"));
  const database = createDatabase(path.join(root, "catalog.sqlite"));
  database.upsertMetadata(account.email, { project: "ORISO", roles: [], shippedVersion: "2.02", lifecycleStatus: "active" });
  const passkeyStore = createPasskeyStore(path.join(root, "auth.sqlite"));
  const user = passkeyStore.createUser({ email: "employee@dreambau.com", name: "Employee", projects: ["oriso"], role: "member" });
  passkeyStore.addCredential({ id: "credential-id", userId: user.id, publicKey: new Uint8Array([1]), counter: 0, transports: ["internal"], deviceType: "multiDevice", backedUp: true });

  // The administrator's local grant. Nothing Infisical reports may remove it.
  passkeyStore.grants.replaceLocal(user.id, [{ userId: user.id, project: "oriso", environments: [...ALL_TEST_ENVIRONMENTS], source: "local" }]);

  const app = createApp({
    passwordHash: "unused",
    secureCookies: false,
    loadAccounts: () => [account],
    database,
    passkeyStore,
    registryProvider,
    humanAccessProvider,
    webauthn,
    now: () => new Date(59_000),
    rpId: "dreambau.com",
    expectedOrigin: "https://dreambau.com",
    bootstrapUser: { email: user.email, name: user.name, projects: ["oriso"], role: "member" }
  });
  const agent = request.agent(app);
  const authOptions = await agent.post("/testmails/api/auth/passkeys/authentication/options").send({ email: user.email });
  const verification = await agent.post("/testmails/api/auth/passkeys/authentication/verify").send({ flowId: authOptions.body.flowId, response: { id: "credential-id" } });
  expect(verification.status).toBe(200);
  return { agent, passkeyStore, user, account };
}

describe("Infisical scope synchronization", () => {
  it("keeps the local grant when Infisical reports no membership", async () => {
    const { agent, passkeyStore, user, account } = await setup({ async projectsFor() { return []; } });

    const response = await agent.get("/testmails/api/accounts");

    // Before the source-aware grant store this wiped user.projects to [] and
    // produced the "0 of 0 accounts" state for an authenticated employee.
    expect(response.status).toBe(200);
    expect(response.body.map((view: { email: string }) => view.email)).toEqual([account.email]);
    expect(passkeyStore.grants.effective(user.id).map((grant) => grant.project)).toEqual(["oriso"]);
  });

  it("adds Infisical projects alongside the local grant instead of replacing it", async () => {
    const { agent, passkeyStore, user } = await setup({ async projectsFor() { return ["dreambau"]; } });

    await agent.get("/testmails/api/accounts");

    const effective = passkeyStore.grants.effective(user.id);
    expect(effective.map((grant) => grant.project).sort()).toEqual(["dreambau", "oriso"]);
    expect(passkeyStore.grants.list(user.id).filter((grant) => grant.source === "local")).toHaveLength(1);
    expect(passkeyStore.grants.list(user.id).filter((grant) => grant.source === "infisical")).toHaveLength(1);
  });

  it("removes only the Infisical grant when a membership disappears", async () => {
    let projects: Array<"oriso" | "orimo" | "dreambau"> = ["dreambau"];
    const { agent, passkeyStore, user } = await setup({ async projectsFor() { return projects; } });
    await agent.get("/testmails/api/accounts");
    expect(passkeyStore.grants.effective(user.id)).toHaveLength(2);

    projects = [];
    await agent.get("/testmails/api/accounts");

    expect(passkeyStore.grants.effective(user.id).map((grant) => grant.project)).toEqual(["oriso"]);
  });

  it("does not grant Infisical secret permissions to the employee", async () => {
    const { agent } = await setup({ async projectsFor() { return ["dreambau"]; } });

    const response = await agent.get("/testmails/api/accounts");

    // Mailbox passwords are the product: this is a test-credential registry and
    // a scoped employee is meant to receive them. What must never leak is the
    // Infisical machine identity used to read memberships.
    const body = JSON.stringify(response.body);
    expect(body).not.toContain("clientSecret");
    expect(body).not.toContain("clientId");
    expect(body).not.toContain("accessToken");
  });
});
