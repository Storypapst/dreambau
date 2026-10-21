import express from "express";
import { z } from "zod";
import {
  createMachineAuthMiddleware,
  type MachineIdentitySource,
} from "../machine-auth.js";
import { machineCan, type MachineIdentity } from "../machine-access.js";
import { createContextRoutes } from "./router.js";
import { createContextService } from "./context.js";
import { WorkStateError } from "./model.js";
import type { WorkStateStore } from "./store.js";
import type { FreshnessMode } from "./classify.js";
export function createWorkStateMachineRouter(
  store: WorkStateStore | undefined,
  options: {
    identities: MachineIdentitySource;
    mode?: FreshnessMode;
    onAuthenticated?: (id: MachineIdentity) => void;
  },
) {
  const router = express.Router();
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  router.use(createMachineAuthMiddleware(options));
  router.use((req, res, next) => {
    const identity = res.locals.machineIdentity as MachineIdentity;
    const action =
      req.method === "GET" ? "work-state:read" : "work-state:checkpoint";
    if (!identity.projects.includes("oriso") || !machineCan(identity, action))
      return res.status(403).json({ error: "scope_denied" });
    if (!store)
      return res.status(503).json({ error: "work_state_unavailable" });
    res.locals.workStateScope = { project: "oriso", actorId: identity.id };
    next();
  });
  router.get("/attention", (req, res) =>
    res.json(
      createContextService(store!, {
        basePath: "/work-state/api/v1",
        mode: options.mode,
      }).summary(res.locals.workStateScope, req.query),
    ),
  );
  router.use(
    createContextRoutes(store, {
      basePath: "/work-state/api/v1",
      mode: options.mode,
    }),
  );
  router.put("/items/:id/checkpoint", (req, res) => {
    const key = z
      .string()
      .regex(/^[A-Za-z0-9._-]{1,200}$/)
      .parse(req.header("Idempotency-Key"));
    res.json(
      store!.writeCheckpointOnce(
        res.locals.workStateScope,
        String(req.params.id),
        req.body,
        key,
      ),
    );
  });
  router.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (err instanceof WorkStateError)
        return res.status(err.status).json({ error: err.message });
      if (err instanceof z.ZodError)
        return res.status(400).json({ error: "invalid_work_state_input" });
      res.status(500).json({ error: "work_state_failed" });
    },
  );
  return router;
}
