import { createHash } from "node:crypto";
import { metrics } from "./metrics.js";
import { objectKey, ObjectNotFoundError, type ObjectStore } from "./storage.js";
import type { EvidenceStore } from "./store.js";

/**
 * Retention and integrity.
 *
 * The asymmetry here is deliberate and is the whole point: unpublished drafts
 * expire on their own, but nothing that was ever published or quarantined is
 * deleted by a schedule. Archiving withdraws public reachability; removing the
 * bytes is a separate, explicit admin step, because a scheduled job that can
 * delete evidence is a scheduled job that will eventually delete the evidence
 * someone needed.
 */

export interface RetentionOptions {
  store: EvidenceStore;
  objectStore: ObjectStore;
  draftRetentionDays: number;
  originalVideoRetentionDays: number;
  now?: () => Date;
}

export interface RetentionReport {
  expiredDrafts: string[];
  removedObjects: number;
  prunedVideoOriginals: string[];
  storageBytes: number;
}

const daysBefore = (from: Date, days: number) => new Date(from.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

/** Every key a run could own. Deleting a key that was never written is fine. */
function keysOf(runId: string, fileIds: string[]): string[] {
  return fileIds.flatMap((fileId) => ([
    objectKey(runId, fileId, "original"),
    objectKey(runId, fileId, "public"),
    objectKey(runId, fileId, "poster"),
    objectKey(runId, fileId, "thumbnail")
  ]));
}

export async function runRetention(options: RetentionOptions): Promise<RetentionReport> {
  const now = options.now?.() ?? new Date();
  const report: RetentionReport = { expiredDrafts: [], removedObjects: 0, prunedVideoOriginals: [], storageBytes: 0 };

  // Unpublished raw runs past the window. `expiredDrafts` only ever returns
  // draft and processing runs, so published, quarantined and archived runs are
  // structurally out of reach here.
  for (const run of options.store.expiredDrafts(daysBefore(now, options.draftRetentionDays))) {
    const fileIds = options.store.listFiles(run.id).map((file) => file.id);
    for (const key of keysOf(run.id, fileIds)) {
      try {
        await options.objectStore.delete(key);
        report.removedObjects += 1;
      } catch (error) {
        if (!(error instanceof ObjectNotFoundError)) throw error;
      }
    }
    options.store.deleteRun(run.id);
    report.expiredDrafts.push(run.id);
  }

  // The upload a video was normalised from, once it has outlived its window.
  // The normalised copy is what the public URL serves and is never touched.
  for (const file of options.store.normalisedVideosCompletedBefore(daysBefore(now, options.originalVideoRetentionDays))) {
    const servedKey = options.store.servedKeyFor(file.id);
    const original = objectKey(file.runId, file.id, "original");
    // Only when something else is actually being served; otherwise the original
    // *is* the evidence.
    if (!servedKey || servedKey === original) continue;
    try {
      await options.objectStore.delete(original);
      report.prunedVideoOriginals.push(file.id);
      report.removedObjects += 1;
    } catch (error) {
      if (!(error instanceof ObjectNotFoundError)) throw error;
    }
  }

  report.storageBytes = options.store.totalBytes();
  metrics.setGauge("evidence_storage_bytes", report.storageBytes);
  return report;
}

export interface IntegrityFinding {
  fileId: string;
  runId: string;
  filename: string;
  problem: "object_missing" | "size_zero" | "digest_mismatch";
}

export interface IntegrityReport {
  checked: number;
  findings: IntegrityFinding[];
  /** sha256 of every published file, so drift is visible between two runs. */
  manifest: Array<{ fileId: string; sha256: string }>;
}

export interface IntegrityOptions {
  store: EvidenceStore;
  objectStore: ObjectStore;
  /** Reading every byte is expensive; off by default, on for a deep check. */
  verifyDigests?: boolean;
  maxDigestBytes?: number;
}

export async function runIntegrityCheck(options: IntegrityOptions): Promise<IntegrityReport> {
  const report: IntegrityReport = { checked: 0, findings: [], manifest: [] };

  for (const file of options.store.publishedFiles()) {
    report.checked += 1;
    report.manifest.push({ fileId: file.id, sha256: file.sha256 });
    const head = await options.objectStore.head(file.servedKey);
    if (!head) {
      report.findings.push({ fileId: file.id, runId: file.runId, filename: file.filename, problem: "object_missing" });
      continue;
    }
    if (head.byteSize === 0) {
      report.findings.push({ fileId: file.id, runId: file.runId, filename: file.filename, problem: "size_zero" });
      continue;
    }
    if (!options.verifyDigests) continue;
    if (head.byteSize > (options.maxDigestBytes ?? 256 * 1024 * 1024)) continue;

    // Only meaningful where the served bytes are the uploaded bytes. A stripped
    // image or a normalised video is deliberately not the original.
    if (!file.servedKey.endsWith("/original")) continue;
    const hash = createHash("sha256");
    const window = 8 * 1024 * 1024;
    for (let offset = 0; offset < head.byteSize; offset += window) {
      hash.update(await options.objectStore.getRange(file.servedKey, offset, window));
    }
    if (hash.digest("hex") !== file.sha256.toLowerCase()) {
      report.findings.push({ fileId: file.id, runId: file.runId, filename: file.filename, problem: "digest_mismatch" });
    }
  }
  return report;
}

export interface ProbeOptions {
  store: EvidenceStore;
  publicBaseUrl: string;
  fetch: typeof fetch;
  limit?: number;
}

/**
 * Confirms that published links actually answer. A broken public link is the
 * failure a reader notices first and the operator notices last.
 */
export async function probePublicLinks(options: ProbeOptions): Promise<{ probed: number; failures: string[] }> {
  const base = options.publicBaseUrl.replace(/\/$/, "");
  const published = options.store.listRuns({ state: "published" }).slice(0, options.limit ?? 25);
  const failures: string[] = [];

  for (const run of published) {
    if (!run.publicId) continue;
    try {
      const response = await options.fetch(`${base}/r/${run.publicId}`, { method: "GET" });
      if (!response.ok) failures.push(run.publicId);
    } catch {
      failures.push(run.publicId);
    }
  }
  if (failures.length > 0) {
    metrics.increment("evidence_public_link_probe_failures_total", {}, failures.length);
  }
  return { probed: published.length, failures };
}
