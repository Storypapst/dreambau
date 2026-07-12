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
import type { RegistryProvider, TestAccessRecord } from "./infisical-provider.js";

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
  registryProvider: RegistryProvider;
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

  const publicRecord = ({ secret: _secret, totpSecret: _totpSecret, ...record }: TestAccessRecord) => record;

  router.get("/accounts", async (req, res, next) => {
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
    try {
      const result = (await options.registryProvider.list())
        .filter((record) => identity.projects.includes(record.project) && identity.environments.includes(record.environment))
        .filter((record) => !requestedProject || record.project === requestedProject)
        .filter((record) => !requestedEnvironment || record.environment === requestedEnvironment)
        .filter((record) => !parsed.data.role || record.roles.includes(parsed.data.role));
      res.json(result.map(publicRecord));
    } catch (error) {
      next(error);
    }
  });

  router.get("/accounts/:id/secret", async (req, res, next) => {
    const identity = res.locals.machineIdentity as MachineIdentity;
    try {
      const match = await options.registryProvider.get(String(req.params.id));
      if (!match || !identity.projects.includes(match.project) || !identity.environments.includes(match.environment)) {
        return res.status(404).json({ error: "account_not_found" });
      }
      res.set("Cache-Control", "no-store");
      res.json({ id: match.id, secret: match.secret });
    } catch (error) {
      next(error);
    }
  });

  const scopedRecord = async (id: string, identity: MachineIdentity) => {
    const match = await options.registryProvider.get(id);
    if (!match || !identity.projects.includes(match.project) || !identity.environments.includes(match.environment)) return null;
    return match;
  };

  const mailQuery = z.object({ query: z.string().max(200).optional() });
  router.get("/accounts/:id/mail/latest", async (req, res, next) => {
    const identity = res.locals.machineIdentity as MachineIdentity;
    const match = await scopedRecord(String(req.params.id), identity);
    if (!match) return res.status(404).json({ error: "account_not_found" });
    const parsed = mailQuery.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "invalid_query" });
    try {
      const account = mailboxAccount(match);
      if (!account) return res.status(404).json({ error: "mailbox_not_found" });
      const message = await options.mailReader.latest(account, parsed.data.query ?? "");
      if (!message) return res.status(404).json({ error: "mail_not_found" });
      res.set("Cache-Control", "no-store");
      res.json(message);
    } catch (error) {
      next(error);
    }
  });

  router.get("/accounts/:id/otp", async (req, res, next) => {
    const identity = res.locals.machineIdentity as MachineIdentity;
    const match = await scopedRecord(String(req.params.id), identity);
    if (!match) return res.status(404).json({ error: "account_not_found" });
    const parsed = mailQuery.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "invalid_query" });
    try {
      const account = mailboxAccount(match);
      if (!account) return res.status(404).json({ error: "mailbox_not_found" });
      const otp = await options.mailReader.otp(account, parsed.data.query ?? "");
      if (!otp) return res.status(404).json({ error: "otp_not_found" });
      res.set("Cache-Control", "no-store");
      res.json(otp);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function mailboxAccount(record: TestAccessRecord): AccountRecord | null {
  if (record.kind !== "mailbox" || !record.email) return null;
  const domain = record.email.split("@").at(-1) ?? "";
  const common = {
    displayName: record.displayName,
    email: record.email,
    password: record.secret,
    domain,
    imap: "mail.dreambau.com:993" as const,
    smtp: "mail.dreambau.com:465" as const,
    jmap: "https://box.dreambau.com/.well-known/jmap" as const,
    caldav: `https://box.dreambau.com/dav/cal/${encodeURIComponent(record.email)}/`,
    carddav: `https://box.dreambau.com/dav/card/${encodeURIComponent(record.email)}/`
  };
  return domain === "oriso.org"
    ? { ...common, encryption: { state: "disabled" } }
    : { ...common, encryption: { state: "encrypted", format: "S/MIME", symmetricMode: "AES-256", encryptOnAppend: true, allowSpamTraining: false } };
}

export function createAccountRegistryProvider(loadAccounts: () => AccountRecord[], database: RegistryDatabase): RegistryProvider {
  const records = () => loadAccounts().map((account): TestAccessRecord => {
    const metadata = database.getMetadata(account.email);
    return {
      id: idFor(account),
      project: projectFor(account, metadata.project),
      environment: "production-test",
      kind: "mailbox",
      displayName: account.displayName,
      username: account.email,
      email: account.email,
      roles: metadata.roles,
      permissionsDescription: "Read-only test mailbox access",
      loginUrl: "https://mail.dreambau.com",
      secret: account.password,
      responsiblePerson: "dreambau",
      createdAt: metadata.updatedAt,
      updatedAt: metadata.updatedAt,
      expiresAt: null,
      shared: true,
      rotationStatus: "unknown",
      documentationUrl: "https://dreambau.com/testmails/"
    };
  });
  return {
    async list() { return records(); },
    async get(id) { return records().find((record) => record.id === id) ?? null; }
  };
}
