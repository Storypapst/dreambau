import { createHash } from "node:crypto";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createEvidenceApp } from "../../src/evidence/server/app.js";
import { createEvidenceStore, type EvidenceStore } from "../../src/evidence/store.js";
import { MemoryObjectStore, objectKey } from "../../src/evidence/storage.js";
import type { MachineAction } from "../../src/server/machine-access.js";

const token = "workspace-read-fixture";
const stores: EvidenceStore[] = [];
afterEach(() => { stores.splice(0).forEach(store => store.close()); });
function fixture(actions: MachineAction[] = ["evidence:read"]) {
  const store = createEvidenceStore(":memory:", { publicBaseUrl: "https://evidence.dreambau.com" }); stores.push(store);
  const objectStore = new MemoryObjectStore();
  const { app } = createEvidenceApp({ store, objectStore, machineIdentities: [{ id: "workspace-fixture", tokenHash: createHash("sha256").update(token).digest("hex"), projects: ["oriso"], environments: ["dev"], actions, expiresAt: "2099-01-01T00:00:00.000Z", revokedAt: null }] });
  const add = (id: string, environment: "dev" | "pre-dev" = "dev") => store.createRun({ project: "oriso", environment, repository: "Storypapst/dreambau", pullRequestNumber: 212, commitSha: "abcdef1", title: id, result: "PASS", source: "codex" }, id, "fixture", "2026-11-07T12:00:00.000Z");
  return { app, store, objectStore, add };
}
describe("read-only evidence workspace API", () => {
  it("does not impose read permission on existing upload-only callers", async () => {
    const f = fixture(["evidence:upload"]);
    await request(f.app).post("/api/v1/runs").auth(token, { type: "bearer" }).send({ project: "oriso", environment: "dev", repository: "Storypapst/dreambau", pullRequestNumber: null, commitSha: "abcdef1", title: "Upload-only fixture", result: "PASS", source: "codex" }).expect(201);
    await request(f.app).get("/api/v1/runs").auth(token, { type: "bearer" }).expect(403);
  });
  it("paginates only scoped runs, including private drafts, without exposing storage details", async () => {
    const f = fixture(); f.add("a"); f.add("b"); f.add("hidden", "pre-dev");
    const first = await request(f.app).get("/api/v1/runs?limit=1").auth(token, { type: "bearer" }).expect(200);
    expect(first.body.items.map((run: { id: string }) => run.id)).toEqual(["b"]);
    expect(first.body.nextCursor).toEqual(expect.any(String));
    const next = await request(f.app).get(`/api/v1/runs?limit=1&cursor=${encodeURIComponent(first.body.nextCursor)}`).auth(token, { type: "bearer" }).expect(200);
    expect(next.body.items.map((run: { id: string }) => run.id)).toEqual(["a"]);
    expect(next.body.nextCursor).toBeNull();
    await request(f.app).get("/api/v1/runs?environment=pre-dev").auth(token, { type: "bearer" }).expect(403);
    await request(f.app).get("/api/v1/runs").expect(401);
    expect(JSON.stringify(first.body)).not.toMatch(/servedKey|uploadId|tokenHash/);
    const pr = await request(f.app).get("/api/v1/runs?q=212").auth(token, { type: "bearer" }).expect(200);
    expect(pr.body.items).toHaveLength(2);
    const ids = await request(f.app).get("/api/v1/runs?ids=a,hidden").auth(token, { type: "bearer" }).expect(200);
    expect(ids.body.items.map((run: { id: string }) => run.id)).toEqual(["a"]);
  });
  it("reads only ready processed bytes, supports ranges, and never reveals quarantined or archived content", async () => {
    const f = fixture(); f.add("run");
    const bytes = Buffer.from("processed-safe-content");
    f.store.createFile("run", "file", { kind: "log", filename: "proof.txt", caption: "Proof", contentType: "text/plain; charset=utf-8", byteSize: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), uploadId: "fixture", partSize: bytes.length, expectedParts: 1 }, "2026-11-07T12:00:00.000Z");
    await f.objectStore.put(objectKey("run", "file", "public"), bytes, "text/plain");
    f.store.setProcessingOutcome("file", { state: "ready", servedKey: objectKey("run", "file", "public"), publicPath: "file/proof.txt", posterPath: null });
    const url = "/api/v1/runs/run/files/file/content";
    const response = await request(f.app).get(url).auth(token, { type: "bearer" }).set("Range", "bytes=0-8").expect(206);
    expect(response.text).toBe("processed");
    expect(response.headers["cache-control"]).toBe("no-store");
    await request(f.app).head(url).auth(token, { type: "bearer" }).expect(200);
    await request(f.app).get("/api/v1/runs/other/files/file/content").auth(token, { type: "bearer" }).expect(404);
    f.store.transitionRun("run", "quarantined", "2026-11-07T12:01:00.000Z");
    await request(f.app).get(url).auth(token, { type: "bearer" }).expect(404);
    f.store.archiveRun("run", "2026-11-07T12:02:00.000Z");
    await request(f.app).get(url).auth(token, { type: "bearer" }).expect(404);
  });
  it("paginates actual ready documents and omits inactive parent runs", async () => {
    const f = fixture(); f.add("documents"); f.add("withdrawn");
    for (const [runId, fileId] of [["documents", "a"], ["documents", "b"], ["withdrawn", "c"]]) {
      f.store.createFile(runId, fileId, { kind: "document", filename: `${fileId}.md`, caption: "Actual report", contentType: "text/markdown", byteSize: 3, sha256: createHash("sha256").update(fileId).digest("hex"), uploadId: "fixture", partSize: 3, expectedParts: 1 }, "2026-11-07T12:00:00.000Z");
      f.store.setProcessingOutcome(fileId, { state: "ready", servedKey: objectKey(runId, fileId, "original"), publicPath: `${fileId}/${fileId}.md`, posterPath: null });
    }
    f.store.archiveRun("withdrawn", "2026-11-07T12:01:00.000Z");
    const first = await request(f.app).get("/api/v1/documents?limit=1&q=report").auth(token, { type: "bearer" }).expect(200);
    expect(first.body.items.map((item: { file: { id: string } }) => item.file.id)).toEqual(["b"]);
    const second = await request(f.app).get(`/api/v1/documents?limit=1&q=report&cursor=${first.body.nextCursor}`).auth(token, { type: "bearer" }).expect(200);
    expect(second.body.items.map((item: { file: { id: string } }) => item.file.id)).toEqual(["a"]); expect(second.body.nextCursor).toBeNull();
  });
});
