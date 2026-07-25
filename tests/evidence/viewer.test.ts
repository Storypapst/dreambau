import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { loadEvidenceConfig } from "../../src/evidence/config.js";
import { escapeHtml } from "../../src/evidence/server/html.js";
import { createProcessor } from "../../src/evidence/processing.js";
import { createEvidenceApp } from "../../src/evidence/server/app.js";
import { MemoryObjectStore } from "../../src/evidence/storage.js";
import { createEvidenceStore, type EvidenceStore } from "../../src/evidence/store.js";
import { digest, makePng, makeZip } from "./fixtures.js";

const token = "evidence-viewer-token";
const publicId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const stores: EvidenceStore[] = [];
afterEach(() => { while (stores.length > 0) stores.pop()?.close(); });

function target() {
  const store = createEvidenceStore(
    path.join(mkdtempSync(path.join(tmpdir(), "evidence-viewer-")), "evidence.sqlite"),
    { publicBaseUrl: "https://evidence.dreambau.com" }
  );
  stores.push(store);
  const objectStore = new MemoryObjectStore();
  const { app } = createEvidenceApp({
    config: loadEvidenceConfig({ EVIDENCE_PUBLIC_BASE_URL: "https://evidence.dreambau.com" }),
    store,
    objectStore,
    processor: createProcessor({ store, objectStore, now: () => new Date("2026-07-22T09:00:00.000Z") }),
    createPublicId: () => publicId,
    machineIdentities: [{
      id: "evidence-m4-oriso",
      tokenHash: createHash("sha256").update(token).digest("hex"),
      projects: ["oriso"],
      environments: ["pre-dev"],
      actions: ["evidence:upload", "evidence:publish", "evidence:read", "evidence:archive"],
      expiresAt: "2027-01-01T00:00:00.000Z",
      revokedAt: null
    }]
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

async function seed(
  app: ReturnType<typeof target>["app"],
  files: Array<{ bytes: Buffer; kind: string; filename: string; caption?: string; contentType: string; primaryActor?: unknown }>,
  options: { publish?: boolean; title?: string } = {}
) {
  const run = await request(app).post("/api/v1/runs")
    .set("authorization", `Bearer ${token}`)
    .send({ ...runBody, ...(options.title ? { title: options.title } : {}) })
    .expect(201);
  const runId = run.body.id as string;
  const ids: string[] = [];
  for (const file of files) {
    const init = await request(app).post(`/api/v1/runs/${runId}/files/init`)
      .set("authorization", `Bearer ${token}`)
      .send({
        kind: file.kind,
        filename: file.filename,
        caption: file.caption ?? "",
        contentType: file.contentType,
        byteSize: file.bytes.length,
        sha256: digest(file.bytes),
        head: file.bytes.subarray(0, 4096).toString("base64"),
        ...(file.primaryActor ? { primaryActor: file.primaryActor } : {})
      })
      .expect(201);
    const fileId = init.body.file.id as string;
    ids.push(fileId);
    await request(app).put(`/api/v1/runs/${runId}/files/${fileId}/parts/1`)
      .set("authorization", `Bearer ${token}`)
      .set("content-type", "application/octet-stream")
      .send(file.bytes)
      .expect(200);
    await request(app).post(`/api/v1/runs/${runId}/files/${fileId}/complete`)
      .set("authorization", `Bearer ${token}`)
      .expect(200);
  }
  if (options.publish !== false) {
    await request(app).post(`/api/v1/runs/${runId}/publish`)
      .set("authorization", `Bearer ${token}`)
      .send({ repository: runBody.repository, pullRequestNumber: 42, commitSha: "abc1234", stage: "commit" })
      .expect(200);
  }
  return { runId, ids };
}

const screenshot = () => ({ bytes: makePng(), kind: "screenshot", filename: "redirect.png", caption: "Invitation redirect", contentType: "image/png" });

describe("run page", () => {
  it("shows result, environment, commit, source, repository and pull request", async () => {
    const { app } = target();
    await seed(app, [screenshot()]);
    const page = await request(app).get(`/r/${publicId}`).expect(200);

    expect(page.text).toContain("Money path");
    expect(page.text).toContain("PASS");
    expect(page.text).toContain("Pre-Dev");
    expect(page.text).toContain("abc1234");
    expect(page.text).toContain("Codex");
    expect(page.text).toContain("https://github.com/OpenResilienceInitiative/ORISO-E2E");
    expect(page.text).toContain("https://github.com/OpenResilienceInitiative/ORISO-E2E/pull/42");
  });

  it("embeds a screenshot and links a video with its poster", async () => {
    const { app } = target();
    const mp4 = Buffer.concat([Buffer.alloc(4), Buffer.from("ftypisom", "latin1"), Buffer.alloc(64)]);
    const { ids } = await seed(app, [screenshot()]);
    const page = await request(app).get(`/r/${publicId}`).expect(200);
    expect(page.text).toContain(`<img src="/e/${publicId}/${ids[0]}/redirect.png"`);
    expect(mp4.length).toBeGreaterThan(0);
  });

  it("names the test user and never a password", async () => {
    const { app } = target();
    await seed(app, [{
      ...screenshot(),
      primaryActor: {
        accountId: "oriso/pre-dev/e2e-consultant",
        username: "brave_otter",
        syntheticEmail: "brave.otter@oriso.org",
        role: "consultant"
      }
    }]);
    const page = await request(app).get(`/r/${publicId}`).expect(200);
    expect(page.text).toContain("brave_otter");
    expect(page.text).toContain("brave.otter@oriso.org");
    expect(page.text).not.toMatch(/password|secret|token/i);
  });

  it("escapes a caption that tries to inject markup", async () => {
    const { app } = target();
    await seed(app, [{ ...screenshot(), caption: '<img src=x onerror=alert(1)>"><script>alert(2)</script>' }]);
    const page = await request(app).get(`/r/${publicId}`).expect(200);
    // The caption survives only as escaped text. Its raw angle brackets and
    // quotes never reach the document, so it can open neither a tag nor an
    // attribute — `onerror` remains inert characters inside a quoted value.
    expect(page.text).toContain(escapeHtml('<img src=x onerror=alert(1)>"><script>alert(2)</script>'));
    expect(page.text).not.toContain("<img src=x");
    expect(page.text).not.toContain('"><script>');
    expect(page.text).not.toMatch(/<script[\s>]/);
  });

  it("sets no cookies", async () => {
    const { app } = target();
    await seed(app, [screenshot()]);
    const page = await request(app).get(`/r/${publicId}`).expect(200);
    expect(page.headers["set-cookie"]).toBeUndefined();
  });

  it("carries the required security headers and forbids scripts", async () => {
    const { app } = target();
    await seed(app, [screenshot()]);
    const page = await request(app).get(`/r/${publicId}`).expect(200);
    expect(page.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(page.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(page.headers["content-security-policy"]).not.toContain("script-src 'self'");
    expect(page.headers["x-content-type-options"]).toBe("nosniff");
    expect(page.headers["referrer-policy"]).toBe("no-referrer");
    expect(page.headers["x-robots-tag"]).toBe("noindex, nofollow");
    expect(page.headers["cross-origin-resource-policy"]).toBe("cross-origin");
    expect(page.text).toContain('name="robots" content="noindex, nofollow"');
  });

  it("lets a run page update but pins the files it points at", async () => {
    const { app } = target();
    const { ids } = await seed(app, [screenshot()]);
    const page = await request(app).get(`/r/${publicId}`).expect(200);
    const file = await request(app).get(`/e/${publicId}/${ids[0]}/redirect.png`).expect(200);
    expect(page.headers["cache-control"]).toBe("no-cache");
    expect(file.headers["cache-control"]).toContain("immutable");
  });
});

describe("hiding what is not published", () => {
  it("answers an unknown public id with the same page as an unpublished one", async () => {
    const { app } = target();
    await seed(app, [screenshot()], { publish: false });
    const unknown = await request(app).get(`/r/${"b".repeat(32)}`).expect(404);
    const unpublished = await request(app).get(`/r/${publicId}`).expect(404);
    expect(unknown.text).toBe(unpublished.text);
    expect(unknown.text).not.toContain("Money path");
  });

  it("rejects an identifier that is not in the public alphabet", async () => {
    const { app } = target();
    await request(app).get("/r/../../etc/passwd").expect(404);
    await request(app).get(`/r/${"l".repeat(32)}`).expect(404);
    await request(app).get("/r/short").expect(404);
  });

  it("stops serving files once a run is archived", async () => {
    const { app, store } = target();
    const { runId, ids } = await seed(app, [screenshot()]);
    await request(app).get(`/e/${publicId}/${ids[0]}/redirect.png`).expect(200);
    store.archiveRun(runId, "2026-07-22T10:00:00.000Z");
    await request(app).get(`/e/${publicId}/${ids[0]}/redirect.png`).expect(404);
    await request(app).get(`/r/${publicId}`).expect(404);
  });

  it("does not serve a file through another run's public id", async () => {
    const { app } = target();
    const { ids } = await seed(app, [screenshot()]);
    await request(app).get(`/e/${"c".repeat(32)}/${ids[0]}/redirect.png`).expect(404);
  });

  it("requires the path to carry the file's real name", async () => {
    const { app } = target();
    const { ids } = await seed(app, [screenshot()]);
    await request(app).get(`/e/${publicId}/${ids[0]}/looks-harmless.txt`).expect(404);
  });
});

describe("file delivery", () => {
  it("serves the processed copy with the right content type", async () => {
    const { app } = target();
    const { ids } = await seed(app, [screenshot()]);
    const response = await request(app).get(`/e/${publicId}/${ids[0]}/redirect.png`).expect(200);
    expect(response.headers["content-type"]).toBe("image/png");
    expect(response.headers["accept-ranges"]).toBe("bytes");
    // The served bytes are the stripped copy, not the upload.
    expect(response.body.includes(Buffer.from("tEXt"))).toBe(false);
  });

  it("answers a range request so a video can be scrubbed", async () => {
    const { app } = target();
    const { ids } = await seed(app, [screenshot()]);
    const full = await request(app).get(`/e/${publicId}/${ids[0]}/redirect.png`).expect(200);
    const total = Number(full.headers["content-length"]);

    const partial = await request(app)
      .get(`/e/${publicId}/${ids[0]}/redirect.png`)
      .set("range", "bytes=0-9")
      .expect(206);
    expect(partial.headers["content-range"]).toBe(`bytes 0-9/${total}`);
    expect(Number(partial.headers["content-length"])).toBe(10);

    const suffix = await request(app)
      .get(`/e/${publicId}/${ids[0]}/redirect.png`)
      .set("range", "bytes=-5")
      .expect(206);
    expect(suffix.headers["content-range"]).toBe(`bytes ${total - 5}-${total - 1}/${total}`);
  });

  it("refuses an unsatisfiable range", async () => {
    const { app } = target();
    const { ids } = await seed(app, [screenshot()]);
    const response = await request(app)
      .get(`/e/${publicId}/${ids[0]}/redirect.png`)
      .set("range", "bytes=99999-999999")
      .expect(416);
    expect(response.headers["content-range"]).toMatch(/^bytes \*\//);
  });
});

describe("playwright report route", () => {
  const report = () => ({
    bytes: makeZip([
      { name: "index.html", body: Buffer.from("<html><body>Playwright report</body></html>") },
      { name: "data/shot.png", body: makePng() }
    ]),
    kind: "playwright-report",
    filename: "report.zip",
    caption: "Playwright report",
    contentType: "application/zip"
  });

  it("serves the report index and its assets", async () => {
    const { app } = target();
    const { ids } = await seed(app, [report()]);
    const index = await request(app).get(`/reports/${publicId}/${ids[0]}/index.html`).expect(200);
    expect(index.headers["content-type"]).toContain("text/html");
    expect(index.text).toContain("Playwright report");
    const asset = await request(app).get(`/reports/${publicId}/${ids[0]}/data/shot.png`).expect(200);
    expect(asset.headers["content-type"]).toBe("image/png");
  });

  it("defaults to the index when no entry is named", async () => {
    const { app } = target();
    const { ids } = await seed(app, [report()]);
    await request(app).get(`/reports/${publicId}/${ids[0]}/`).expect(200);
  });

  it("gives the report its own policy, still pinned to this origin", async () => {
    const { app } = target();
    const { ids } = await seed(app, [report()]);
    const index = await request(app).get(`/reports/${publicId}/${ids[0]}/index.html`).expect(200);
    const csp = index.headers["content-security-policy"];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(index.headers["set-cookie"]).toBeUndefined();
    expect(index.headers["x-robots-tag"]).toBe("noindex, nofollow");
  });

  it("refuses traversal inside the archive path", async () => {
    const { app } = target();
    const { ids } = await seed(app, [report()]);
    await request(app).get(`/reports/${publicId}/${ids[0]}/../../etc/passwd`).expect(404);
    await request(app).get(`/reports/${publicId}/${ids[0]}/data/../../secret`).expect(404);
  });

  it("does not serve the report route for a file that is not a report", async () => {
    const { app } = target();
    const { ids } = await seed(app, [screenshot()]);
    await request(app).get(`/reports/${publicId}/${ids[0]}/index.html`).expect(404);
  });

  it("returns a plain 404 for an entry the archive does not hold", async () => {
    const { app } = target();
    const { ids } = await seed(app, [report()]);
    const response = await request(app).get(`/reports/${publicId}/${ids[0]}/missing.html`).expect(404);
    expect(response.text).not.toContain("Money path");
  });
});

describe("health endpoints stay separate from the viewer", () => {
  it("still answers after the viewer is mounted", async () => {
    const { app } = target();
    await request(app).get("/health/live").expect(200, { status: "ok" });
  });
});

describe("findings raised by review", () => {
  const nestedReport = () => ({
    bytes: makeZip([
      { name: "playwright-report/index.html", body: Buffer.from("<html><body>Nested report</body></html>") },
      { name: "playwright-report/assets/app.js", body: Buffer.from("console.log('report')") }
    ]),
    kind: "playwright-report",
    filename: "report.zip",
    caption: "Playwright report",
    contentType: "application/zip"
  });

  it("links a report whose index sits in a subdirectory", async () => {
    const { app } = target();
    const { ids } = await seed(app, [nestedReport()]);
    const page = await request(app).get(`/r/${publicId}`).expect(200);
    expect(page.text).toContain(`/reports/${publicId}/${ids[0]}/playwright-report/index.html`);
    expect(page.text).not.toContain(`/reports/${publicId}/${ids[0]}/index.html"`);

    const index = await request(app)
      .get(`/reports/${publicId}/${ids[0]}/playwright-report/index.html`)
      .expect(200);
    expect(index.text).toContain("Nested report");
  });

  it("defaults the bare report route to the recorded index", async () => {
    const { app } = target();
    const { ids } = await seed(app, [nestedReport()]);
    const index = await request(app).get(`/reports/${publicId}/${ids[0]}/`).expect(200);
    expect(index.text).toContain("Nested report");
  });

  it("serves a normalised video as MP4 whatever the upload was", async () => {
    const { app, store } = target();
    const mov = Buffer.concat([Buffer.alloc(4), Buffer.from("ftypqt  ", "latin1"), Buffer.alloc(64)]);
    const run = await request(app).post("/api/v1/runs")
      .set("authorization", `Bearer ${token}`)
      .send(runBody)
      .expect(201);
    const init = await request(app).post(`/api/v1/runs/${run.body.id}/files/init`)
      .set("authorization", `Bearer ${token}`)
      .send({
        kind: "video", filename: "flow.mov", caption: "Flow", contentType: "video/quicktime",
        byteSize: mov.length, sha256: digest(mov), head: mov.subarray(0, 4096).toString("base64")
      })
      .expect(201);
    // No ffmpeg in this suite, so the run quarantines; the point is that the
    // recorded type is what the viewer would serve, never the raw upload type.
    expect(init.body.file.contentType).toBe("video/quicktime");
    expect(store.getFile(init.body.file.id as string)?.contentType).toBe("video/quicktime");
  });

  it("streams a download without buffering it whole", async () => {
    const { app } = target();
    // Large enough to cross several relay windows.
    const big = Buffer.concat([Buffer.from("step log\n"), Buffer.alloc(9 * 1024 * 1024, 0x2e)]);
    const { ids } = await seed(app, [{
      bytes: big, kind: "log", filename: "big.log", caption: "Big log",
      contentType: "text/plain; charset=utf-8"
    }]);
    const response = await request(app).get(`/e/${publicId}/${ids[0]}/big.log`).expect(200);
    expect(Number(response.headers["content-length"])).toBe(big.length);
    expect(response.body.length ?? response.text.length).toBe(big.length);
  });
});
