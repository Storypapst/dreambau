import Database from "better-sqlite3";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createEvidenceStore, migrations, runMigrations, type EvidenceStore } from "../../src/evidence/store.js";
import type { CreateRunInput } from "../../src/evidence/model.js";

const stores: EvidenceStore[] = [];

afterEach(() => {
  while (stores.length > 0) stores.pop()?.close();
});

function temporaryPath(name = "evidence.sqlite") {
  return path.join(mkdtempSync(path.join(tmpdir(), "evidence-store-")), name);
}

function newStore() {
  const store = createEvidenceStore(temporaryPath(), { publicBaseUrl: "https://evidence.dreambau.com/" });
  stores.push(store);
  return store;
}

const runInput: CreateRunInput = {
  project: "oriso",
  repository: "OpenResilienceInitiative/ORISO-E2E",
  pullRequestNumber: 42,
  commitSha: "abc1234",
  environment: "pre-dev",
  title: "Money path",
  result: "PASS",
  source: "codex"
};

function seedRun(store: EvidenceStore, overrides: Partial<CreateRunInput> = {}) {
  return store.createRun({ ...runInput, ...overrides }, "run-1", "evidence-m4-oriso", "2026-07-22T09:00:00.000Z");
}

function seedFile(store: EvidenceStore, runId: string, fileId = "file-1", sha = "a".repeat(64)) {
  return store.createFile(runId, fileId, {
    kind: "screenshot",
    filename: "redirect.png",
    caption: "Redirect validated",
    contentType: "image/png",
    byteSize: 100,
    sha256: sha,
    partSize: 64 * 1024 * 1024,
    expectedParts: 1,
    uploadId: "upload-1"
  }, "2026-07-22T09:00:01.000Z");
}

describe("migrations", () => {
  it("applies every version once and is a no-op on a second run", () => {
    const file = temporaryPath();
    const sqlite = new Database(file);
    expect(runMigrations(sqlite)).toEqual(migrations.map((migration) => migration.version));
    expect(runMigrations(sqlite)).toEqual([]);
    const tables = (sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>)
      .map((row) => row.name);
    expect(tables).toEqual(expect.arrayContaining([
      "evidence_runs", "evidence_files", "evidence_file_parts", "evidence_findings", "evidence_events"
    ]));
    sqlite.close();
  });

  it("can be applied to a database an older version already touched", () => {
    const file = temporaryPath();
    const first = new Database(file);
    runMigrations(first);
    first.close();
    const second = new Database(file);
    expect(runMigrations(second)).toEqual([]);
    second.close();
  });
});

describe("runs", () => {
  it("stores a run as a draft with no public identity", () => {
    const store = newStore();
    const run = seedRun(store);
    expect(run).toMatchObject({
      state: "draft",
      publicId: null,
      publishedAt: null,
      githubCommentUrl: null,
      pullRequestUrl: "https://github.com/OpenResilienceInitiative/ORISO-E2E/pull/42"
    });
  });

  it("refuses a transition the state machine does not allow", () => {
    const store = newStore();
    seedRun(store);
    expect(() => store.transitionRun("run-1", "published", "2026-07-22T09:01:00.000Z"))
      .toThrow(/invalid evidence run transition/);
  });

  it("publishes only through processing and records the public id once", () => {
    const store = newStore();
    seedRun(store);
    store.transitionRun("run-1", "processing", "2026-07-22T09:01:00.000Z");
    const published = store.publishRun("run-1", "abcdefghjkmnpqrstuvwxyz23456782", {
      repository: runInput.repository,
      pullRequestNumber: 42,
      commitSha: "abc1234"
    }, "2026-07-22T09:02:00.000Z");
    expect(published).toMatchObject({ state: "published", publicId: "abcdefghjkmnpqrstuvwxyz23456782" });
    expect(store.getRunByPublicId("abcdefghjkmnpqrstuvwxyz23456782")?.id).toBe("run-1");
  });

  it("keeps the public id and publication time stable when a run is republished", () => {
    const store = newStore();
    seedRun(store);
    store.transitionRun("run-1", "processing", "2026-07-22T09:01:00.000Z");
    const first = store.publishRun("run-1", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", {
      repository: runInput.repository, pullRequestNumber: 42, commitSha: "abc1234"
    }, "2026-07-22T09:02:00.000Z");
    const second = store.publishRun("run-1", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", {
      repository: runInput.repository, pullRequestNumber: 42, commitSha: "abc1234"
    }, "2026-07-22T09:03:00.000Z");
    expect(second.publicId).toBe(first.publicId);
    expect(second.publishedAt).toBe("2026-07-22T09:02:00.000Z");
  });

  it("refuses to publish a run that was quarantined or archived", () => {
    const store = newStore();
    seedRun(store);
    store.transitionRun("run-1", "quarantined", "2026-07-22T09:01:00.000Z");
    expect(() => store.publishRun("run-1", "a".repeat(32), {
      repository: runInput.repository, pullRequestNumber: 42, commitSha: "abc1234"
    }, "2026-07-22T09:02:00.000Z")).toThrow(/invalid evidence run transition/);
  });
});

describe("files", () => {
  it("deduplicates by digest inside one run", () => {
    const store = newStore();
    seedRun(store);
    seedFile(store, "run-1");
    expect(store.findFileBySha("run-1", "A".repeat(64))?.id).toBe("file-1");
    expect(() => seedFile(store, "run-1", "file-2")).toThrow(/UNIQUE/);
  });

  it("hides every public address until the run is published", () => {
    const store = newStore();
    seedRun(store);
    seedFile(store, "run-1");
    store.setProcessingOutcome("file-1", {
      state: "ready",
      servedKey: "runs/run-1/file-1/public",
      publicPath: "file-1/redirect.png",
      posterPath: null
    });
    expect(store.getFile("file-1")).toMatchObject({ publicUrl: null, viewerUrl: null, processingState: "ready" });

    store.transitionRun("run-1", "processing", "2026-07-22T09:01:00.000Z");
    store.publishRun("run-1", "cccccccccccccccccccccccccccccccc", {
      repository: runInput.repository, pullRequestNumber: 42, commitSha: "abc1234"
    }, "2026-07-22T09:02:00.000Z");
    expect(store.getFile("file-1")).toMatchObject({
      publicUrl: "https://evidence.dreambau.com/e/cccccccccccccccccccccccccccccccc/file-1/redirect.png",
      viewerUrl: "https://evidence.dreambau.com/r/cccccccccccccccccccccccccccccccc"
    });
  });

  it("withdraws the public address again when the run is archived", () => {
    const store = newStore();
    seedRun(store);
    seedFile(store, "run-1");
    store.setProcessingOutcome("file-1", {
      state: "ready", servedKey: "k", publicPath: "file-1/redirect.png", posterPath: null
    });
    store.transitionRun("run-1", "processing", "2026-07-22T09:01:00.000Z");
    store.publishRun("run-1", "dddddddddddddddddddddddddddddddd", {
      repository: runInput.repository, pullRequestNumber: 42, commitSha: "abc1234"
    }, "2026-07-22T09:02:00.000Z");
    store.archiveRun("run-1", "2026-07-22T10:00:00.000Z");
    expect(store.getFile("file-1")).toMatchObject({ publicUrl: null, viewerUrl: null });
  });

  it("never exposes the bucket key on the file record", () => {
    const store = newStore();
    seedRun(store);
    seedFile(store, "run-1");
    store.setProcessingOutcome("file-1", {
      state: "ready", servedKey: "runs/run-1/file-1/original", publicPath: "file-1/redirect.png", posterPath: null
    });
    expect(JSON.stringify(store.getFile("file-1"))).not.toContain("runs/run-1");
    expect(store.servedKeyFor("file-1")).toBe("runs/run-1/file-1/original");
  });

  it("records and replaces multipart parts so an upload can resume", () => {
    const store = newStore();
    seedRun(store);
    seedFile(store, "run-1");
    store.recordPart("file-1", { partNumber: 2, etag: "b", byteSize: 20 }, "2026-07-22T09:00:03.000Z");
    store.recordPart("file-1", { partNumber: 1, etag: "a", byteSize: 10 }, "2026-07-22T09:00:02.000Z");
    store.recordPart("file-1", { partNumber: 1, etag: "a2", byteSize: 11 }, "2026-07-22T09:00:04.000Z");
    expect(store.listParts("file-1")).toEqual([
      { partNumber: 1, etag: "a2", byteSize: 11 },
      { partNumber: 2, etag: "b", byteSize: 20 }
    ]);
  });

  it("sums the stored bytes of a run for the ceiling check", () => {
    const store = newStore();
    seedRun(store);
    seedFile(store, "run-1", "file-1", "a".repeat(64));
    seedFile(store, "run-1", "file-2", "b".repeat(64));
    expect(store.storedBytes("run-1")).toBe(200);
  });
});

describe("findings, events and retention", () => {
  it("keeps quarantine findings and the audit trail", () => {
    const store = newStore();
    seedRun(store);
    seedFile(store, "run-1");
    store.addFindings([
      { runId: "run-1", fileId: "file-1", rule: "secret:private_key_block", location: "line 4" }
    ], "2026-07-22T09:05:00.000Z");
    store.appendEvent("run-1", "file_quarantined", "gateway", "2026-07-22T09:05:00.000Z", { fileId: "file-1" });
    expect(store.listFindings("run-1")).toEqual([
      { runId: "run-1", fileId: "file-1", rule: "secret:private_key_block", location: "line 4" }
    ]);
    expect(store.events("run-1")).toEqual([{
      eventType: "file_quarantined",
      actorId: "gateway",
      createdAt: "2026-07-22T09:05:00.000Z",
      payload: { fileId: "file-1" }
    }]);
  });

  it("lists unpublished runs older than the retention cut-off and nothing else", () => {
    const store = newStore();
    seedRun(store);
    const other = store.createRun(runInput, "run-2", "evidence-m4-oriso", "2026-07-22T09:00:00.000Z");
    store.transitionRun(other.id, "processing", "2026-07-22T09:01:00.000Z");
    store.publishRun(other.id, "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", {
      repository: runInput.repository, pullRequestNumber: 42, commitSha: "abc1234"
    }, "2026-07-22T09:02:00.000Z");
    expect(store.expiredDrafts("2026-09-30T00:00:00.000Z").map((run) => run.id)).toEqual(["run-1"]);
    expect(store.expiredDrafts("2026-07-01T00:00:00.000Z")).toEqual([]);
  });
});
