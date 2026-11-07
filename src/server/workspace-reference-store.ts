import { createHash, randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { WorkspaceEnvironment, WorkspaceProject, WorkspaceReferenceInput, WorkspaceSource } from "../shared/workspace.js";

export class WorkspaceReferenceStore {
  constructor(private readonly sqlite: Database.Database) {
    sqlite.exec(`CREATE TABLE IF NOT EXISTS workspace_references (
      id TEXT PRIMARY KEY, owner_source TEXT NOT NULL, owner_id TEXT NOT NULL, target TEXT NOT NULL,
      fingerprint TEXT NOT NULL, actor_id TEXT NOT NULL, created_at TEXT NOT NULL, owner_project TEXT, owner_environment TEXT,
      UNIQUE(owner_source,owner_id,fingerprint));
      CREATE INDEX IF NOT EXISTS workspace_reference_owner ON workspace_references(owner_source,owner_id);
      CREATE TABLE IF NOT EXISTS workspace_reference_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, reference_id TEXT NOT NULL, owner_source TEXT NOT NULL,
      owner_id TEXT NOT NULL, actor_id TEXT NOT NULL, created_at TEXT NOT NULL);`);
    const columns = new Set((sqlite.prepare("PRAGMA table_info(workspace_references)").all() as Array<{ name: string }>).map(row => row.name));
    for (const name of ["owner_project", "owner_environment"]) if (!columns.has(name)) sqlite.exec(`ALTER TABLE workspace_references ADD COLUMN ${name} TEXT`);
  }
  list(source: WorkspaceSource, id: string): Array<{ id: string; input: WorkspaceReferenceInput }> {
    const rows = this.sqlite.prepare("SELECT id,target FROM workspace_references WHERE owner_source=? AND owner_id=? ORDER BY created_at,id").all(source, id) as Array<{ id: string; target: string }>;
    return rows.map(row => ({ id: row.id, input: JSON.parse(row.target) as WorkspaceReferenceInput }));
  }
  attach(source: WorkspaceSource, ownerId: string, input: WorkspaceReferenceInput, actorId: string, now: string, scope: { project: WorkspaceProject; environment: WorkspaceEnvironment }) {
    const target = JSON.stringify(input); const fingerprint = createHash("sha256").update(target).digest("hex");
    this.sqlite.transaction(() => {
      const result = this.sqlite.prepare("INSERT INTO workspace_references(id,owner_source,owner_id,target,fingerprint,actor_id,created_at,owner_project,owner_environment) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_source,owner_id,fingerprint) DO NOTHING").run(randomUUID(), source, ownerId, target, fingerprint, actorId, now, scope.project, scope.environment);
      if (result.changes) {
        const row = this.sqlite.prepare("SELECT id FROM workspace_references WHERE owner_source=? AND owner_id=? AND fingerprint=?").get(source, ownerId, fingerprint) as { id: string };
        this.sqlite.prepare("INSERT INTO workspace_reference_events(reference_id,owner_source,owner_id,actor_id,created_at) VALUES(?,?,?,?,?)").run(row.id, source, ownerId, actorId, now);
      }
    }).immediate();
  }
  /** Scope metadata is copied from the verified immutable owner, never inferred from timestamps or SHA. */
  matchingEvidenceOwners(query: string, scopes: Array<{ project: string; environments: string[] }>, filter: { project?: string; environment?: string }): string[] {
    const active = scopes.filter(scope => scope.environments.length && (!filter.project || scope.project === filter.project));
    if (!active.length) return [];
    const values: unknown[] = [];
    const allowed = active.map(scope => {
      const environments = scope.environments.filter(environment => !filter.environment || environment === filter.environment);
      if (!environments.length) return "0";
      values.push(scope.project, ...environments);
      return `(owner_project=? AND owner_environment IN (${environments.map(() => "?").join(",")}))`;
    });
    return (this.sqlite.prepare(`SELECT DISTINCT owner_id FROM workspace_references WHERE owner_source='evidence-run'
      AND (${allowed.join(" OR ")}) AND instr(lower(target),lower(?))>0 ORDER BY owner_id LIMIT 1001`).all(...values, query) as Array<{ owner_id: string }>).map(row => row.owner_id);
  }
  events(source: WorkspaceSource, id: string) {
    return (this.sqlite.prepare("SELECT actor_id,created_at FROM workspace_reference_events WHERE owner_source=? AND owner_id=? ORDER BY id").all(source, id) as Array<{ actor_id: string; created_at: string }>).map(row => ({ type: "reference_attached", actor: row.actor_id, createdAt: row.created_at, payload: {} }));
  }
}
