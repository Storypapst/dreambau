import express from "express";
import { z } from "zod";
import type { AccountRecord } from "./accounts.js";
import type { RegistryDatabase } from "./db.js";
import {
  authenticateMachineToken,
  type MachineIdentity,
  type TestEnvironment,
  type TestProject
} from "./machine-access.js";
import type { TestMailReader } from "./test-mail.js";

const querySchema = z.object({
  project: z.enum(["oriso", "orimo", "dreambau"]).optional(),
  environment: z.enum(["local", "pre-dev", "dev", "production-test"]).optional(),
  role: z.string().min(1).optional()
});

function projectFor(account: AccountRecord, metadataProject: string): TestProject {
  if (metadataProject === "ORISO") return "oriso";
  if (metadataProject === "ORIMO" || metadataProject === "TRAIL.IST") return "orimo";
  if (metadataProject === "DREAMBAU") return "dreambau";
  if (account.domain === "oriso.org" || account.domain === "openresilience.cc") return "oriso";
  if (account.domain === "trail.ist") return "orimo";
  return "dreambau";
}

function idFor(account: AccountRecord) {
  return `mailbox:${account.email}`;
}

function bearerToken(header: string | undefined) {
  const match = header?.match(/^Bearer ([^\s]+)$/);
  return match?.[1] ?? "";
}

export function createTestAccessRouter(options: {
  identities: MachineIdentity[];
  loadAccounts: () => AccountRecord[];
  database: RegistryDatabase;
  mailReader: TestMailReader;
}) {
  const router = express.Router();

  router.use((req, res, next) => {
    const identity = authenticateMachineToken(bearerToken(req.header("authorization")), options.identities);
    if (!identity) return res.status(401).json({ error: "unauthorized" });
    options.database.recordMachineIdentityUse(identity.id);
    res.locals.machineIdentity = identity;
    next();
  });

  const views = () => options.loadAccounts().map((account) => {
    const metadata = options.database.getMetadata(account.email);
    const project = projectFor(account, metadata.project);
    const environment: TestEnvironment = "production-test";
    return {
      account,
      metadata,
      project,
      environment,
      public: {
        id: idFor(account),
        project,
        environment,
        kind: "mailbox" as const,
        displayName: account.displayName,
        username: account.email,
        email: account.email,
        roles: metadata.roles,
        permissionsDescription: "Read-only test mailbox access",
        loginUrl: "https://mail.dreambau.com",
        responsiblePerson: "dreambau",
        createdAt: null,
        updatedAt: metadata.updatedAt,
        expiresAt: null,
        shared: true,
        rotationStatus: "unknown",
        documentationUrl: "https://dreambau.com/testmails/"
      }
    };
  });

  router.get("/accounts", (req, res) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      const environment = String(req.query.environment ?? "");
      return res.status(400).json({ error: environment === "production" ? "invalid_environment" : "invalid_query" });
    }
    const identity = res.locals.machineIdentity as MachineIdentity;
    const requestedProject = parsed.data.project;
    const requestedEnvironment = parsed.data.environment;
    if (requestedProject && !identity.projects.includes(requestedProject)) return res.status(403).json({ error: "scope_denied" });
    if (requestedEnvironment && !identity.environments.includes(requestedEnvironment)) return res.status(403).json({ error: "scope_denied" });
    const result = views()
      .filter((view) => identity.projects.includes(view.project) && identity.environments.includes(view.environment))
      .filter((view) => !requestedProject || view.project === requestedProject)
      .filter((view) => !requestedEnvironment || view.environment === requestedEnvironment)
      .filter((view) => !parsed.data.role || view.metadata.roles.includes(parsed.data.role));
    res.json(result.map((view) => view.public));
  });

  router.get("/accounts/:id/secret", (req, res) => {
    const identity = res.locals.machineIdentity as MachineIdentity;
    const match = views().find((view) => idFor(view.account) === String(req.params.id));
    if (!match || !identity.projects.includes(match.project) || !identity.environments.includes(match.environment)) {
      return res.status(404).json({ error: "account_not_found" });
    }
    res.set("Cache-Control", "no-store");
    res.json({ id: idFor(match.account), secret: match.account.password });
  });

  const scopedView = (id: string, identity: MachineIdentity) => {
    const match = views().find((view) => idFor(view.account) === id);
    if (!match || !identity.projects.includes(match.project) || !identity.environments.includes(match.environment)) return null;
    return match;
  };

  const mailQuery = z.object({ query: z.string().max(200).optional() });
  router.get("/accounts/:id/mail/latest", async (req, res, next) => {
    const identity = res.locals.machineIdentity as MachineIdentity;
    const match = scopedView(String(req.params.id), identity);
    if (!match) return res.status(404).json({ error: "account_not_found" });
    const parsed = mailQuery.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "invalid_query" });
    try {
      const message = await options.mailReader.latest(match.account, parsed.data.query ?? "");
      if (!message) return res.status(404).json({ error: "mail_not_found" });
      res.set("Cache-Control", "no-store");
      res.json(message);
    } catch (error) {
      next(error);
    }
  });

  router.get("/accounts/:id/otp", async (req, res, next) => {
    const identity = res.locals.machineIdentity as MachineIdentity;
    const match = scopedView(String(req.params.id), identity);
    if (!match) return res.status(404).json({ error: "account_not_found" });
    const parsed = mailQuery.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "invalid_query" });
    try {
      const otp = await options.mailReader.otp(match.account, parsed.data.query ?? "");
      if (!otp) return res.status(404).json({ error: "otp_not_found" });
      res.set("Cache-Control", "no-store");
      res.json(otp);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
