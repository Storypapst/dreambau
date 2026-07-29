import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { loadEvidenceConfig } from "../../src/evidence/config.js";
import { createProcessor } from "../../src/evidence/processing.js";
import { createEvidenceApp } from "../../src/evidence/server/app.js";
import { MemoryObjectStore } from "../../src/evidence/storage.js";
import { createEvidenceStore, type EvidenceStore } from "../../src/evidence/store.js";
import type { MachineAction } from "../../src/server/machine-access.js";
import { digest, makePng } from "./fixtures.js";

const token = "evidence-token-for-tests";
const otherToken = "evidence-token-for-orimo";
// Same project as the main identity, but only one of its two environments.
const narrowToken = "evidence-token-for-pre-dev-only";

const stores: EvidenceStore[] = [];
afterEach(() => { while (stores.length > 0) stores.pop()?.close(); });

const allActions: MachineAction[] = ["evidence:upload", "evidence:publish", "evidence:read", "evidence:archive"];

function target(actions: MachineAction[] = allActions) {
  const store = createEvidenceStore(
    path.join(mkdtempSync(path.join(tmpdir(), "evidence-api-")), "evidence.sqlite"),
    { publicBaseUrl: "https://evidence.dreambau.com" }
  );
  stores.push(store);
  const objectStore = new MemoryObjectStore();
  const processor = createProcessor({ store, objectStore, now: () => new Date("2026-07-22T09:00:00.000Z") });
  let publicIds = 0;
  const { app } = createEvidenceApp({
    config: loadEvidenceConfig({ EVIDENCE_PUBLIC_BASE_URL: "https://evidence.dreambau.com" }),
    store,
    objectStore,
    processor,
    now: () => new Date("2026-07-22T09:00:00.000Z"),
    createPublicId: () => { publicIds += 1; return String(publicIds).padStart(32, "a"); },
    machineIdentities: [
      {
        id: "evidence-m4-oriso",
        tokenHash: createHash("sha256").update(token).digest("hex"),
        projects: ["oriso"],
        environments: ["pre-dev", "dev"],
        actions,
        expiresAt: "2027-01-01T00:00:00.000Z",
        revokedAt: null
      },
      {
        id: "evidence-m4-orimo",
        tokenHash: createHash("sha256").update(otherToken).digest("hex"),
        projects: ["orimo"],
        environments: ["pre-dev"],
        actions: allActions,
        expiresAt: "2027-01-01T00:00:00.000Z",
        revokedAt: null
      },
      {
        id: "evidence-m4-oriso-pre-dev",
        tokenHash: createHash("sha256").update(narrowToken).digest("hex"),
        projects: ["oriso"],
        environments: ["pre-dev"],
        actions: allActions,
        expiresAt: "2027-01-01T00:00:00.000Z",
        revokedAt: null
      }
    ]
  });
  return { app, store, objectStore };
}

const runBody = {
  project: "oriso",
  repository: "OpenResilienceInitiative/ORISO-E2E",
  pullRequestNumber: 42,
  commitSha: "abc1234",
  environment: "pre-dev",
  title: "Money path",
  result: "PASS",
  source: "codex"
};

async function createRun(app: ReturnType<typeof target>["app"], overrides: Record<string, unknown> = {}) {
  const response = await request(app).post("/api/v1/runs")
    .set("authorization", `Bearer ${token}`)
    .send({ ...runBody, ...overrides });
  expect(response.status).toBe(201);
  return response.body as { id: string };
}

async function uploadFile(
  app: ReturnType<typeof target>["app"],
  runId: string,
  bytes: Buffer,
  overrides: Record<string, unknown> = {}
) {
  const init = await request(app).post(`/api/v1/runs/${runId}/files/init`)
    .set("authorization", `Bearer ${token}`)
    .send({
      kind: "screenshot",
      filename: "redirect.png",
      caption: "Redirect and landing page validated",
      contentType: "image/png",
      byteSize: bytes.length,
      sha256: digest(bytes),
      head: bytes.subarray(0, 4096).toString("base64"),
      ...overrides
    });
  if (init.status !== 201) return { init, complete: null };
  const fileId = init.body.file.id as string;
  await request(app).put(`/api/v1/runs/${runId}/files/${fileId}/parts/1`)
    .set("authorization", `Bearer ${token}`)
    .set("content-type", "application/octet-stream")
    .send(bytes);
  const complete = await request(app).post(`/api/v1/runs/${runId}/files/${fileId}/complete`)
    .set("authorization", `Bearer ${token}`)
    .send();
  return { init, complete };
}

describe("authentication and scope", () => {
  it("refuses an unauthenticated caller", async () => {
    const { app } = target();
    await request(app).post("/api/v1/runs").send(runBody).expect(401, { error: "unauthenticated" });
  });

  it("refuses an unknown token", async () => {
    const { app } = target();
    await request(app).post("/api/v1/runs")
      .set("authorization", "Bearer not-a-real-token")
      .send(runBody)
      .expect(401);
  });

  it("refuses an identity that lacks the action", async () => {
    const { app } = target(["evidence:read"]);
    await request(app).post("/api/v1/runs")
      .set("authorization", `Bearer ${token}`)
      .send(runBody)
      .expect(403, { error: "action_denied" });
  });

  it("refuses a project or environment outside the identity scope", async () => {
    const { app } = target();
    await request(app).post("/api/v1/runs")
      .set("authorization", `Bearer ${token}`)
      .send({ ...runBody, project: "orimo" })
      .expect(403, { error: "scope_denied" });
    await request(app).post("/api/v1/runs")
      .set("authorization", `Bearer ${token}`)
      .send({ ...runBody, environment: "production-test" })
      .expect(403);
  });

  it("hides another project's run behind a 404", async () => {
    const { app } = target();
    const run = await createRun(app);
    await request(app).get(`/api/v1/runs/${run.id}`)
      .set("authorization", `Bearer ${otherToken}`)
      .expect(404, { error: "run_not_found" });
  });

  it("serves health without a token and without leaking anything", async () => {
    const { app } = target();
    await request(app).get("/health/live").expect(200, { status: "ok" });
    const ready = await request(app).get("/health/ready");
    expect(ready.body).toEqual({ status: "ok" });
  });
});

describe("upload, publish and archive", () => {
  it("walks a screenshot from upload to a public url on the pull request", async () => {
    const { app, store } = target();
    const run = await createRun(app);
    const png = makePng({ text: "Author Frank" });

    const { complete } = await uploadFile(app, run.id, png);
    expect(complete?.status).toBe(200);
    expect(complete?.body.state).toBe("ready");
    expect(complete?.body.file.publicUrl).toBeNull();

    const published = await request(app).post(`/api/v1/runs/${run.id}/publish`)
      .set("authorization", `Bearer ${token}`)
      .send({ repository: runBody.repository, pullRequestNumber: 42, commitSha: "abc1234" })
      .expect(200);
    expect(published.body.state).toBe("published");
    expect(published.body.files[0].publicUrl)
      .toMatch(/^https:\/\/evidence\.dreambau\.com\/e\/a+1\/[0-9a-f-]+\/redirect\.png$/);
    expect(published.body.files[0].viewerUrl).toContain("/r/");

    const linked = await request(app).patch(`/api/v1/runs/${run.id}/github-reference`)
      .set("authorization", `Bearer ${token}`)
      .send({ githubCommentUrl: "https://github.com/OpenResilienceInitiative/ORISO-E2E/pull/42#issuecomment-9" })
      .expect(200);
    expect(linked.body.githubCommentUrl).toContain("issuecomment-9");

    await request(app).post(`/api/v1/runs/${run.id}/archive`)
      .set("authorization", `Bearer ${token}`)
      .expect(200);
    expect(store.listFiles(run.id)[0].publicUrl).toBeNull();
  });

  it("returns the existing file when the same bytes are offered twice", async () => {
    const { app } = target();
    const run = await createRun(app);
    const png = makePng();
    const first = await uploadFile(app, run.id, png);
    const second = await request(app).post(`/api/v1/runs/${run.id}/files/init`)
      .set("authorization", `Bearer ${token}`)
      .send({
        kind: "screenshot", filename: "copy.png", caption: "", contentType: "image/png",
        byteSize: png.length, sha256: digest(png), head: png.subarray(0, 4096).toString("base64")
      })
      .expect(200);
    expect(second.body.deduplicated).toBe(true);
    expect(second.body.file.id).toBe(first.init.body.file.id);
  });

  it("reports received parts so an interrupted upload can resume", async () => {
    const { app } = target();
    const run = await createRun(app);
    const png = makePng();
    const init = await request(app).post(`/api/v1/runs/${run.id}/files/init`)
      .set("authorization", `Bearer ${token}`)
      .send({
        kind: "screenshot", filename: "redirect.png", caption: "", contentType: "image/png",
        byteSize: png.length * 2, sha256: digest(png), head: png.subarray(0, 4096).toString("base64")
      })
      .expect(201);
    await request(app).put(`/api/v1/runs/${run.id}/files/${init.body.file.id}/parts/1`)
      .set("authorization", `Bearer ${token}`)
      .set("content-type", "application/octet-stream")
      .send(png)
      .expect(200);

    const detail = await request(app).get(`/api/v1/runs/${run.id}`)
      .set("authorization", `Bearer ${token}`)
      .expect(200);
    expect(detail.body.files[0].receivedParts).toEqual([1]);

    await request(app).post(`/api/v1/runs/${run.id}/files/${init.body.file.id}/complete`)
      .set("authorization", `Bearer ${token}`)
      .expect(409, { error: "upload_incomplete", receivedBytes: png.length, expectedBytes: png.length * 2 });
  });

  it("reserves the public addresses without making them reachable", async () => {
    const { app, store } = target();
    const run = await createRun(app);
    await uploadFile(app, run.id, makePng());

    const prepared = await request(app).post(`/api/v1/runs/${run.id}/publish`)
      .set("authorization", `Bearer ${token}`)
      .send({ repository: runBody.repository, pullRequestNumber: 42, commitSha: "abc1234", stage: "prepare" })
      .expect(200);

    expect(prepared.body.stage).toBe("prepare");
    expect(prepared.body.state).not.toBe("published");
    expect(prepared.body.publicId).toBeTruthy();
    expect(prepared.body.files[0].publicUrl).toContain("/e/");

    // The run itself still reports no reachable address anywhere else.
    expect(store.getRun(run.id)?.state).toBe("processing");
    expect(store.listFiles(run.id)[0].publicUrl).toBeNull();
    const detail = await request(app).get(`/api/v1/runs/${run.id}`)
      .set("authorization", `Bearer ${token}`)
      .expect(200);
    expect(detail.body.files[0].publicUrl).toBeNull();
  });

  it("commits the publication together with the comment url", async () => {
    const { app, store } = target();
    const run = await createRun(app);
    await uploadFile(app, run.id, makePng());
    await request(app).post(`/api/v1/runs/${run.id}/publish`)
      .set("authorization", `Bearer ${token}`)
      .send({ repository: runBody.repository, pullRequestNumber: 42, commitSha: "abc1234", stage: "prepare" })
      .expect(200);

    const committed = await request(app).post(`/api/v1/runs/${run.id}/publish`)
      .set("authorization", `Bearer ${token}`)
      .send({
        repository: runBody.repository,
        pullRequestNumber: 42,
        commitSha: "abc1234",
        stage: "commit",
        githubCommentUrl: "https://github.com/OpenResilienceInitiative/ORISO-E2E/pull/42#issuecomment-3"
      })
      .expect(200);

    expect(committed.body.state).toBe("published");
    expect(committed.body.githubCommentUrl).toContain("issuecomment-3");
    expect(store.listFiles(run.id)[0].publicUrl).toContain("/e/");
  });

  it("refuses to prepare a quarantined run", async () => {
    const { app } = target();
    const run = await createRun(app);
    await uploadFile(app, run.id, Buffer.from("-----BEGIN PRIVATE KEY-----\n"), {
      kind: "log", filename: "key.log", contentType: "text/plain; charset=utf-8"
    });
    await request(app).post(`/api/v1/runs/${run.id}/publish`)
      .set("authorization", `Bearer ${token}`)
      .send({ repository: runBody.repository, pullRequestNumber: 42, commitSha: "abc1234", stage: "prepare" })
      .expect(409, /run_quarantined/);
  });

  it("refuses to publish a run whose commit moved on", async () => {
    const { app } = target();
    const run = await createRun(app);
    await uploadFile(app, run.id, makePng());
    await request(app).post(`/api/v1/runs/${run.id}/publish`)
      .set("authorization", `Bearer ${token}`)
      .send({ repository: runBody.repository, pullRequestNumber: 42, commitSha: "9999999" })
      .expect(409, { error: "commit_mismatch" });
  });

  it("refuses to publish a run without evidence", async () => {
    const { app } = target();
    const run = await createRun(app);
    await request(app).post(`/api/v1/runs/${run.id}/publish`)
      .set("authorization", `Bearer ${token}`)
      .send({ repository: runBody.repository, pullRequestNumber: 42, commitSha: "abc1234" })
      .expect(409, { error: "no_evidence_files" });
  });
});

describe("preflight and quarantine", () => {
  it("refuses a credential file by name before storing anything", async () => {
    const { app, objectStore } = target();
    const run = await createRun(app);
    const body = Buffer.from('{"cookies":[]}');
    const { init } = await uploadFile(app, run.id, body, {
      kind: "log", filename: "storageState.json", contentType: "application/json; charset=utf-8"
    });
    expect(init.status).toBe(422);
    expect(init.body).toMatchObject({ error: "upload_rejected", reasons: ["filename_forbidden"] });
    expect(objectStore.keys()).toEqual([]);
  });

  it("refuses a payload whose magic bytes contradict the extension", async () => {
    const { app } = target();
    const run = await createRun(app);
    const text = Buffer.from("this is not a png at all");
    const { init } = await uploadFile(app, run.id, text, { filename: "fake.png", contentType: "image/png" });
    expect(init.status).toBe(422);
    expect(init.body.reasons).toContain("format_extension_mismatch");
  });

  it("quarantines a secret-bearing log and then refuses to publish the run", async () => {
    const { app } = target();
    const run = await createRun(app);
    const log = Buffer.from("start\nclient_secret=abcdefgh12345678\n");
    const { complete } = await uploadFile(app, run.id, log, {
      kind: "log", filename: "run.log", contentType: "text/plain; charset=utf-8"
    });
    expect(complete?.status).toBe(422);
    expect(complete?.body.state).toBe("rejected");
    expect(complete?.body.file.publicUrl).toBeNull();

    const publish = await request(app).post(`/api/v1/runs/${run.id}/publish`)
      .set("authorization", `Bearer ${token}`)
      .send({ repository: runBody.repository, pullRequestNumber: 42, commitSha: "abc1234" })
      .expect(409);
    expect(publish.body.error).toBe("run_quarantined");
    expect(publish.body.findings[0].rule).toBe("secret:secret_assignment");
  });

  it("keeps a quarantined run out of every public address", async () => {
    const { app, store } = target();
    const run = await createRun(app);
    await uploadFile(app, run.id, Buffer.from("-----BEGIN PRIVATE KEY-----\n"), {
      kind: "log", filename: "key.log", contentType: "text/plain; charset=utf-8"
    });
    expect(store.getRun(run.id)?.state).toBe("quarantined");
    expect(store.getRun(run.id)?.publicId).toBeNull();
    expect(store.listFiles(run.id).every((file) => file.publicUrl === null)).toBe(true);
  });
});

describe("request validation", () => {
  it("rejects an unknown field on the run body", async () => {
    const { app } = target();
    await request(app).post("/api/v1/runs")
      .set("authorization", `Bearer ${token}`)
      .send({ ...runBody, injected: "value" })
      .expect(400, /invalid_run/);
  });

  it("rejects a part number outside the permitted range", async () => {
    const { app } = target();
    const run = await createRun(app);
    const png = makePng();
    const init = await request(app).post(`/api/v1/runs/${run.id}/files/init`)
      .set("authorization", `Bearer ${token}`)
      .send({
        kind: "screenshot", filename: "redirect.png", caption: "", contentType: "image/png",
        byteSize: png.length, sha256: digest(png), head: png.subarray(0, 4096).toString("base64")
      })
      .expect(201);
    await request(app).put(`/api/v1/runs/${run.id}/files/${init.body.file.id}/parts/0`)
      .set("authorization", `Bearer ${token}`)
      .set("content-type", "application/octet-stream")
      .send(png)
      .expect(400, { error: "invalid_part_number" });
  });

  it("rejects a github reference that does not point at github.com", async () => {
    const { app } = target();
    const run = await createRun(app);
    await request(app).patch(`/api/v1/runs/${run.id}/github-reference`)
      .set("authorization", `Bearer ${token}`)
      .send({ githubCommentUrl: "https://evil.example/comment" })
      .expect(400);
  });
});

describe("scope and lifecycle findings raised by review", () => {
  it("hides a run whose environment is outside the identity scope", async () => {
    const { app } = target();
    // Created by an identity scoped to pre-dev and dev.
    const run = await createRun(app, { environment: "dev" });

    // A pre-dev-only identity of the *same project* must not see it, and must
    // not be able to act on it either.
    await request(app).get(`/api/v1/runs/${run.id}`)
      .set("authorization", `Bearer ${narrowToken}`)
      .expect(404, { error: "run_not_found" });
    await request(app).post(`/api/v1/runs/${run.id}/publish`)
      .set("authorization", `Bearer ${narrowToken}`)
      .send({ repository: runBody.repository, pullRequestNumber: 42, commitSha: "abc1234", stage: "prepare" })
      .expect(404);
    await request(app).post(`/api/v1/runs/${run.id}/archive`)
      .set("authorization", `Bearer ${narrowToken}`)
      .expect(404);

    // The identity that does cover dev still sees it.
    await request(app).get(`/api/v1/runs/${run.id}`)
      .set("authorization", `Bearer ${token}`)
      .expect(200);
  });

  it("refuses to add a file to a run that is no longer open", async () => {
    const { app } = target();
    const run = await createRun(app);
    await uploadFile(app, run.id, makePng());
    await request(app).post(`/api/v1/runs/${run.id}/publish`)
      .set("authorization", `Bearer ${token}`)
      .send({ repository: runBody.repository, pullRequestNumber: 42, commitSha: "abc1234", stage: "commit" })
      .expect(200);

    const second = await request(app).post(`/api/v1/runs/${run.id}/files/init`)
      .set("authorization", `Bearer ${token}`)
      .send({
        kind: "screenshot", filename: "later.png", caption: "", contentType: "image/png",
        byteSize: 10, sha256: digest(Buffer.from("later")), head: makePng().subarray(0, 4096).toString("base64")
      });
    expect(second.status).toBe(409);
    expect(second.body).toEqual({ error: "run_not_open" });
  });

  it("drops the upload id once the multipart upload is complete", async () => {
    const { app, store } = target();
    const run = await createRun(app);
    const png = makePng();
    const { init } = await uploadFile(app, run.id, png);
    const fileId = init.body.file.id as string;
    expect(store.uploadIdFor(fileId)).toBeNull();

    await request(app).put(`/api/v1/runs/${run.id}/files/${fileId}/parts/2`)
      .set("authorization", `Bearer ${token}`)
      .set("content-type", "application/octet-stream")
      .send(png)
      .expect(409, { error: "upload_already_completed" });
  });

  it("abandons the multipart upload when the received size cannot add up", async () => {
    const { app, store } = target();
    const run = await createRun(app);
    const png = makePng();
    const init = await request(app).post(`/api/v1/runs/${run.id}/files/init`)
      .set("authorization", `Bearer ${token}`)
      .send({
        kind: "screenshot", filename: "redirect.png", caption: "", contentType: "image/png",
        byteSize: png.length * 2, sha256: digest(png), head: png.subarray(0, 4096).toString("base64")
      })
      .expect(201);
    const fileId = init.body.file.id as string;
    await request(app).put(`/api/v1/runs/${run.id}/files/${fileId}/parts/1`)
      .set("authorization", `Bearer ${token}`)
      .set("content-type", "application/octet-stream")
      .send(png)
      .expect(200);

    await request(app).post(`/api/v1/runs/${run.id}/files/${fileId}/complete`)
      .set("authorization", `Bearer ${token}`)
      .expect(409, /upload_incomplete/);
    // Nothing is left open in storage for an upload that can never complete.
    expect(store.uploadIdFor(fileId)).toBeNull();
  });
});
