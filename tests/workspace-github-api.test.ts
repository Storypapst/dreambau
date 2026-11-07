import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server/app.js";
import { createDatabase } from "../src/server/db.js";
import { createPasskeyStore } from "../src/server/passkey-store.js";
import { createWorkspaceGithub } from "../src/server/workspace-github.js";
import { createGithubTransport } from "../src/server/github-app-reader.js";

const cleanup: Array<() => void> = [];
afterEach(() => cleanup.splice(0).forEach(close => close()));
async function fixture(configured = true) {
  const dir = mkdtempSync(path.join(tmpdir(), "workspace-github-")); const database = createDatabase(":memory:"); const store = createPasskeyStore(path.join(dir, "auth.sqlite"));
  cleanup.push(() => { database.close(); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const user = store.createUser({ email: "viewer@example.test", name: "Viewer", projects: ["oriso", "dreambau"], role: "admin" });
  store.addCredential({ id: "credential", userId: user.id, publicKey: new Uint8Array([1]), counter: 0, transports: [], deviceType: "multiDevice", backedUp: true });
  let now = new Date("2026-11-07T12:00:00.000Z");
  const transport = vi.fn(async (url: string | URL) => {
    const pathname = new URL(url).pathname;
    if (pathname === "/graphql") return Response.json({ data: { repository: { issue: { closedByPullRequestsReferences: { nodes: [{ url: "https://github.com/Storypapst/dreambau/pull/42", repository: { nameWithOwner: "Storypapst/dreambau" } }], pageInfo: { hasNextPage: false } } } } } });
    if (pathname.includes("/pulls/")) return Response.json({ title: "Private Dreambau PR title", state: "open", draft: false, merged_at: null });
    return Response.json({ title: "ORISO issue title", state: "open", milestone: null });
  });
  const client = createGithubTransport({ token: async () => "private-token", transport, now: () => now.getTime() });
  const github = configured ? createWorkspaceGithub({ store: database.workspaceGithub, now: () => now.getTime(), config: { appId: "1", privateKeyFile: "/unused-test-key", installations: [{ installationId: "2", repositories: [{ fullName: "OpenResilienceInitiative/ORISO-Frontend", project: "oriso", boards: [] }] }, { installationId: "3", repositories: [{ fullName: "Storypapst/dreambau", project: "dreambau", boards: [] }] }] }, clients: new Map([["2", client], ["3", createGithubTransport({ token: async () => "private-token", transport, now: () => now.getTime() })]]) }) : null;
  database.testRuns.create({ project: "oriso", targetEnvironment: "dev", poolEnvironment: "dev", scenario: "actual-run", applicationVersion: "1.0", commitSha: "abcdef1", roles: [{ role: "user", count: 1 }] }, [{ accountId: "one", email: "one@example.test", roles: ["user"] }], { type: "machine", id: "runner" }, now.toISOString(), "run");
  const app = createApp({ database, passkeyStore: store, now: () => now, workspaceGithub: github, workspaceEvidence: null, loadAccounts: () => [], registryProvider: { list: async () => [], get: async () => null }, passwordHash: "unused", secureCookies: false, webauthn: { generateRegistrationOptions: async () => ({}), verifyRegistrationResponse: async () => ({ verified: false }), generateAuthenticationOptions: async () => ({ challenge: "test" }), verifyAuthenticationResponse: async () => ({ verified: true, authenticationInfo: { newCounter: 1 } }) } });
  const agent = request.agent(app); const auth = await agent.post("/testmails/api/auth/passkeys/authentication/options").send({ email: user.email });
  await agent.post("/testmails/api/auth/passkeys/authentication/verify").send({ flowId: auth.body.flowId, response: { id: "credential" } }).expect(200);
  function attach(url: string) { database.workspaceReferences.attach("test-run", "run", { kind: url.includes("/pull/") ? "pull-request" : "issue", url }, user.id, now.toISOString(), { project: "oriso", environment: "dev" }); }
  return { database, store, user, app, agent, github, transport, attach, advance: (milliseconds: number) => { now = new Date(now.getTime() + milliseconds); } };
}
const endpoint = "/testmails/api/workspace/runs/test-run/run/github";
describe("selected-run GitHub HTTP boundary", () => {
  it("does not resurrect a denied closing PR from an older concurrent outage fallback after cooldown expires", async () => {
    const f = await fixture(); const issueUrl = "https://github.com/OpenResilienceInitiative/ORISO-Frontend/issues/1";
    const issue = [{ id: "issue", kind: "issue" as const, label: "", url: issueUrl }];
    await f.github!.read(issue, () => true); f.advance(61_000);
    let started!: () => void; const parentStarted = new Promise<void>(resolve => { started = resolve; });
    let failParent!: () => void; let parentCalls = 0;
    f.transport.mockImplementation(async url => {
      if (new URL(url).pathname.includes("/ORISO-Frontend/issues/")) {
        parentCalls++;
        if (parentCalls === 1) return new Promise<Response>((_, reject) => { failParent = () => reject(new Error("offline")); started(); });
        throw new Error("offline");
      }
      return new Response(null, { status: 403 });
    });
    const parent = f.github!.read(issue, () => true, true); await parentStarted;
    await f.github!.read([{ id: "child", kind: "pull-request", label: "", url: "https://github.com/Storypapst/dreambau/pull/42" }], () => true, true);
    expect(f.database.workspaceGithub.get(issueUrl)?.facts?.closingPullRequests).toEqual([]);
    failParent(); await parent;
    expect(f.database.workspaceGithub.get(issueUrl)?.facts?.closingPullRequests).toEqual([]);
    f.advance(61_000);
    const retried = await f.github!.read(issue, () => true, true);
    expect(JSON.stringify(retried)).not.toContain("Private Dreambau PR title");
    const child = [{ id: "child", kind: "pull-request" as const, label: "", url: "https://github.com/Storypapst/dreambau/pull/42" }];
    f.transport.mockRejectedValue(new Error("still offline"));
    expect((await f.github!.read(child, () => true, true)).status).toBe("denied");
    f.advance(61_000);
    f.transport.mockImplementation(async () => Response.json({ title: "Successfully revalidated", state: "open", draft: false }));
    expect((await f.github!.read(child, () => true, true)).items[0]).toMatchObject({ status: "ready", facts: { title: "Successfully revalidated" } });
  });
  it("shares pending work and the refresh cooldown across case variants of the same GitHub repository", async () => {
    const f = await fixture(); f.attach("https://github.com/Storypapst/dreambau/pull/42");
    await f.agent.get(endpoint).expect(200);
    f.attach("https://github.com/storypapst/DREAMBAU/pull/42");
    const response = await f.agent.post(`${endpoint}/refresh`).expect(200);
    expect(response.body.items).toHaveLength(2);
    expect(f.transport).toHaveBeenCalledTimes(1);
    expect(response.body.items.every((item: { cached: boolean }) => item.cached)).toBe(true);
  });
  it("reauthorizes earlier private results when a grant is revoked while another reference is loading", async () => {
    const f = await fixture(); f.attach("https://github.com/Storypapst/dreambau/pull/42"); f.advance(1);
    f.attach("https://github.com/OpenResilienceInitiative/ORISO-Frontend/pull/43");
    const original = f.transport.getMockImplementation()!;
    f.transport.mockImplementation(async url => {
      if (new URL(url).pathname === "/repos/OpenResilienceInitiative/ORISO-Frontend/pulls/43") {
        f.store.grants.replaceLocal(f.user.id, [{ userId: f.user.id, project: "oriso", environments: ["dev"], source: "local" }]);
        return Response.json({ title: "ORISO reference", state: "open", draft: false });
      }
      return original(url);
    });
    const response = await f.agent.get(endpoint).expect(200);
    expect(response.body.items.find((item: { url: string }) => item.url.includes("storypapst"))).toMatchObject({ status: "denied", facts: null });
    expect(JSON.stringify(response.body)).not.toContain("Private Dreambau PR title");
  });
  it.each([401, 403, 404])("withholds cached private facts when GitHub explicitly denies access (%s)", async status => {
    const f = await fixture(); f.attach("https://github.com/Storypapst/dreambau/pull/42");
    await f.agent.get(endpoint).expect(200); f.advance(61_000);
    f.transport.mockImplementation(async () => new Response(null, { status }));
    const response = await f.agent.post(`${endpoint}/refresh`).expect(200);
    expect(response.body).toMatchObject({ status: "denied", items: [{ facts: null, observedAt: null, stale: false }] });
    expect(JSON.stringify(response.body)).not.toContain("Private Dreambau PR title");
    expect(f.database.workspaceGithub.get("https://github.com/Storypapst/dreambau/pull/42")?.facts).toBeNull();
  });
  it("retains stale facts for rate limits while honoring their longer retry interval", async () => {
    const f = await fixture(); f.attach("https://github.com/Storypapst/dreambau/pull/42");
    await f.agent.get(endpoint).expect(200); f.advance(61_000);
    f.transport.mockImplementation(async () => new Response(null, { status: 403, headers: { "x-ratelimit-remaining": "0", "retry-after": "180" } }));
    const response = await f.agent.post(`${endpoint}/refresh`).expect(200);
    expect(response.body.items[0]).toMatchObject({ status: "unavailable", stale: true, facts: { title: "Private Dreambau PR title" }, errorCode: "rate_limited" });
    expect(response.body.retryAfter).toBe("2026-11-07T12:04:01.000Z");
  });
  it("removes denied nested PR facts from another cached Issue and keeps them removed after service restart", async () => {
    const f = await fixture(); const issue = "https://github.com/OpenResilienceInitiative/ORISO-Frontend/issues/1";
    f.attach(issue); f.attach("https://github.com/Storypapst/dreambau/pull/42");
    await f.agent.get(endpoint).expect(200); f.advance(61_000);
    f.transport.mockImplementation(async () => new Response(null, { status: 403 }));
    // Refresh just the PR publicly through the service seam; the Issue is not refetched.
    const gh = createWorkspaceGithub({ store: f.database.workspaceGithub, config: { appId: "1", privateKeyFile: "/unused", installations: [{ installationId: "3", repositories: [{ fullName: "Storypapst/dreambau", project: "dreambau", boards: [] }] }] }, clients: new Map([["3", createGithubTransport({ token: async () => "test", transport: f.transport })]]) });
    await gh.read([{ id: "pr", kind: "pull-request", label: "", url: "https://github.com/Storypapst/dreambau/pull/42" }], () => true, true);
    expect(f.database.workspaceGithub.get(issue)?.facts?.closingPullRequests).toEqual([]);
    expect(f.database.workspaceGithub.get(issue)?.facts?.closingPullRequestsComplete).toBe(false);
  });
  it("bounds selected reference counts and total upstream work", async () => {
    const f = await fixture();
    for (let number = 1; number <= 12; number++) f.attach(`https://github.com/OpenResilienceInitiative/ORISO-Frontend/issues/${number}`);
    const response = await f.agent.get(endpoint).expect(200);
    expect(response.body.items).toHaveLength(10); expect(response.body.limitReached).toBe(true);
    expect(f.transport.mock.calls.length).toBeLessThanOrEqual(20);
  });
  it("leaves unmapped pasted repositories as denied external links without a network request", async () => {
    const f = await fixture(); f.attach("https://github.com/private/unmapped/issues/212");
    expect((await f.agent.get(endpoint).expect(200)).body).toMatchObject({ status: "denied", items: [{ facts: null, observedAt: null }] });
    expect(f.transport).not.toHaveBeenCalled();
  });
  it("keeps an unconfigured integration honest without blocking the run", async () => {
    const f = await fixture(false); f.attach("https://github.com/Storypapst/dreambau/issues/212");
    await request(f.app).get(endpoint).expect(401);
    expect((await f.agent.get(endpoint).expect(200)).body).toMatchObject({ status: "unconfigured", items: [{ facts: null }] });
    await f.agent.get("/testmails/api/workspace/runs/test-run/run").expect(200);
    expect(f.transport).not.toHaveBeenCalled();
  });
  it("reauthorizes the reference repository before cached projection, including cross-repository closing PRs", async () => {
    const f = await fixture(); f.attach("https://github.com/OpenResilienceInitiative/ORISO-Frontend/issues/1"); f.attach("https://github.com/Storypapst/dreambau/pull/42");
    const initial = await f.agent.get(endpoint).expect(200); expect(JSON.stringify(initial.body)).toContain("Private Dreambau PR title");
    const count = f.transport.mock.calls.length;
    f.store.grants.replaceLocal(f.user.id, [{ userId: f.user.id, project: "oriso", environments: ["dev"], source: "local" }]);
    const narrowed = await f.agent.get(endpoint).expect(200);
    expect(narrowed.body.status).toBe("partial");
    expect(narrowed.body.items.find((item: { facts: unknown }) => item.facts)?.facts.closingPullRequests).toEqual([]);
    expect(JSON.stringify(narrowed.body)).not.toContain("Private Dreambau PR title");
    expect(f.transport).toHaveBeenCalledTimes(count);
    f.store.grants.replaceLocal(f.user.id, []);
    await f.agent.get(endpoint).expect(404);
  });
  it("deduplicates refreshes, enforces the shared cooldown and returns stale facts on upstream failure", async () => {
    const f = await fixture(); f.attach("https://github.com/Storypapst/dreambau/pull/42");
    await Promise.all([f.agent.get(endpoint).expect(200), f.agent.post(`${endpoint}/refresh`).expect(200)]);
    expect(f.transport).toHaveBeenCalledTimes(1);
    const cached = await f.agent.post(`${endpoint}/refresh`).expect(200); expect(cached.body.items[0].cached).toBe(true); expect(cached.body.retryAfter).not.toBeNull();
    f.advance(16 * 60_000); f.transport.mockRejectedValue(new Error("secret network diagnostic"));
    const failed = await f.agent.get(endpoint).expect(200);
    expect(failed.body.items[0]).toMatchObject({ status: "unavailable", stale: true, facts: { title: "Private Dreambau PR title" }, observedAt: "2026-11-07T12:00:00.000Z" });
    expect(JSON.stringify(failed.body)).not.toMatch(/secret network diagnostic|private-token/);
    await f.agent.post(`${endpoint}/refresh`).set("Origin", "https://attacker.test").expect(403);
  });
  it("persists and validates each user's basic defaults and clamps filters after grant loss", async () => {
    const f = await fixture(); const url = "/testmails/api/auth/me/preferences/workspace-defaults";
    await f.agent.put(url).send({ value: { rememberFilters: true, refreshMinutes: 15, filtersByProject: { oriso: { source: "test-run", environment: "dev" }, dreambau: { source: "all", environment: "local" } } } }).expect(200);
    f.store.grants.replaceLocal(f.user.id, [{ userId: f.user.id, project: "oriso", environments: ["pre-dev"], source: "local" }]);
    expect((await f.agent.get(url).expect(200)).body.value).toEqual({ rememberFilters: true, refreshMinutes: 15, filtersByProject: { oriso: { source: "test-run", environment: "all" } } });
    await f.agent.put(url).send({ value: { rememberFilters: true, refreshMinutes: 1, filtersByProject: {} } }).expect(400);
  });
});
