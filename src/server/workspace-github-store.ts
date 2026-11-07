import type Database from "better-sqlite3";
import type { WorkspaceGithubFacts } from "../shared/workspace-github.js";
export interface StoredGithubSnapshot {
  facts: WorkspaceGithubFacts | null; status: "ready" | "partial" | "unavailable" | "denied";
  observedAt: string | null; lastAttemptAt: string; errorCode: string | null; retryAt: number;
}
/** Only sanitized display snapshots persist. Raw GitHub bodies/tokens never enter this table. */
export class WorkspaceGithubStore {
  constructor(private readonly sqlite: Database.Database) {
    sqlite.exec(`CREATE TABLE IF NOT EXISTS workspace_github_cache (
      url TEXT PRIMARY KEY, snapshot TEXT NOT NULL, attempted_at TEXT NOT NULL
    ); CREATE INDEX IF NOT EXISTS workspace_github_cache_attempted ON workspace_github_cache(attempted_at);`);
  }
  get(url: string): StoredGithubSnapshot | null {
    url = url.toLowerCase();
    const row = this.sqlite.prepare("SELECT snapshot FROM workspace_github_cache WHERE url=?").get(url) as { snapshot: string } | undefined;
    try { return row ? JSON.parse(row.snapshot) as StoredGithubSnapshot : null; } catch { return null; }
  }
  /** A known App denial invalidates old private facts, including nested closing-PR facts. */
  denyRepository(fullName: string, attemptedAt: string, retryAt: number) {
    const prefix = `https://github.com/${fullName.toLowerCase()}/`;
    const rows = this.sqlite.prepare("SELECT url,snapshot FROM workspace_github_cache").all() as Array<{ url: string; snapshot: string }>;
    this.sqlite.transaction(() => {
      for (const row of rows) {
        let snapshot: StoredGithubSnapshot; try { snapshot = JSON.parse(row.snapshot) as StoredGithubSnapshot; } catch { continue; }
        if (row.url.toLowerCase().startsWith(prefix)) snapshot = { facts: null, observedAt: null, lastAttemptAt: attemptedAt, status: "denied", errorCode: "github_access_denied", retryAt };
        else if (snapshot.facts) {
          const filtered = snapshot.facts.closingPullRequests.filter(item => !item.url.toLowerCase().startsWith(prefix));
          if (filtered.length === snapshot.facts.closingPullRequests.length) continue;
          snapshot = { ...snapshot, status: snapshot.status === "ready" ? "partial" : snapshot.status, facts: { ...snapshot.facts, closingPullRequests: filtered, closingPullRequestsComplete: false } };
        } else continue;
        this.sqlite.prepare("UPDATE workspace_github_cache SET snapshot=?,attempted_at=? WHERE url=?").run(JSON.stringify(snapshot), snapshot.lastAttemptAt, row.url);
      }
    }).immediate();
  }
  put(url: string, value: StoredGithubSnapshot) {
    url = url.toLowerCase();
    const json = JSON.stringify(value);
    if (Buffer.byteLength(json) > 64 * 1024) throw new Error("github_snapshot_too_large");
    this.sqlite.transaction(() => {
      this.sqlite.prepare("INSERT INTO workspace_github_cache(url,snapshot,attempted_at) VALUES(?,?,?) ON CONFLICT(url) DO UPDATE SET snapshot=excluded.snapshot,attempted_at=excluded.attempted_at").run(url, json, value.lastAttemptAt);
      this.sqlite.prepare("DELETE FROM workspace_github_cache WHERE url IN (SELECT url FROM workspace_github_cache ORDER BY attempted_at DESC,url LIMIT -1 OFFSET 1000)").run();
    }).immediate();
  }
}
