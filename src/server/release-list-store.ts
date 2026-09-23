import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { z } from "zod";

export const releaseSelectFields = ["areas", "devStatus", "functional"] as const;
export type ReleaseSelectField = typeof releaseSelectFields[number];
export const optionColors = ["blue", "amber", "violet", "green", "rose", "slate", "teal", "orange"] as const;
export type OptionColor = typeof optionColors[number];

export interface ReleaseOption { id: string; label: string; color: OptionColor; position: number }
export type ReleaseOptions = Record<ReleaseSelectField, ReleaseOption[]>;

export interface ReleaseList { id: string; project: string; title: string; intro: string; updatedAt: string }

export interface ReleaseItem {
  id: string;
  listId: string;
  parentId: string | null;
  position: number;
  name: string;
  areas: string[];
  description: string;
  crossReferences: string;
  crossReferenceIds: string[];
  devStatus: string | null;
  functional: string[];
  statusComment: string;
  notes: string;
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
  completed: z.boolean()
}).partial().strict();
export type ItemPatch = z.infer<typeof itemPatchSchema>;

export const newItemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  parentId: z.string().min(1).nullable().optional()
}).strict();

export const optionInputSchema = z.object({
  label: z.string().trim().min(1).max(60),
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
  constructor(readonly code: "list_not_found" | "item_not_found" | "option_not_found" | "unknown_option" | "list_exists" | "invalid_parent") {
    super(code);
  }
}

interface ItemRow {
  id: string; list_id: string; parent_id: string | null; position: number; name: string; areas: string; description: string;
  cross_references: string; cross_reference_ids: string; dev_status: string | null; functional: string; status_comment: string;
  notes: string; completed: number; created_at: string; created_by: string; updated_at: string; updated_by: string; comment_count: number;
}

const columnFor: Record<keyof ItemPatch, string> = {
  name: "name", areas: "areas", description: "description", crossReferences: "cross_references",
  crossReferenceIds: "cross_reference_ids", devStatus: "dev_status", functional: "functional",
  statusComment: "status_comment", notes: "notes", completed: "completed"
};

export class ReleaseListStore {
  constructor(private readonly sqlite: Database.Database, private readonly now: () => Date = () => new Date()) {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS release_lists (
        id TEXT PRIMARY KEY, project TEXT NOT NULL, title TEXT NOT NULL, intro TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS release_list_options (
        list_id TEXT NOT NULL REFERENCES release_lists(id) ON DELETE CASCADE,
        field TEXT NOT NULL, id TEXT NOT NULL, label TEXT NOT NULL, color TEXT NOT NULL, position INTEGER NOT NULL,
        PRIMARY KEY(list_id, field, id)
      );
      CREATE TABLE IF NOT EXISTS release_items (
        id TEXT PRIMARY KEY,
        list_id TEXT NOT NULL REFERENCES release_lists(id) ON DELETE CASCADE,
        parent_id TEXT REFERENCES release_items(id),
        position INTEGER NOT NULL, source_id TEXT, name TEXT NOT NULL,
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
  }

  lists(): ReleaseList[] {
    return this.sqlite.prepare("SELECT id, project, title, intro, updated_at FROM release_lists ORDER BY title").all()
      .map((row) => this.listFromRow(row as { id: string; project: string; title: string; intro: string; updated_at: string }));
  }

  getList(listId: string): ReleaseList | null {
    const row = this.sqlite.prepare("SELECT id, project, title, intro, updated_at FROM release_lists WHERE id=?").get(listId);
    return row ? this.listFromRow(row as { id: string; project: string; title: string; intro: string; updated_at: string }) : null;
  }

  options(listId: string): ReleaseOptions {
    const rows = this.sqlite.prepare("SELECT field, id, label, color, position FROM release_list_options WHERE list_id=? ORDER BY position, label")
      .all(listId) as Array<{ field: ReleaseSelectField; id: string; label: string; color: OptionColor; position: number }>;
    const result: ReleaseOptions = { areas: [], devStatus: [], functional: [] };
    for (const row of rows) result[row.field]?.push({ id: row.id, label: row.label, color: row.color, position: row.position });
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
    if (parentId) this.getItem(listId, parentId);
    const at = this.now().toISOString();
    const id = randomUUID();
    const position = (this.sqlite.prepare("SELECT COALESCE(MAX(position), 0) AS p FROM release_items WHERE list_id=?").get(listId) as { p: number }).p + 1;
    this.sqlite.prepare(`INSERT INTO release_items(id,list_id,parent_id,position,name,created_at,created_by,updated_at,updated_by)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(id, listId, parentId, position, input.name, at, actor.name, at, actor.name);
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
    const at = this.now().toISOString();
    const apply = this.sqlite.transaction(() => {
      for (const [key, value] of Object.entries(patch) as Array<[keyof ItemPatch, ItemPatch[keyof ItemPatch]]>) {
        if (value === undefined) continue;
        const before = current[key];
        const next = Array.isArray(value) ? [...new Set(value)] : value;
        if (JSON.stringify(before) === JSON.stringify(next)) continue;
        const stored = Array.isArray(next) ? JSON.stringify(next) : typeof next === "boolean" ? Number(next) : next;
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
    const option: ReleaseOption = { id: `opt_${randomUUID().slice(0, 8)}`, label: input.label, color: input.color, position };
    this.sqlite.prepare("INSERT INTO release_list_options(list_id,field,id,label,color,position) VALUES(?,?,?,?,?,?)")
      .run(listId, field, option.id, option.label, option.color, option.position);
    return option;
  }

  updateOption(listId: string, field: ReleaseSelectField, optionId: string, patch: z.infer<typeof optionPatchSchema>): ReleaseOption {
    const existing = this.options(listId)[field].find((option) => option.id === optionId);
    if (!existing) throw new ReleaseListError("option_not_found");
    const next = { ...existing, ...patch };
    this.sqlite.prepare("UPDATE release_list_options SET label=?, color=? WHERE list_id=? AND field=? AND id=?")
      .run(next.label, next.color, listId, field, optionId);
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
      const insertItem = this.sqlite.prepare(`INSERT INTO release_items(id,list_id,parent_id,position,source_id,name,areas,description,cross_references,
        cross_reference_ids,dev_status,functional,status_comment,notes,completed,created_at,created_by,updated_at,updated_by)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      seed.features.forEach((feature, index) => {
        const notes = [feature.notes, feature.notes2].filter((value) => value.trim()).join("\n\n");
        insertItem.run(
          ids.get(feature.sourceId), listId, feature.parentSourceId ? ids.get(feature.parentSourceId) ?? null : null, index + 1,
          feature.sourceId, feature.name, JSON.stringify(feature.areas), feature.description, feature.crossReferences,
          JSON.stringify(feature.crossReferenceIds.map((sourceId) => ids.get(sourceId)).filter(Boolean)),
          feature.devStatus, JSON.stringify(feature.functional), feature.statusComment, notes, Number(feature.completed),
          at, actor, at, actor
        );
      });
      return { items: seed.features.length };
    });
    return run();
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

  private listFromRow(row: { id: string; project: string; title: string; intro: string; updated_at: string }): ReleaseList {
    return { id: row.id, project: row.project, title: row.title, intro: row.intro, updatedAt: row.updated_at };
  }

  private itemFromRow(row: ItemRow): ReleaseItem {
    return {
      id: row.id, listId: row.list_id, parentId: row.parent_id, position: row.position, name: row.name,
      areas: JSON.parse(row.areas), description: row.description, crossReferences: row.cross_references,
      crossReferenceIds: JSON.parse(row.cross_reference_ids), devStatus: row.dev_status, functional: JSON.parse(row.functional),
      statusComment: row.status_comment, notes: row.notes, completed: row.completed === 1,
      createdAt: row.created_at, createdBy: row.created_by, updatedAt: row.updated_at, updatedBy: row.updated_by,
      commentCount: row.comment_count
    };
  }
}
