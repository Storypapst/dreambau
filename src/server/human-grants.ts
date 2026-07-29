import type DatabaseType from "better-sqlite3";
import { z } from "zod";
import type { HumanProject } from "./passkey-store.js";

const projectSchema = z.enum(["oriso", "orimo", "dreambau"]);
const environmentSchema = z.enum(["local", "pre-dev", "dev", "production-test"]);
const sourceSchema = z.enum(["local", "infisical"]);
const statusSchema = z.enum(["active", "revoked"]);

export type TestEnvironment = z.infer<typeof environmentSchema>;
export type HumanGrantSource = z.infer<typeof sourceSchema>;
export type HumanGrantStatus = z.infer<typeof statusSchema>;

export const ALL_TEST_ENVIRONMENTS: readonly TestEnvironment[] = ["local", "pre-dev", "dev", "production-test"];

export interface HumanProjectGrant {
  userId: string;
  project: HumanProject;
  environments: TestEnvironment[];
  source: HumanGrantSource;
  status: HumanGrantStatus;
  createdAt: string;
  updatedAt: string;
}

const grantInputSchema = z.object({
  userId: z.string().min(1),
  project: projectSchema,
  environments: z.array(environmentSchema).min(1),
  source: sourceSchema,
  status: statusSchema.default("active")
});

export type HumanProjectGrantInput = z.input<typeof grantInputSchema>;

export interface HumanGrantStore {
  list(userId: string): HumanProjectGrant[];
  replaceLocal(userId: string, grants: HumanProjectGrantInput[]): HumanProjectGrant[];
  replaceInfisical(userId: string, grants: HumanProjectGrantInput[]): HumanProjectGrant[];
  revoke(userId: string, source: HumanGrantSource): void;
  effective(userId: string): HumanProjectGrant[];
}

/**
 * `UNIQUE(user_id, project, source)` is what keeps the two sources independent:
 * a local and an Infisical grant for the same project are separate rows, so an
 * Infisical synchronization can never touch what an administrator granted
 * locally.
 */
export function ensureHumanGrantSchema(sqlite: DatabaseType.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS human_project_grants (
      user_id TEXT NOT NULL REFERENCES human_users(id) ON DELETE CASCADE,
      project TEXT NOT NULL CHECK(project IN ('oriso','orimo','dreambau')),
      environments TEXT NOT NULL,
      source TEXT NOT NULL CHECK(source IN ('local','infisical')),
      status TEXT NOT NULL CHECK(status IN ('active','revoked')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(user_id, project, source)
    );
    CREATE INDEX IF NOT EXISTS human_project_grants_user_status
      ON human_project_grants(user_id, status);
    CREATE TABLE IF NOT EXISTS human_grant_migrations (
      key TEXT PRIMARY KEY,
      completed_at TEXT NOT NULL
    );
  `);
}

/**
 * Converts the legacy overloaded `human_users.projects` column into explicit
 * local grants.
 *
 * Idempotent by construction: it only inserts a row when no grant exists for
 * that (user, project, local) triple, so re-running never duplicates and never
 * overwrites an environment scope somebody has since narrowed.
 *
 * A user whose `projects` is already empty gets nothing. Four live employees are
 * in exactly that state, and they are genuinely ungranted — fabricating access
 * for them here would hide the very defect this package exists to fix.
 */
export function migrateLegacyProjectGrants(sqlite: DatabaseType.Database, now = new Date()) {
  ensureHumanGrantSchema(sqlite);
  const migrationKey = "legacy-projects-to-local-grants-v1";
  if (sqlite.prepare("SELECT 1 FROM human_grant_migrations WHERE key=?").get(migrationKey)) return;
  const timestamp = now.toISOString();
  const rows = sqlite.prepare("SELECT id, projects FROM human_users").all() as Array<{ id: string; projects: string }>;
  const insert = sqlite.prepare(`
    INSERT INTO human_project_grants(user_id, project, environments, source, status, created_at, updated_at)
    VALUES(?, ?, ?, 'local', 'active', ?, ?)
    ON CONFLICT(user_id, project, source) DO NOTHING
  `);
  const environments = JSON.stringify(ALL_TEST_ENVIRONMENTS);
  const markComplete = sqlite.prepare(`
    INSERT INTO human_grant_migrations(key, completed_at) VALUES(?, ?)
    ON CONFLICT(key) DO NOTHING
  `);
  const run = sqlite.transaction(() => {
    for (const row of rows) {
      let raw: unknown;
      try {
        raw = JSON.parse(row.projects);
      } catch {
        continue;
      }
      const parsed = z.array(projectSchema).safeParse(raw);
      if (!parsed.success) continue;
      for (const project of new Set(parsed.data)) insert.run(row.id, project, environments, timestamp, timestamp);
    }
    markComplete.run(migrationKey, timestamp);
  });
  run();
}

export function createHumanGrantStore(sqlite: DatabaseType.Database, options: { now?: () => Date } = {}): HumanGrantStore {
  ensureHumanGrantSchema(sqlite);
  const now = options.now ?? (() => new Date());

  const rowToGrant = (row: any): HumanProjectGrant => ({
    userId: row.user_id,
    project: projectSchema.parse(row.project),
    environments: z.array(environmentSchema).parse(JSON.parse(row.environments)),
    source: sourceSchema.parse(row.source),
    status: statusSchema.parse(row.status),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });

  const selectAll = sqlite.prepare("SELECT * FROM human_project_grants WHERE user_id=? ORDER BY project, source");
  const selectActive = sqlite.prepare("SELECT * FROM human_project_grants WHERE user_id=? AND status='active' ORDER BY project, source");
  const deleteSource = sqlite.prepare("DELETE FROM human_project_grants WHERE user_id=? AND source=?");
  const revokeSource = sqlite.prepare("UPDATE human_project_grants SET status='revoked', updated_at=? WHERE user_id=? AND source=?");
  const upsert = sqlite.prepare(`
    INSERT INTO human_project_grants(user_id, project, environments, source, status, created_at, updated_at)
    VALUES(@userId, @project, @environments, @source, @status, @createdAt, @updatedAt)
    ON CONFLICT(user_id, project, source) DO UPDATE SET
      environments=excluded.environments,
      status=excluded.status,
      updated_at=excluded.updated_at
  `);

  /** Replaces exactly one source and leaves every row of the other source untouched. */
  const replaceSource = (userId: string, source: HumanGrantSource, grants: HumanProjectGrantInput[]) => {
    const timestamp = now().toISOString();
    const parsed = grants.map((grant) => {
      const value = grantInputSchema.parse(grant);
      if (value.source !== source) throw new Error(`grant source ${value.source} does not match ${source}`);
      if (value.userId !== userId) throw new Error("grant user does not match");
      return value;
    });
    const run = sqlite.transaction(() => {
      deleteSource.run(userId, source);
      for (const value of parsed) {
        upsert.run({
          userId,
          project: value.project,
          environments: JSON.stringify([...new Set(value.environments)]),
          source,
          status: value.status,
          createdAt: timestamp,
          updatedAt: timestamp
        });
      }
    });
    run();
    return (selectAll.all(userId) as any[]).map(rowToGrant).filter((grant) => grant.source === source);
  };

  return {
    list(userId) {
      return (selectAll.all(userId) as any[]).map(rowToGrant);
    },
    replaceLocal(userId, grants) {
      return replaceSource(userId, "local", grants);
    },
    replaceInfisical(userId, grants) {
      return replaceSource(userId, "infisical", grants);
    },
    revoke(userId, source) {
      revokeSource.run(now().toISOString(), userId, source);
    },
    /**
     * Deduplicated union of both sources: one entry per project, carrying the
     * union of the environments each source grants.
     */
    effective(userId) {
      const active = (selectActive.all(userId) as any[]).map(rowToGrant);
      const byProject = new Map<HumanProject, HumanProjectGrant>();
      for (const grant of active) {
        const existing = byProject.get(grant.project);
        if (!existing) {
          byProject.set(grant.project, { ...grant, environments: [...grant.environments] });
          continue;
        }
        existing.environments = [...new Set([...existing.environments, ...grant.environments])];
      }
      return [...byProject.values()].sort((a, b) => a.project.localeCompare(b.project));
    }
  };
}
