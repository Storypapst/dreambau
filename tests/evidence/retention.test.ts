import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMetrics } from "../../src/evidence/metrics.js";
import { probePublicLinks, runIntegrityCheck, runRetention } from "../../src/evidence/retention.js";
import { MemoryObjectStore, objectKey } from "../../src/evidence/storage.js";
import { createEvidenceStore, type EvidenceStore } from "../../src/evidence/store.js";
import { digest, makePng } from "./fixtures.js";

const stores: EvidenceStore[] = [];
afterEach(() => { while (stores.length > 0) stores.pop()?.close(); });

const NOW = new Date("2026-07-26T00:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

function harness() {
  const store = createEvidenceStore(
    path.join(mkdtempSync(path.join(tmpdir(), "evidence-retention-")), "evidence.sqlite"),
    { publicBaseUrl: "https://evidence.dreambau.com" }
  );
  stores.push(store);
  return { store, objectStore: new MemoryObjectStore() };
}

const runInput = {
  project: "oriso" as const,
  repository: "OpenResilienceInitiative/ORISO-E2E",
  pullRequestNumber: 42,
  commitSha: "abc1234",
  environment: "pre-dev" as const,
  title: "Money path",
  result: "PASS" as const,
  source: "codex" as const
};

async function seedRun(
  value: ReturnType<typeof harness>,
  runId: string,
  createdAt: string,
  options: { state?: "draft" | "published" | "quarantined"; bytes?: Buffer; kind?: string; contentType?: string } = {}
) {
  const bytes = options.bytes ?? makePng();
  value.store.createRun(runInput, runId, "evidence-m4-oriso", createdAt);
  const fileId = `${runId}-file`;
  value.store.createFile(runId, fileId, {
    kind: (options.kind ?? "screenshot") as never,
    filename: "shot.png",
    caption: "",
    contentType: options.contentType ?? "image/png",
    byteSize: bytes.length,
    sha256: digest(bytes),
    partSize: 64 * 1024 * 1024,
    expectedParts: 1,
    uploadId: null
  }, createdAt);
  await value.objectStore.put(objectKey(runId, fileId, "original"), bytes, options.contentType ?? "image/png");
  value.store.completeFile(fileId, createdAt);

  if (options.state === "published" || options.state === "quarantined") {
    value.store.setProcessingOutcome(fileId, {
      state: options.state === "published" ? "ready" : "rejected",
      servedKey: objectKey(runId, fileId, "original"),
      publicPath: `${fileId}/shot.png`,
      posterPath: null
    });
  }
  if (options.state === "published") {
    value.store.transitionRun(runId, "processing", createdAt);
    value.store.publishRun(runId, runId.padEnd(32, "a").slice(0, 32), {
      repository: runInput.repository, pullRequestNumber: 42, commitSha: "abc1234"
    }, createdAt);
  }
  if (options.state === "quarantined") value.store.transitionRun(runId, "quarantined", createdAt);
  return fileId;
}

describe("retention", () => {
  it("expires an unpublished draft past the window and removes its objects", async () => {
    const value = harness();
    const fileId = await seedRun(value, "old-draft", daysAgo(90));

    const report = await runRetention({
      store: value.store, objectStore: value.objectStore,
      draftRetentionDays: 60, originalVideoRetentionDays: 7, now: () => NOW
    });

    expect(report.expiredDrafts).toEqual(["old-draft"]);
    expect(value.store.getRun("old-draft")).toBeNull();
    expect(await value.objectStore.head(objectKey("old-draft", fileId, "original"))).toBeNull();
  });

  it("leaves a draft that is still inside the window alone", async () => {
    const value = harness();
    await seedRun(value, "young-draft", daysAgo(10));
    const report = await runRetention({
      store: value.store, objectStore: value.objectStore,
      draftRetentionDays: 60, originalVideoRetentionDays: 7, now: () => NOW
    });
    expect(report.expiredDrafts).toEqual([]);
    expect(value.store.getRun("young-draft")).not.toBeNull();
  });

  it("never deletes a published run, however old", async () => {
    const value = harness();
    const fileId = await seedRun(value, "published", daysAgo(400), { state: "published" });
    await runRetention({
      store: value.store, objectStore: value.objectStore,
      draftRetentionDays: 60, originalVideoRetentionDays: 7, now: () => NOW
    });
    expect(value.store.getRun("published")?.state).toBe("published");
    expect(await value.objectStore.head(objectKey("published", fileId, "original"))).not.toBeNull();
  });

  it("never deletes a quarantined run, however old", async () => {
    const value = harness();
    const fileId = await seedRun(value, "quarantined", daysAgo(400), { state: "quarantined" });
    await runRetention({
      store: value.store, objectStore: value.objectStore,
      draftRetentionDays: 60, originalVideoRetentionDays: 7, now: () => NOW
    });
    expect(value.store.getRun("quarantined")?.state).toBe("quarantined");
    expect(await value.objectStore.head(objectKey("quarantined", fileId, "original"))).not.toBeNull();
  });

  it("prunes a video's original once the normalised copy has outlived the window", async () => {
    const value = harness();
    const mp4 = Buffer.concat([Buffer.alloc(4), Buffer.from("ftypisom", "latin1"), Buffer.alloc(64)]);
    const fileId = await seedRun(value, "video-run", daysAgo(30), {
      state: "published", bytes: mp4, kind: "video", contentType: "video/mp4"
    });
    // The normalised copy is what is served; the original is the extra one.
    await value.objectStore.put(objectKey("video-run", fileId, "public"), mp4, "video/mp4");
    value.store.setProcessingOutcome(fileId, {
      state: "ready", servedKey: objectKey("video-run", fileId, "public"),
      publicPath: `${fileId}/flow.mp4`, posterPath: `${fileId}/poster.jpg`
    });

    const report = await runRetention({
      store: value.store, objectStore: value.objectStore,
      draftRetentionDays: 60, originalVideoRetentionDays: 7, now: () => NOW
    });

    expect(report.prunedVideoOriginals).toEqual([fileId]);
    expect(await value.objectStore.head(objectKey("video-run", fileId, "original"))).toBeNull();
    // The published copy — the one the URL points at — is untouched.
    expect(await value.objectStore.head(objectKey("video-run", fileId, "public"))).not.toBeNull();
  });

  it("keeps a video original that is still what gets served", async () => {
    const value = harness();
    const mp4 = Buffer.concat([Buffer.alloc(4), Buffer.from("ftypisom", "latin1"), Buffer.alloc(64)]);
    const fileId = await seedRun(value, "unnormalised", daysAgo(30), {
      state: "published", bytes: mp4, kind: "video", contentType: "video/mp4"
    });
    const report = await runRetention({
      store: value.store, objectStore: value.objectStore,
      draftRetentionDays: 60, originalVideoRetentionDays: 7, now: () => NOW
    });
    expect(report.prunedVideoOriginals).toEqual([]);
    expect(await value.objectStore.head(objectKey("unnormalised", fileId, "original"))).not.toBeNull();
  });
});

describe("integrity", () => {
  it("reports a published file whose object has gone missing", async () => {
    const value = harness();
    const fileId = await seedRun(value, "gap", daysAgo(1), { state: "published" });
    await value.objectStore.delete(objectKey("gap", fileId, "original"));

    const report = await runIntegrityCheck({ store: value.store, objectStore: value.objectStore });
    expect(report.checked).toBe(1);
    expect(report.findings).toEqual([
      { fileId, runId: "gap", filename: "shot.png", problem: "object_missing" }
    ]);
  });

  it("passes a healthy published file and lists it in the manifest", async () => {
    const value = harness();
    const fileId = await seedRun(value, "healthy", daysAgo(1), { state: "published" });
    const report = await runIntegrityCheck({ store: value.store, objectStore: value.objectStore, verifyDigests: true });
    expect(report.findings).toEqual([]);
    expect(report.manifest.map((entry) => entry.fileId)).toEqual([fileId]);
  });

  it("notices when the stored bytes no longer match the recorded digest", async () => {
    const value = harness();
    const fileId = await seedRun(value, "tampered", daysAgo(1), { state: "published" });
    await value.objectStore.put(objectKey("tampered", fileId, "original"), Buffer.from("replaced"), "image/png");

    const report = await runIntegrityCheck({ store: value.store, objectStore: value.objectStore, verifyDigests: true });
    expect(report.findings.map((finding) => finding.problem)).toEqual(["digest_mismatch"]);
  });

  it("ignores a draft: only published evidence has a promise to keep", async () => {
    const value = harness();
    await seedRun(value, "draft", daysAgo(1));
    const report = await runIntegrityCheck({ store: value.store, objectStore: value.objectStore });
    expect(report.checked).toBe(0);
  });
});

describe("public link probe", () => {
  it("reports a published run whose page does not answer", async () => {
    const value = harness();
    await seedRun(value, "reachable", daysAgo(1), { state: "published" });
    const fetcher = vi.fn(async () => new Response("", { status: 502 })) as unknown as typeof fetch;

    const report = await probePublicLinks({
      store: value.store, publicBaseUrl: "https://evidence.dreambau.com", fetch: fetcher
    });
    expect(report.probed).toBe(1);
    expect(report.failures).toHaveLength(1);
  });

  it("counts a healthy link as healthy", async () => {
    const value = harness();
    await seedRun(value, "reachable", daysAgo(1), { state: "published" });
    const fetcher = vi.fn(async () => new Response("<html></html>", { status: 200 })) as unknown as typeof fetch;
    const report = await probePublicLinks({
      store: value.store, publicBaseUrl: "https://evidence.dreambau.com", fetch: fetcher
    });
    expect(report.failures).toEqual([]);
  });
});

describe("metrics", () => {
  it("renders counters, a gauge and a histogram in Prometheus form", () => {
    const registry = createMetrics();
    registry.increment("evidence_upload_total", { outcome: "ready" });
    registry.increment("evidence_upload_total", { outcome: "ready" });
    registry.increment("evidence_upload_total", { outcome: "quarantined" });
    registry.increment("evidence_upload_bytes_total", {}, 4096);
    registry.setGauge("evidence_storage_bytes", 12_345);
    registry.observeProcessing("screenshot", 0.2);
    registry.observeProcessing("video", 42);

    const rendered = registry.render();
    expect(rendered).toContain('evidence_upload_total{outcome="ready"} 2');
    expect(rendered).toContain('evidence_upload_total{outcome="quarantined"} 1');
    expect(rendered).toContain("evidence_upload_bytes_total 4096");
    expect(rendered).toContain("evidence_storage_bytes 12345");
    expect(rendered).toContain('evidence_processing_duration_seconds_bucket{kind="screenshot",le="0.25"} 1');
    expect(rendered).toContain('evidence_processing_duration_seconds_count{kind="video"} 1');
    expect(rendered).toContain("# TYPE evidence_quarantine_total counter");
  });

  it("reports zero for a counter nothing has touched", () => {
    expect(createMetrics().render()).toContain("evidence_publish_failures_total 0");
  });

  it("carries no run, repository or file identifier as a label", () => {
    const registry = createMetrics();
    registry.increment("evidence_quarantine_total", { family: "secret" });
    const rendered = registry.render();
    expect(rendered).not.toMatch(/run[_-]?id/i);
    expect(rendered).not.toMatch(/repository/i);
    expect(rendered).not.toMatch(/filename/i);
  });
});
