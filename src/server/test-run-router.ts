import { randomUUID } from "node:crypto";
import express from "express";
import type { RegistryDatabase } from "./db.js";
import type { RegistryProvider } from "./infisical-provider.js";
import { machineCan, type MachineIdentity } from "./machine-access.js";
import { createRunInputSchema } from "./test-run-model.js";
import { InsufficientAccountsError } from "./test-run-store.js";
import { z } from "zod";

const listRunsQuerySchema = z.object({
  project: z.enum(["oriso", "orimo", "dreambau"]).optional(),
  targetEnvironment: z.enum(["local", "pre-dev", "dev", "production-test"]).optional()
}).strict();

const finishRunSchema = z.object({
  result: z.enum(["passed", "failed"]),
  evidence: z.object({
    checks: z.number().int().nonnegative().optional(),
    failures: z.number().int().nonnegative().optional(),
    reportUrl: z.string().url().optional()
  }).strict().optional()
}).strict();

export function createTestRunRouter(options: {
  registryProvider: RegistryProvider;
  database: RegistryDatabase;
  now?: () => Date;
  createRunId?: () => string;
}) {
  const router = express.Router();

  const identityCanSeeRun = (identity: MachineIdentity, run: NonNullable<ReturnType<RegistryDatabase["testRuns"]["get"]>>) =>
    identity.projects.includes(run.project)
    && identity.environments.includes(run.targetEnvironment)
    && identity.environments.includes(run.poolEnvironment);

  router.get("/", (req, res) => {
    const identity = res.locals.machineIdentity as MachineIdentity;
    if (!machineCan(identity, "runs:read")) return res.status(403).json({ error: "action_denied" });
    const parsed = listRunsQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "invalid_query" });
    if (parsed.data.project && !identity.projects.includes(parsed.data.project)) {
      return res.status(403).json({ error: "scope_denied" });
    }
    if (parsed.data.targetEnvironment && !identity.environments.includes(parsed.data.targetEnvironment)) {
      return res.status(403).json({ error: "scope_denied" });
    }
    return res.json(options.database.testRuns.list(parsed.data).filter((run) => identityCanSeeRun(identity, run)));
  });

  router.post("/", async (req, res, next) => {
    const identity = res.locals.machineIdentity as MachineIdentity;
    if (!machineCan(identity, "runs:create")) {
      return res.status(403).json({ error: "action_denied" });
    }
    const parsed = createRunInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_run" });
    const input = parsed.data;
    if (!identity.projects.includes(input.project)
      || !identity.environments.includes(input.targetEnvironment)
      || !identity.environments.includes(input.poolEnvironment)) {
      return res.status(403).json({ error: "scope_denied" });
    }

    try {
      const candidates = (await options.registryProvider.list())
        .filter((record) => record.project === input.project)
        .filter((record) => record.environment === input.poolEnvironment)
        .filter((record) => record.kind === "mailbox")
        .map((record) => ({
          accountId: record.id,
          email: record.email ?? null,
          roles: record.roles
        }));
      const run = options.database.testRuns.create(
        input,
        candidates,
        { type: "machine", id: identity.id },
        (options.now?.() ?? new Date()).toISOString(),
        options.createRunId?.() ?? randomUUID()
      );
      return res.status(201).json(run);
    } catch (error) {
      if (error instanceof InsufficientAccountsError) {
        return res.status(409).json({ error: "insufficient_accounts", missing: error.missing });
      }
      next(error);
    }
  });

  router.get("/:runId", (req, res) => {
    const identity = res.locals.machineIdentity as MachineIdentity;
    if (!machineCan(identity, "runs:read")) return res.status(403).json({ error: "action_denied" });
    const run = options.database.testRuns.get(String(req.params.runId));
    if (!run || !identityCanSeeRun(identity, run)) return res.status(404).json({ error: "run_not_found" });
    return res.json({ ...run, events: options.database.testRuns.events(run.id) });
  });

  const executeRun = (
    req: express.Request,
    res: express.Response,
    operation: (runId: string, identity: MachineIdentity, now: string) => void
  ) => {
    const identity = res.locals.machineIdentity as MachineIdentity;
    if (!machineCan(identity, "runs:execute")) return res.status(403).json({ error: "action_denied" });
    const runId = String(req.params.runId);
    const run = options.database.testRuns.get(runId);
    if (!run || !identityCanSeeRun(identity, run)) return res.status(404).json({ error: "run_not_found" });
    try {
      operation(runId, identity, (options.now?.() ?? new Date()).toISOString());
      return res.json(options.database.testRuns.get(runId));
    } catch (error) {
      if (error instanceof Error && (error.message.startsWith("invalid run transition") || error.message === "run status changed")) {
        return res.status(409).json({ error: "invalid_transition" });
      }
      throw error;
    }
  };

  router.post("/:runId/start", (req, res, next) => {
    try {
      return executeRun(req, res, (runId, identity, now) => {
        options.database.testRuns.transition(runId, "reserved", "running", { type: "machine", id: identity.id }, now);
      });
    } catch (error) { next(error); }
  });

  router.post("/:runId/finish", (req, res, next) => {
    const parsed = finishRunSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_result" });
    try {
      return executeRun(req, res, (runId, identity, now) => {
        options.database.testRuns.transition(
          runId,
          "running",
          parsed.data.result,
          { type: "machine", id: identity.id },
          now,
          parsed.data.evidence ?? {}
        );
      });
    } catch (error) { next(error); }
  });

  router.post("/:runId/release", (req, res, next) => {
    try {
      return executeRun(req, res, (runId, identity, now) => {
        options.database.testRuns.release(runId, { type: "machine", id: identity.id }, now);
      });
    } catch (error) { next(error); }
  });

  return router;
}
