import express from "express";
import type { RegistryDatabase } from "./db.js";
import type { RegistryProvider } from "./infisical-provider.js";
import type { OrisoIdentityObserver } from "./oriso-identity-observation.js";
import { machineCan, type MachineIdentity } from "./machine-access.js";
import { fixturePlanInputSchema } from "./test-fixture-plan-model.js";
import { createFixturePlanner } from "./test-fixture-planner.js";

export function createTestFixturePlanRouter(options: { database: RegistryDatabase; registryProvider: RegistryProvider; observer?: OrisoIdentityObserver; now?: () => Date }) {
  const router = express.Router({ mergeParams: true });
  const planner = createFixturePlanner(options);
  function visibleRun(req: express.Request, identity: MachineIdentity) {
    const run = options.database.testRuns.get(String(req.params.runId));
    return run && identity.projects.includes(run.project) && identity.environments.includes(run.targetEnvironment) && identity.environments.includes(run.poolEnvironment) ? run : null;
  }
  router.post("/", async (req, res, next) => {
    const identity = res.locals.machineIdentity as MachineIdentity;
    if (!machineCan(identity, "fixtures:plan")) return res.status(403).json({ error: "action_denied" });
    const parsed = fixturePlanInputSchema.safeParse(req.body);
    if (!parsed.success || Object.keys(req.query).length) return res.status(400).json({ error: "invalid_fixture_plan" });
    const run = visibleRun(req, identity);
    if (!run) return res.status(404).json({ error: "run_not_found" });
    try {
      return res.status(201).json(await planner.create(run.id, parsed.data.templateVersion, { type: "machine", id: identity.id }));
    } catch (error) {
      if (error instanceof Error && error.message === "run_changed") return res.status(409).json({ error: "run_changed" });
      if (error instanceof Error && error.message === "registry_unavailable") return res.status(503).json({ error: "registry_unavailable" });
      next(error);
    }
  });
  router.get("/:planId", async (req, res, next) => {
    const identity = res.locals.machineIdentity as MachineIdentity;
    if (!machineCan(identity, "runs:read")) return res.status(403).json({ error: "action_denied" });
    if (!visibleRun(req, identity)) return res.status(404).json({ error: "run_not_found" });
    if (Object.keys(req.query).length) return res.status(400).json({ error: "invalid_query" });
    try {
      const plan = await planner.get(String((req.params as Record<string, string>).runId), String(req.params.planId));
      return plan ? res.json(plan) : res.status(404).json({ error: "plan_not_found" });
    } catch (error) { next(error); }
  });
  return router;
}
