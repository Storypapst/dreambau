import express from "express";
import { z } from "zod";
import type { HumanUser } from "../passkey-store.js";
import { WorkStateError, type RepoScope } from "./model.js";
import type { WorkStateStore } from "./store.js";

/** Must be mounted behind requireActiveHumanSession. No grants can be mutated here. */
export function createWorkStateRouter(store: WorkStateStore | undefined) {
  const router = express.Router();
  router.use((_req, res, next) => {
    const user = res.locals.humanUser as HumanUser | undefined;
    if (!user || user.status !== "active") return res.status(403).json({ error: "strong_auth_required" });
    if (!user.projects.includes("oriso")) return res.status(403).json({ error: "scope_denied" });
    if (!store) return res.status(503).json({ error: "work_state_unavailable" });
    res.locals.workStateScope = { project: "oriso", actorId: user.id } satisfies RepoScope;
    next();
  });
  const scope = (res: express.Response) => res.locals.workStateScope as RepoScope;
  router.get("/repositories", (_req, res) => res.json({ items: store!.listRepositories(scope(res)) }));
  router.get("/pulls", (req, res) => res.json(store!.listPullRequests(scope(res), req.query)));
  router.get("/items", (_req, res) => res.json({ items: store!.listWorkItems(scope(res)) }));
  router.post("/items", (req, res) => res.status(201).json(store!.createWorkItem(scope(res), req.body)));
  router.get("/items/:id", (req, res) => res.json(store!.getWorkItem(scope(res), String(req.params.id))));
  router.put("/items/:id/checkpoint", (req, res) => res.json(store!.writeCheckpoint(scope(res), String(req.params.id), req.body)));
  router.put("/items/:id/links", (req, res) => res.json(store!.updateWorkItemLinks(scope(res), String(req.params.id), req.body)));
  router.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof WorkStateError) return res.status(error.status).json({ error: error.message });
    if (error instanceof z.ZodError) return res.status(400).json({ error: "invalid_work_state_input" });
    res.status(500).json({ error: "work_state_failed" });
  });
  return router;
}
