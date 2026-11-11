import type Database from "better-sqlite3";

export interface WorkspaceAccountLink {
  runId: string;
  project: "oriso" | "orimo" | "dreambau";
  environment: "local" | "pre-dev" | "dev" | "production-test";
  email: string;
  actorId: string;
  createdAt: string;
}

type LinkRow = { run_id: string; project: WorkspaceAccountLink["project"]; environment: WorkspaceAccountLink["environment"];
  email: string; actor_id: string; created_at: string };
const normalize = (email: string) => email.trim().toLowerCase();
const view = (row: LinkRow): WorkspaceAccountLink => ({ runId: row.run_id, project: row.project, environment: row.environment,
  email: row.email, actorId: row.actor_id, createdAt: row.created_at });

export class WorkspaceAccountLinks {
  constructor(private readonly sqlite: Database.Database) {
    sqlite.exec(`CREATE TABLE IF NOT EXISTS workspace_account_links (
      run_id TEXT NOT NULL, project TEXT NOT NULL, environment TEXT NOT NULL,
      email TEXT NOT NULL, actor_id TEXT NOT NULL, created_at TEXT NOT NULL,
      PRIMARY KEY(run_id,email)
    ); CREATE INDEX IF NOT EXISTS workspace_account_links_email ON workspace_account_links(email);`);
  }
  attach(runId: string, project: WorkspaceAccountLink["project"], environment: WorkspaceAccountLink["environment"],
    email: string, actorId: string, createdAt: string): WorkspaceAccountLink {
    const normalized = normalize(email);
    this.sqlite.prepare(`INSERT INTO workspace_account_links(run_id,project,environment,email,actor_id,created_at)
      VALUES(?,?,?,?,?,?) ON CONFLICT(run_id,email) DO NOTHING`).run(runId, project, environment, normalized, actorId, createdAt);
    return this.forRun(runId).find((item) => item.email === normalized)!;
  }
  detach(runId: string, email: string): boolean {
    return this.sqlite.prepare("DELETE FROM workspace_account_links WHERE run_id=? AND email=?").run(runId, normalize(email)).changes > 0;
  }
  forRun(runId: string): WorkspaceAccountLink[] {
    return (this.sqlite.prepare("SELECT * FROM workspace_account_links WHERE run_id=? ORDER BY email").all(runId) as LinkRow[]).map(view);
  }
  forEmail(email: string): WorkspaceAccountLink[] {
    return (this.sqlite.prepare("SELECT * FROM workspace_account_links WHERE email=? ORDER BY created_at DESC,run_id").all(normalize(email)) as LinkRow[]).map(view);
  }
}
