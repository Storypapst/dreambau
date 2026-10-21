import Database from "better-sqlite3";
import { createCollectorStore } from "./collector-store.js";
import { z } from "zod";
import { createHash, randomUUID } from "node:crypto";
import { createWorkStateAccess } from "./access.js";
import {
  checkpointSchema, internalGrantSchema, linksUpdateSchema, pullQuerySchema, repositoryGrantSchema,
  repositorySchema, repositorySnapshotSchema, scopeSchema, workItemSchema, WorkStateError,
  type CheckpointInput, type Facet, type PullQuery, type PullRequestSnapshot, type RepoScope,
  type RepositoryInput, type RepositorySnapshot, type WorkItemInput, type WorkItemLinkInput
} from "./model.js";

interface RepositoryRow {
  id: string; project: "oriso"; full_name: string; integration_branch: string; active: number;
  last_attempt_at: string | null; last_success_at: string | null; coverage: "complete" | "partial" | "unknown";
  error_code: string | null; covered_pages: number;
}
interface ItemRow { id: string; project: "oriso"; goal: string; owner: string | null; priority: "P0" | "P1" | "P2" | "P3" | null; state: string; version: number; created_at: string; updated_at: string }
interface LinkRow { repository_id: string; kind: WorkItemLinkInput["kind"]; number: number | null }
interface JsonRow { payload: string }

/** Own database, additive initialization; no registry/account tables or credentials. */
export function createWorkStateStore(path: string) {
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.transaction(() => sqlite.exec(`
    CREATE TABLE IF NOT EXISTS work_state_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS repositories (
      id TEXT PRIMARY KEY, project TEXT NOT NULL CHECK(project='oriso'), full_name TEXT NOT NULL,
      integration_branch TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
      last_attempt_at TEXT, last_success_at TEXT, coverage TEXT NOT NULL DEFAULT 'unknown', error_code TEXT,
      covered_pages INTEGER NOT NULL DEFAULT 0, UNIQUE(id,project)
    );
    CREATE TABLE IF NOT EXISTS repository_grants (
      repository_id TEXT NOT NULL, project TEXT NOT NULL, actor_id TEXT NOT NULL,
      PRIMARY KEY(repository_id,project,actor_id),
      FOREIGN KEY(repository_id,project) REFERENCES repositories(id,project)
    );
    CREATE TABLE IF NOT EXISTS internal_task_grants (project TEXT NOT NULL CHECK(project='oriso'), actor_id TEXT NOT NULL, PRIMARY KEY(project,actor_id));
    CREATE TABLE IF NOT EXISTS pull_requests (
      repository_id TEXT NOT NULL REFERENCES repositories(id), number INTEGER NOT NULL, payload TEXT NOT NULL,
      PRIMARY KEY(repository_id,number)
    );
    CREATE TABLE IF NOT EXISTS observations (
      repository_id TEXT NOT NULL, number INTEGER NOT NULL, facet TEXT NOT NULL, payload TEXT NOT NULL,
      PRIMARY KEY(repository_id,number,facet), FOREIGN KEY(repository_id,number) REFERENCES pull_requests(repository_id,number)
    );
    CREATE TABLE IF NOT EXISTS work_items (
      id TEXT PRIMARY KEY, project TEXT NOT NULL CHECK(project='oriso'), goal TEXT NOT NULL, owner TEXT, priority TEXT,
      state TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS work_item_links (
      item_id TEXT NOT NULL REFERENCES work_items(id), repository_id TEXT NOT NULL REFERENCES repositories(id),
      kind TEXT NOT NULL, number INTEGER, UNIQUE(item_id,repository_id,kind,number)
    );
    CREATE INDEX IF NOT EXISTS work_item_links_item ON work_item_links(item_id);
    CREATE TABLE IF NOT EXISTS checkpoints (
      item_id TEXT NOT NULL REFERENCES work_items(id), version INTEGER NOT NULL, author_id TEXT NOT NULL,
      created_at TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(item_id,version)
    );
    CREATE TABLE IF NOT EXISTS work_item_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT, item_id TEXT NOT NULL REFERENCES work_items(id), version INTEGER NOT NULL,
      kind TEXT NOT NULL, author_id TEXT NOT NULL, created_at TEXT NOT NULL, payload TEXT NOT NULL,
      UNIQUE(item_id,version)
    );
    INSERT OR IGNORE INTO work_state_migrations(version,applied_at) VALUES(1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
  `)).immediate();
  sqlite.transaction(() => {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS work_item_required_repositories (
        item_id TEXT NOT NULL REFERENCES work_items(id), repository_id TEXT NOT NULL REFERENCES repositories(id),
        PRIMARY KEY(item_id,repository_id)
      );
      CREATE TABLE IF NOT EXISTS work_item_required_internal (item_id TEXT PRIMARY KEY REFERENCES work_items(id));
      CREATE TABLE IF NOT EXISTS pull_request_history (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT, repository_id TEXT NOT NULL, number INTEGER NOT NULL,
        observed_at TEXT, recorded_at TEXT NOT NULL, origin TEXT NOT NULL, payload TEXT NOT NULL,
        FOREIGN KEY(repository_id,number) REFERENCES pull_requests(repository_id,number)
      );
      CREATE INDEX IF NOT EXISTS pull_request_history_pr ON pull_request_history(repository_id,number,sequence);
    `);
    if (!sqlite.prepare("SELECT 1 FROM work_state_migrations WHERE version=2").get()) {
      const requireRepo = sqlite.prepare("INSERT OR IGNORE INTO work_item_required_repositories(item_id,repository_id) VALUES(?,?)");
      const requireInternal = sqlite.prepare("INSERT OR IGNORE INTO work_item_required_internal(item_id) VALUES(?)");
      // V1 already retained all creation/link events. Restore their cumulative authority,
      // including links removed before this migration, rather than treating removal as declassification.
      for (const item of sqlite.prepare("SELECT id FROM work_items").all() as Array<{ id: string }>) {
        const current = sqlite.prepare("SELECT repository_id FROM work_item_links WHERE item_id=?").all(item.id) as Array<{ repository_id: string }>;
        if (!current.length) requireInternal.run(item.id);
        for (const link of current) requireRepo.run(item.id, link.repository_id);
        const events = sqlite.prepare("SELECT kind,payload FROM work_item_history WHERE item_id=? AND kind IN ('created','links_changed') ORDER BY version").all(item.id) as Array<JsonRow & { kind: string }>;
        for (const event of events) {
          const payload = JSON.parse(event.payload);
          const links = (event.kind === "created" ? payload.links : payload) as WorkItemLinkInput[];
          if (!links.length) requireInternal.run(item.id);
          for (const link of links) requireRepo.run(item.id, link.repositoryId);
        }
      }
      // Earlier binaries did not retain PR transitions. Preserve their current verified
      // baseline without inventing a source observation time or missing older transitions.
      const recordedAt = new Date().toISOString();
      sqlite.prepare(`INSERT INTO pull_request_history(repository_id,number,observed_at,recorded_at,origin,payload)
        SELECT repository_id,number,NULL,?,'migration_baseline',payload FROM pull_requests
        WHERE NOT EXISTS (SELECT 1 FROM pull_request_history h WHERE h.repository_id=pull_requests.repository_id AND h.number=pull_requests.number)`)
        .run(recordedAt);
      sqlite.prepare("INSERT INTO work_state_migrations(version,applied_at) VALUES(2,?)").run(recordedAt);
    }
  }).immediate();
  sqlite.transaction(() => {
    sqlite.exec(`CREATE TABLE IF NOT EXISTS checkpoint_receipts (
      actor_id TEXT NOT NULL, project TEXT NOT NULL, item_id TEXT NOT NULL REFERENCES work_items(id),
      key TEXT NOT NULL, request_hash TEXT NOT NULL, version INTEGER NOT NULL,
      PRIMARY KEY(actor_id,project,item_id,key));
      INSERT OR IGNORE INTO work_state_migrations(version,applied_at) VALUES(3,strftime('%Y-%m-%dT%H:%M:%fZ','now'));`);
  }).immediate();
  const access = createWorkStateAccess(sqlite);
  const repository = (id: string) => sqlite.prepare("SELECT * FROM repositories WHERE id=?").get(id) as RepositoryRow | undefined;
  function listRepositoriesInTransaction(scope: RepoScope) {
    const parsed = scopeSchema.parse(scope);
    return (sqlite.prepare("SELECT * FROM repositories WHERE project=? ORDER BY full_name,id").all(parsed.project) as RepositoryRow[])
      .filter((row) => access.repositoryAllowed(parsed, row.id))
      .map((row) => ({ id: row.id, project: row.project, fullName: row.full_name, url: `https://github.com/${row.full_name}`, integrationBranch: row.integration_branch,
        active: Boolean(row.active), lastAttemptAt: row.last_attempt_at, lastSuccessAt: row.last_success_at, coverage: row.coverage, errorCode: row.error_code, coveredPages: row.covered_pages }));
  }
  function readItem(scope: RepoScope, id: string) {
    access.assertItem(scope, id);
    const row = sqlite.prepare("SELECT * FROM work_items WHERE id=?").get(id) as ItemRow;
    const links = (sqlite.prepare("SELECT repository_id,kind,number FROM work_item_links WHERE item_id=? ORDER BY rowid").all(id) as LinkRow[])
      .map((link) => {
        const repo = repository(link.repository_id)!;
        return { repositoryId: link.repository_id, kind: link.kind, ...(link.number === null ? {} : { number: link.number }),
          url: `https://github.com/${repo.full_name}${link.kind === "repository" ? "" : `/${link.kind === "pull" ? "pull" : "issues"}/${link.number}`}` };
      });
    const checkpointRow = sqlite.prepare("SELECT payload FROM checkpoints WHERE item_id=? ORDER BY version DESC LIMIT 1").get(id) as JsonRow | undefined;
    const history = (sqlite.prepare("SELECT version,kind,author_id,created_at FROM work_item_history WHERE item_id=? ORDER BY version").all(id) as Array<{ version: number; kind: string; author_id: string; created_at: string }>)
      .map((event) => ({ version: event.version, kind: event.kind, authorId: event.author_id, createdAt: event.created_at }));
    return { id: row.id, project: row.project, goal: row.goal, owner: row.owner, priority: row.priority, state: row.state, version: row.version, createdAt: row.created_at, updatedAt: row.updated_at,
      links, checkpoint: checkpointRow ? JSON.parse(checkpointRow.payload) as Omit<CheckpointInput, "expectedVersion"> & { authorId: string; version: number; createdAt: string } : null, history };
  }
  function setLinks(id: string, links: WorkItemLinkInput[]) {
    if (!links.length) sqlite.prepare("INSERT OR IGNORE INTO work_item_required_internal(item_id) VALUES(?)").run(id);
    const retainScope = sqlite.prepare("INSERT OR IGNORE INTO work_item_required_repositories(item_id,repository_id) VALUES(?,?)");
    for (const link of links) retainScope.run(id, link.repositoryId);
    sqlite.prepare("DELETE FROM work_item_links WHERE item_id=?").run(id);
    const insert = sqlite.prepare("INSERT INTO work_item_links(item_id,repository_id,kind,number) VALUES(?,?,?,?)");
    const seen = new Set<string>();
    for (const link of links) {
      const key = JSON.stringify(link);
      if (seen.has(key)) continue;
      seen.add(key); insert.run(id, link.repositoryId, link.kind, link.number ?? null);
    }
  }
  function history(id: string, version: number, kind: string, actorId: string, at: string, payload: unknown) {
    sqlite.prepare("INSERT INTO work_item_history(item_id,version,kind,author_id,created_at,payload) VALUES(?,?,?,?,?,?)").run(id, version, kind, actorId, at, JSON.stringify(payload));
  }
  function assertExpectedVersion(input: unknown, actual: number) {
    const version = input && typeof input === "object" && "expectedVersion" in input ? input.expectedVersion : undefined;
    if (!Number.isInteger(version) || version !== actual) throw new WorkStateError(409, "version_conflict");
  }
  function currentVersion(id: string) { return (sqlite.prepare("SELECT version FROM work_items WHERE id=?").get(id) as { version: number }).version; }

  function writeCheckpoint(scope: RepoScope, id: string, input: unknown) {
      return sqlite.transaction(() => {
        const parsed = access.assertItem(scope, id), version = currentVersion(id);
        assertExpectedVersion(input, version);
        const { expectedVersion: _expected, ...value } = checkpointSchema.parse(input);
        const at = new Date().toISOString(), checkpoint = { ...value, version: version + 1, authorId: parsed.actorId, createdAt: at };
        sqlite.prepare("UPDATE work_items SET version=version+1,updated_at=? WHERE id=? AND version=?").run(at, id, version);
        sqlite.prepare("INSERT INTO checkpoints(item_id,version,author_id,created_at,payload) VALUES(?,?,?,?,?)").run(id, version + 1, parsed.actorId, at, JSON.stringify(checkpoint));
        history(id, version + 1, "checkpoint", parsed.actorId, at, checkpoint);
        return readItem(parsed, id);
      }).immediate();
    }
  const collector = createCollectorStore(sqlite, (scope, ids) => access.assertRepositories(scope, ids));
  return {
    ...collector,
    commitSync(token: string, snapshot: RepositorySnapshot, now = Date.now()) {
      return collector.commitSnapshot(token, snapshot, now, () => this.applyRepositorySnapshot(snapshot));
    },
    close() { if (sqlite.open) sqlite.close(); },
    /** Service-owner configuration only. Never expose these methods through a human router. */
    configureRepository(input: RepositoryInput) {
      const value = repositorySchema.parse(input);
      sqlite.transaction(() => {
        const existing = repository(value.id);
        if (existing && existing.project !== value.project) throw new WorkStateError(400, "repository_project_immutable");
        sqlite.prepare(`INSERT INTO repositories(id,project,full_name,integration_branch,active) VALUES(?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET full_name=excluded.full_name,integration_branch=excluded.integration_branch,active=excluded.active`)
          .run(value.id, value.project, value.fullName, value.integrationBranch, Number(value.active));
      }).immediate();
    },
    setRepositoryGrant(input: unknown) {
      const value = repositoryGrantSchema.parse(input);
      sqlite.transaction(() => {
        const repo = repository(value.repositoryId);
        if (!repo || repo.project !== value.project) throw new WorkStateError(403, "scope_denied");
        if (value.allowed) sqlite.prepare("INSERT OR IGNORE INTO repository_grants(repository_id,project,actor_id) VALUES(?,?,?)").run(value.repositoryId, value.project, value.actorId);
        else sqlite.prepare("DELETE FROM repository_grants WHERE repository_id=? AND project=? AND actor_id=?").run(value.repositoryId, value.project, value.actorId);
      }).immediate();
    },
    setInternalTaskGrant(input: unknown) {
      const value = internalGrantSchema.parse(input);
      if (value.allowed) sqlite.prepare("INSERT OR IGNORE INTO internal_task_grants(project,actor_id) VALUES(?,?)").run(value.project, value.actorId);
      else sqlite.prepare("DELETE FROM internal_task_grants WHERE project=? AND actor_id=?").run(value.project, value.actorId);
    },
    readSnapshot<T>(read: () => T): T { return sqlite.transaction(read)(); },
    getPullRequest(scope: RepoScope, repositoryId: string, inputNumber: number) {
      return sqlite.transaction(() => {
        const parsed = scopeSchema.parse(scope);
        access.assertRepositories(parsed, [repositoryId]);
        const number = z.number().int().positive().parse(inputNumber);
        const row = sqlite.prepare("SELECT payload FROM pull_requests WHERE repository_id=? AND number=?").get(repositoryId, number) as JsonRow | undefined;
        if (!row) throw new WorkStateError(404, "pull_not_found");
        const core = JSON.parse(row.payload) as Omit<PullRequestSnapshot, "facets">;
        const facets: PullRequestSnapshot["facets"] = {};
        for (const facet of sqlite.prepare("SELECT facet,payload FROM observations WHERE repository_id=? AND number=?").all(repositoryId, number) as Array<JsonRow & {facet:keyof typeof facets}>) facets[facet.facet]=JSON.parse(facet.payload) as Facet;
        return {...core, repositoryId, facets};
      })();
    },
    listRepositories(scope: RepoScope) { return sqlite.transaction(() => listRepositoriesInTransaction(scope))(); },
    applyRepositorySnapshot(input: RepositorySnapshot) {
      const snapshot = repositorySnapshotSchema.parse(input);
      sqlite.transaction(() => {
        const repo = repository(snapshot.repositoryId);
        if (!repo) throw new WorkStateError(400, "repository_not_configured");
        if (repo.full_name !== snapshot.fullName) throw new WorkStateError(400, "repository_name_mismatch");
        // A stale attempt must not overwrite a later observation or its error metadata.
        if (repo.last_attempt_at && Date.parse(snapshot.collectedAt) < Date.parse(repo.last_attempt_at)) return;
        for (const pr of snapshot.pullRequests) {
          if (pr.url !== `https://github.com/${repo.full_name}/pull/${pr.number}`) throw new WorkStateError(400, "pull_request_url_mismatch");
          const old = sqlite.prepare("SELECT payload FROM pull_requests WHERE repository_id=? AND number=?").get(repo.id, pr.number) as JsonRow | undefined;
          // An interrupted inventory does not confirm changed core PR fields.
          if (!snapshot.complete && !old) continue;
          if (snapshot.complete) {
            const { facets: _facets, ...core } = pr;
            sqlite.prepare("INSERT INTO pull_requests(repository_id,number,payload) VALUES(?,?,?) ON CONFLICT(repository_id,number) DO UPDATE SET payload=excluded.payload").run(repo.id, pr.number, JSON.stringify(core));
            const previous = old ? JSON.parse(old.payload) as Omit<PullRequestSnapshot, "facets"> : undefined;
            if (!previous || previous.lifecycle !== core.lifecycle || previous.base !== core.base || previous.head !== core.head || previous.headSha !== core.headSha || previous.baseSha !== core.baseSha) {
              sqlite.prepare("INSERT INTO pull_request_history(repository_id,number,observed_at,recorded_at,origin,payload) VALUES(?,?,?,?,?,?)")
                .run(repo.id, pr.number, snapshot.collectedAt, new Date().toISOString(), "github", JSON.stringify(core));
            }
          }
          for (const [name, incoming] of Object.entries(pr.facets)) {
            if (!incoming) continue;
            const priorRow = sqlite.prepare("SELECT payload FROM observations WHERE repository_id=? AND number=? AND facet=?").get(repo.id, pr.number, name) as JsonRow | undefined;
            const prior = priorRow ? JSON.parse(priorRow.payload) as Facet : undefined;
            const attemptedAt = incoming.lastAttemptAt ?? snapshot.collectedAt;
            if (prior?.lastAttemptAt && Date.parse(attemptedAt) < Date.parse(prior.lastAttemptAt)) continue;
            const confirmed = snapshot.complete && incoming.coverage === "complete" && !incoming.errorCode;
            const facet: Facet = confirmed ? incoming : {
              source: "github", value: prior?.value ?? null, sourceRevision: prior?.sourceRevision ?? null, observedAt: prior?.observedAt ?? null,
              lastSuccessAt: prior?.lastSuccessAt ?? null, lastAttemptAt: attemptedAt,
              coverage: incoming.coverage === "unknown" ? "unknown" : "partial", errorCode: incoming.errorCode ?? snapshot.errorCode ?? "snapshot_partial"
            };
            sqlite.prepare("INSERT INTO observations(repository_id,number,facet,payload) VALUES(?,?,?,?) ON CONFLICT(repository_id,number,facet) DO UPDATE SET payload=excluded.payload").run(repo.id, pr.number, name, JSON.stringify(facet));
          }
        }
        // Missing PRs never imply closed or merged; only explicit source observations do.
        sqlite.prepare(`UPDATE repositories SET last_attempt_at=?, last_success_at=CASE WHEN ? THEN ? ELSE last_success_at END,
          coverage=?, error_code=?, covered_pages=? WHERE id=?`).run(snapshot.collectedAt, Number(snapshot.complete), snapshot.collectedAt,
          snapshot.complete ? "complete" : "partial", snapshot.errorCode ?? (snapshot.complete ? null : "snapshot_partial"), snapshot.coveredPages, repo.id);
      }).immediate();
    },
    listPullRequests(scope: RepoScope, input: PullQuery = {}) {
      return sqlite.transaction(() => {
        const parsedScope = scopeSchema.parse(scope); const query = pullQuerySchema.parse(input);
        if (query.repositoryId) access.assertRepositories(parsedScope, [query.repositoryId]);
        const repos = listRepositoriesInTransaction(parsedScope).filter((repo) => !query.repositoryId || repo.id === query.repositoryId);
        const allowed = new Set(repos.map((repo) => repo.id));
        const rows = sqlite.prepare("SELECT repository_id,number,payload FROM pull_requests ORDER BY repository_id,number").all() as Array<JsonRow & { repository_id: string; number: number }>;
        const all = rows.filter((row) => allowed.has(row.repository_id)).map((row) => {
          const core = JSON.parse(row.payload) as Omit<PullRequestSnapshot, "facets">;
          const facets: PullRequestSnapshot["facets"] = {};
          for (const facet of sqlite.prepare("SELECT facet,payload FROM observations WHERE repository_id=? AND number=?").all(row.repository_id, row.number) as Array<JsonRow & { facet: keyof typeof facets }>) facets[facet.facet] = JSON.parse(facet.payload) as Facet;
          return { ...core, repositoryId: row.repository_id, facets };
        }).filter((pr) => !query.lifecycle || pr.lifecycle === query.lifecycle);
        const items = all.slice(query.cursor, query.cursor + query.limit);
        return { items, nextCursor: query.cursor + items.length < all.length ? query.cursor + items.length : null,
          coverage: !repos.length || repos.some((repo) => repo.coverage === "unknown") ? "unknown" : repos.every((repo) => repo.coverage === "complete") ? "complete" : "partial",
          dataAsOf: repos.length && repos.every((repo) => repo.lastSuccessAt) ? repos.map((repo) => repo.lastSuccessAt!).sort()[0] : null,
          repositoryErrors: repos.filter((repo) => repo.errorCode).map((repo) => ({ repositoryId: repo.id, errorCode: repo.errorCode })), truncatedFields: [] };
      })();
    },
    listPullRequestHistory(scope: RepoScope, repositoryId: string, inputNumber: number) {
      return sqlite.transaction(() => {
        access.assertRepositories(scope, [repositoryId]);
        const number = z.number().int().positive().parse(inputNumber);
        const rows = sqlite.prepare("SELECT sequence,observed_at,recorded_at,origin,payload FROM pull_request_history WHERE repository_id=? AND number=? ORDER BY sequence")
          .all(repositoryId, number) as Array<JsonRow & { sequence: number; observed_at: string | null; recorded_at: string; origin: "github" | "migration_baseline" }>;
        return rows.map((row) => ({ ...JSON.parse(row.payload) as Omit<PullRequestSnapshot, "facets">, repositoryId, sequence: row.sequence,
          observedAt: row.observed_at, recordedAt: row.recorded_at, origin: row.origin }));
      })();
    },
    createWorkItem(scope: RepoScope, input: WorkItemInput) {
      const value = workItemSchema.parse(input);
      return sqlite.transaction(() => {
        const parsed = access.assertRepositories(scope, value.links.map((link) => link.repositoryId));
        const id = randomUUID(), at = new Date().toISOString();
        sqlite.prepare("INSERT INTO work_items(id,project,goal,owner,priority,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").run(id, parsed.project, value.goal, value.owner, value.priority, value.state, at, at);
        setLinks(id, value.links); history(id, 1, "created", parsed.actorId, at, value);
        return readItem(parsed, id);
      }).immediate();
    },
    listWorkItems(scope: RepoScope) {
      return sqlite.transaction(() => {
        const parsed = scopeSchema.parse(scope);
        const rows = sqlite.prepare("SELECT id FROM work_items WHERE project=? ORDER BY created_at,id").all(parsed.project) as Array<{ id: string }>;
        return rows.filter((row) => access.itemAllowed(parsed, row.id)).map((row) => readItem(parsed, row.id));
      })();
    },
    getWorkItem(scope: RepoScope, id: string) { return sqlite.transaction(() => readItem(scope, id))(); },
    writeCheckpoint,
    writeCheckpointOnce(scope: RepoScope, id: string, input: unknown, key: string) {
      return sqlite.transaction(() => {
        access.assertItem(scope,id);
        z.string().regex(/^[A-Za-z0-9._-]{1,200}$/).parse(key);
        const parsed=checkpointSchema.parse(input);
        const hash=createHash("sha256").update(JSON.stringify(parsed)).digest("hex");
        const prior=sqlite.prepare("SELECT request_hash,version FROM checkpoint_receipts WHERE actor_id=? AND project=? AND item_id=? AND key=?").get(scope.actorId,scope.project,id,key) as {request_hash:string;version:number}|undefined;
        if(prior){if(prior.request_hash!==hash)throw new WorkStateError(409,"idempotency_conflict");return {id,version:prior.version};}
        const result=writeCheckpoint(scope,id,parsed);
        sqlite.prepare("INSERT INTO checkpoint_receipts(actor_id,project,item_id,key,request_hash,version) VALUES(?,?,?,?,?,?)").run(scope.actorId,scope.project,id,key,hash,result.version);
        return {id,version:result.version};
      }).immediate();
    },
    getCheckpointReceipt(scope: RepoScope,id:string,key:string){
      return sqlite.transaction(()=>{access.assertItem(scope,id);const row=sqlite.prepare("SELECT version FROM checkpoint_receipts WHERE actor_id=? AND project=? AND item_id=? AND key=?").get(scope.actorId,scope.project,id,key) as {version:number}|undefined;
      if(!row)throw new WorkStateError(404,"receipt_not_found");return {id,version:row.version};})();
    },
    updateWorkItemLinks(scope: RepoScope, id: string, input: unknown) {
      return sqlite.transaction(() => {
        const parsed = access.assertItem(scope, id), version = currentVersion(id);
        assertExpectedVersion(input, version);
        const value = linksUpdateSchema.parse(input);
        access.assertRepositories(parsed, value.links.map((link) => link.repositoryId));
        const at = new Date().toISOString(); setLinks(id, value.links);
        sqlite.prepare("UPDATE work_items SET version=version+1,updated_at=? WHERE id=? AND version=?").run(at, id, version);
        history(id, version + 1, "links_changed", parsed.actorId, at, value.links);
        return readItem(parsed, id);
      }).immediate();
    }
  };
}
export type WorkStateStore = ReturnType<typeof createWorkStateStore>;
