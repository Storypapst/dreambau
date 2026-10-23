import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server/app.js";
import { createDatabase } from "../src/server/db.js";
import { createPasskeyStore } from "../src/server/passkey-store.js";
import { createWorkStateStore } from "../src/server/work-state/store.js";
import type { WebAuthnAdapter } from "../src/server/passkey-auth.js";
const cleanups: Array<() => void> = [];
function setup(enabled = true) {
  const dir = mkdtempSync(path.join(tmpdir(), "work-state-api-"));
  const passkeyStore = createPasskeyStore(path.join(dir, "auth.sqlite"));
  const database = createDatabase(":memory:");
  const workStateStore = enabled ? createWorkStateStore(path.join(dir, "work.sqlite")) : undefined;
  const alice = passkeyStore.createUser({ email: "alice@example.com", name: "Alice", projects: ["oriso"], role: "member" });
  const bob = passkeyStore.createUser({ email: "bob@example.com", name: "Bob", projects: ["oriso"], role: "admin" });
  for (const user of [alice, bob]) passkeyStore.addCredential({ id: `${user.id}-credential`, userId: user.id, publicKey: new Uint8Array([1]), counter: 0, transports: ["internal"], deviceType: "multiDevice", backedUp: true });
  const webauthn: WebAuthnAdapter = {
    generateRegistrationOptions: vi.fn(), verifyRegistrationResponse: vi.fn(),
    generateAuthenticationOptions: vi.fn(async () => ({ challenge: "work-state-challenge" })),
    verifyAuthenticationResponse: vi.fn(async () => ({ verified: true, authenticationInfo: { newCounter: 1 } }))
  };
  const app = createApp({ passwordHash: "unused", sessionSecret: "work-state-session-secret-32-bytes", secureCookies: false, loadAccounts: () => [], database, passkeyStore, webauthn, workStateStore });
  cleanups.push(() => { workStateStore?.close(); passkeyStore.close(); database.close(); rmSync(dir, { recursive: true, force: true }); });
  async function login(user = alice) {
    const agent = request.agent(app);
    const options = await agent.post("/testmails/api/auth/passkeys/authentication/options").send({ email: user.email });
    const verified = await agent.post("/testmails/api/auth/passkeys/authentication/verify").send({ flowId: options.body.flowId, response: { id: `${user.id}-credential` } });
    expect(verified.status).toBe(200);
    return agent;
  }
  function configure() {
    for (const id of ["A", "B"]) workStateStore!.configureRepository({ id, project: "oriso", fullName: `OpenResilienceInitiative/repo${id}`, integrationBranch: "dev" });
    for (const repositoryId of ["A", "B"]) workStateStore!.setRepositoryGrant({ actorId: alice.id, project: "oriso", repositoryId, allowed: true });
  }
  return { app, passkeyStore, workStateStore, alice, bob, login, configure };
}
const prefix = "/testmails/api/work-state";
const linkA = { repositoryId: "A", kind: "pull", number: 1 };
const linkB = { repositoryId: "B", kind: "issue", number: 2 };
const checkpoint = { expectedVersion: 1, goal: "Fix", lastVerifiedAction: "Checked", blockers: [], nextAction: "Review", evidenceLinks: [], optionalSessionUrl: "https://chatgpt.com/c/private-session" };
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); });
describe("human work-state API", () => {
  it("requires a real authenticated strong session even when not configured", async () => {
    const { app, login } = setup(false);
    expect((await request(app).get(`${prefix}/repositories`)).status).toBe(401);
    const agent = await login();
    const response = await agent.get(`${prefix}/repositories`);
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: "work_state_unavailable" });
    expect(response.headers["cache-control"]).toBe("no-store");
  });
  it("rejects the retired password login and disabled human users", async () => {
    const { app, configure, login, passkeyStore, alice } = setup(); configure();
    const weak = request.agent(app);
    expect((await weak.post("/testmails/api/auth/login").send({ password: "test-only-password" })).status).toBe(410);
    expect((await weak.get(`${prefix}/repositories`)).status).toBe(401);
    const agent = await login();
    expect((await agent.get(`${prefix}/repositories`)).status).toBe(200);
    passkeyStore.setUserStatus(alice.id, "disabled");
    expect((await agent.get(`${prefix}/repositories`)).status).toBe(403);
  });
  it("derives actor and project authority from current session, never admin role or request body", async () => {
    const { configure, login, bob } = setup(); configure();
    const agent = await login(bob);
    expect((await agent.get(`${prefix}/repositories`)).body.items).toEqual([]);
    expect((await agent.post(`${prefix}/items`).send({ goal: "Denied", links: [linkA] })).status).toBe(403);
    expect((await agent.get(`${prefix}/pulls?repositoryId=B`)).status).toBe(403);
    expect((await agent.post(`${prefix}/items`).send({ goal: "Spoof", actorId: "alice", repositoryIds: ["A"], links: [linkA] })).status).toBe(400);
    expect((await agent.post(`${prefix}/items`).send({ goal: "Internal", links: [] })).status).toBe(403);
  });
  it("rechecks composite-item visibility and session URLs after repo and project revocation", async () => {
    const { configure, login, alice, workStateStore, passkeyStore } = setup(); configure();
    const agent = await login();
    const created = await agent.post(`${prefix}/items`).send({ goal: "Composite", links: [linkA, linkB] });
    expect(created.status).toBe(201);
    expect((await agent.put(`${prefix}/items/${created.body.id}/checkpoint`).send(checkpoint)).status).toBe(200);
    workStateStore!.setRepositoryGrant({ actorId: alice.id, project: "oriso", repositoryId: "B", allowed: false });
    const listed = await agent.get(`${prefix}/items`);
    expect(listed.body.items).toEqual([]); expect(JSON.stringify(listed.body)).not.toContain("private-session");
    expect((await agent.get(`${prefix}/items/${created.body.id}`)).status).toBe(403);
    expect((await agent.put(`${prefix}/items/${created.body.id}/checkpoint`).send({ ...checkpoint, expectedVersion: 2 })).status).toBe(403);
    expect((await agent.put(`${prefix}/items/${created.body.id}/links`).send({ expectedVersion: 2, links: [linkA] })).status).toBe(403);
    passkeyStore.grants.replaceLocal(alice.id, [{ userId: alice.id, project: "dreambau", environments: ["dev"], source: "local" }]);
    expect((await agent.get(`${prefix}/repositories`)).status).toBe(403);
  });
  it("never publishes retained B-private session context by unlinking B", async () => {
    const { configure, login, alice, bob, workStateStore } = setup(); configure();
    workStateStore!.setRepositoryGrant({ actorId: bob.id, project: "oriso", repositoryId: "A", allowed: true });
    const owner = await login(), reader = await login(bob);
    const created = await owner.post(`${prefix}/items`).send({ goal: "B private", links: [linkA, linkB] });
    await owner.put(`${prefix}/items/${created.body.id}/checkpoint`).send(checkpoint);
    expect((await reader.get(`${prefix}/items`)).body.items).toEqual([]);
    expect((await owner.put(`${prefix}/items/${created.body.id}/links`).send({ expectedVersion: 2, links: [linkA] })).status).toBe(200);
    const listed = await reader.get(`${prefix}/items`);
    expect(listed.body.items).toEqual([]);
    expect(JSON.stringify(listed.body)).not.toContain("private-session");
    expect((await reader.get(`${prefix}/items/${created.body.id}`)).status).toBe(403);
    workStateStore!.setRepositoryGrant({ actorId: alice.id, project: "oriso", repositoryId: "B", allowed: false });
    expect((await owner.get(`${prefix}/items/${created.body.id}`)).status).toBe(403);
  });
  it("returns 409 for missing and stale versions and denies ungranted link additions", async () => {
    const { configure, login, alice, workStateStore } = setup(); configure();
    const agent = await login();
    const created = await agent.post(`${prefix}/items`).send({ goal: "One", links: [linkA] });
    const id = created.body.id; expect(created.status).toBe(201);
    const { expectedVersion: _ignored, ...missing } = checkpoint;
    expect((await agent.put(`${prefix}/items/${id}/checkpoint`).send(missing)).status).toBe(409);
    expect((await agent.put(`${prefix}/items/${id}/checkpoint`).send(checkpoint)).body.version).toBe(2);
    expect((await agent.put(`${prefix}/items/${id}/checkpoint`).send({ ...checkpoint, nextAction: "Overwrite" })).status).toBe(409);
    workStateStore!.setRepositoryGrant({ actorId: alice.id, project: "oriso", repositoryId: "B", allowed: false });
    expect((await agent.put(`${prefix}/items/${id}/links`).send({ expectedVersion: 2, links: [linkA, linkB] })).status).toBe(403);
    expect((await agent.get(`${prefix}/items/${id}`)).body).toMatchObject({ version: 2, checkpoint: { nextAction: "Review" }, links: [expect.objectContaining(linkA)] });
    expect((await agent.put(`${prefix}/items/${id}/links`).send({ links: [linkA] })).status).toBe(409);
  });
});
