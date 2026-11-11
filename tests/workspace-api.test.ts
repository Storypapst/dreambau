import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server/app.js";
import { createDatabase } from "../src/server/db.js";
import { createPasskeyStore } from "../src/server/passkey-store.js";
import { WorkspaceEvidenceUnavailable } from "../src/server/workspace-evidence-client.js";
import type { AccountRecord } from "../src/server/accounts.js";

const cleanup: Array<() => void> = [];
afterEach(() => cleanup.splice(0).forEach(close => close()));
const gatewayRun = (id = "proof") => ({ id, publicId: null, project: "oriso", environment: "dev", repository: "Storypapst/dreambau", pullRequestNumber: 212, pullRequestUrl: "https://github.com/Storypapst/dreambau/pull/212", commitSha: "abcdef1", title: "Actual screenshot verification", result: "PASS", source: "codex", createdAt: "2026-11-07T12:00:00.000Z", publishedAt: null, githubCommentUrl: null, state: "draft", files: [{ id: "image", runId: id, kind: "screenshot", filename: "proof.png", caption: "Actual fixture", contentType: "image/png", byteSize: 3, sha256: "a".repeat(64), publicUrl: null, viewerUrl: null, processingState: "ready" }], events: [] });
async function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "workspace-api-"));
  const database = createDatabase(":memory:"); const passkeyStore = createPasskeyStore(path.join(root, "auth.sqlite"));
  cleanup.push(() => { database.close(); passkeyStore.close(); });
  const user = passkeyStore.createUser({ email: "viewer@example.test", name: "Viewer", projects: ["oriso"], role: "admin" });
  passkeyStore.grants.replaceLocal(user.id, [{ userId: user.id, project: "oriso", environments: ["dev", "production-test"], source: "local" }]);
  passkeyStore.addCredential({ id: "credential", userId: user.id, publicKey: new Uint8Array([1]), counter: 0, transports: [], deviceType: "multiDevice", backedUp: true });
  const proof = gatewayRun();
  const bridge = { list: vi.fn(async () => ({ items: [proof], nextCursor: null })), documents: vi.fn(async () => ({ items: [], nextCursor: null })), get: vi.fn(async (id: string) => id === proof.id ? proof : null), content: vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png", "content-length": "3" } })) };
  const mailbox: AccountRecord = { displayName: "Simone", email: "simone@oriso.org", password: "private-mail-secret", domain: "oriso.org",
    imap: "mail.dreambau.com:993", smtp: "mail.dreambau.com:465", jmap: "https://box.dreambau.com/.well-known/jmap",
    caldav: "https://box.dreambau.com/dav", carddav: "https://box.dreambau.com/dav", encryption: { state: "disabled" } };
  database.upsertMetadata(mailbox.email, { project: "ORISO", roles: ["Ratsuchender"], agencies: ["Kinder- und Jugendberatung"], carrier: "Springfield", postalCode: "10551" });
  const app = createApp({ database, passkeyStore, loadAccounts: () => [mailbox], registryProvider: { list: async () => [], get: async () => null }, secureCookies: false, passwordHash: "unused", workspaceEvidence: bridge, webauthn: { generateRegistrationOptions: async () => ({}), verifyRegistrationResponse: async () => ({ verified: false }), generateAuthenticationOptions: async () => ({ challenge: "test" }), verifyAuthenticationResponse: async () => ({ verified: true, authenticationInfo: { newCounter: 1 } }) } });
  const agent = request.agent(app);
  const options = await agent.post("/testmails/api/auth/passkeys/authentication/options").send({ email: user.email });
  await agent.post("/testmails/api/auth/passkeys/authentication/verify").send({ flowId: options.body.flowId, response: { id: "credential" } }).expect(200);
  return { app, agent, database, passkeyStore, user, bridge, proof };
}
function createRun(database: ReturnType<typeof createDatabase>, id: string, poolEnvironment: "dev" | "pre-dev" | "production-test" = "production-test") {
  return database.testRuns.create({ project: "oriso", targetEnvironment: "dev", poolEnvironment, applicationVersion: "2.1", commitSha: "abcdef1", scenario: "actual-check", roles: [{ role: "user", count: 1 }] }, [{ accountId: id, email: `${id}@example.test`, roles: ["user"] }], { type: "machine", id: "real-runner" }, "2026-11-07T11:00:00.000Z", id);
}
describe("human workspace", () => {
  it("links an exact mailbox to an evidence run without returning its password", async () => {
    const f = await fixture();
    const route = "/testmails/api/workspace/runs/evidence-run/proof/accounts";
    const linked = await f.agent.post(route).send({ email: "Simone@ORISO.org" }).expect(201);
    expect(linked.body.accounts).toContainEqual(expect.objectContaining({ email: "simone@oriso.org", displayName: "Simone", resolved: true }));
    expect(JSON.stringify(linked.body)).not.toContain("private-mail-secret");
    const history = await f.agent.get("/testmails/api/workspace/accounts/simone%40oriso.org/runs").expect(200);
    expect(history.body.runs).toContainEqual(expect.objectContaining({ id: "proof", source: "evidence-run" }));
    await f.agent.delete(route + "/simone%40oriso.org").expect(200);
    const after = await f.agent.get("/testmails/api/workspace/runs/evidence-run/proof").expect(200);
    expect(after.body.accounts).toEqual([]);
  });
  it("stops remote account-run lookups after an Evidence outage and keeps local runs", async () => {
    const f = await fixture();
    f.database.testRuns.create({ project: "oriso", targetEnvironment: "dev", poolEnvironment: "dev",
      applicationVersion: "2.1", commitSha: "abcdef1", scenario: "local-check", roles: [{ role: "user", count: 1 }] },
      [{ accountId: "mailbox:simone@oriso.org", email: "simone@oriso.org", roles: ["user"] }],
      { type: "machine", id: "runner" }, "2026-11-07T11:00:00.000Z", "local-run");
    for (const id of ["proof-a", "proof-b"]) f.database.workspaceAccountLinks.attach(id, "oriso", "dev", "simone@oriso.org", f.user.id, "2026-11-07T12:00:00.000Z");
    f.bridge.get.mockRejectedValue(new WorkspaceEvidenceUnavailable());
    const response = await f.agent.get("/testmails/api/workspace/accounts/simone%40oriso.org/runs").expect(200);
    expect(response.body.runs).toContainEqual(expect.objectContaining({ id: "local-run", source: "test-run" }));
    expect(f.bridge.get).toHaveBeenCalledTimes(1);
  });
  it("keeps reserved run identities exact and rejects evidence associations outside viewer scope", async () => {
    const f = await fixture();
    createRun(f.database, "run", "production-test");
    const reserved = await f.agent.get("/testmails/api/workspace/runs/test-run/run").expect(200);
    expect(reserved.body.accounts).toContainEqual(expect.objectContaining({ accountId: "run", email: "run@example.test", resolved: false, source: "reserved" }));
    f.proof.environment = "pre-dev";
    await f.agent.post("/testmails/api/workspace/runs/evidence-run/proof/accounts").send({ email: "simone@oriso.org" }).expect(404);
    expect(f.database.workspaceAccountLinks.forRun("proof")).toEqual([]);
  });
  it("does not resolve a reserved product identity from email alone and retains the run outcome", async () => {
    const f = await fixture();
    const input = { project: "oriso" as const, targetEnvironment: "dev" as const, poolEnvironment: "dev" as const,
      applicationVersion: "2.1", commitSha: "abcdef1", scenario: "identity-check", roles: [{ role: "user", count: 1 }] };
    f.database.testRuns.create(input, [{ accountId: "old-product-record", email: "simone@oriso.org", roles: ["user"] }],
      { type: "machine", id: "runner" }, "2026-11-07T11:00:00.000Z", "identity-run");
    const detail = await f.agent.get("/testmails/api/workspace/runs/test-run/identity-run").expect(200);
    expect(detail.body.accounts).toContainEqual(expect.objectContaining({ accountId: "old-product-record", resolved: false }));
    f.database.testRuns.transition("identity-run", "reserved", "running", { type: "machine", id: "runner" }, "2026-11-07T11:01:00.000Z");
    f.database.testRuns.transition("identity-run", "running", "passed", { type: "machine", id: "runner" }, "2026-11-07T11:02:00.000Z");
    const history = await f.agent.get("/testmails/api/workspace/accounts/simone%40oriso.org/runs").expect(200);
    expect(history.body.runs).toContainEqual(expect.objectContaining({ id: "identity-run", result: "passed" }));
  });
  it("keeps released failed outcomes and explicit legacy report links separate from evidence records", async () => {
    const f = await fixture(); createRun(f.database, "run");
    f.database.testRuns.transition("run", "reserved", "running", { type: "machine", id: "real-runner" }, "2026-11-07T11:01:00.000Z");
    f.database.testRuns.transition("run", "running", "failed", { type: "machine", id: "real-runner" }, "2026-11-07T11:02:00.000Z", { checks: 3, failures: 1, reportUrl: "https://evidence.dreambau.com/r/exact-old-link", accidentalSecret: "must-not-be-returned", internalPath: "/private/runner/storageState.json" });
    f.database.testRuns.release("run", { type: "machine", id: "real-runner" }, "2026-11-07T11:03:00.000Z");
    const list = await f.agent.get("/testmails/api/workspace/runs?project=oriso").expect(200);
    expect(list.body.items).toEqual(expect.arrayContaining([expect.objectContaining({ source: "test-run", lifecycle: "released", result: "failed" }), expect.objectContaining({ source: "evidence-run", id: "proof" })]));
    const detail = await f.agent.get("/testmails/api/workspace/runs/test-run/run").expect(200);
    expect(detail.body.references).toEqual([expect.objectContaining({ kind: "legacy-report", url: "https://evidence.dreambau.com/r/exact-old-link" })]);
    expect(detail.body.files).toEqual([]); // Matching commit is never a relation.
    expect(JSON.stringify(detail.body)).not.toMatch(/must-not-be-returned|internalPath|storageState/);
  });
  it("requires human auth and fresh target AND pool grants on every detail and media request", async () => {
    const f = await fixture(); createRun(f.database, "hidden", "pre-dev");
    await request(f.app).get("/testmails/api/workspace/runs").expect(401);
    await f.agent.get("/testmails/api/workspace/runs/test-run/hidden").expect(404);
    const detail = await f.agent.get("/testmails/api/workspace/runs/evidence-run/proof").expect(200);
    const content = detail.body.files[0].previewUrl;
    expect(content).toContain(`viewer=${f.user.id}`);
    await f.agent.get(content).expect(200);
    await f.agent.get(content.replace(f.user.id, "other-viewer")).expect(403);
    f.passkeyStore.grants.replaceLocal(f.user.id, [{ userId: f.user.id, project: "oriso", environments: ["pre-dev"], source: "local" }]);
    await f.agent.get(content).expect(404);
    await f.agent.get("/testmails/api/workspace/runs/evidence-run/proof").expect(404);
  });
  it("retains local runs during gateway failure and paginates/filter results without fabricated rows", async () => {
    const f = await fixture(); createRun(f.database, "a"); createRun(f.database, "b");
    f.bridge.list.mockRejectedValue(new Error("offline"));
    const first = await f.agent.get("/testmails/api/workspace/runs?source=test-run&limit=1").expect(200);
    expect(first.body.items.map((item: { id: string }) => item.id)).toEqual(["b"]);
    const second = await f.agent.get(`/testmails/api/workspace/runs?source=test-run&limit=1&cursor=${encodeURIComponent(first.body.nextCursor)}`).expect(200);
    expect(second.body.items.map((item: { id: string }) => item.id)).toEqual(["a"]);
    const combined = await f.agent.get("/testmails/api/workspace/runs").expect(200);
    expect(combined.body.evidenceStatus).toBe("unavailable"); expect(combined.body.items).toHaveLength(2);
    await f.agent.get("/testmails/api/workspace/runs?project=orimo").expect(403);
  });
  it("stores explicit validated references with audit, and rejects cross-scope or invented document links", async () => {
    const f = await fixture(); createRun(f.database, "run");
    const url = "/testmails/api/workspace/runs/test-run/run/references";
    const attached = await f.agent.post(url).send({ kind: "issue", url: "https://github.com/Storypapst/dreambau/issues/212" }).expect(201);
    expect(attached.body.references).toContainEqual(expect.objectContaining({ kind: "issue", label: "Storypapst/dreambau#212", url: "https://github.com/Storypapst/dreambau/issues/212" }));
    await f.agent.post(url).send({ kind: "evidence-run", runId: "proof" }).expect(201);
    const detail = await f.agent.get("/testmails/api/workspace/runs/test-run/run").expect(200);
    expect(detail.body.files).toHaveLength(1); expect(detail.body.events.some((event: { type: string }) => event.type === "reference_attached")).toBe(true);
    await f.agent.post(url).send({ kind: "issue", url: "https://github.com.evil.test/Storypapst/dreambau/issues/212" }).expect(400);
    await f.agent.post(url).send({ kind: "document", evidenceRunId: "proof", fileId: "image" }).expect(404);
    f.proof.environment = "pre-dev";
    await f.agent.post(url).send({ kind: "evidence-run", runId: "proof" }).expect(404);
  });
  it("lists actual ready document artifacts and validates document associations", async () => {
    const f = await fixture(); createRun(f.database, "run");
    const file = { ...f.proof.files[0], id: "document", kind: "document", filename: "report.md", contentType: "text/markdown" };
    f.proof.files.push(file);
    f.bridge.documents.mockResolvedValue({ items: [{ run: f.proof, file }], nextCursor: null });
    const documents = await f.agent.get("/testmails/api/workspace/documents?project=oriso").expect(200);
    expect(documents.body.items).toHaveLength(1);
    expect(documents.body.items[0]).toMatchObject({ id: "document", runId: "proof", runTitle: f.proof.title, project: "oriso", environment: "dev" });
    expect(documents.body.items[0].downloadUrl).toContain(`viewer=${f.user.id}`);
    const detail = await f.agent.post("/testmails/api/workspace/runs/test-run/run/references").send({ kind: "document", evidenceRunId: "proof", fileId: "document" }).expect(201);
    expect(detail.body.references).toContainEqual(expect.objectContaining({ kind: "document", label: "report.md", fileId: "document" }));
    expect(detail.body.files).toEqual([expect.objectContaining({ id: "document", runId: "proof", filename: "report.md" })]);
    const reopened = await f.agent.get("/testmails/api/workspace/runs/test-run/run").expect(200);
    expect(reopened.body.files).toHaveLength(1);
    expect(reopened.body.files[0].downloadUrl).toContain(`viewer=${f.user.id}`);
    f.proof.environment = "pre-dev";
    const narrowed = await f.agent.get("/testmails/api/workspace/runs/test-run/run").expect(200);
    expect(narrowed.body.files).toEqual([]);
  });
  it("keeps quarantine and active HTML out of media previews, even with a valid session", async () => {
    const f = await fixture(); f.proof.files[0].contentType = "text/html";
    const detail = await f.agent.get("/testmails/api/workspace/runs/evidence-run/proof").expect(200);
    expect(detail.body.files[0]).toMatchObject({ previewUrl: null, downloadUrl: null });
    await f.agent.get(`/testmails/api/workspace/evidence/proof/files/image/content?viewer=${f.user.id}`).expect(404);
    f.proof.files[0].contentType = "image/png"; f.proof.state = "quarantined";
    const quarantine = await f.agent.get("/testmails/api/workspace/runs/evidence-run/proof").expect(200);
    expect(quarantine.body.files[0].previewUrl).toBeNull();
    expect(f.bridge.content).not.toHaveBeenCalled();
  });
  it.each(["https://example.test/report?access_token=private-token", "https://example.test/report?X-Amz-Signature=private-token", "https://example.test/report#private-token", "https://user:private-token@example.test/report"])("withholds unsafe legacy report URLs: %s", async reportUrl => {
    const f = await fixture(); createRun(f.database, "run");
    f.database.testRuns.transition("run", "reserved", "running", { type: "machine", id: "runner" }, "2026-11-07T11:01:00.000Z");
    f.database.testRuns.transition("run", "running", "passed", { type: "machine", id: "runner" }, "2026-11-07T11:02:00.000Z", { reportUrl });
    const response = await f.agent.get("/testmails/api/workspace/runs/test-run/run").expect(200);
    expect(response.body.references).toContainEqual(expect.objectContaining({ kind: "legacy-report", url: null }));
    expect(JSON.stringify(response.body)).not.toContain("private-token");
  });
  it("searches explicit GitHub references before pagination for both real sources", async () => {
    const f = await fixture(); createRun(f.database, "run");
    await f.agent.post("/testmails/api/workspace/runs/test-run/run/references").send({ kind: "issue", url: "https://github.com/Storypapst/dreambau/issues/9733" }).expect(201);
    await f.agent.post("/testmails/api/workspace/runs/evidence-run/proof/references").send({ kind: "issue", url: "https://github.com/Storypapst/dreambau/issues/9733" }).expect(201);
    f.bridge.list.mockImplementation(async query => ({ items: query.ids?.includes("proof") ? [f.proof] : [], nextCursor: null }));
    const response = await f.agent.get("/testmails/api/workspace/runs?q=9733&limit=1").expect(200);
    expect(response.body.items).toHaveLength(1); expect(response.body.items[0].source).toBe("evidence-run");
    const second = await f.agent.get(`/testmails/api/workspace/runs?q=9733&limit=1&cursor=${response.body.nextCursor}`).expect(200);
    expect(second.body.items).toEqual([expect.objectContaining({ id: "run", source: "test-run" })]);
    expect(f.bridge.list.mock.calls.some(([query]) => query.ids?.includes("proof"))).toBe(true);
  });
  it("asks for a narrower reference search instead of truncating more than 1000 matching owners", async () => {
    const f = await fixture();
    for (let index = 0; index < 1001; index++) f.database.workspaceReferences.attach("evidence-run", `proof-${index}`, { kind: "issue", url: "https://github.com/Storypapst/dreambau/issues/9733" }, f.user.id, "2026-11-07T12:00:00.000Z", { project: "oriso", environment: "dev" });
    await f.agent.get("/testmails/api/workspace/runs?q=9733").expect(422, { error: "reference_search_too_broad" });
    expect(f.bridge.list).not.toHaveBeenCalled();
  });
  it("batches reference owner reads by 50 with at most four requests active", async () => {
    const f = await fixture();
    for (let index = 0; index < 201; index++) f.database.workspaceReferences.attach("evidence-run", `proof-${index}`, { kind: "issue", url: "https://github.com/Storypapst/dreambau/issues/9733" }, f.user.id, "2026-11-07T12:00:00.000Z", { project: "oriso", environment: "dev" });
    let active = 0; let maximum = 0;
    f.bridge.list.mockImplementation(async () => {
      active++; maximum = Math.max(maximum, active);
      await new Promise(resolve => setTimeout(resolve, 5)); active--;
      return { items: [], nextCursor: null };
    });
    await f.agent.get("/testmails/api/workspace/runs?q=9733").expect(200);
    expect(f.bridge.list).toHaveBeenCalledTimes(6); expect(maximum).toBeLessThanOrEqual(4);
    const batches = f.bridge.list.mock.calls.map(([query]) => query.ids).filter(Boolean);
    expect(batches.map(ids => ids!.length).sort((a, b) => a - b)).toEqual([1, 50, 50, 50, 50]);
  });
  it("does not let out-of-scope reference owners trip the broad-search limit", async () => {
    const f = await fixture();
    for (let index = 0; index < 1001; index++) f.database.workspaceReferences.attach("evidence-run", `hidden-${index}`, { kind: "issue", url: "https://github.com/Storypapst/dreambau/issues/9733" }, f.user.id, "2026-11-07T12:00:00.000Z", { project: "oriso", environment: "pre-dev" });
    f.bridge.list.mockResolvedValue({ items: [], nextCursor: null });
    await f.agent.get("/testmails/api/workspace/runs?q=9733").expect(200);
    expect(f.bridge.list).toHaveBeenCalledTimes(1);
    expect(f.bridge.list.mock.calls[0][0].ids).toBeUndefined();
  });
  it("stops remote reference resolution after the first upstream outage while retaining local links", async () => {
    const f = await fixture(); createRun(f.database, "run");
    for (let index = 0; index < 5; index++) f.database.workspaceReferences.attach("test-run", "run", { kind: "evidence-run", runId: `proof-${index}` }, f.user.id, "2026-11-07T12:00:00.000Z", { project: "oriso", environment: "dev" });
    f.database.workspaceReferences.attach("test-run", "run", { kind: "issue", url: "https://github.com/Storypapst/dreambau/issues/9733" }, f.user.id, "2026-11-07T12:00:00.000Z", { project: "oriso", environment: "dev" });
    f.bridge.get.mockRejectedValue(new WorkspaceEvidenceUnavailable());
    const response = await f.agent.get("/testmails/api/workspace/runs/test-run/run").expect(200);
    expect(response.body.evidenceStatus).toBe("unavailable"); expect(f.bridge.get).toHaveBeenCalledTimes(1);
    expect(response.body.references).toContainEqual(expect.objectContaining({ kind: "issue" }));
  });
});
