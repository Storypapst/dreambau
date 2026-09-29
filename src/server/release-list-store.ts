import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { z } from "zod";

export const releaseSelectFields = ["areas", "devStatus", "functional"] as const;
export type ReleaseSelectField = typeof releaseSelectFields[number];
export const optionColors = ["blue", "amber", "violet", "green", "rose", "slate", "teal", "orange"] as const;
export type OptionColor = typeof optionColors[number];

export interface ReleaseOption { id: string; label: string; labelDe: string; color: OptionColor; position: number }
export type ReleaseOptions = Record<ReleaseSelectField, ReleaseOption[]>;

export interface ReleaseList { id: string; project: string; title: string; titleDe: string; intro: string; introDe: string; updatedAt: string }

export const translatedFields = ["name", "description", "crossReferences", "statusComment", "notes", "releaseNotes"] as const;
export type TranslatedField = typeof translatedFields[number];
export type ReleaseTranslations = Partial<Record<TranslatedField, string>>;
export const translationsSchema = z.object({
  name: z.string().trim().min(1).max(200), description: z.string().max(4000),
  crossReferences: z.string().max(4000), statusComment: z.string().max(4000),
  notes: z.string().max(8000), releaseNotes: z.string().max(15000)
}).partial().strict();

export interface ReleaseItem {
  id: string;
  listId: string;
  parentId: string | null;
  position: number;
  name: string;
  translations: ReleaseTranslations;
  areas: string[];
  description: string;
  crossReferences: string;
  crossReferenceIds: string[];
  devStatus: string | null;
  functional: string[];
  statusComment: string;
  notes: string;
  releaseNotes: string;
  completed: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  commentCount: number;
}

export interface ReleaseComment { id: number; itemId: string; authorName: string; body: string; createdAt: string }
export interface ReleaseChange { id: number; itemId: string; field: string; oldValue: string; newValue: string; actorName: string; changedAt: string }

export interface ReleaseActor { id: string; name: string }

const text = (max: number) => z.string().max(max);
export const itemPatchSchema = z.object({
  name: z.string().trim().min(1).max(200),
  areas: z.array(z.string().min(1)).max(30),
  description: text(4000),
  crossReferences: text(4000),
  crossReferenceIds: z.array(z.string().min(1)).max(50),
  devStatus: z.string().min(1).nullable(),
  functional: z.array(z.string().min(1)).max(10),
  statusComment: text(4000),
  notes: text(8000),
  releaseNotes: text(15000),
  translations: translationsSchema,
  completed: z.boolean()
}).partial().strict();
export type ItemPatch = z.infer<typeof itemPatchSchema>;

export const newItemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  nameDe: z.string().trim().min(1).max(200).optional(),
  parentId: z.string().min(1).nullable().optional()
}).strict();

export const optionInputSchema = z.object({
  label: z.string().trim().min(1).max(60),
  labelDe: z.string().trim().min(1).max(60).optional(),
  color: z.enum(optionColors)
}).strict();
export const optionPatchSchema = optionInputSchema.partial().strict();

export const commentSchema = z.object({ body: z.string().trim().min(1).max(4000) }).strict();

/** The shape `npm run release-list-import` reads; produced from the Slack List export. */
export const releaseSeedSchema = z.object({
  title: z.string().min(1),
  intro: z.string(),
  options: z.object({
    areas: z.array(z.object({ id: z.string(), en: z.string(), color: z.enum(optionColors) }).passthrough()),
    devStatus: z.array(z.object({ id: z.string(), en: z.string(), tone: z.enum(["success", "warning", "neutral", "danger"]) }).passthrough()),
    functional: z.array(z.object({ id: z.string(), en: z.string(), tone: z.enum(["success", "warning", "neutral", "danger"]) }).passthrough())
  }),
  features: z.array(z.object({
    sourceId: z.string(),
    parentSourceId: z.string().nullable(),
    name: z.string(),
    areas: z.array(z.string()),
    description: z.string(),
    crossReferences: z.string(),
    crossReferenceIds: z.array(z.string()),
    devStatus: z.string().nullable(),
    functional: z.array(z.string()),
    statusComment: z.string(),
    notes: z.string(),
    notes2: z.string(),
    completed: z.boolean()
  }).passthrough())
});
export type ReleaseSeed = z.infer<typeof releaseSeedSchema>;

const toneColor: Record<"success" | "warning" | "neutral" | "danger", OptionColor> = {
  success: "green", warning: "amber", neutral: "slate", danger: "rose"
};

export class ReleaseListError extends Error {
  constructor(readonly code: "list_not_found" | "item_not_found" | "option_not_found" | "unknown_option" | "list_exists" | "translation_exists" | "invalid_parent" | "invalid_reference") {
    super(code);
  }
}

interface ItemRow {
  id: string; list_id: string; parent_id: string | null; position: number; name: string; translations: string; areas: string; description: string;
  cross_references: string; cross_reference_ids: string; dev_status: string | null; functional: string; status_comment: string;
  notes: string; release_notes: string; completed: number; created_at: string; created_by: string; updated_at: string; updated_by: string; comment_count: number;
}
interface ListRow { id: string; project: string; title: string; title_de: string; intro: string; intro_de: string; updated_at: string }

export const releaseTranslationSchema = z.object({
  titleDe: z.string().min(1), introDe: z.string(),
  options: z.array(z.object({ field: z.enum(releaseSelectFields), id: z.string(), labelDe: z.string().min(1) })),
  items: z.array(z.object({ sourceId: z.string(), translations: translationsSchema.required({ name: true }) }))
}).strict();
export type ReleaseTranslationSeed = z.infer<typeof releaseTranslationSchema>;

const columnFor: Record<keyof ItemPatch, string> = {
  name: "name", translations: "translations", areas: "areas", description: "description", crossReferences: "cross_references",
  crossReferenceIds: "cross_reference_ids", devStatus: "dev_status", functional: "functional",
  statusComment: "status_comment", notes: "notes", releaseNotes: "release_notes", completed: "completed"
};

export class ReleaseListStore {
  constructor(private readonly sqlite: Database.Database, private readonly now: () => Date = () => new Date()) {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS release_lists (
        id TEXT PRIMARY KEY, project TEXT NOT NULL, title TEXT NOT NULL, title_de TEXT NOT NULL DEFAULT '', intro TEXT NOT NULL DEFAULT '', intro_de TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS release_list_options (
        list_id TEXT NOT NULL REFERENCES release_lists(id) ON DELETE CASCADE,
        field TEXT NOT NULL, id TEXT NOT NULL, label TEXT NOT NULL, label_de TEXT NOT NULL DEFAULT '', color TEXT NOT NULL, position INTEGER NOT NULL,
        PRIMARY KEY(list_id, field, id)
      );
      CREATE TABLE IF NOT EXISTS release_items (
        id TEXT PRIMARY KEY,
        list_id TEXT NOT NULL REFERENCES release_lists(id) ON DELETE CASCADE,
        parent_id TEXT REFERENCES release_items(id),
        position INTEGER NOT NULL, source_id TEXT, name TEXT NOT NULL, translations TEXT NOT NULL DEFAULT '{}',
        areas TEXT NOT NULL DEFAULT '[]', description TEXT NOT NULL DEFAULT '', cross_references TEXT NOT NULL DEFAULT '',
        cross_reference_ids TEXT NOT NULL DEFAULT '[]', dev_status TEXT, functional TEXT NOT NULL DEFAULT '[]',
        status_comment TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', completed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL, created_by TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL,
        archived_at TEXT, archived_by TEXT
      );
      CREATE INDEX IF NOT EXISTS release_items_list ON release_items(list_id, position);
      CREATE TABLE IF NOT EXISTS release_item_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT, item_id TEXT NOT NULL REFERENCES release_items(id) ON DELETE CASCADE,
        author_id TEXT NOT NULL, author_name TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS release_item_changes (
        id INTEGER PRIMARY KEY AUTOINCREMENT, item_id TEXT NOT NULL REFERENCES release_items(id) ON DELETE CASCADE,
        field TEXT NOT NULL, old_value TEXT NOT NULL, new_value TEXT NOT NULL,
        actor_id TEXT NOT NULL, actor_name TEXT NOT NULL, changed_at TEXT NOT NULL
      );
    `);
    // Added after the first live import; CREATE TABLE IF NOT EXISTS does not extend an existing table.
    const itemColumns = (sqlite.prepare("PRAGMA table_info(release_items)").all() as Array<{ name: string }>).map((column) => column.name);
    if (!itemColumns.includes("release_notes")) sqlite.exec("ALTER TABLE release_items ADD COLUMN release_notes TEXT NOT NULL DEFAULT ''");
    if (!itemColumns.includes("translations")) sqlite.exec("ALTER TABLE release_items ADD COLUMN translations TEXT NOT NULL DEFAULT '{}'");
    const listColumns = (sqlite.prepare("PRAGMA table_info(release_lists)").all() as Array<{ name: string }>).map((column) => column.name);
    if (!listColumns.includes("title_de")) sqlite.exec("ALTER TABLE release_lists ADD COLUMN title_de TEXT NOT NULL DEFAULT ''");
    if (!listColumns.includes("intro_de")) sqlite.exec("ALTER TABLE release_lists ADD COLUMN intro_de TEXT NOT NULL DEFAULT ''");
    const optionColumns = (sqlite.prepare("PRAGMA table_info(release_list_options)").all() as Array<{ name: string }>).map((column) => column.name);
    if (!optionColumns.includes("label_de")) sqlite.exec("ALTER TABLE release_list_options ADD COLUMN label_de TEXT NOT NULL DEFAULT ''");
  }

  lists(): ReleaseList[] {
    return this.sqlite.prepare("SELECT * FROM release_lists ORDER BY title").all()
      .map((row) => this.listFromRow(row as ListRow));
  }

  getList(listId: string): ReleaseList | null {
    const row = this.sqlite.prepare("SELECT * FROM release_lists WHERE id=?").get(listId);
    return row ? this.listFromRow(row as ListRow) : null;
  }

  options(listId: string): ReleaseOptions {
    const rows = this.sqlite.prepare("SELECT field, id, label, label_de, color, position FROM release_list_options WHERE list_id=? ORDER BY position, label")
      .all(listId) as Array<{ field: ReleaseSelectField; id: string; label: string; label_de: string; color: OptionColor; position: number }>;
    const result: ReleaseOptions = { areas: [], devStatus: [], functional: [] };
    for (const row of rows) result[row.field]?.push({ id: row.id, label: row.label, labelDe: row.label_de, color: row.color, position: row.position });
    return result;
  }

  items(listId: string): ReleaseItem[] {
    return (this.sqlite.prepare(`${this.itemSelect()} WHERE i.list_id=? AND i.archived_at IS NULL ORDER BY COALESCE(p.position, i.position), i.parent_id IS NOT NULL, i.position`).all(listId) as ItemRow[])
      .map((row) => this.itemFromRow(row));
  }

  getItem(listId: string, itemId: string): ReleaseItem {
    const row = this.sqlite.prepare(`${this.itemSelect()} WHERE i.list_id=? AND i.id=? AND i.archived_at IS NULL`).get(listId, itemId) as ItemRow | undefined;
    if (!row) throw new ReleaseListError("item_not_found");
    return this.itemFromRow(row);
  }

  createItem(listId: string, input: z.infer<typeof newItemSchema>, actor: ReleaseActor): ReleaseItem {
    this.requireList(listId);
    const parentId = input.parentId ?? null;
    // One level of sub-items only: archive, ordering and the UI all assume it.
    if (parentId && this.getItem(listId, parentId).parentId !== null) throw new ReleaseListError("invalid_parent");
    const at = this.now().toISOString();
    const id = randomUUID();
    const position = (this.sqlite.prepare("SELECT COALESCE(MAX(position), 0) AS p FROM release_items WHERE list_id=?").get(listId) as { p: number }).p + 1;
    this.sqlite.prepare(`INSERT INTO release_items(id,list_id,parent_id,position,name,translations,created_at,created_by,updated_at,updated_by)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).run(id, listId, parentId, position, input.name, JSON.stringify(input.nameDe ? { name: input.nameDe } : {}), at, actor.name, at, actor.name);
    this.recordChange(id, "created", "", input.name, actor, at);
    this.touchList(listId, at);
    return this.getItem(listId, id);
  }

  updateItem(listId: string, itemId: string, patch: ItemPatch, actor: ReleaseActor): ReleaseItem {
    const current = this.getItem(listId, itemId);
    const options = this.options(listId);
    const known = (field: ReleaseSelectField, values: string[]) => {
      const ids = new Set(options[field].map((option) => option.id));
      if (values.some((value) => !ids.has(value))) throw new ReleaseListError("unknown_option");
    };
    if (patch.areas) known("areas", patch.areas);
    if (patch.functional) known("functional", patch.functional);
    if (patch.devStatus) known("devStatus", [patch.devStatus]);
    if (patch.crossReferenceIds) {
      const active = new Set(this.items(listId).map((item) => item.id));
      if (patch.crossReferenceIds.some((id) => id === itemId || !active.has(id))) throw new ReleaseListError("invalid_reference");
    }
    const at = this.now().toISOString();
    const apply = this.sqlite.transaction(() => {
      for (const [key, value] of Object.entries(patch) as Array<[keyof ItemPatch, ItemPatch[keyof ItemPatch]]>) {
        if (value === undefined) continue;
        const before = current[key];
        const next = key === "translations" ? { ...current.translations, ...(value as ReleaseTranslations) } : Array.isArray(value) ? [...new Set(value)] : value;
        if (JSON.stringify(before) === JSON.stringify(next)) continue;
        const stored = Array.isArray(next) || key === "translations" ? JSON.stringify(next) : typeof next === "boolean" ? Number(next) : next;
        this.sqlite.prepare(`UPDATE release_items SET ${columnFor[key]}=?, updated_at=?, updated_by=? WHERE id=?`).run(stored, at, actor.name, itemId);
        this.recordChange(itemId, key, this.describe(before), this.describe(next), actor, at);
      }
      this.touchList(listId, at);
    });
    apply();
    return this.getItem(listId, itemId);
  }

  archiveItem(listId: string, itemId: string, actor: ReleaseActor): void {
    this.getItem(listId, itemId);
    const at = this.now().toISOString();
    this.sqlite.prepare("UPDATE release_items SET archived_at=?, archived_by=? WHERE id=? OR parent_id=?").run(at, actor.name, itemId, itemId);
    this.recordChange(itemId, "archived", "", "true", actor, at);
    this.touchList(listId, at);
  }

  addOption(listId: string, field: ReleaseSelectField, input: z.infer<typeof optionInputSchema>): ReleaseOption {
    this.requireList(listId);
    const position = (this.sqlite.prepare("SELECT COALESCE(MAX(position), 0) AS p FROM release_list_options WHERE list_id=? AND field=?").get(listId, field) as { p: number }).p + 1;
    const option: ReleaseOption = { id: `opt_${randomUUID().slice(0, 8)}`, label: input.label, labelDe: input.labelDe ?? "", color: input.color, position };
    this.sqlite.prepare("INSERT INTO release_list_options(list_id,field,id,label,label_de,color,position) VALUES(?,?,?,?,?,?,?)")
      .run(listId, field, option.id, option.label, option.labelDe, option.color, option.position);
    return option;
  }

  updateOption(listId: string, field: ReleaseSelectField, optionId: string, patch: z.infer<typeof optionPatchSchema>): ReleaseOption {
    const existing = this.options(listId)[field].find((option) => option.id === optionId);
    if (!existing) throw new ReleaseListError("option_not_found");
    const next = { ...existing, ...patch };
    this.sqlite.prepare("UPDATE release_list_options SET label=?, label_de=?, color=? WHERE list_id=? AND field=? AND id=?")
      .run(next.label, next.labelDe, next.color, listId, field, optionId);
    return next;
  }

  activity(listId: string, itemId: string): { comments: ReleaseComment[]; changes: ReleaseChange[] } {
    this.getItem(listId, itemId);
    const comments = (this.sqlite.prepare("SELECT id, item_id, author_name, body, created_at FROM release_item_comments WHERE item_id=? ORDER BY id").all(itemId) as Array<{ id: number; item_id: string; author_name: string; body: string; created_at: string }>)
      .map((row) => ({ id: row.id, itemId: row.item_id, authorName: row.author_name, body: row.body, createdAt: row.created_at }));
    const changes = (this.sqlite.prepare("SELECT id, item_id, field, old_value, new_value, actor_name, changed_at FROM release_item_changes WHERE item_id=? ORDER BY id DESC LIMIT 100").all(itemId) as Array<{ id: number; item_id: string; field: string; old_value: string; new_value: string; actor_name: string; changed_at: string }>)
      .map((row) => ({ id: row.id, itemId: row.item_id, field: row.field, oldValue: row.old_value, newValue: row.new_value, actorName: row.actor_name, changedAt: row.changed_at }));
    return { comments, changes };
  }

  addComment(listId: string, itemId: string, body: string, actor: ReleaseActor): ReleaseComment {
    this.getItem(listId, itemId);
    const at = this.now().toISOString();
    const result = this.sqlite.prepare("INSERT INTO release_item_comments(item_id,author_id,author_name,body,created_at) VALUES(?,?,?,?,?)")
      .run(itemId, actor.id, actor.name, body, at);
    return { id: Number(result.lastInsertRowid), itemId, authorName: actor.name, body, createdAt: at };
  }

  /**
   * One-shot import of a translated Slack List export. Refuses to touch an
   * existing list unless `replace` is set, so a second run cannot silently
   * overwrite edits the team made in the meantime.
   */
  importSeed(listId: string, project: string, seed: ReleaseSeed, options: { replace?: boolean; actorName?: string } = {}): { items: number } {
    const actor = options.actorName ?? "Slack import";
    const at = this.now().toISOString();
    const run = this.sqlite.transaction(() => {
      // The export does not promise parents before their sub-items; check the links at commit.
      this.sqlite.pragma("defer_foreign_keys = ON");
      if (this.getList(listId)) {
        if (!options.replace) throw new ReleaseListError("list_exists");
        this.sqlite.prepare("DELETE FROM release_lists WHERE id=?").run(listId);
      }
      this.sqlite.prepare("INSERT INTO release_lists(id,project,title,intro,created_at,updated_at) VALUES(?,?,?,?,?,?)")
        .run(listId, project, seed.title, seed.intro, at, at);
      const insertOption = this.sqlite.prepare("INSERT INTO release_list_options(list_id,field,id,label,color,position) VALUES(?,?,?,?,?,?)");
      seed.options.areas.forEach((option, index) => insertOption.run(listId, "areas", option.id, option.en, option.color, index + 1));
      seed.options.devStatus.forEach((option, index) => insertOption.run(listId, "devStatus", option.id, option.en, toneColor[option.tone], index + 1));
      seed.options.functional.forEach((option, index) => insertOption.run(listId, "functional", option.id, option.en, toneColor[option.tone], index + 1));
      const ids = new Map(seed.features.map((feature) => [feature.sourceId, randomUUID()]));
      // A dangling reference would otherwise import as a top-level item or a lost link, and nobody would notice.
      const dangling = seed.features.flatMap((feature) => [feature.parentSourceId, ...feature.crossReferenceIds])
        .filter((sourceId): sourceId is string => sourceId !== null && !ids.has(sourceId));
      if (dangling.length) throw new ReleaseListError("invalid_reference");
      // Deferred checks only prove the parent exists; keep the one-level hierarchy createItem enforces, which also rules out cycles.
      const parentOf = new Map(seed.features.map((feature) => [feature.sourceId, feature.parentSourceId]));
      if (seed.features.some((feature) => feature.parentSourceId !== null && parentOf.get(feature.parentSourceId) !== null)) throw new ReleaseListError("invalid_parent");
      const known = (field: ReleaseSelectField) => new Set(seed.options[field].map((option) => option.id));
      const areaIds = known("areas"), statusIds = known("devStatus"), stagingIds = known("functional");
      const unknownOption = seed.features.some((feature) => feature.areas.some((id) => !areaIds.has(id))
        || feature.functional.some((id) => !stagingIds.has(id)) || (feature.devStatus !== null && !statusIds.has(feature.devStatus)));
      if (unknownOption) throw new ReleaseListError("unknown_option");
      const insertItem = this.sqlite.prepare(`INSERT INTO release_items(id,list_id,parent_id,position,source_id,name,areas,description,cross_references,
        cross_reference_ids,dev_status,functional,status_comment,notes,completed,created_at,created_by,updated_at,updated_by)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      seed.features.forEach((feature, index) => {
        const notes = [feature.notes, feature.notes2].filter((value) => value.trim()).join("\n\n");
        insertItem.run(
          ids.get(feature.sourceId), listId, feature.parentSourceId ? ids.get(feature.parentSourceId) : null, index + 1,
          feature.sourceId, feature.name, JSON.stringify(feature.areas), feature.description, feature.crossReferences,
          JSON.stringify(feature.crossReferenceIds.map((sourceId) => ids.get(sourceId))),
          feature.devStatus, JSON.stringify(feature.functional), feature.statusComment, notes, Number(feature.completed),
          at, actor, at, actor
        );
      });
      return { items: seed.features.length };
    });
    return run();
  }

  /**
   * Add German originals by stable Slack IDs without replacing English text, comments, or status edits.
   * Only imported records are matched; items and options the team added since need no translation.
   */
  importTranslations(listId: string, seed: ReleaseTranslationSeed): { items: number; options: number } {
    return this.sqlite.transaction(() => {
      // Read inside the write transaction, so two concurrent runs cannot both pass this check.
      const list = this.getList(listId);
      if (!list) throw new ReleaseListError("list_not_found");
      if (list.titleDe) throw new ReleaseListError("translation_exists");
      const imported = this.sqlite.prepare("SELECT source_id, archived_at FROM release_items WHERE list_id=? AND source_id IS NOT NULL")
        .all(listId) as Array<{ source_id: string; archived_at: string | null }>;
      const importedIds = new Set(imported.map((row) => row.source_id));
      const seedIds = new Set(seed.items.map((item) => item.sourceId));
      // Every active imported item needs a German name; archived ones may be in the file or not.
      if (seedIds.size !== seed.items.length || seed.items.some((item) => !importedIds.has(item.sourceId))
        || imported.some((row) => row.archived_at === null && !seedIds.has(row.source_id))) throw new ReleaseListError("invalid_reference");
      // The same option ID may exist in several fields, so field plus ID is the key.
      const optionKey = (field: string, id: string) => `${field}\u0000${id}`;
      const knownOptions = this.sqlite.prepare("SELECT field, id FROM release_list_options WHERE list_id=?").all(listId) as Array<{ field: string; id: string }>;
      const optionKeys = new Set(knownOptions.map((row) => optionKey(row.field, row.id)));
      const seedOptionKeys = new Set(seed.options.map((option) => optionKey(option.field, option.id)));
      if (seedOptionKeys.size !== seed.options.length || seed.options.some((option) => !optionKeys.has(optionKey(option.field, option.id)))) throw new ReleaseListError("unknown_option");
      this.sqlite.prepare("UPDATE release_lists SET title_de=?, intro_de=? WHERE id=?").run(seed.titleDe, seed.introDe, listId);
      const updateOption = this.sqlite.prepare("UPDATE release_list_options SET label_de=? WHERE list_id=? AND field=? AND id=?");
      for (const option of seed.options) updateOption.run(option.labelDe, listId, option.field, option.id);
      const updateItem = this.sqlite.prepare("UPDATE release_items SET translations=? WHERE list_id=? AND source_id=?");
      for (const item of seed.items) updateItem.run(JSON.stringify(item.translations), listId, item.sourceId);
      return { items: seed.items.length, options: seed.options.length };
    })();
  }

  private requireList(listId: string) {
    if (!this.getList(listId)) throw new ReleaseListError("list_not_found");
  }

  private touchList(listId: string, at: string) {
    this.sqlite.prepare("UPDATE release_lists SET updated_at=? WHERE id=?").run(at, listId);
  }

  private recordChange(itemId: string, field: string, oldValue: string, newValue: string, actor: ReleaseActor, at: string) {
    this.sqlite.prepare("INSERT INTO release_item_changes(item_id,field,old_value,new_value,actor_id,actor_name,changed_at) VALUES(?,?,?,?,?,?,?)")
      .run(itemId, field, oldValue, newValue, actor.id, actor.name, at);
  }

  private describe(value: unknown): string {
    if (value === null || value === undefined) return "";
    return typeof value === "string" ? value : JSON.stringify(value);
  }

  private itemSelect() {
    return `SELECT i.*, (SELECT COUNT(*) FROM release_item_comments c WHERE c.item_id=i.id) AS comment_count FROM release_items i LEFT JOIN release_items p ON p.id=i.parent_id`;
  }

  private listFromRow(row: ListRow): ReleaseList {
    return { id: row.id, project: row.project, title: row.title, titleDe: row.title_de, intro: row.intro, introDe: row.intro_de, updatedAt: row.updated_at };
  }

  private itemFromRow(row: ItemRow): ReleaseItem {
    return {
      id: row.id, listId: row.list_id, parentId: row.parent_id, position: row.position, name: row.name, translations: JSON.parse(row.translations),
      areas: JSON.parse(row.areas), description: row.description, crossReferences: row.cross_references,
      crossReferenceIds: JSON.parse(row.cross_reference_ids), devStatus: row.dev_status, functional: JSON.parse(row.functional),
      statusComment: row.status_comment, notes: row.notes, releaseNotes: row.release_notes, completed: row.completed === 1,
      createdAt: row.created_at, createdBy: row.created_by, updatedAt: row.updated_at, updatedBy: row.updated_by,
      commentCount: row.comment_count
    };
  }
}
