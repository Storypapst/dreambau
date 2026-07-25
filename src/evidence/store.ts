import Database, { type Database as SqliteDatabase } from "better-sqlite3";
import {
  assertRunTransition,
  evidenceSchemaVersion,
  pullRequestUrl,
  type CreateRunInput,
  type EvidenceFile,
  type EvidenceKind,
  type EvidenceRun,
  type EvidenceState,
  type FileProcessingState,
  type InitFileInput,
  type PrimaryActor,
  type PublishInput
} from "./model.js";
import type { UploadedPart } from "./storage.js";

interface Migration {
  version: number;
  statements: string[];
}

/**
 * Forward-only migrations. Each version is applied inside one transaction and
 * recorded, so running the migrator twice is a no-op and a partially applied
 * version can never be observed.
 */
export const migrations: Migration[] = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS evidence_runs (
        id TEXT PRIMARY KEY,
        schema_version INTEGER NOT NULL,
        public_id TEXT UNIQUE,
        project TEXT NOT NULL,
        repository TEXT NOT NULL,
        pull_request_number INTEGER,
        commit_sha TEXT NOT NULL,
        environment TEXT NOT NULL,
        title TEXT NOT NULL,
        result TEXT NOT NULL,
        source TEXT NOT NULL,
        state TEXT NOT NULL,
        created_at TEXT NOT NULL,
        published_at TEXT,
        archived_at TEXT,
        github_comment_url TEXT,
        identity_id TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS evidence_files (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES evidence_runs(id) ON DELETE RESTRICT,
        kind TEXT NOT NULL,
        filename TEXT NOT NULL,
        caption TEXT NOT NULL DEFAULT '',
        content_type TEXT NOT NULL,
        byte_size INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        primary_actor TEXT,
        processing_state TEXT NOT NULL DEFAULT 'pending',
        public_path TEXT,
        poster_path TEXT,
        served_key TEXT,
        upload_id TEXT,
        part_size INTEGER NOT NULL,
        expected_parts INTEGER NOT NULL,
        completed_at TEXT,
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS evidence_file_parts (
        file_id TEXT NOT NULL REFERENCES evidence_files(id) ON DELETE RESTRICT,
        part_number INTEGER NOT NULL,
        etag TEXT NOT NULL,
        byte_size INTEGER NOT NULL,
        received_at TEXT NOT NULL,
        PRIMARY KEY(file_id, part_number)
      )`,
      `CREATE TABLE IF NOT EXISTS evidence_findings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL REFERENCES evidence_runs(id) ON DELETE RESTRICT,
        file_id TEXT,
        rule TEXT NOT NULL,
        location TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS evidence_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL REFERENCES evidence_runs(id) ON DELETE RESTRICT,
        event_type TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        payload TEXT NOT NULL DEFAULT '{}'
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS evidence_files_run_sha ON evidence_files(run_id, sha256)`,
      `CREATE INDEX IF NOT EXISTS evidence_files_run ON evidence_files(run_id, created_at)`,
      `CREATE INDEX IF NOT EXISTS evidence_runs_state ON evidence_runs(state, created_at)`,
      `CREATE INDEX IF NOT EXISTS evidence_runs_pull_request ON evidence_runs(repository, pull_request_number)`,
      `CREATE INDEX IF NOT EXISTS evidence_events_order ON evidence_events(run_id, id)`
    ]
  }
];

export function runMigrations(sqlite: SqliteDatabase): number[] {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS evidence_schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);
  const applied = new Set(
    (sqlite.prepare("SELECT version FROM evidence_schema_migrations").all() as Array<{ version: number }>)
      .map((row) => row.version)
  );
  const executed: number[] = [];
  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    const apply = sqlite.transaction(() => {
      for (const statement of migration.statements) sqlite.exec(statement);
      sqlite.prepare("INSERT INTO evidence_schema_migrations(version, applied_at) VALUES(?,?)")
        .run(migration.version, new Date().toISOString());
    });
    apply();
    executed.push(migration.version);
  }
  return executed;
}

export interface CreateFileRecord extends InitFileInput {
  contentType: string;
  partSize: number;
  expectedParts: number;
  uploadId: string | null;
}

export interface StoredFinding {
  runId: string;
  fileId: string | null;
  rule: string;
  location: string;
}

export interface ProcessingOutcome {
  state: FileProcessingState;
  /** Bucket key holding the bytes the gateway serves; never disclosed to a client. */
  servedKey: string | null;
  publicPath: string | null;
  posterPath: string | null;
}

export interface EvidenceStore {
  createRun(input: CreateRunInput, id: string, identityId: string, createdAt: string): EvidenceRun;
  getRun(id: string): EvidenceRun | null;
  getRunByPublicId(publicId: string): EvidenceRun | null;
  listRuns(filter?: { project?: string; state?: EvidenceState }): EvidenceRun[];
  transitionRun(id: string, to: EvidenceState, at: string): EvidenceRun;
  /** Fixes the public id without exposing anything, so a comment can be rendered first. */
  reservePublicId(id: string, publicId: string): EvidenceRun;
  /** Renders the addresses a publication would create. Only for the prepare step. */
  previewFiles(id: string): EvidenceFile[];
  publishRun(id: string, publicId: string, input: PublishInput, at: string): EvidenceRun;
  setGithubCommentUrl(id: string, url: string): EvidenceRun;
  archiveRun(id: string, at: string): EvidenceRun;
  createFile(runId: string, fileId: string, record: CreateFileRecord, createdAt: string): EvidenceFile;
  getFile(fileId: string): EvidenceFile | null;
  findFileBySha(runId: string, sha256: string): EvidenceFile | null;
  listFiles(runId: string): EvidenceFile[];
  recordPart(fileId: string, part: UploadedPart, receivedAt: string): void;
  listParts(fileId: string): UploadedPart[];
  completeFile(fileId: string, at: string): void;
  setProcessingState(fileId: string, state: FileProcessingState): void;
  setProcessingOutcome(fileId: string, outcome: ProcessingOutcome): void;
  servedKeyFor(fileId: string): string | null;
  storedBytes(runId: string): number;
  addFindings(findings: StoredFinding[], createdAt: string): void;
  listFindings(runId: string): StoredFinding[];
  appendEvent(runId: string, eventType: string, actorId: string, createdAt: string, payload?: Record<string, unknown>): void;
  events(runId: string): Array<{ eventType: string; actorId: string; createdAt: string; payload: Record<string, unknown> }>;
  expiredDrafts(before: string): EvidenceRun[];
  uploadIdFor(fileId: string): string | null;
  close(): void;
}

interface RunRow {
  id: string; schema_version: number; public_id: string | null; project: string; repository: string;
  pull_request_number: number | null; commit_sha: string; environment: string; title: string;
  result: string; source: string; state: string; created_at: string; published_at: string | null;
  github_comment_url: string | null;
}

interface FileRow {
  id: string; run_id: string; kind: string; filename: string; caption: string; content_type: string;
  byte_size: number; sha256: string; primary_actor: string | null; processing_state: string;
  public_path: string | null; poster_path: string | null;
}

export interface StoreOptions {
  /** Base for `publicUrl` and `viewerUrl`; never a bucket address. */
  publicBaseUrl: string;
}

export function createEvidenceStore(path: string, options: StoreOptions): EvidenceStore {
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  runMigrations(sqlite);
  const base = options.publicBaseUrl.replace(/\/$/, "");

  const toRun = (row: RunRow): EvidenceRun => ({
    schemaVersion: evidenceSchemaVersion,
    id: row.id,
    publicId: row.public_id,
    project: row.project as EvidenceRun["project"],
    repository: row.repository,
    pullRequestNumber: row.pull_request_number,
    pullRequestUrl: pullRequestUrl(row.repository, row.pull_request_number),
    commitSha: row.commit_sha,
    environment: row.environment as EvidenceRun["environment"],
    title: row.title,
    result: row.result as EvidenceRun["result"],
    source: row.source as EvidenceRun["source"],
    createdAt: row.created_at,
    publishedAt: row.published_at,
    githubCommentUrl: row.github_comment_url,
    state: row.state as EvidenceState
  });

  const runOf = (fileId: string): RunRow | null =>
    (sqlite.prepare(`SELECT r.* FROM evidence_runs r
      JOIN evidence_files f ON f.run_id = r.id WHERE f.id = ?`).get(fileId) as RunRow | undefined) ?? null;

  /**
   * Public addresses only exist while the run is published. Every other state —
   * draft, processing, quarantined, archived — reports `null` so a caller can
   * never publish a link the gateway would refuse to serve.
   */
  const toFile = (row: FileRow, run: RunRow | null, assumePublished = false): EvidenceFile => {
    const reachable = (assumePublished || run?.state === "published") && run?.public_id != null;
    const actor = row.primary_actor ? JSON.parse(row.primary_actor) as PrimaryActor : undefined;
    return {
      id: row.id,
      runId: row.run_id,
      kind: row.kind as EvidenceKind,
      filename: row.filename,
      caption: row.caption,
      contentType: row.content_type,
      byteSize: row.byte_size,
      sha256: row.sha256,
      ...(actor ? { primaryActor: actor } : {}),
      publicUrl: reachable && row.public_path ? `${base}/e/${run!.public_id}/${row.public_path}` : null,
      viewerUrl: reachable ? `${base}/r/${run!.public_id}` : null,
      processingState: row.processing_state as FileProcessingState
    };
  };

  const requireRun = (id: string): RunRow => {
    const row = sqlite.prepare("SELECT * FROM evidence_runs WHERE id=?").get(id) as RunRow | undefined;
    if (!row) throw new Error(`evidence run not found: ${id}`);
    return row;
  };

  const store: EvidenceStore = {
    createRun(input, id, identityId, createdAt) {
      sqlite.prepare(`INSERT INTO evidence_runs(
        id, schema_version, public_id, project, repository, pull_request_number, commit_sha,
        environment, title, result, source, state, created_at, published_at, archived_at,
        github_comment_url, identity_id
      ) VALUES(?,?,NULL,?,?,?,?,?,?,?,?, 'draft', ?, NULL, NULL, NULL, ?)`).run(
        id, evidenceSchemaVersion, input.project, input.repository, input.pullRequestNumber,
        input.commitSha, input.environment, input.title, input.result, input.source, createdAt, identityId
      );
      return toRun(requireRun(id));
    },
    getRun(id) {
      const row = sqlite.prepare("SELECT * FROM evidence_runs WHERE id=?").get(id) as RunRow | undefined;
      return row ? toRun(row) : null;
    },
    getRunByPublicId(publicId) {
      const row = sqlite.prepare("SELECT * FROM evidence_runs WHERE public_id=?").get(publicId) as RunRow | undefined;
      return row ? toRun(row) : null;
    },
    listRuns(filter = {}) {
      const clauses: string[] = [];
      const values: unknown[] = [];
      if (filter.project) { clauses.push("project=?"); values.push(filter.project); }
      if (filter.state) { clauses.push("state=?"); values.push(filter.state); }
      const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
      return (sqlite.prepare(`SELECT * FROM evidence_runs${where} ORDER BY created_at DESC, id`).all(...values) as RunRow[])
        .map(toRun);
    },
    transitionRun(id, to, at) {
      const row = requireRun(id);
      assertRunTransition(row.state as EvidenceState, to);
      sqlite.prepare("UPDATE evidence_runs SET state=?, archived_at=CASE WHEN ?='archived' THEN ? ELSE archived_at END WHERE id=?")
        .run(to, to, at, id);
      return toRun(requireRun(id));
    },
    reservePublicId(id, publicId) {
      sqlite.prepare("UPDATE evidence_runs SET public_id=COALESCE(public_id, ?) WHERE id=?").run(publicId, id);
      return toRun(requireRun(id));
    },
    previewFiles(id) {
      const run = requireRun(id);
      return (sqlite.prepare("SELECT * FROM evidence_files WHERE run_id=? ORDER BY created_at, id").all(id) as FileRow[])
        .map((row) => toFile(row, run, true));
    },
    /**
     * Idempotent by design: republishing a run refreshes its pull request
     * details but keeps the public id and the original publication time, so an
     * existing link never changes underneath a comment that already carries it.
     */
    publishRun(id, publicId, input, at) {
      const row = requireRun(id);
      if (row.state !== "published") assertRunTransition(row.state as EvidenceState, "published");
      const apply = sqlite.transaction(() => {
        sqlite.prepare(`UPDATE evidence_runs SET state='published', public_id=COALESCE(public_id, ?),
          repository=?, pull_request_number=?, commit_sha=?, published_at=COALESCE(published_at, ?) WHERE id=?`)
          .run(publicId, input.repository, input.pullRequestNumber, input.commitSha, at, id);
      });
      apply();
      return toRun(requireRun(id));
    },
    setGithubCommentUrl(id, url) {
      sqlite.prepare("UPDATE evidence_runs SET github_comment_url=? WHERE id=?").run(url, id);
      return toRun(requireRun(id));
    },
    archiveRun(id, at) {
      return store.transitionRun(id, "archived", at);
    },
    createFile(runId, fileId, record, createdAt) {
      sqlite.prepare(`INSERT INTO evidence_files(
        id, run_id, kind, filename, caption, content_type, byte_size, sha256, primary_actor,
        processing_state, public_path, poster_path, upload_id, part_size, expected_parts,
        completed_at, created_at
      ) VALUES(?,?,?,?,?,?,?,?,?, 'pending', NULL, NULL, ?,?,?, NULL, ?)`).run(
        fileId, runId, record.kind, record.filename, record.caption, record.contentType,
        record.byteSize, record.sha256.toLowerCase(),
        record.primaryActor ? JSON.stringify(record.primaryActor) : null,
        record.uploadId, record.partSize, record.expectedParts, createdAt
      );
      return store.getFile(fileId)!;
    },
    getFile(fileId) {
      const row = sqlite.prepare("SELECT * FROM evidence_files WHERE id=?").get(fileId) as FileRow | undefined;
      return row ? toFile(row, runOf(fileId)) : null;
    },
    findFileBySha(runId, sha256) {
      const row = sqlite.prepare("SELECT * FROM evidence_files WHERE run_id=? AND sha256=?")
        .get(runId, sha256.toLowerCase()) as FileRow | undefined;
      return row ? toFile(row, requireRun(runId)) : null;
    },
    listFiles(runId) {
      const run = sqlite.prepare("SELECT * FROM evidence_runs WHERE id=?").get(runId) as RunRow | undefined;
      return (sqlite.prepare("SELECT * FROM evidence_files WHERE run_id=? ORDER BY created_at, id").all(runId) as FileRow[])
        .map((row) => toFile(row, run ?? null));
    },
    recordPart(fileId, part, receivedAt) {
      sqlite.prepare(`INSERT INTO evidence_file_parts(file_id, part_number, etag, byte_size, received_at)
        VALUES(?,?,?,?,?)
        ON CONFLICT(file_id, part_number) DO UPDATE SET etag=excluded.etag, byte_size=excluded.byte_size, received_at=excluded.received_at`)
        .run(fileId, part.partNumber, part.etag, part.byteSize, receivedAt);
    },
    listParts(fileId) {
      return (sqlite.prepare("SELECT part_number, etag, byte_size FROM evidence_file_parts WHERE file_id=? ORDER BY part_number")
        .all(fileId) as Array<{ part_number: number; etag: string; byte_size: number }>)
        .map((row) => ({ partNumber: row.part_number, etag: row.etag, byteSize: row.byte_size }));
    },
    completeFile(fileId, at) {
      sqlite.prepare("UPDATE evidence_files SET completed_at=? WHERE id=?").run(at, fileId);
    },
    setProcessingState(fileId, state) {
      sqlite.prepare("UPDATE evidence_files SET processing_state=? WHERE id=?").run(state, fileId);
    },
    setProcessingOutcome(fileId, outcome) {
      sqlite.prepare("UPDATE evidence_files SET processing_state=?, served_key=?, public_path=?, poster_path=? WHERE id=?")
        .run(outcome.state, outcome.servedKey, outcome.publicPath, outcome.posterPath, fileId);
    },
    servedKeyFor(fileId) {
      const row = sqlite.prepare("SELECT served_key FROM evidence_files WHERE id=?").get(fileId) as { served_key: string | null } | undefined;
      return row?.served_key ?? null;
    },
    storedBytes(runId) {
      const row = sqlite.prepare("SELECT COALESCE(SUM(byte_size),0) AS total FROM evidence_files WHERE run_id=?")
        .get(runId) as { total: number };
      return row.total;
    },
    addFindings(findings, createdAt) {
      const insert = sqlite.prepare("INSERT INTO evidence_findings(run_id, file_id, rule, location, created_at) VALUES(?,?,?,?,?)");
      const apply = sqlite.transaction(() => {
        for (const finding of findings) insert.run(finding.runId, finding.fileId, finding.rule, finding.location, createdAt);
      });
      apply();
    },
    listFindings(runId) {
      return (sqlite.prepare("SELECT run_id, file_id, rule, location FROM evidence_findings WHERE run_id=? ORDER BY id")
        .all(runId) as Array<{ run_id: string; file_id: string | null; rule: string; location: string }>)
        .map((row) => ({ runId: row.run_id, fileId: row.file_id, rule: row.rule, location: row.location }));
    },
    appendEvent(runId, eventType, actorId, createdAt, payload = {}) {
      sqlite.prepare("INSERT INTO evidence_events(run_id, event_type, actor_id, created_at, payload) VALUES(?,?,?,?,?)")
        .run(runId, eventType, actorId, createdAt, JSON.stringify(payload));
    },
    events(runId) {
      return (sqlite.prepare("SELECT event_type, actor_id, created_at, payload FROM evidence_events WHERE run_id=? ORDER BY id")
        .all(runId) as Array<{ event_type: string; actor_id: string; created_at: string; payload: string }>)
        .map((row) => ({
          eventType: row.event_type,
          actorId: row.actor_id,
          createdAt: row.created_at,
          payload: JSON.parse(row.payload) as Record<string, unknown>
        }));
    },
    expiredDrafts(before) {
      return (sqlite.prepare("SELECT * FROM evidence_runs WHERE state IN ('draft','processing') AND created_at < ? ORDER BY created_at")
        .all(before) as RunRow[]).map(toRun);
    },
    uploadIdFor(fileId) {
      const row = sqlite.prepare("SELECT upload_id FROM evidence_files WHERE id=?").get(fileId) as { upload_id: string | null } | undefined;
      return row?.upload_id ?? null;
    },
    close: () => sqlite.close()
  };
  return store;
}
