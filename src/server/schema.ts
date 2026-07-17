import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const accountMetadata = sqliteTable("account_metadata", {
  email: text("email").primaryKey(), shippedVersion: text("shipped_version").notNull().default(""),
  lifecycleStatus: text("lifecycle_status").notNull().default("unused"), project: text("project").notNull().default("NONE"), roles: text("roles").notNull().default("[]"),
  topics: text("topics").notNull().default("[]"), conversationTypes: text("conversation_types").notNull().default("[]"),
  fixtureQuality: text("fixture_quality").notNull().default("empty"), sampleFileCount: integer("sample_file_count").notNull().default(0),
  notes: text("notes").notNull().default(""), updatedAt: text("updated_at").notNull()
});
export const taxonomyValues = sqliteTable("taxonomy_values", {
  id: integer("id").primaryKey({ autoIncrement: true }), kind: text("kind").notNull(), value: text("value").notNull()
}, (table) => [uniqueIndex("taxonomy_kind_value").on(table.kind, table.value)]);
export const coordinationItemMetadata = sqliteTable("coordination_item_metadata", {
  itemId: text("item_id").primaryKey(),
  tags: text("tags").notNull().default("[]"),
  discussions: text("discussions").notNull().default("[]")
});

export const testRuns = sqliteTable("test_runs", {
  id: text("id").primaryKey(),
  project: text("project").notNull(),
  targetEnvironment: text("target_environment").notNull(),
  poolEnvironment: text("pool_environment").notNull(),
  applicationVersion: text("application_version").notNull(),
  commitSha: text("commit_sha").notNull(),
  scenario: text("scenario").notNull(),
  status: text("status").notNull(),
  requestedAccounts: integer("requested_accounts").notNull(),
  initiatedByType: text("initiated_by_type").notNull(),
  initiatedById: text("initiated_by_id").notNull(),
  createdAt: text("created_at").notNull(),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
  cleanedAt: text("cleaned_at")
}, (table) => [
  index("test_runs_lookup").on(table.project, table.targetEnvironment, table.applicationVersion)
]);

export const testRunRoleDemands = sqliteTable("test_run_role_demands", {
  runId: text("run_id").notNull().references(() => testRuns.id, { onDelete: "restrict" }),
  role: text("role").notNull(),
  count: integer("count").notNull()
}, (table) => [primaryKey({ columns: [table.runId, table.role] })]);

export const testRunAccounts = sqliteTable("test_run_accounts", {
  runId: text("run_id").notNull().references(() => testRuns.id, { onDelete: "restrict" }),
  accountId: text("account_id").notNull(),
  email: text("email"),
  roles: text("roles").notNull(),
  requestedRole: text("requested_role").notNull()
}, (table) => [primaryKey({ columns: [table.runId, table.accountId] })]);

export const accountLeases = sqliteTable("account_leases", {
  accountId: text("account_id").primaryKey(),
  runId: text("run_id").notNull().references(() => testRuns.id, { onDelete: "restrict" }),
  leasedAt: text("leased_at").notNull(),
  expiresAt: text("expires_at")
});

export const testRunEvents = sqliteTable("test_run_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: text("run_id").notNull().references(() => testRuns.id, { onDelete: "restrict" }),
  eventType: text("event_type").notNull(),
  actorType: text("actor_type").notNull(),
  actorId: text("actor_id").notNull(),
  createdAt: text("created_at").notNull(),
  payload: text("payload").notNull().default("{}")
}, (table) => [index("test_run_events_order").on(table.runId, table.id)]);
