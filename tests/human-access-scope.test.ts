import path from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server/app.js";
import type { AccountRecord } from "../src/server/accounts.js";
import { createDatabase } from "../src/server/db.js";
import type { RegistryProvider } from "../src/server/infisical-provider.js";
import { createPasskeyStore } from "../src/server/passkey-store.js";
import type { WebAuthnAdapter } from "../src/server/passkey-auth.js";

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

const webauthn: WebAuthnAdapter = {
  generateRegistrationOptions: vi.fn(async () => ({ challenge: "registration" })),
  verifyRegistrationResponse: vi.fn(async () => ({ verified: false })),
  generateAuthenticationOptions: vi.fn(async () => ({ challenge: "authentication-challenge", allowCredentials: [{ id: "credential-id" }] })),
  verifyAuthenticationResponse: vi.fn(async () => ({ verified: true, authenticationInfo: { newCounter: 1 } }))
};

/**
 * Authenticates a human employee whose stored grant list is empty.
 *
 * This models a state that production is actually in: on 2026-07-25, four of the
 * seven rows in the live `human_users` table were active members with
 * `projects = "[]"`. `createUser` still enforces at least one project, so the
 * row is created with a grant and then emptied directly, which is what the
 * Infisical scope synchronization does in the running image when Infisical
 * reports no matching membership for the address.
 */
async function authenticatedWithoutGrant() {
  const abe = mailbox();
  const registryProvider: RegistryProvider = {
    async list() { return []; },
    async get() { return null; }
  };
  const root = mkdtempSync(path.join(tmpdir(), "human-access-scope-"));
  const database = createDatabase(path.join(root, "catalog.sqlite"));
  database.upsertMetadata(abe.email, { project: "ORISO", roles: ["Admin"], shippedVersion: "2.02", lifecycleStatus: "active" });
  const authPath = path.join(root, "auth.sqlite");
  const passkeyStore = createPasskeyStore(authPath);
  const user = passkeyStore.createUser({ email: "invited@dreambau.com", name: "Invited Employee", projects: ["oriso"], role: "member" });
  passkeyStore.addCredential({ id: "credential-id", userId: user.id, publicKey: new Uint8Array([1]), counter: 0, transports: ["internal"], deviceType: "multiDevice", backedUp: true });

  const raw = new Database(authPath);
  raw.prepare("UPDATE human_users SET projects=? WHERE id=?").run("[]", user.id);
  raw.close();

  const app = createApp({
    passwordHash: "unused",
    secureCookies: false,
    loadAccounts: () => [abe],
    database,
    passkeyStore,
    registryProvider,
    webauthn,
    now: () => new Date(59_000),
    rpId: "dreambau.com",
    expectedOrigin: "https://dreambau.com",
    bootstrapUser: { email: user.email, name: user.name, projects: ["oriso"], role: "member" }
  });
  const agent = request.agent(app);
  const authOptions = await agent.post("/testmails/api/auth/passkeys/authentication/options").send({ email: user.email });
  const verification = await agent.post("/testmails/api/auth/passkeys/authentication/verify").send({ flowId: authOptions.body.flowId, response: { id: "credential-id" } });

  expect(authOptions.status).toBe(200);
  expect(authOptions.body.flowId).toEqual(expect.any(String));
  expect(verification.status).toBe(200);

  return { agent };
}

/**
 * These are known-defect contracts recorded by Package A (issue #25).
 *
 * `it.fails` asserts that the endpoint is still WRONG, so CI stays green while
 * the defect is documented and pinned. Package C (issue #27) implements the
 * scope-error contract; when it does, these will start passing, `it.fails` will
 * report them as failures, and the person doing that work must flip them to
 * plain `it`. That flip is the acceptance signal, not an inconvenience.
 */
describe("human account scope errors", () => {
  // Guard for the two it.fails contracts below. `it.fails` passes when the body
  // throws for ANY reason, so a broken sign-in would return 401, the
  // expectations would still throw, and both contracts would stay green while
  // testing nothing. This plain `it` fails loudly in that case, so it must run
  // as its own test rather than as an assertion inside the contracts.
  it("authenticates the grantless employee before the scope contracts run", async () => {
    const { agent } = await authenticatedWithoutGrant();

    const response = await agent.get("/testmails/api/accounts");

    // Only unauthenticated is excluded. 403 becomes the correct answer once
    // Package C lands, so asserting against it would turn this guard into a
    // second copy of the contract.
    expect(response.status).not.toBe(401);
  });

  it.fails("answers a grantless employee with a scope error instead of an empty catalog", async () => {
    const { agent } = await authenticatedWithoutGrant();

    const response = await agent.get("/testmails/api/accounts");

    // Regression contract for the "0 of 0 accounts / Expected 180 unique accounts"
    // incident: a missing grant is an authorization state, not a healthy but empty
    // catalog. Returning 200 [] makes a missing grant indistinguishable from a
    // provider failure and from a legitimately empty scope.
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: "human_scope_missing" });
  });

  it.fails("never reports a grantless employee as a successful empty result", async () => {
    const { agent } = await authenticatedWithoutGrant();

    const response = await agent.get("/testmails/api/accounts");

    expect(response.status).not.toBe(200);
    expect(Array.isArray(response.body)).toBe(false);
  });
});
