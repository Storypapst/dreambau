import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { metadataPatchSchema, emptyMetadata, type AccountMetadata, type MetadataPatch } from "./metadata.js";
import type { Taxonomies } from "./taxonomies.js";
import * as schema from "./schema.js";

const seeds = {
  roles: ["Träger", "Berater", "Ratsuchender", "Admin"],
  topics: [],
  conversationTypes: ["Chat", "E-Mail", "Video", "Termin", "Dateiaustausch", "Langzeitdialog"]
};

export interface RegistryDatabase {
  tableNames(): string[]; getMetadata(email: string): AccountMetadata; getAllMetadata(): AccountMetadata[];
  upsertMetadata(email: string, patch: MetadataPatch): AccountMetadata; bulkStatus(emails: string[], status: string): number;
  getTaxonomies(): Taxonomies; putTaxonomy(kind: keyof Taxonomies, values: string[]): Taxonomies; close(): void;
}

export function createDatabase(path: string): RegistryDatabase {
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL"); sqlite.pragma("foreign_keys = ON");
  drizzle(sqlite, { schema });
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS account_metadata (
      email TEXT PRIMARY KEY, shipped_version TEXT NOT NULL DEFAULT '', lifecycle_status TEXT NOT NULL DEFAULT 'active',
      roles TEXT NOT NULL DEFAULT '[]', topics TEXT NOT NULL DEFAULT '[]', conversation_types TEXT NOT NULL DEFAULT '[]',
      fixture_quality TEXT NOT NULL DEFAULT 'empty', sample_file_count INTEGER NOT NULL DEFAULT 0, notes TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS taxonomy_values (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, value TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS taxonomy_kind_value ON taxonomy_values(kind, value);
  `);
  const seed = sqlite.prepare("INSERT OR IGNORE INTO taxonomy_values(kind,value) VALUES (?,?)");
  const seedTransaction = sqlite.transaction(() => { for (const [kind, values] of Object.entries(seeds)) for (const value of values) seed.run(kind, value); });
  seedTransaction();

  const rowToMetadata = (row: any): AccountMetadata => ({
    email: row.email, shippedVersion: row.shipped_version, lifecycleStatus: row.lifecycle_status,
    roles: JSON.parse(row.roles), topics: JSON.parse(row.topics), conversationTypes: JSON.parse(row.conversation_types),
    fixtureQuality: row.fixture_quality, sampleFileCount: row.sample_file_count, notes: row.notes, updatedAt: row.updated_at
  });
  const api: RegistryDatabase = {
    tableNames: () => (sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[]).map((row) => row.name),
    getMetadata(email) { const row = sqlite.prepare("SELECT * FROM account_metadata WHERE email=?").get(email); return row ? rowToMetadata(row) : emptyMetadata(email); },
    getAllMetadata: () => (sqlite.prepare("SELECT * FROM account_metadata ORDER BY email").all() as any[]).map(rowToMetadata),
    upsertMetadata(email, input) {
      const patch = metadataPatchSchema.parse(input); const current = api.getMetadata(email); const next = { ...current, ...patch, email, updatedAt: new Date().toISOString() };
      sqlite.prepare(`INSERT INTO account_metadata(email,shipped_version,lifecycle_status,roles,topics,conversation_types,fixture_quality,sample_file_count,notes,updated_at)
        VALUES(@email,@shippedVersion,@lifecycleStatus,@roles,@topics,@conversationTypes,@fixtureQuality,@sampleFileCount,@notes,@updatedAt)
        ON CONFLICT(email) DO UPDATE SET shipped_version=excluded.shipped_version,lifecycle_status=excluded.lifecycle_status,roles=excluded.roles,topics=excluded.topics,conversation_types=excluded.conversation_types,fixture_quality=excluded.fixture_quality,sample_file_count=excluded.sample_file_count,notes=excluded.notes,updated_at=excluded.updated_at`).run({ ...next, roles: JSON.stringify(next.roles), topics: JSON.stringify(next.topics), conversationTypes: JSON.stringify(next.conversationTypes) });
      return next;
    },
    bulkStatus(emails, status) { const parsed = metadataPatchSchema.pick({ lifecycleStatus: true }).parse({ lifecycleStatus: status }); const transaction = sqlite.transaction(() => { for (const email of [...new Set(emails)]) api.upsertMetadata(email, parsed); }); transaction(); return new Set(emails).size; },
    getTaxonomies() {
      const result: Taxonomies = { roles: [], topics: [], conversationTypes: [] };
      for (const row of sqlite.prepare("SELECT kind,value FROM taxonomy_values ORDER BY value COLLATE NOCASE").all() as any[]) result[row.kind as keyof Taxonomies].push(row.value);
      return result;
    },
    putTaxonomy(kind, values) { const transaction = sqlite.transaction(() => { sqlite.prepare("DELETE FROM taxonomy_values WHERE kind=?").run(kind); const insert = sqlite.prepare("INSERT INTO taxonomy_values(kind,value) VALUES (?,?)"); for (const value of [...new Set(values)].sort((a,b) => a.localeCompare(b,"de"))) insert.run(kind, value); }); transaction(); return api.getTaxonomies(); },
    close: () => sqlite.close()
  };
  return api;
}
