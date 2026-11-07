import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { metadataPatchSchema, workspaceMetadataSchema, emptyMetadata, type AccountMetadata, type MetadataPatch } from "./metadata.js";
import {
  accountTaxonomyProject,
  defaultConversationTypes,
  defaultOrisoLoginTargets,
  taxonomyProjectSchema,
  type ConversationTypePatch,
  type ConversationTypeResult,
  type LoginTarget,
  type TaxonomyProject,
  type Taxonomies
} from "./taxonomies.js";
import * as schema from "./schema.js";
import { topicKeys } from "./catalog.js";
import { TestResourceStore } from "./test-resource-store.js";
import { TestFixturePlanStore } from "./test-fixture-plan-store.js";
import { TestRunStore } from "./test-run-store.js";
import { WorkspaceReferenceStore } from "./workspace-reference-store.js";
import { ReleaseListStore } from "./release-list-store.js";
import {
  accountAccessEventInputSchema,
  type AccountAccessEvent,
  type AccountAccessEventInput,
  type AccountAccessSummary,
  type TestAccessLinkReconciliation,
  type TestAccessRecordLink
} from "./account-link.js";
import { testAccessRecordSchema, type TestAccessRecord } from "./infisical-provider.js";
import { secretNameForRecord } from "./infisical-import.js";

const seeds = {
  roles: ["Träger", "Berater", "Ratsuchender", "Admin", "platform-admin", "tenant-admin", "agency-admin", "counsellor", "advice-seeker"],
  topics: topicKeys,
  conversationTypes: ["Chat", "E-Mail", "Video", "Termin", "Dateiaustausch", "Langzeitdialog"]
};

export interface RegistryDatabase {
  workspaceReferences: WorkspaceReferenceStore;
  testRuns: TestRunStore;
  fixturePlans: TestFixturePlanStore;
  testResources: TestResourceStore;
  releaseLists: ReleaseListStore;
  tableNames(): string[]; getMetadata(email: string): AccountMetadata; getAllMetadata(): AccountMetadata[];
  upsertMetadata(email: string, patch: MetadataPatch): AccountMetadata; bulkStatus(emails: string[], status: string): number;
  recordMachineIdentityUse(identityId: string, usedAt?: string): void;
  getMachineIdentityUsage(): Array<{ identityId: string; lastUsedAt: string }>;
  markOrisoAdminDeletionPending(accountId: string, environment: string, email: string, actorId: string, startedAt: string): void;
  isOrisoAdminDeletionPending(accountId: string): boolean;
  markOrisoAdminDeleted(accountId: string, environment: string, email: string, actorId: string, deletedAt: string): void;
  isOrisoAdminDeleted(accountId: string): boolean;
  clearOrisoAdminDeletion(accountId: string): void;
  recordAccountAccess(event: AccountAccessEventInput): AccountAccessEvent;
  getAccountAccess(email: string, limit?: number): AccountAccessSummary;
  recordApplicationPasswordSetAt(record: TestAccessRecord, at: string): void;
  getApplicationPasswordSetAt(record: TestAccessRecord): string | undefined;
  reconcileTestAccessLinks(accounts: string[], records: TestAccessRecord[], seenAt?: string): TestAccessLinkReconciliation;
  getTestAccessLinks(email: string): TestAccessRecordLink[];
  isTestAccessLinkSuppressed(record: Pick<TestAccessRecord, "id" | "createdAt">): boolean;
  unlinkTestAccessRecords(records: TestAccessRecord[], actorId: string, now: string, mode: "candidate" | "individual"): number;
  allowTestAccessRelink(record: TestAccessRecord): void;
  getTaxonomies(): Taxonomies; putTaxonomy(kind: keyof Taxonomies, values: string[]): Taxonomies; close(): void;
  getProjectConversationTypes(project: TaxonomyProject): string[];
  patchProjectConversationType(project: TaxonomyProject, patch: ConversationTypePatch): ConversationTypeResult;
  getProjectLoginTargets(project: TaxonomyProject): LoginTarget[];
  addProjectLoginTarget(project: TaxonomyProject, target: LoginTarget): LoginTarget[] | null;
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
    CREATE TABLE IF NOT EXISTS project_conversation_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT, project TEXT NOT NULL, value TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS project_conversation_type_value ON project_conversation_types(project, value);
    CREATE TABLE IF NOT EXISTS project_conversation_type_aliases (
      project TEXT NOT NULL, value TEXT NOT NULL, type_id INTEGER NOT NULL REFERENCES project_conversation_types(id),
      PRIMARY KEY(project, value)
    );
    CREATE TABLE IF NOT EXISTS project_login_targets (
      id INTEGER PRIMARY KEY AUTOINCREMENT, project TEXT NOT NULL, label TEXT NOT NULL, url TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS project_login_target_label ON project_login_targets(project, label);
    CREATE UNIQUE INDEX IF NOT EXISTS project_login_target_url ON project_login_targets(project, url);
    CREATE TABLE IF NOT EXISTS machine_identity_usage (
      identity_id TEXT PRIMARY KEY,
      last_used_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS oriso_admin_deletions (
      account_id TEXT PRIMARY KEY, environment TEXT NOT NULL, email TEXT NOT NULL,
      actor_id TEXT NOT NULL, deleted_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS account_access_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL,
      email TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      action TEXT NOT NULL,
      created_at TEXT NOT NULL,
      context TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS test_access_password_dates (
      record_id TEXT PRIMARY KEY,
      record_created_at TEXT NOT NULL,
      password_set_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS test_access_record_links (
      record_id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      secret_name TEXT NOT NULL,
      project TEXT NOT NULL,
      environment TEXT NOT NULL,
      kind TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS test_access_unlinked_records (
      record_id TEXT PRIMARY KEY,
      record_created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS test_access_unlink_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id TEXT NOT NULL,
      email TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      environment TEXT
    );
    CREATE TRIGGER IF NOT EXISTS suppress_unlinked_test_access_record
    BEFORE INSERT ON test_access_record_links
    WHEN EXISTS (SELECT 1 FROM test_access_unlinked_records WHERE record_id=NEW.record_id)
    BEGIN
      SELECT RAISE(IGNORE);
    END;
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
    CREATE TABLE IF NOT EXISTS test_fixture_plans (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES test_runs(id) ON DELETE RESTRICT,
      revision INTEGER NOT NULL CHECK(revision > 0),
      snapshot_hash TEXT NOT NULL,
      body TEXT NOT NULL,
      UNIQUE(run_id,revision)
    );
    CREATE TABLE IF NOT EXISTS test_resources (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES test_runs(id) ON DELETE RESTRICT,
      operation_key TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('tenant','agency','user','session','matrix-room')),
      account_id TEXT,
      project TEXT NOT NULL,
      target_environment TEXT NOT NULL,
      application_version TEXT NOT NULL,
      commit_sha TEXT NOT NULL,
      target_origin TEXT NOT NULL,
      external_id TEXT,
      fingerprint TEXT,
      state TEXT NOT NULL CHECK(state IN ('planned','creating','create-uncertain','present','deleting','pending-purge','delete-uncertain','deleted','cancelled')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deletion_started_at TEXT,
      UNIQUE(run_id,operation_key),
      UNIQUE(target_origin,kind,external_id)
    );
    CREATE TABLE IF NOT EXISTS test_resource_parents (
      resource_id TEXT NOT NULL REFERENCES test_resources(id) ON DELETE RESTRICT,
      parent_id TEXT NOT NULL REFERENCES test_resources(id) ON DELETE RESTRICT,
      PRIMARY KEY(resource_id,parent_id),
      CHECK(resource_id <> parent_id)
    );
    CREATE INDEX IF NOT EXISTS test_resources_run ON test_resources(run_id,state);
    CREATE INDEX IF NOT EXISTS test_resource_children ON test_resource_parents(parent_id,resource_id);
    CREATE UNIQUE INDEX IF NOT EXISTS taxonomy_kind_value ON taxonomy_values(kind, value);
    CREATE INDEX IF NOT EXISTS test_runs_lookup ON test_runs(project,target_environment,application_version);
    CREATE INDEX IF NOT EXISTS test_run_events_order ON test_run_events(run_id,id);
    CREATE INDEX IF NOT EXISTS account_access_events_email ON account_access_events(email,created_at DESC,id DESC);
    CREATE INDEX IF NOT EXISTS account_access_events_account ON account_access_events(account_id,created_at DESC,id DESC);
    CREATE INDEX IF NOT EXISTS test_access_record_links_email ON test_access_record_links(email,project,environment);
  `);
  // Prior binaries read the access ledger using a closed enum.
  sqlite.transaction(() => {
    sqlite.prepare(`INSERT INTO test_access_unlink_audit (record_id,email,actor_id,created_at,environment)
      SELECT account_id,email,actor_id,created_at,json_extract(context,'$.environment')
      FROM account_access_events WHERE action='record_unlinked'`).run();
    sqlite.prepare("DELETE FROM account_access_events WHERE action='record_unlinked'").run();
  }).immediate();
  const suppressedLink = sqlite.prepare<[string], { record_created_at: string }>(
    "SELECT record_created_at FROM test_access_unlinked_records WHERE record_id=?"
  );
  const removeSuppression = sqlite.prepare("DELETE FROM test_access_unlinked_records WHERE record_id=? AND record_created_at=?");
  const supersedesSuppression = (createdAt: string, suppressedAt: string) =>
    testAccessRecordSchema.shape.createdAt.safeParse(createdAt).success
    && testAccessRecordSchema.shape.createdAt.safeParse(suppressedAt).success
    && Date.parse(createdAt) > Date.parse(suppressedAt);
  const metadataColumns = new Set((sqlite.prepare("PRAGMA table_info(account_metadata)").all() as Array<{ name: string }>).map((column) => column.name));
  if (!metadataColumns.has("project")) sqlite.exec("ALTER TABLE account_metadata ADD COLUMN project TEXT NOT NULL DEFAULT 'NONE'");
  if (!metadataColumns.has("agencies")) sqlite.exec("ALTER TABLE account_metadata ADD COLUMN agencies TEXT NOT NULL DEFAULT '[]'");
  if (!metadataColumns.has("workspace_metadata")) sqlite.exec("ALTER TABLE account_metadata ADD COLUMN workspace_metadata TEXT NOT NULL DEFAULT '{}'");
  // Keep optional additions outside the workspace JSON so older builds can read the row.
  if (!metadataColumns.has("documented_username")) sqlite.exec("ALTER TABLE account_metadata ADD COLUMN documented_username TEXT");
  const seed = sqlite.prepare("INSERT OR IGNORE INTO taxonomy_values(kind,value) VALUES (?,?)");
  const seedTransaction = sqlite.transaction(() => { for (const [kind, values] of Object.entries(seeds)) for (const value of values) seed.run(kind, value); });
  seedTransaction();

  const readProjectTypes = sqlite.prepare<[TaxonomyProject], { value: string }>(
    "SELECT value FROM project_conversation_types WHERE project=? ORDER BY id"
  );
  const insertProjectType = sqlite.prepare("INSERT INTO project_conversation_types(project,value) VALUES (?,?)");
  const insertLoginTarget = sqlite.prepare("INSERT INTO project_login_targets(project,label,url) VALUES (?,?,?) ON CONFLICT DO NOTHING");
  const readLoginTargets = sqlite.prepare<[TaxonomyProject], LoginTarget>(
    "SELECT label,url FROM project_login_targets WHERE project=? ORDER BY id"
  );
  sqlite.transaction(() => {
    for (const project of taxonomyProjectSchema.options) {
      if (readProjectTypes.get(project)) continue;
      for (const value of defaultConversationTypes) insertProjectType.run(project, value);
    }
    for (const { label, url } of defaultOrisoLoginTargets) insertLoginTarget.run("oriso", label, url);
  }).immediate();

  const readSelections = sqlite.prepare<[], { email: string; project: string; conversation_types: string }>(
    "SELECT email,project,conversation_types FROM account_metadata WHERE conversation_types <> '[]' ORDER BY email"
  );
  const metadataProject = (project: string, email: string) => accountTaxonomyProject(project, email.slice(email.lastIndexOf("@") + 1));
  const projectSelections = (project: TaxonomyProject) => readSelections.all()
    .filter((row) => metadataProject(row.project, row.email) === project)
    .map((row) => ({ email: row.email, values: JSON.parse(row.conversation_types) as string[] }));
  const projectTypesWithSelections = (project: TaxonomyProject, selections: ReturnType<typeof projectSelections>) => [
    ...new Set([...readProjectTypes.all(project).map((row) => row.value), ...selections.flatMap((entry) => entry.values)])
  ];
  const writeSelection = sqlite.prepare("UPDATE account_metadata SET conversation_types=?,updated_at=? WHERE email=?");
  const renameProjectType = sqlite.prepare("UPDATE project_conversation_types SET value=? WHERE project=? AND value=?");
  const writeProjectTypeAlias = sqlite.prepare(`INSERT INTO project_conversation_type_aliases(project,value,type_id)
    SELECT project,?,id FROM project_conversation_types WHERE project=? AND value=?
    ON CONFLICT(project,value) DO UPDATE SET type_id=excluded.type_id`);
  // If an old name is deliberately reused as a new type, the current type takes precedence.
  const readProjectTypeAliases = sqlite.prepare<[TaxonomyProject], { previous: string; value: string }>(`
    SELECT alias.value AS previous, current.value FROM project_conversation_type_aliases AS alias
    JOIN project_conversation_types AS current ON current.id=alias.type_id
    WHERE alias.project=? AND NOT EXISTS (
      SELECT 1 FROM project_conversation_types WHERE project=alias.project AND value=alias.value
    )`);
  const projectTypeAliases = (project: TaxonomyProject) => new Map(readProjectTypeAliases.all(project).map(({ previous, value }) => [previous, value]));
  const patchProjectConversationType = sqlite.transaction((project: TaxonomyProject, { previous, value }: ConversationTypePatch): ConversationTypeResult => {
    const selections = projectSelections(project);
    const values = projectTypesWithSelections(project, selections);
    if (previous !== undefined && !values.includes(previous)) {
      return projectTypeAliases(project).get(previous) === value ? { values } : { error: "conversation_type_not_found" };
    }
    if (value === previous || (previous === undefined && values.includes(value))) return { values };
    if (values.includes(value)) return { error: "conversation_type_exists" };
    if (previous === undefined || renameProjectType.run(value, project, previous).changes === 0) {
      insertProjectType.run(project, value);
    }
    if (previous !== undefined) {
      writeProjectTypeAlias.run(previous, project, value);
      const now = new Date().toISOString();
      for (const selection of selections) {
        if (!selection.values.includes(previous)) continue;
        const renamed = selection.values.map((selected) => selected === previous ? value : selected);
        writeSelection.run(JSON.stringify(renamed), now, selection.email);
      }
    }
    return { values: projectTypesWithSelections(project, projectSelections(project)) };
  });

  const rowToMetadata = (row: any): AccountMetadata => ({
    email: row.email, shippedVersion: row.shipped_version, lifecycleStatus: row.lifecycle_status, project: row.project,
    roles: JSON.parse(row.roles), agencies: JSON.parse(row.agencies), topics: JSON.parse(row.topics), conversationTypes: JSON.parse(row.conversation_types),
    fixtureQuality: row.fixture_quality, sampleFileCount: row.sample_file_count, notes: row.notes, updatedAt: row.updated_at,
    ...workspaceMetadataSchema.parse(JSON.parse(row.workspace_metadata)),
    ...(row.documented_username === null ? {} : { documentedUsername: row.documented_username })
  });
  if (!(sqlite.pragma("table_info(oriso_admin_deletions)") as Array<{ name: string }>).some((column) => column.name === "state")) {
    sqlite.exec("ALTER TABLE oriso_admin_deletions ADD COLUMN state TEXT NOT NULL DEFAULT 'deleted'");
  }
  const markDeletion = (accountId: string, environment: string, email: string, actorId: string, at: string, state: "pending" | "deleted") => {
    sqlite.prepare(`INSERT INTO oriso_admin_deletions(account_id,environment,email,actor_id,deleted_at,state) VALUES(?,?,?,?,?,?)
      ON CONFLICT(account_id) DO UPDATE SET environment=excluded.environment,email=excluded.email,actor_id=excluded.actor_id,deleted_at=excluded.deleted_at,state=excluded.state`)
      .run(accountId, environment, email, actorId, at, state);
  };
  const testResources = new TestResourceStore(sqlite);
  const api: RegistryDatabase = {
    workspaceReferences: new WorkspaceReferenceStore(sqlite),
    testRuns: new TestRunStore(sqlite, testResources),
    fixturePlans: new TestFixturePlanStore(sqlite),
    testResources,
    releaseLists: new ReleaseListStore(sqlite),
    tableNames: () => (sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[]).map((row) => row.name),
    getMetadata(email) { const row = sqlite.prepare("SELECT * FROM account_metadata WHERE email=?").get(email); return row ? rowToMetadata(row) : emptyMetadata(email); },
    getAllMetadata: () => (sqlite.prepare("SELECT * FROM account_metadata ORDER BY email").all() as any[]).map(rowToMetadata),
    upsertMetadata: sqlite.transaction((email: string, input: MetadataPatch) => {
      const patch = metadataPatchSchema.parse(input); const current = api.getMetadata(email); const next = { ...current, ...patch, email, updatedAt: new Date().toISOString() };
      if (patch.conversationTypes?.length) {
        const aliases = projectTypeAliases(metadataProject(next.project, email));
        if (aliases.size) next.conversationTypes = [...new Set(next.conversationTypes.map((value) => aliases.get(value) ?? value))];
      }
      sqlite.prepare(`INSERT INTO account_metadata(email,shipped_version,lifecycle_status,project,roles,agencies,topics,conversation_types,fixture_quality,sample_file_count,notes,updated_at,workspace_metadata,documented_username)
        VALUES(@email,@shippedVersion,@lifecycleStatus,@project,@roles,@agencies,@topics,@conversationTypes,@fixtureQuality,@sampleFileCount,@notes,@updatedAt,@workspaceMetadata,@documentedUsername)
        ON CONFLICT(email) DO UPDATE SET shipped_version=excluded.shipped_version,lifecycle_status=excluded.lifecycle_status,project=excluded.project,roles=excluded.roles,agencies=excluded.agencies,topics=excluded.topics,conversation_types=excluded.conversation_types,fixture_quality=excluded.fixture_quality,sample_file_count=excluded.sample_file_count,notes=excluded.notes,updated_at=excluded.updated_at,workspace_metadata=excluded.workspace_metadata,documented_username=excluded.documented_username`).run({ ...next,
          documentedUsername: next.documentedUsername ?? null,
          workspaceMetadata: JSON.stringify({ carrier: next.carrier, postalCode: next.postalCode, supervisor: next.supervisor, otpDelivery: next.otpDelivery, loginTargetUrl: next.loginTargetUrl }),
          roles: JSON.stringify(next.roles), agencies: JSON.stringify(next.agencies), topics: JSON.stringify(next.topics), conversationTypes: JSON.stringify(next.conversationTypes) });
      return next;
    }).immediate,
    bulkStatus(emails, status) { const parsed = metadataPatchSchema.pick({ lifecycleStatus: true }).parse({ lifecycleStatus: status }); const transaction = sqlite.transaction(() => { for (const email of [...new Set(emails)]) api.upsertMetadata(email, parsed); }); transaction(); return new Set(emails).size; },
    recordMachineIdentityUse(identityId, usedAt = new Date().toISOString()) {
      sqlite.prepare(`INSERT INTO machine_identity_usage(identity_id,last_used_at) VALUES(?,?)
        ON CONFLICT(identity_id) DO UPDATE SET last_used_at=excluded.last_used_at`).run(identityId, usedAt);
    },
    getMachineIdentityUsage: () => (sqlite.prepare("SELECT identity_id,last_used_at FROM machine_identity_usage ORDER BY identity_id").all() as Array<{ identity_id: string; last_used_at: string }>).map((row) => ({ identityId: row.identity_id, lastUsedAt: row.last_used_at })),
    markOrisoAdminDeletionPending(accountId, environment, email, actorId, startedAt) { markDeletion(accountId, environment, email, actorId, startedAt, "pending"); },
    isOrisoAdminDeletionPending(accountId) { return Boolean(sqlite.prepare("SELECT 1 FROM oriso_admin_deletions WHERE account_id=? AND state='pending'").get(accountId)); },
    markOrisoAdminDeleted(accountId, environment, email, actorId, deletedAt) { markDeletion(accountId, environment, email, actorId, deletedAt, "deleted"); },
    isOrisoAdminDeleted(accountId) { return Boolean(sqlite.prepare("SELECT 1 FROM oriso_admin_deletions WHERE account_id=? AND state='deleted'").get(accountId)); },
    clearOrisoAdminDeletion(accountId) { sqlite.prepare("DELETE FROM oriso_admin_deletions WHERE account_id=?").run(accountId); },
    recordAccountAccess(input) {
      const event = accountAccessEventInputSchema.parse({
        ...input,
        email: input.email.trim().toLowerCase()
      });
      const result = sqlite.prepare(`INSERT INTO account_access_events(
        account_id,email,actor_id,action,created_at,context
      ) VALUES(?,?,?,?,?,?)`).run(
        event.accountId,
        event.email,
        event.actorId,
        event.action,
        event.createdAt,
        JSON.stringify(event.context)
      );
      return { id: Number(result.lastInsertRowid), ...event };
    },
    recordApplicationPasswordSetAt(record, at) {
      sqlite.prepare(`INSERT INTO test_access_password_dates(record_id, record_created_at, password_set_at)
        VALUES(?,?,?) ON CONFLICT(record_id) DO UPDATE SET
        record_created_at=excluded.record_created_at, password_set_at=excluded.password_set_at`)
        .run(record.id, record.createdAt, at);
    },
    getApplicationPasswordSetAt(record) {
      const result = sqlite.prepare("SELECT password_set_at FROM test_access_password_dates WHERE record_id=? AND record_created_at=?")
        .get(record.id, record.createdAt) as { password_set_at: string } | undefined;
      return result?.password_set_at;
    },
    getAccountAccess(email, limit = 10) {
      const boundedLimit = Math.max(1, Math.min(50, Math.trunc(limit)));
      const rows = sqlite.prepare(`SELECT id,account_id,email,actor_id,action,created_at,context
        FROM account_access_events WHERE email=? ORDER BY created_at DESC,id DESC LIMIT ?`)
        .all(email.trim().toLowerCase(), boundedLimit) as Array<{
          id: number; account_id: string; email: string; actor_id: string;
          action: AccountAccessEvent["action"]; created_at: string; context: string;
        }>;
      const events = rows.map((row): AccountAccessEvent => {
        const parsed = accountAccessEventInputSchema.parse({
          accountId: row.account_id,
          email: row.email,
          actorId: row.actor_id,
          action: row.action,
          createdAt: row.created_at,
          context: JSON.parse(row.context)
        });
        return { id: row.id, ...parsed };
      });
      return { latest: events[0] ?? null, events };
    },
    reconcileTestAccessLinks(accounts, records, seenAt = new Date().toISOString()) {
      const knownAccounts = new Map(accounts.map((email) => [email.trim().toLowerCase(), email.trim().toLowerCase()]));
      const applicationRecords = records
        .filter((record): record is TestAccessRecord & { email: string; kind: "app-user" | "admin" } =>
          Boolean(record.email) && (record.kind === "app-user" || record.kind === "admin"))
        .sort((left, right) => left.id.localeCompare(right.id));
      const mappedEmails = new Set<string>();
      const unmappedRecords: string[] = [];
      const transaction = sqlite.transaction(() => {
        for (const record of applicationRecords) {
          const suppressed = suppressedLink.get(record.id);
          if (suppressed) {
            if (!supersedesSuppression(record.createdAt, suppressed.record_created_at)) {
              unmappedRecords.push(record.id);
              continue;
            }
            // The old binary's INSERT carries only the record ID.
            removeSuppression.run(record.id, suppressed.record_created_at);
          }
          const email = record.email.trim().toLowerCase();
          if (!knownAccounts.has(email)) {
            unmappedRecords.push(record.id);
            continue;
          }
          const existing = sqlite.prepare("SELECT email FROM test_access_record_links WHERE record_id=?")
            .get(record.id) as { email: string } | undefined;
          if (existing && existing.email !== email) throw new Error("Test Access record link conflict");
          sqlite.prepare(`INSERT INTO test_access_record_links(
            record_id,email,secret_name,project,environment,kind,last_seen_at
          ) VALUES(?,?,?,?,?,?,?)
          ON CONFLICT(record_id) DO UPDATE SET
            secret_name=excluded.secret_name,
            project=excluded.project,
            environment=excluded.environment,
            kind=excluded.kind,
            last_seen_at=excluded.last_seen_at`).run(
            record.id,
            email,
            secretNameForRecord(record.id),
            record.project,
            record.environment,
            record.kind,
            seenAt
          );
          mappedEmails.add(email);
        }
      });
      transaction.immediate();
      return {
        linked: applicationRecords.length - unmappedRecords.length,
        unmappedRecords,
        unmappedAccounts: [...knownAccounts.keys()].filter((email) => !mappedEmails.has(email)).sort()
      };
    },
    isTestAccessLinkSuppressed(record) {
      const suppressed = suppressedLink.get(record.id);
      return Boolean(suppressed && !supersedesSuppression(record.createdAt, suppressed.record_created_at));
    },
    unlinkTestAccessRecords(records, actorId, now, mode) {
      const unlink = sqlite.prepare(`DELETE FROM test_access_record_links
        WHERE record_id=? AND email=? AND project=? AND environment=? AND kind=?`);
      const remember = sqlite.prepare(`INSERT INTO test_access_unlinked_records (record_id, record_created_at)
        VALUES (?,?) ON CONFLICT(record_id) DO UPDATE SET record_created_at=excluded.record_created_at`);
      const audit = sqlite.prepare(`INSERT INTO test_access_unlink_audit (record_id,email,actor_id,created_at,environment)
        VALUES (?,?,?,?,?)`);
      return sqlite.transaction(() => {
        const affected = new Set<string>();
        for (const record of records) {
          const email = record.email?.trim().toLowerCase();
          if (!email || api.testRuns.hasAccountLease(record) || api.isOrisoAdminDeletionPending(record.id)
            || (mode === "candidate" && api.getMetadata(email).lifecycleStatus !== "delete_candidate")) {
            throw new Error("cleanup_preview_stale");
          }
          if (unlink.run(record.id, email, record.project, record.environment, record.kind).changes !== 1) {
            throw new Error("cleanup_preview_stale");
          }
          remember.run(record.id, record.createdAt);
          audit.run(record.id, email, actorId, now, record.environment);
          affected.add(email);
        }
        for (const email of affected) {
          if (!api.getTestAccessLinks(email).length) api.upsertMetadata(email, { lifecycleStatus: "unused" });
        }
        return records.length;
      }).immediate();
    },
    allowTestAccessRelink(record) {
      removeSuppression.run(record.id, record.createdAt);
    },
    getTestAccessLinks(email) {
      return (sqlite.prepare(`SELECT email,record_id,secret_name,project,environment,kind,last_seen_at
        FROM test_access_record_links WHERE email=?
        ORDER BY project,environment,record_id`).all(email.trim().toLowerCase()) as Array<{
          email: string;
          record_id: string;
          secret_name: string;
          project: TestAccessRecordLink["project"];
          environment: TestAccessRecordLink["environment"];
          kind: TestAccessRecordLink["kind"];
          last_seen_at: string;
        }>).map((row) => ({
          email: row.email,
          recordId: row.record_id,
          secretName: row.secret_name,
          project: row.project,
          environment: row.environment,
          kind: row.kind,
          lastSeenAt: row.last_seen_at
        }));
    },
    getTaxonomies() {
      const result: Taxonomies = { roles: [], topics: [], conversationTypes: [] };
      for (const row of sqlite.prepare("SELECT kind,value FROM taxonomy_values ORDER BY value COLLATE NOCASE").all() as any[]) result[row.kind as keyof Taxonomies].push(row.value);
      return result;
    },
    putTaxonomy(kind, values) { const transaction = sqlite.transaction(() => { sqlite.prepare("DELETE FROM taxonomy_values WHERE kind=?").run(kind); const insert = sqlite.prepare("INSERT INTO taxonomy_values(kind,value) VALUES (?,?)"); for (const value of [...new Set(values)].sort((a,b) => a.localeCompare(b,"de"))) insert.run(kind, value); }); transaction(); return api.getTaxonomies(); },
    getProjectConversationTypes: sqlite.transaction((project: TaxonomyProject) =>
      projectTypesWithSelections(project, projectSelections(project))
    ).deferred,
    patchProjectConversationType: patchProjectConversationType.immediate,
    getProjectLoginTargets: (project) => readLoginTargets.all(project),
    addProjectLoginTarget: sqlite.transaction((project: TaxonomyProject, { label, url }: LoginTarget) => {
      const added = insertLoginTarget.run(project, label, url).changes > 0;
      const values = readLoginTargets.all(project);
      return added || values.some((target) => target.label === label && target.url === url) ? values : null;
    }).immediate,
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
