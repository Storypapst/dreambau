import express from "express";
import { z } from "zod";
import type { HumanUser } from "./passkey-store.js";
import {
  commentSchema,
  itemPatchSchema,
  newItemSchema,
  optionInputSchema,
  optionPatchSchema,
  releaseSelectFields,
  ReleaseListError,
  type ReleaseItem,
  type ReleaseListStore,
  type ReleaseOptions
} from "./release-list-store.js";

const fieldSchema = z.enum(releaseSelectFields);

const statusFor: Record<ReleaseListError["code"], number> = {
  list_not_found: 404, item_not_found: 404, option_not_found: 404, unknown_option: 400, list_exists: 409, invalid_parent: 400, invalid_reference: 400
};

/**
 * Human-only routes for the release feature lists. The caller mounts it behind
 * `requireActiveHumanSession`, so `res.locals.humanUser` is always set; a list
 * is visible only to people granted the list's project.
 */
export function createReleaseListRouter(store: ReleaseListStore) {
  const router = express.Router();
  // Project-scoped team data: keep it out of shared browser and proxy caches.
  router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  const user = (res: express.Response) => res.locals.humanUser as HumanUser;
  const actor = (res: express.Response) => ({ id: user(res).id, name: user(res).name });

  router.param("listId", (req, res, next, listId: string) => {
    const list = store.getList(listId);
    if (!list) return res.status(404).json({ error: "list_not_found" });
    if (!(user(res).projects as string[]).includes(list.project)) return res.status(403).json({ error: "scope_denied" });
    next();
  });

  const handle = (work: (req: express.Request, res: express.Response) => void): express.RequestHandler => (req, res, next) => {
    try { work(req, res); }
    catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: "validation_failed", fieldErrors: error.flatten().fieldErrors });
      if (error instanceof ReleaseListError) return res.status(statusFor[error.code]).json({ error: error.code });
      next(error);
    }
  };

  router.get("/", (_req, res) => {
    const projects = user(res).projects as string[];
    res.json(store.lists().filter((list) => projects.includes(list.project))
      .map((list) => ({ ...list, itemCount: store.items(list.id).length })));
  });

  router.get("/:listId", handle((req, res) => {
    const listId = String(req.params.listId);
    res.json({ list: store.getList(listId), options: store.options(listId), items: store.items(listId) });
  }));

  router.get("/:listId/export.csv", handle((req, res) => {
    const listId = String(req.params.listId);
    const list = store.getList(listId)!;
    res.type("text/csv; charset=utf-8")
      .attachment(`${list.id}.csv`)
      .send(toCsv(store.items(listId), store.options(listId)));
  }));

  router.post("/:listId/items", handle((req, res) => {
    res.status(201).json(store.createItem(String(req.params.listId), newItemSchema.parse(req.body), actor(res)));
  }));

  router.patch("/:listId/items/:itemId", handle((req, res) => {
    res.json(store.updateItem(String(req.params.listId), String(req.params.itemId), itemPatchSchema.parse(req.body), actor(res)));
  }));

  router.delete("/:listId/items/:itemId", handle((req, res) => {
    store.archiveItem(String(req.params.listId), String(req.params.itemId), actor(res));
    res.status(204).end();
  }));

  router.get("/:listId/items/:itemId/activity", handle((req, res) => {
    res.json(store.activity(String(req.params.listId), String(req.params.itemId)));
  }));

  router.post("/:listId/items/:itemId/comments", handle((req, res) => {
    const { body } = commentSchema.parse(req.body);
    res.status(201).json(store.addComment(String(req.params.listId), String(req.params.itemId), body, actor(res)));
  }));

  router.post("/:listId/options/:field", handle((req, res) => {
    const field = fieldSchema.parse(String(req.params.field));
    res.status(201).json(store.addOption(String(req.params.listId), field, optionInputSchema.parse(req.body)));
  }));

  router.patch("/:listId/options/:field/:optionId", handle((req, res) => {
    const field = fieldSchema.parse(String(req.params.field));
    res.json(store.updateOption(String(req.params.listId), field, String(req.params.optionId), optionPatchSchema.parse(req.body)));
  }));

  return router;
}

function toCsv(items: ReleaseItem[], options: ReleaseOptions): string {
  const label = (field: keyof ReleaseOptions, ids: string[]) =>
    ids.map((id) => options[field].find((option) => option.id === id)?.label ?? id).join("; ");
  const names = new Map(items.map((item) => [item.id, item.name]));
  const header = ["Feature", "Areas", "Description", "Cross-references", "Status on Dev", "Staging", "Status comment", "Notes", "Release notes", "Parent", "Completed"];
  const rows = items.map((item) => [
    item.name, label("areas", item.areas), item.description,
    [item.crossReferences, ...item.crossReferenceIds.map((id) => names.get(id) ?? "")].filter(Boolean).join("; "),
    label("devStatus", item.devStatus ? [item.devStatus] : []), label("functional", item.functional),
    item.statusComment, item.notes, item.releaseNotes, item.parentId ? names.get(item.parentId) ?? "" : "", item.completed ? "yes" : "no"
  ]);
  const cell = (value: string) => {
    // Spreadsheet apps evaluate =, +, - or @ as a formula, even behind leading whitespace, and treat a leading tab or CR alike.
    const safe = /^(\s*[=+\-@]|[\t\r])/.test(value) ? `'${value}` : value;
    return /[",\n\r]/.test(safe) ? `"${safe.replaceAll("\"", "\"\"")}"` : safe;
  };
  return `﻿${[header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n")}\r\n`;
}
