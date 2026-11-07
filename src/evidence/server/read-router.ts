import express from "express";
import { z } from "zod";
import { machineCan, type MachineIdentity } from "../../server/machine-access.js";
import type { EvidenceStore } from "../store.js";
import { ObjectNotFoundError, type ObjectStore } from "../storage.js";

const environmentSchema = z.enum(["local", "pre-dev", "dev", "production-test"]);
const querySchema = z.object({ project: z.enum(["oriso", "orimo", "dreambau"]).optional(), environment: environmentSchema.optional(), environments: z.string().transform(value => value.split(",")).pipe(z.array(environmentSchema).min(1).max(4)).optional(), ids: z.string().transform(value => value.split(",")).pipe(z.array(z.string().min(1).max(240)).min(1).max(50)).optional(), q: z.string().max(200).optional(), result: z.enum(["PASS", "FAIL", "FLAKY", "BLOCKED", "INFORMATIONAL"]).optional(), cursor: z.string().max(1000).optional(), limit: z.coerce.number().int().min(1).max(100).default(20) }).strict();
const cursorSchema = z.object({ createdAt: z.iso.datetime(), id: z.string().max(300) }).strict();
export function createEvidenceReadRouter({ store, objectStore }: { store: EvidenceStore; objectStore: ObjectStore }) {
  const router = express.Router();
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!machineCan(res.locals.machineIdentity as MachineIdentity, "evidence:read")) return res.status(403).json({ error: "action_denied" });
    next();
  });
  for (const documents of [false, true]) router.get(documents ? "/documents" : "/runs", (req, res) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "invalid_query" });
    const identity = res.locals.machineIdentity as MachineIdentity;
    const input = parsed.data;
    if ((input.project && !identity.projects.includes(input.project)) || (input.environment && !identity.environments.includes(input.environment)) || input.environments?.some(environment => !identity.environments.includes(environment))) return res.status(403).json({ error: "scope_denied" });
    let before: z.infer<typeof cursorSchema> | undefined;
    if (input.cursor) {
      try { before = cursorSchema.parse(JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8"))); }
      catch { return res.status(400).json({ error: "invalid_cursor" }); }
    }
    const filter = { ...input, projects: identity.projects, environments: input.environments ?? identity.environments, before, limit: input.limit + 1 };
    if (documents) {
      const rows = store.readDocuments(filter); const items = rows.slice(0, input.limit);
      const last = items.at(-1);
      const nextCursor = rows.length > input.limit && last ? Buffer.from(JSON.stringify({ createdAt: last.run.createdAt, id: last.file.id })).toString("base64url") : null;
      return res.json({ items, nextCursor });
    }
    const rows = store.readRuns(filter); const runs = rows.slice(0, input.limit);
    const last = runs.at(-1);
    const counts = store.fileCounts(runs.map(run => run.id));
    const items = runs.map(run => ({ ...run, filesCount: counts[run.id] ?? 0 }));
    const nextCursor = rows.length > input.limit && last ? Buffer.from(JSON.stringify({ createdAt: last.createdAt, id: last.id })).toString("base64url") : null;
    return res.json({ items, nextCursor });
  });

  router.get("/runs/:runId/files/:fileId/content", async (req, res, next) => {
    const identity = res.locals.machineIdentity as MachineIdentity;
    const run = store.getRun(String(req.params.runId));
    if (!run || !identity.projects.includes(run.project) || !identity.environments.includes(run.environment) || run.state === "quarantined" || run.state === "archived") return res.status(404).json({ error: "file_not_found" });
    const file = store.getFile(String(req.params.fileId)); const key = file ? store.servedKeyFor(file.id) : null;
    const mime = file?.contentType.split(";")[0];
    const safe = mime && /^(image\/(png|jpeg|webp)|video\/mp4|text\/(plain|markdown)|application\/(json|pdf|zip))$/.test(mime);
    if (!file || file.runId !== run.id || file.processingState !== "ready" || !key || !safe) return res.status(404).json({ error: "file_not_found" });
    try {
      const head = await objectStore.head(key);
      if (!head) return res.status(404).json({ error: "file_not_found" });
      let start = 0; let end = head.byteSize - 1; let partial = false;
      const range = req.get("Range");
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!match || (!match[1] && !match[2])) return res.status(416).set("Content-Range", `bytes */${head.byteSize}`).end();
        start = match[1] ? Number(match[1]) : Math.max(0, head.byteSize - Number(match[2]));
        end = match[1] && match[2] ? Math.min(end, Number(match[2])) : end;
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= head.byteSize) return res.status(416).set("Content-Range", `bytes */${head.byteSize}`).end();
        partial = true;
      }
      res.set({ "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Referrer-Policy": "no-referrer", "Accept-Ranges": "bytes", "Content-Type": mime === "text/markdown" ? "text/plain; charset=utf-8" : file.contentType });
      const inline = /^(image\/|video\/|text\/|application\/json)/.test(mime!) && req.query.download !== "1";
      res.set("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${file.filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`);
      res.status(partial ? 206 : 200).set("Content-Length", String(Math.max(0, end - start + 1)));
      if (partial) res.set("Content-Range", `bytes ${start}-${end}/${head.byteSize}`);
      if (req.method === "HEAD") return res.end();
      for (let offset = start; offset <= end; offset += 4 * 1024 * 1024) {
        if (res.destroyed) break;
        const bytes = await objectStore.getRange(key, offset, Math.min(4 * 1024 * 1024, end - offset + 1));
        if (!bytes.length) throw new Error("evidence content truncated");
        if (!res.write(bytes)) await new Promise<void>(resolve => {
          const finish = () => { res.off("drain", finish); res.off("close", finish); resolve(); };
          res.once("drain", finish); res.once("close", finish);
        });
      }
      return res.end();
    } catch (error) {
      if (res.headersSent) { res.destroy(); return; }
      if (error instanceof ObjectNotFoundError) return res.status(404).json({ error: "file_not_found" });
      next(error);
    }
  });
  return router;
}
