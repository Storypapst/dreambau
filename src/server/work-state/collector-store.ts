import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import {
  WorkStateError,
  type PullRequestSnapshot,
  type RepoScope,
  type RepositorySnapshot,
} from "./model.js";
interface RepositoryRow {
  id: string;
  project: "oriso";
  full_name: string;
  integration_branch: string;
  active: number;
  last_success_at: string | null;
}
interface JsonRow {
  payload: string;
}
/** Additive collector tables; no grants, work notes or PR history are rewritten. */
export function createCollectorStore(
  sqlite: Database.Database,
  assertRepositories: (scope: RepoScope, ids: string[]) => unknown,
) {
  const repository = (id: string) =>
    sqlite.prepare("SELECT * FROM repositories WHERE id=?").get(id) as
      | RepositoryRow
      | undefined;
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS event_inbox(delivery_id TEXT PRIMARY KEY, repository_id TEXT NOT NULL REFERENCES repositories(id), event TEXT NOT NULL, received_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sync_jobs(repository_id TEXT PRIMARY KEY REFERENCES repositories(id), generation INTEGER NOT NULL DEFAULT 1, claimed_generation INTEGER, token TEXT, lease_until INTEGER, due_at INTEGER NOT NULL, checkpoint TEXT, error_code TEXT);
    CREATE TABLE IF NOT EXISTS sync_targets(repository_id TEXT NOT NULL REFERENCES repositories(id), number INTEGER NOT NULL, generation INTEGER NOT NULL, PRIMARY KEY(repository_id,number));
    CREATE TABLE IF NOT EXISTS sync_runs(id TEXT PRIMARY KEY, repository_id TEXT NOT NULL, started_at INTEGER NOT NULL, finished_at INTEGER, error_code TEXT);
    CREATE TABLE IF NOT EXISTS github_cache(key TEXT PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sync_schedule(repository_id TEXT PRIMARY KEY, reconciled_at INTEGER NOT NULL, inventory_at INTEGER NOT NULL);
    INSERT OR IGNORE INTO work_state_migrations(version,applied_at) VALUES(3,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
  `);
  sqlite
    .transaction(() => {
      const columns = sqlite.prepare("PRAGMA table_info(sync_jobs)").all() as {
        name: string;
      }[];
      if (!columns.some((column) => column.name === "checkpoint_generation"))
        sqlite.exec(
          "ALTER TABLE sync_jobs ADD COLUMN checkpoint_generation INTEGER",
        );
      sqlite
        .prepare(
          "INSERT OR IGNORE INTO work_state_migrations(version,applied_at) VALUES(4,?)",
        )
        .run(new Date().toISOString());
    })
    .immediate();
  function enqueue(repositoryId: string, now: number) {
    if (!repository(repositoryId)?.active)
      throw new WorkStateError(400, "repository_not_active");
    sqlite
      .prepare(
        `INSERT INTO sync_jobs(repository_id,due_at) VALUES(?,?) ON CONFLICT(repository_id) DO UPDATE SET generation=generation+1,due_at=CASE WHEN error_code='rate_limited' THEN due_at ELSE MIN(due_at,excluded.due_at) END`,
      )
      .run(repositoryId, now);
  }
  return {
    collectorRepositories() {
      return (
        sqlite
          .prepare("SELECT * FROM repositories WHERE active=1")
          .all() as RepositoryRow[]
      ).map((r) => ({
        id: r.id,
        project: r.project,
        fullName: r.full_name,
        integrationBranch: r.integration_branch,
        active: true,
      }));
    },
    collectorInitialized(repositoryId: string) {
      return Boolean(repository(repositoryId)?.last_success_at);
    },
    collectorPulls(repositoryId: string) {
      return (
        sqlite
          .prepare("SELECT payload FROM pull_requests WHERE repository_id=?")
          .all(repositoryId) as JsonRow[]
      ).map((r) => JSON.parse(r.payload) as PullRequestSnapshot);
    },
    collectorLinks(repositoryId: string, initial: boolean) {
      return (
        sqlite
          .prepare(
            `SELECT DISTINCT l.number FROM work_item_links l JOIN work_items w ON w.id=l.item_id WHERE l.repository_id=? AND l.kind='pull' AND (? OR w.state!='done')`,
          )
          .all(repositoryId, Number(initial)) as { number: number }[]
      ).map((r) => r.number);
    },
    cacheGet(key: string) {
      const row = sqlite
        .prepare("SELECT payload FROM github_cache WHERE key=?")
        .get(key) as JsonRow | undefined;
      return row ? JSON.parse(row.payload) : undefined;
    },
    cachePut(key: string, value: unknown) {
      sqlite
        .prepare(
          "INSERT INTO github_cache VALUES(?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload",
        )
        .run(key, JSON.stringify(value));
    },
    enqueueSync(repositoryId: string, now = Date.now()) {
      sqlite.transaction(() => enqueue(repositoryId, now)).immediate();
    },
    enqueueScopedSync(
      scope: RepoScope,
      repositoryId: string,
      now = Date.now(),
    ) {
      sqlite
        .transaction(() => {
          assertRepositories(scope, [repositoryId]);
          enqueue(repositoryId, now);
        })
        .immediate();
    },
    enqueueScopedPull(
      scope: RepoScope,
      repositoryId: string,
      number: number,
      now = Date.now(),
    ) {
      if (!Number.isSafeInteger(number) || number < 1)
        throw new WorkStateError(400, "invalid_pull_number");
      sqlite
        .transaction(() => {
          assertRepositories(scope, [repositoryId]);
          enqueue(repositoryId, now);
          sqlite
            .prepare(
              `INSERT INTO sync_targets SELECT repository_id,?,generation FROM sync_jobs WHERE repository_id=?
          ON CONFLICT(repository_id,number) DO UPDATE SET generation=excluded.generation`,
            )
            .run(number, repositoryId);
        })
        .immediate();
    },
    acceptEvent(
      deliveryId: string,
      repositoryId: string,
      event: string,
      now = Date.now(),
      targets: number[] = [],
    ) {
      return sqlite
        .transaction(() => {
          if (!repository(repositoryId)?.active)
            throw new WorkStateError(400, "repository_not_active");
          const result = sqlite
            .prepare("INSERT OR IGNORE INTO event_inbox VALUES(?,?,?,?)")
            .run(deliveryId, repositoryId, event, now);
          if (result.changes) {
            enqueue(repositoryId, now);
            for (const number of targets) {
              if (!Number.isSafeInteger(number) || number < 1) continue;
              sqlite
                .prepare(
                  `INSERT INTO sync_targets SELECT repository_id,?,generation FROM sync_jobs WHERE repository_id=?
                ON CONFLICT(repository_id,number) DO UPDATE SET generation=excluded.generation`,
                )
                .run(number, repositoryId);
            }
          }
          return deliveryId;
        })
        .immediate();
    },
    claimSync(now = Date.now(), leaseMs = 70_000) {
      return sqlite
        .transaction(() => {
          sqlite
            .prepare(
              "DELETE FROM sync_targets WHERE repository_id IN (SELECT id FROM repositories WHERE active=0)",
            )
            .run();
          sqlite
            .prepare(
              "DELETE FROM sync_jobs WHERE repository_id IN (SELECT id FROM repositories WHERE active=0)",
            )
            .run();
          const row = sqlite
            .prepare(
              "SELECT repository_id,generation,checkpoint,checkpoint_generation FROM sync_jobs WHERE due_at<=? AND (token IS NULL OR lease_until<=?) ORDER BY due_at,repository_id LIMIT 1",
            )
            .get(now, now) as
            | {
                repository_id: string;
                generation: number;
                checkpoint: string | null;
                checkpoint_generation: number | null;
              }
            | undefined;
          if (!row) return null;
          const token = randomUUID();
          sqlite
            .prepare(
              "UPDATE sync_jobs SET token=?,lease_until=?,claimed_generation=generation WHERE repository_id=?",
            )
            .run(token, now + leaseMs, row.repository_id);
          sqlite
            .prepare(
              "INSERT INTO sync_runs(id,repository_id,started_at) VALUES(?,?,?)",
            )
            .run(token, row.repository_id, now);
          return {
            repositoryId: row.repository_id,
            token,
            generation: row.generation,
            targets: (
              sqlite
                .prepare(
                  "SELECT number FROM sync_targets WHERE repository_id=? AND generation<=? ORDER BY number",
                )
                .all(row.repository_id, row.generation) as { number: number }[]
            ).map((row) => row.number),
            checkpoint:
              row.checkpoint && row.checkpoint_generation === row.generation
                ? JSON.parse(row.checkpoint)
                : undefined,
          };
        })
        .immediate();
    },
    saveSyncCheckpoint(token: string, checkpoint: unknown, now = Date.now()) {
      return (
        sqlite
          .prepare(
            "UPDATE sync_jobs SET checkpoint=?,checkpoint_generation=claimed_generation WHERE token=? AND lease_until>?",
          )
          .run(JSON.stringify(checkpoint), token, now).changes === 1
      );
    },
    commitSnapshot(
      token: string,
      snapshot: RepositorySnapshot,
      now: number,
      apply: () => void,
    ) {
      return sqlite
        .transaction(() => {
          const lease = sqlite
            .prepare(
              "SELECT 1 FROM sync_jobs WHERE repository_id=? AND token=? AND lease_until>?",
            )
            .get(snapshot.repositoryId, token, now);
          if (!lease || !repository(snapshot.repositoryId)?.active)
            return false;
          apply();
          return true;
        })
        .immediate();
    },
    finishSync(
      token: string,
      options: {
        now?: number;
        dueAt?: number;
        checkpoint?: unknown;
        errorCode?: string;
      } = {},
    ) {
      const now = options.now ?? Date.now();
      return sqlite
        .transaction(() => {
          const row = sqlite
            .prepare(
              "SELECT repository_id,generation,claimed_generation FROM sync_jobs WHERE token=? AND lease_until>?",
            )
            .get(token, now) as
            | {
                repository_id: string;
                generation: number;
                claimed_generation: number;
              }
            | undefined;
          if (!row) return false;
          sqlite
            .prepare(
              "UPDATE sync_runs SET finished_at=?,error_code=? WHERE id=?",
            )
            .run(now, options.errorCode ?? null, token);
          if (options.dueAt === undefined)
            sqlite
              .prepare(
                "DELETE FROM sync_targets WHERE repository_id=? AND generation<=?",
              )
              .run(row.repository_id, row.claimed_generation);
          if (
            options.dueAt !== undefined ||
            row.generation !== row.claimed_generation
          )
            sqlite
              .prepare(
                "UPDATE sync_jobs SET token=NULL,lease_until=NULL,due_at=?,checkpoint=?,checkpoint_generation=?,error_code=? WHERE token=?",
              )
              .run(
                row.generation !== row.claimed_generation &&
                  options.errorCode !== "rate_limited"
                  ? now
                  : options.dueAt,
                row.generation === row.claimed_generation && options.checkpoint
                  ? JSON.stringify(options.checkpoint)
                  : null,
                row.generation === row.claimed_generation && options.checkpoint
                  ? row.claimed_generation
                  : null,
                options.errorCode ?? null,
                token,
              );
          else sqlite.prepare("DELETE FROM sync_jobs WHERE token=?").run(token);
          return true;
        })
        .immediate();
    },
    scheduleSyncs(now = Date.now()) {
      sqlite
        .transaction(() => {
          for (const repo of this.collectorRepositories()) {
            const prior = sqlite
              .prepare(
                "SELECT reconciled_at,inventory_at FROM sync_schedule WHERE repository_id=?",
              )
              .get(repo.id) as
              | { reconciled_at: number; inventory_at: number }
              | undefined;
            if (
              !prior ||
              now - prior.reconciled_at >= 3_600_000 ||
              now - prior.inventory_at >= 86_400_000
            ) {
              // Reconciliation coalesces pending work; only events/explicit refresh dirty its generation.
              sqlite
                .prepare(
                  "INSERT INTO sync_jobs(repository_id,due_at) VALUES(?,?) ON CONFLICT(repository_id) DO NOTHING",
                )
                .run(repo.id, now);
              sqlite
                .prepare(
                  "INSERT INTO sync_schedule VALUES(?,?,?) ON CONFLICT(repository_id) DO UPDATE SET reconciled_at=excluded.reconciled_at,inventory_at=excluded.inventory_at",
                )
                .run(
                  repo.id,
                  now,
                  !prior || now - prior.inventory_at >= 86_400_000
                    ? now
                    : prior.inventory_at,
                );
            }
          }
        })
        .immediate();
    },
  };
}
