import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { metadataPatchSchema, emptyMetadata, type AccountMetadata, type MetadataPatch } from "./metadata.js";
import type { Taxonomies } from "./taxonomies.js";
import * as schema from "./schema.js";
import { topicKeys } from "./catalog.js";
import { TestRunStore } from "./test-run-store.js";

const seeds = {
  roles: ["Träger", "Berater", "Ratsuchender", "Admin"],
  topics: topicKeys,
  conversationTypes: ["Chat", "E-Mail", "Video", "Termin", "Dateiaustausch", "Langzeitdialog"]
};

export interface RegistryDatabase {
  testRuns: TestRunStore;
  tableNames(): string[]; getMetadata(email: string): AccountMetadata; getAllMetadata(): AccountMetadata[];
  upsertMetadata(email: string, patch: MetadataPatch): AccountMetadata; bulkStatus(emails: string[], status: string): number;
  recordMachineIdentityUse(identityId: string, usedAt?: string): void;
  getMachineIdentityUsage(): Array<{ identityId: string; lastUsedAt: string }>;
  getTaxonomies(): Taxonomies; putTaxonomy(kind: keyof Taxonomies, values: string[]): Taxonomies; close(): void;
  getCoordinationMetadata(itemId: string): CoordinationMetadata;
  addCoordinationTag(itemId: string, tag: string): CoordinationMetadata;
  addCoordinationDiscussion(itemId: string, discussion: CoordinationDiscussion): CoordinationMetadata;
}

export interface CoordinationDiscussion { label: string; url: string }
export interface CoordinationMetadata { tags: string[]; discussions: CoordinationDiscussion[] }

export function createDatabase(path: string): RegistryDatabase {
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL"); sqlite.pragma("foreign_keys = ON");
  drizzle(sqlite, { schema });
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS account_metadata (
      email TEXT PRIMARY KEY, shipped_version TEXT NOT NULL DEFAULT '', lifecycle_status TEXT NOT NULL DEFAULT 'unused', project TEXT NOT NULL DEFAULT 'NONE',
      roles TEXT NOT NULL DEFAULT '[]', topics TEXT NOT NULL DEFAULT '[]', conversation_types TEXT NOT NULL DEFAULT '[]',
      fixture_quality TEXT NOT NULL DEFAULT 'empty', sample_file_count INTEGER NOT NULL DEFAULT 0, notes TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS taxonomy_values (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS machine_identity_usage (
      identity_id TEXT PRIMARY KEY,
      last_used_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS coordination_item_metadata (
      item_id TEXT PRIMARY KEY,
      tags TEXT NOT NULL DEFAULT '[]',
      discussions TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS test_runs (
      id TEXT PRIMARY KEY,
      project TEXT NOT NULL,
      target_environment TEXT NOT NULL,
      pool_environment TEXT NOT NULL,
      application_version TEXT NOT NULL,
      commit_sha TEXT NOT NULL,
      scenario TEXT NOT NULL,
      status TEXT NOT NULL,
      requested_accounts INTEGER NOT NULL,
      initiated_by_type TEXT NOT NULL,
      initiated_by_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      cleaned_at TEXT
    );
    CREATE TABLE IF NOT EXISTS test_run_role_demands (
      run_id TEXT NOT NULL REFERENCES test_runs(id) ON DELETE RESTRICT,
      role TEXT NOT NULL,
      count INTEGER NOT NULL,
      PRIMARY KEY(run_id,role)
    );
    CREATE TABLE IF NOT EXISTS test_run_accounts (
      run_id TEXT NOT NULL REFERENCES test_runs(id) ON DELETE RESTRICT,
      account_id TEXT NOT NULL,
      email TEXT,
      roles TEXT NOT NULL,
      requested_role TEXT NOT NULL,
      PRIMARY KEY(run_id,account_id)
    );
    CREATE TABLE IF NOT EXISTS account_leases (
      account_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES test_runs(id) ON DELETE RESTRICT,
      leased_at TEXT NOT NULL,
      expires_at TEXT
    );
    CREATE TABLE IF NOT EXISTS test_run_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL REFERENCES test_runs(id) ON DELETE RESTRICT,
      event_type TEXT NOT NULL,
      actor_type TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}'
    );
    CREATE UNIQUE INDEX IF NOT EXISTS taxonomy_kind_value ON taxonomy_values(kind, value);
    CREATE INDEX IF NOT EXISTS test_runs_lookup ON test_runs(project,target_environment,application_version);
    CREATE INDEX IF NOT EXISTS test_run_events_order ON test_run_events(run_id,id);
  `);
  const metadataColumns = new Set((sqlite.prepare("PRAGMA table_info(account_metadata)").all() as Array<{ name: string }>).map((column) => column.name));
  if (!metadataColumns.has("project")) sqlite.exec("ALTER TABLE account_metadata ADD COLUMN project TEXT NOT NULL DEFAULT 'NONE'");
  const seed = sqlite.prepare("INSERT OR IGNORE INTO taxonomy_values(kind,value) VALUES (?,?)");
  const seedTransaction = sqlite.transaction(() => { for (const [kind, values] of Object.entries(seeds)) for (const value of values) seed.run(kind, value); });
  seedTransaction();

  const rowToMetadata = (row: any): AccountMetadata => ({
    email: row.email, shippedVersion: row.shipped_version, lifecycleStatus: row.lifecycle_status, project: row.project,
    roles: JSON.parse(row.roles), topics: JSON.parse(row.topics), conversationTypes: JSON.parse(row.conversation_types),
    fixtureQuality: row.fixture_quality, sampleFileCount: row.sample_file_count, notes: row.notes, updatedAt: row.updated_at
  });
  const api: RegistryDatabase = {
    testRuns: new TestRunStore(sqlite),
    tableNames: () => (sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[]).map((row) => row.name),
    getMetadata(email) { const row = sqlite.prepare("SELECT * FROM account_metadata WHERE email=?").get(email); return row ? rowToMetadata(row) : emptyMetadata(email); },
    getAllMetadata: () => (sqlite.prepare("SELECT * FROM account_metadata ORDER BY email").all() as any[]).map(rowToMetadata),
    upsertMetadata(email, input) {
      const patch = metadataPatchSchema.parse(input); const current = api.getMetadata(email); const next = { ...current, ...patch, email, updatedAt: new Date().toISOString() };
      sqlite.prepare(`INSERT INTO account_metadata(email,shipped_version,lifecycle_status,project,roles,topics,conversation_types,fixture_quality,sample_file_count,notes,updated_at)
        VALUES(@email,@shippedVersion,@lifecycleStatus,@project,@roles,@topics,@conversationTypes,@fixtureQuality,@sampleFileCount,@notes,@updatedAt)
        ON CONFLICT(email) DO UPDATE SET shipped_version=excluded.shipped_version,lifecycle_status=excluded.lifecycle_status,project=excluded.project,roles=excluded.roles,topics=excluded.topics,conversation_types=excluded.conversation_types,fixture_quality=excluded.fixture_quality,sample_file_count=excluded.sample_file_count,notes=excluded.notes,updated_at=excluded.updated_at`).run({ ...next, roles: JSON.stringify(next.roles), topics: JSON.stringify(next.topics), conversationTypes: JSON.stringify(next.conversationTypes) });
      return next;
    },
    bulkStatus(emails, status) { const parsed = metadataPatchSchema.pick({ lifecycleStatus: true }).parse({ lifecycleStatus: status }); const transaction = sqlite.transaction(() => { for (const email of [...new Set(emails)]) api.upsertMetadata(email, parsed); }); transaction(); return new Set(emails).size; },
    recordMachineIdentityUse(identityId, usedAt = new Date().toISOString()) {
      sqlite.prepare(`INSERT INTO machine_identity_usage(identity_id,last_used_at) VALUES(?,?)
        ON CONFLICT(identity_id) DO UPDATE SET last_used_at=excluded.last_used_at`).run(identityId, usedAt);
    },
    getMachineIdentityUsage: () => (sqlite.prepare("SELECT identity_id,last_used_at FROM machine_identity_usage ORDER BY identity_id").all() as Array<{ identity_id: string; last_used_at: string }>).map((row) => ({ identityId: row.identity_id, lastUsedAt: row.last_used_at })),
    getTaxonomies() {
      const result: Taxonomies = { roles: [], topics: [], conversationTypes: [] };
      for (const row of sqlite.prepare("SELECT kind,value FROM taxonomy_values ORDER BY value COLLATE NOCASE").all() as any[]) result[row.kind as keyof Taxonomies].push(row.value);
      return result;
    },
    putTaxonomy(kind, values) { const transaction = sqlite.transaction(() => { sqlite.prepare("DELETE FROM taxonomy_values WHERE kind=?").run(kind); const insert = sqlite.prepare("INSERT INTO taxonomy_values(kind,value) VALUES (?,?)"); for (const value of [...new Set(values)].sort((a,b) => a.localeCompare(b,"de"))) insert.run(kind, value); }); transaction(); return api.getTaxonomies(); },
    getCoordinationMetadata(itemId) {
      const row = sqlite.prepare("SELECT tags,discussions FROM coordination_item_metadata WHERE item_id=?").get(itemId) as { tags: string; discussions: string } | undefined;
      return row ? { tags: JSON.parse(row.tags), discussions: JSON.parse(row.discussions) } : { tags: [], discussions: [] };
    },
    addCoordinationTag(itemId, tag) {
      const current = api.getCoordinationMetadata(itemId);
      const tags = [...new Set([...current.tags, tag])].sort((a, b) => a.localeCompare(b, "de"));
      writeCoordinationMetadata(itemId, { ...current, tags });
      return api.getCoordinationMetadata(itemId);
    },
    addCoordinationDiscussion(itemId, discussion) {
      const current = api.getCoordinationMetadata(itemId);
      const discussions = current.discussions.some((entry) => entry.url === discussion.url)
        ? current.discussions
        : [...current.discussions, discussion];
      writeCoordinationMetadata(itemId, { ...current, discussions });
      return api.getCoordinationMetadata(itemId);
    },
    close: () => sqlite.close()
  };
  function writeCoordinationMetadata(itemId: string, value: CoordinationMetadata) {
    sqlite.prepare(`INSERT INTO coordination_item_metadata(item_id,tags,discussions) VALUES(?,?,?)
      ON CONFLICT(item_id) DO UPDATE SET tags=excluded.tags,discussions=excluded.discussions`)
      .run(itemId, JSON.stringify(value.tags), JSON.stringify(value.discussions));
  }
  return api;
}
