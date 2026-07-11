import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const accountMetadata = sqliteTable("account_metadata", {
  email: text("email").primaryKey(), shippedVersion: text("shipped_version").notNull().default(""),
  lifecycleStatus: text("lifecycle_status").notNull().default("active"), roles: text("roles").notNull().default("[]"),
  topics: text("topics").notNull().default("[]"), conversationTypes: text("conversation_types").notNull().default("[]"),
  fixtureQuality: text("fixture_quality").notNull().default("empty"), sampleFileCount: integer("sample_file_count").notNull().default(0),
  notes: text("notes").notNull().default(""), updatedAt: text("updated_at").notNull()
});
export const taxonomyValues = sqliteTable("taxonomy_values", {
  id: integer("id").primaryKey({ autoIncrement: true }), kind: text("kind").notNull(), value: text("value").notNull()
}, (table) => [uniqueIndex("taxonomy_kind_value").on(table.kind, table.value)]);
