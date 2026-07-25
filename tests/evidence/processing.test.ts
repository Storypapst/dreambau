import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProcessor } from "../../src/evidence/processing.js";
import { MemoryObjectStore, objectKey } from "../../src/evidence/storage.js";
import { createEvidenceStore, type EvidenceStore } from "../../src/evidence/store.js";
import type { CreateFileRecord } from "../../src/evidence/store.js";
import type { VideoProcessor } from "../../src/evidence/media.js";
import { digest, makePng, makeZip } from "./fixtures.js";

const stores: EvidenceStore[] = [];
afterEach(() => { while (stores.length > 0) stores.pop()?.close(); });

function harness(video?: VideoProcessor) {
  const store = createEvidenceStore(
    path.join(mkdtempSync(path.join(tmpdir(), "evidence-processing-")), "evidence.sqlite"),
    { publicBaseUrl: "https://evidence.dreambau.com" }
  );
  stores.push(store);
  const objectStore = new MemoryObjectStore();
  const processor = createProcessor({
    store,
    objectStore,
    video,
    now: () => new Date("2026-07-22T09:00:00.000Z")
  });
  store.createRun({
    project: "oriso",
    repository: "OpenResilienceInitiative/ORISO-E2E",
    pullRequestNumber: 42,
    commitSha: "abc1234",
    environment: "pre-dev",
    title: "Money path",
    result: "PASS",
    source: "codex"
  }, "run-1", "evidence-m4-oriso", "2026-07-22T08:59:00.000Z");
  return { store, objectStore, processor };
}

async function stage(
  harnessValue: ReturnType<typeof harness>,
  fileId: string,
  bytes: Buffer,
  overrides: Partial<CreateFileRecord> = {}
) {
  harnessValue.store.createFile("run-1", fileId, {
    kind: "screenshot",
    filename: "redirect.png",
    caption: "Redirect validated",
    contentType: "image/png",
    byteSize: bytes.length,
    // The real digest: processing verifies it against the stored object.
    sha256: digest(bytes),
    partSize: 64 * 1024 * 1024,
    expectedParts: 1,
    uploadId: null,
    ...overrides
  }, "2026-07-22T09:00:00.000Z");
  await harnessValue.objectStore.put(objectKey("run-1", fileId, "original"), bytes, String(overrides.contentType ?? "image/png"));
}

describe("image processing", () => {
  it("strips metadata and writes a separate public object", async () => {
    const value = harness();
    const png = makePng({ text: "Author Frank" });
    await stage(value, "file-1", png);

    const result = await value.processor.processFile("file-1");
    expect(result.state).toBe("ready");
    const published = await value.objectStore.get(objectKey("run-1", "file-1", "public"));
    expect(published.includes(Buffer.from("tEXt"))).toBe(false);
    expect(value.store.servedKeyFor("file-1")).toBe(objectKey("run-1", "file-1", "public"));
    expect(value.store.getFile("file-1")?.processingState).toBe("ready");
  });

  it("quarantines an image whose bytes do not parse", async () => {
    const value = harness();
    const broken = Buffer.concat([makePng().subarray(0, 8), Buffer.from("garbage")]);
    await stage(value, "file-1", broken);

    const result = await value.processor.processFile("file-1");
    expect(result.state).toBe("rejected");
    expect(result.findings.map((finding) => finding.rule)).toContain("image_metadata_strip_failed");
    expect(value.store.getRun("run-1")?.state).toBe("quarantined");
  });

  it("quarantines a screenshot whose OCR text carries a secret", async () => {
    const value = harness();
    const ocrStore = createProcessor({
      store: value.store,
      objectStore: value.objectStore,
      ocr: { text: async () => "password: hunter2secret" },
      now: () => new Date("2026-07-22T09:00:00.000Z")
    });
    await stage(value, "file-1", makePng());

    const result = await ocrStore.processFile("file-1");
    expect(result.state).toBe("rejected");
    expect(result.findings[0].rule).toBe("secret:secret_assignment");
  });
});

describe("text processing", () => {
  it("accepts an ordinary log and serves the uploaded object without copying it", async () => {
    const value = harness();
    const log = Buffer.from("2026-07-22 step=login result=PASS\nGET /api/v1/runs 200\n");
    await stage(value, "file-1", log, {
      kind: "log", filename: "run.log", contentType: "text/plain; charset=utf-8"
    });

    const result = await value.processor.processFile("file-1");
    expect(result.state).toBe("ready");
    expect(value.store.servedKeyFor("file-1")).toBe(objectKey("run-1", "file-1", "original"));
    expect(value.objectStore.keys()).toEqual([objectKey("run-1", "file-1", "original")]);
  });

  it("quarantines a log that carries a private key", async () => {
    const value = harness();
    const log = Buffer.from("setup\n-----BEGIN OPENSSH PRIVATE KEY-----\nbody\n");
    await stage(value, "file-1", log, {
      kind: "log", filename: "run.log", contentType: "text/plain; charset=utf-8"
    });

    const result = await value.processor.processFile("file-1");
    expect(result.state).toBe("rejected");
    expect(result.findings[0]).toMatchObject({ rule: "secret:private_key_block", location: "line 2" });
    expect(value.store.getFile("file-1")).toMatchObject({ processingState: "rejected", publicUrl: null });
  });

  it("finds a secret that sits beyond the first scan window", async () => {
    const value = harness();
    const filler = "harmless log line padded to length\n".repeat(300_000);
    const log = Buffer.from(`${filler}authorization: Bearer abcdefghijklmnop\n`);
    expect(log.length).toBeGreaterThan(8 * 1024 * 1024);
    await stage(value, "file-1", log, {
      kind: "log", filename: "run.log", contentType: "text/plain; charset=utf-8"
    });

    const result = await value.processor.processFile("file-1");
    expect(result.state).toBe("rejected");
    expect(result.findings.map((finding) => finding.rule)).toContain("secret:authorization_bearer");
  });
});

describe("archive processing", () => {
  it("extracts a Playwright report onto its own key prefix", async () => {
    const value = harness();
    const archive = makeZip([
      { name: "index.html", body: Buffer.from("<html>report</html>") },
      { name: "data/shot.png", body: makePng() }
    ]);
    await stage(value, "file-1", archive, {
      kind: "playwright-report", filename: "report.zip", contentType: "application/zip"
    });

    const result = await value.processor.processFile("file-1");
    expect(result.state).toBe("ready");
    expect(value.objectStore.keys()).toEqual(expect.arrayContaining([
      "runs/run-1/file-1/report/index.html",
      "runs/run-1/file-1/report/data/shot.png"
    ]));
  });

  it("quarantines a report without an index page", async () => {
    const value = harness();
    const archive = makeZip([{ name: "data/shot.png", body: makePng() }]);
    await stage(value, "file-1", archive, {
      kind: "playwright-report", filename: "report.zip", contentType: "application/zip"
    });

    const result = await value.processor.processFile("file-1");
    expect(result.findings.map((finding) => finding.rule)).toEqual(["report_index_missing"]);
  });

  it("quarantines an archive whose entries escape the root", async () => {
    const value = harness();
    const archive = makeZip([{ name: "../escape.txt", body: Buffer.from("x") }]);
    await stage(value, "file-1", archive, {
      kind: "trace", filename: "trace.zip", contentType: "application/zip"
    });

    const result = await value.processor.processFile("file-1");
    expect(result.findings.map((finding) => finding.rule)).toEqual(["archive:entry_name_rejected"]);
  });

  it("quarantines an archive that hides a secret in an entry", async () => {
    const value = harness();
    const archive = makeZip([
      { name: "index.html", body: Buffer.from("<html>report</html>") },
      { name: "data/env.txt", body: Buffer.from("client_secret=abcdefgh12345678") }
    ]);
    await stage(value, "file-1", archive, {
      kind: "playwright-report", filename: "report.zip", contentType: "application/zip"
    });

    const result = await value.processor.processFile("file-1");
    expect(result.state).toBe("rejected");
    expect(result.findings[0]).toMatchObject({
      rule: "secret:secret_assignment",
      location: "data/env.txt:1"
    });
    expect(value.objectStore.keys()).not.toContain("runs/run-1/file-1/report/index.html");
  });
});

describe("video processing", () => {
  const mp4 = Buffer.concat([Buffer.alloc(4), Buffer.from("ftypisom", "latin1"), Buffer.alloc(64)]);

  it("normalises the upload, writes a poster and serves the normalised object", async () => {
    const video: VideoProcessor = {
      normalise: vi.fn(async (_input, output) => { await writeSample(output, "normalised"); }),
      poster: vi.fn(async (_input, output) => { await writeSample(output, "poster"); }),
      probe: vi.fn(async () => ({ durationSeconds: 4, width: 1280, height: 720 }))
    };
    const value = harness(video);
    await stage(value, "file-1", mp4, { kind: "video", filename: "flow.mp4", contentType: "video/mp4" });

    const result = await value.processor.processFile("file-1");
    expect(result.state).toBe("ready");
    expect(video.normalise).toHaveBeenCalled();
    expect(value.store.servedKeyFor("file-1")).toBe(objectKey("run-1", "file-1", "public"));
    expect(value.objectStore.keys()).toEqual(expect.arrayContaining([objectKey("run-1", "file-1", "poster")]));
  });

  it("quarantines the run when ffmpeg fails", async () => {
    const video: VideoProcessor = {
      normalise: vi.fn(async () => { throw new Error("ffmpeg exploded"); }),
      poster: vi.fn(async () => undefined),
      probe: vi.fn(async () => ({ durationSeconds: null, width: null, height: null }))
    };
    const value = harness(video);
    await stage(value, "file-1", mp4, { kind: "video", filename: "flow.mp4", contentType: "video/mp4" });

    const result = await value.processor.processFile("file-1");
    expect(result.findings.map((finding) => finding.rule)).toEqual(["video_normalisation_failed"]);
  });

  it("quarantines a video when no processor is configured", async () => {
    const value = harness();
    await stage(value, "file-1", mp4, { kind: "video", filename: "flow.mp4", contentType: "video/mp4" });

    const result = await value.processor.processFile("file-1");
    expect(result.findings.map((finding) => finding.rule)).toEqual(["video_processor_unavailable"]);
  });
});

describe("upload integrity", () => {
  it("quarantines a file whose stored size differs from the declaration", async () => {
    const value = harness();
    const png = makePng();
    value.store.createFile("run-1", "file-1", {
      kind: "screenshot", filename: "redirect.png", caption: "", contentType: "image/png",
      byteSize: png.length + 10, sha256: digest(png),
      partSize: 64 * 1024 * 1024, expectedParts: 1, uploadId: null
    }, "2026-07-22T09:00:00.000Z");
    await value.objectStore.put(objectKey("run-1", "file-1", "original"), png, "image/png");

    const result = await value.processor.processFile("file-1");
    expect(result.findings.map((finding) => finding.rule)).toEqual(["size_mismatch"]);
  });

  it("quarantines a file whose bytes never arrived", async () => {
    const value = harness();
    value.store.createFile("run-1", "file-1", {
      kind: "screenshot", filename: "redirect.png", caption: "", contentType: "image/png",
      byteSize: 10, sha256: "a".repeat(64),
      partSize: 64 * 1024 * 1024, expectedParts: 1, uploadId: "upload-1"
    }, "2026-07-22T09:00:00.000Z");

    const result = await value.processor.processFile("file-1");
    expect(result.findings.map((finding) => finding.rule)).toEqual(["upload_incomplete"]);
  });
});

async function writeSample(target: string, contents: string) {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(target, contents);
}

describe("findings raised by review", () => {
  it("quarantines a file whose stored bytes do not match the declared digest", async () => {
    const value = harness();
    const png = makePng();
    value.store.createFile("run-1", "file-1", {
      kind: "screenshot", filename: "redirect.png", caption: "", contentType: "image/png",
      byteSize: png.length, sha256: "b".repeat(64),
      partSize: 64 * 1024 * 1024, expectedParts: 1, uploadId: null
    }, "2026-07-22T09:00:00.000Z");
    await value.objectStore.put(objectKey("run-1", "file-1", "original"), png, "image/png");

    const result = await value.processor.processFile("file-1");
    expect(result.findings.map((entry) => entry.rule)).toEqual(["checksum_mismatch"]);
    expect(value.store.getRun("run-1")?.state).toBe("quarantined");
  });

  it("records the served type as MP4 once a MOV upload is normalised", async () => {
    const video: VideoProcessor = {
      normalise: vi.fn(async (_input, output) => { await writeSample(output, "normalised"); }),
      poster: vi.fn(async (_input, output) => { await writeSample(output, "poster"); }),
      probe: vi.fn(async () => ({ durationSeconds: 2, width: 640, height: 360 }))
    };
    const value = harness(video);
    const mov = Buffer.concat([Buffer.alloc(4), Buffer.from("ftypqt  ", "latin1"), Buffer.alloc(64)]);
    await stage(value, "file-1", mov, { kind: "video", filename: "flow.mov", contentType: "video/quicktime" });

    await value.processor.processFile("file-1");
    expect(value.store.getFile("file-1")?.contentType).toBe("video/mp4");
  });

  it("remembers where a nested report index actually lives", async () => {
    const value = harness();
    const archive = makeZip([
      { name: "playwright-report/index.html", body: Buffer.from("<html>report</html>") },
      { name: "playwright-report/data/shot.png", body: makePng() }
    ]);
    await stage(value, "file-1", archive, {
      kind: "playwright-report", filename: "report.zip", contentType: "application/zip"
    });

    expect((await value.processor.processFile("file-1")).state).toBe("ready");
    expect(value.store.reportIndexFor("file-1")).toBe("playwright-report/index.html");
  });

  it("quarantines an archive whose entry cannot be read", async () => {
    const value = harness();
    const archive = makeZip([{ name: "a.txt", body: Buffer.from("hello world") }]);
    // Break the local header the entry points at, leaving the directory intact.
    archive.writeUInt32LE(0xdeadbeef, 0);
    await stage(value, "file-1", archive, {
      kind: "trace", filename: "trace.zip", contentType: "application/zip"
    });

    const result = await value.processor.processFile("file-1");
    expect(result.findings.map((entry) => entry.rule)).toEqual(["archive:corrupt_archive"]);
  });

  it("finds a secret inside a Flate-compressed PDF stream", async () => {
    const value = harness();
    const { deflateSync } = await import("node:zlib");
    const body = deflateSync(Buffer.from("(client_secret=abcdefgh12345678) Tj"));
    const pdf = Buffer.concat([
      Buffer.from("%PDF-1.7\n1 0 obj<</Length 40/Filter/FlateDecode>>stream\n"),
      body,
      Buffer.from("\nendstream endobj\n%%EOF\n")
    ]);
    await stage(value, "file-1", pdf, {
      kind: "document", filename: "report.pdf", contentType: "application/pdf"
    });

    const result = await value.processor.processFile("file-1");
    expect(result.state).toBe("rejected");
    expect(result.findings.map((entry) => entry.rule)).toContain("secret:secret_assignment");
  });

  it("accepts a PDF that carries nothing sensitive", async () => {
    const value = harness();
    const pdf = Buffer.from("%PDF-1.7\n1 0 obj<<>>stream\n(step one passed) Tj\nendstream endobj\n%%EOF\n");
    await stage(value, "file-1", pdf, {
      kind: "document", filename: "report.pdf", contentType: "application/pdf"
    });
    expect((await value.processor.processFile("file-1")).state).toBe("ready");
  });
});
