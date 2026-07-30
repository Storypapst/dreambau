import express from "express";
import { z } from "zod";
import type { AccountRecord } from "./accounts.js";
import type { RegistryDatabase } from "./db.js";
import {
  authenticateMachineToken,
  machineCan,
  type MachineIdentity,
  type TestEnvironment,
  type TestProject
} from "./machine-access.js";
import type { TestMailReader } from "./test-mail.js";
import type { RegistryProvider, TestAccessRecord } from "./infisical-provider.js";
import type { RegistryWriter } from "./infisical-writer.js";
import { generateCompatibleOrisoTotp, generateTotp } from "./totp.js";
import { parseSeedProfile } from "./seed-profile.js";
import { createTestRunRouter } from "./test-run-router.js";
import { derivedCatalogPatch, isKnownSyntheticEmail, publicLinkedAccount } from "./account-link.js";
import { enrollTotpForRecord, totpEnrollmentHttpError } from "./totp-enrollment.js";

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
  identities: MachineIdentity[] | (() => MachineIdentity[]);
  registryProvider: RegistryProvider;
  registryWriter?: RegistryWriter;
  database: RegistryDatabase;
  mailReader: TestMailReader;
  accounts: () => AccountRecord[];
  now?: () => Date;
}) {
  const router = express.Router();

  router.use((req, res, next) => {
    const identities = typeof options.identities === "function" ? options.identities() : options.identities;
    const identity = authenticateMachineToken(bearerToken(req.header("authorization")), identities);
    if (!identity) return res.status(401).json({ error: "unauthorized" });
    options.database.recordMachineIdentityUse(identity.id);
    res.locals.machineIdentity = identity;
    next();
  });

  const publicRecord = ({ secret: _secret, totpSecret: _totpSecret, ...record }: TestAccessRecord) => record;

  router.use("/runs", createTestRunRouter({
    registryProvider: options.registryProvider,
    database: options.database,
    now: options.now
  }));

  const scopedRecord = async (id: string, identity: MachineIdentity) => {
    const match = await options.registryProvider.get(id);
    if (!match || !identity.projects.includes(match.project) || !identity.environments.includes(match.environment)) return null;
    return match;
  };
  const accessedAt = () => (options.now?.() ?? new Date()).toISOString();
  const recordAccess = (
    record: TestAccessRecord,
    identity: MachineIdentity,
    action: "catalog_sync" | "secret_requested" | "mail_requested" | "otp_requested"
      | "environment_requested" | "lookup_requested" | "totp_enrolled" | "doctor_checked" | "record_linked"
  ) => {
    if (!record.email) return;
    options.database.recordAccountAccess({
      accountId: record.id,
      email: record.email,
      actorId: identity.id,
      action,
      createdAt: accessedAt(),
      context: { environment: record.environment }
    });
  };
  const scopedRecords = async (identity: MachineIdentity) =>
    (await options.registryProvider.list())
      .filter((record) => identity.projects.includes(record.project) && identity.environments.includes(record.environment));
  const reconcile = (records: TestAccessRecord[]) =>
    options.database.reconcileTestAccessLinks(
      options.accounts().map((account) => account.email),
      records,
      accessedAt()
    );
  const enrollmentSchema = z.object({
    totpSecret: z.string().trim().min(16).max(256)
  }).strict();

  router.post("/accounts/:id/totp", async (req, res, next) => {
    const identity = res.locals.machineIdentity as MachineIdentity;
    if (!machineCan(identity, "accounts:totp:write")) return res.status(403).json({ error: "action_denied" });
    if (!options.registryWriter) return res.status(503).json({ error: "totp_enrollment_unavailable" });
    try {
      const match = await scopedRecord(String(req.params.id), identity);
      if (!match || (match.kind !== "app-user" && match.kind !== "admin")) {
        return res.status(404).json({ error: "account_not_found" });
      }
      const parsed = enrollmentSchema.parse(req.body);
      const result = await enrollTotpForRecord({
        record: match,
        rawSecret: parsed.totpSecret,
        writer: options.registryWriter,
        now: options.now?.() ?? new Date()
      });
      recordAccess(match, identity, "totp_enrolled");
      res.set("Cache-Control", "no-store");
      res.json({ accountId: result.recordId, enrolled: true, updatedAt: result.updatedAt });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: "validation_failed" });
      const mapped = totpEnrollmentHttpError(error);
      if (mapped) return res.status(mapped.status).json(mapped.body);
      next(error);
    }
  });

  router.post("/accounts/:id/catalog", async (req, res, next) => {
    const identity = res.locals.machineIdentity as MachineIdentity;
    if (!machineCan(identity, "accounts:sync")) return res.status(403).json({ error: "action_denied" });
    try {
      const match = await scopedRecord(String(req.params.id), identity);
      if (!match) return res.status(404).json({ error: "account_not_found" });
      if (!match.email || !isKnownSyntheticEmail(match.email, options.accounts())) {
        return res.status(409).json({ error: "synthetic_account_not_found" });
      }
      const derived = derivedCatalogPatch(match, req.body);
      const metadata = options.database.upsertMetadata(derived.email, derived.metadata);
      options.database.recordAccountAccess({
        accountId: match.id,
        email: derived.email,
        actorId: identity.id,
        action: "catalog_sync",
        createdAt: accessedAt(),
        context: { applicationVersion: metadata.shippedVersion, environment: match.environment }
      });
      res.json({ id: match.id, email: derived.email, metadata });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: "validation_failed", fieldErrors: error.flatten().fieldErrors });
      next(error);
    }
  });

  router.use((_req, res, next) => {
    const identity = res.locals.machineIdentity as MachineIdentity;
    if (!machineCan(identity, "accounts:read")) {
      return res.status(403).json({ error: "action_denied" });
    }
    next();
  });

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

  const lookupSchema = z.object({
    email: z.string().email(),
    project: z.enum(["oriso", "orimo", "dreambau"]).optional(),
    environment: z.enum(["local", "pre-dev", "dev", "production-test"]).optional()
  }).strict();
  router.get("/lookup", async (req, res, next) => {
    const identity = res.locals.machineIdentity as MachineIdentity;
    const parsed = lookupSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "invalid_query" });
    if (parsed.data.project && !identity.projects.includes(parsed.data.project)) return res.status(403).json({ error: "scope_denied" });
    if (parsed.data.environment && !identity.environments.includes(parsed.data.environment)) return res.status(403).json({ error: "scope_denied" });
    try {
      const records = await scopedRecords(identity);
      reconcile(records);
      const links = new Set(options.database.getTestAccessLinks(parsed.data.email).map((link) => link.recordId));
      const matches = records
        .filter((record) => links.has(record.id))
        .filter((record) => !parsed.data.project || record.project === parsed.data.project)
        .filter((record) => !parsed.data.environment || record.environment === parsed.data.environment)
        .map((record) => {
          recordAccess(record, identity, "lookup_requested");
          const linked = publicLinkedAccount(record);
          return linked ? { ...linked, linked: true } : null;
        })
        .filter((record) => record !== null);
      if (!matches.length) return res.status(404).json({ error: "account_not_found" });
      res.json({ matches });
    } catch (error) {
      next(error);
    }
  });

  const doctorSchema = z.object({
    repair: z.enum(["true", "false"]).default("false")
  }).strict();
  router.get("/doctor", async (req, res, next) => {
    const identity = res.locals.machineIdentity as MachineIdentity;
    const parsed = doctorSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "invalid_query" });
    const repair = parsed.data.repair === "true";
    if (repair && !machineCan(identity, "accounts:sync")) return res.status(403).json({ error: "action_denied" });
    try {
      const records = await scopedRecords(identity);
      if (options.registryProvider.health) await options.registryProvider.health();
      const report = repair
        ? reconcile(records)
        : {
            linked: records.filter((record) =>
              record.email && options.database.getTestAccessLinks(record.email).some((link) => link.recordId === record.id)).length,
            unmappedRecords: records
              .filter((record) => (record.kind === "app-user" || record.kind === "admin")
                && (!record.email || !options.database.getTestAccessLinks(record.email).some((link) => link.recordId === record.id)))
              .map((record) => record.id),
            unmappedAccounts: [] as string[]
          };
      for (const record of records) recordAccess(record, identity, "doctor_checked");
      res.json({
        status: "ok",
        repaired: repair,
        records: {
          total: records.filter((record) => record.kind === "app-user" || record.kind === "admin").length,
          ...report
        }
      });
    } catch {
      res.status(503).json({ status: "unavailable" });
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
      recordAccess(match, identity, "secret_requested");
      res.json({ id: match.id, secret: match.secret });
    } catch (error) {
      next(error);
    }
  });

  router.get("/accounts/:id/env", async (req, res, next) => {
    const identity = res.locals.machineIdentity as MachineIdentity;
    try {
      const match = await options.registryProvider.get(String(req.params.id));
      if (!match || match.kind !== "seed-profile"
        || !identity.projects.includes(match.project)
        || !identity.environments.includes(match.environment)) {
        return res.status(404).json({ error: "seed_profile_not_found" });
      }
      res.set("Cache-Control", "no-store");
      recordAccess(match, identity, "environment_requested");
      res.json({ id: match.id, variables: parseSeedProfile(match.secret) });
    } catch (error) {
      next(error);
    }
  });

  const mailQuery = z.object({ query: z.string().max(200).optional() });
  router.get("/accounts/:id/mail/latest", async (req, res, next) => {
    const identity = res.locals.machineIdentity as MachineIdentity;
    try {
      const match = await scopedRecord(String(req.params.id), identity);
      if (!match) return res.status(404).json({ error: "account_not_found" });
      const parsed = mailQuery.safeParse(req.query);
      if (!parsed.success) return res.status(400).json({ error: "invalid_query" });
      const account = mailboxAccount(match);
      if (!account) return res.status(404).json({ error: "mailbox_not_found" });
      const message = await options.mailReader.latest(account, parsed.data.query ?? "");
      if (!message) return res.status(404).json({ error: "mail_not_found" });
      res.set("Cache-Control", "no-store");
      recordAccess(match, identity, "mail_requested");
      res.json(message);
    } catch (error) {
      next(error);
    }
  });

  router.get("/accounts/:id/otp", async (req, res, next) => {
    const identity = res.locals.machineIdentity as MachineIdentity;
    try {
      const match = await scopedRecord(String(req.params.id), identity);
      if (!match) return res.status(404).json({ error: "account_not_found" });
      const parsed = mailQuery.safeParse(req.query);
      if (!parsed.success) return res.status(400).json({ error: "invalid_query" });
      if (match.totpSecret) {
        res.set("Cache-Control", "no-store");
        recordAccess(match, identity, "otp_requested");
        return res.json(
          match.project === "oriso"
            ? generateCompatibleOrisoTotp(match.totpSecret, options.now?.() ?? new Date())
            : generateTotp(match.totpSecret, options.now?.() ?? new Date())
        );
      }
      const account = mailboxAccount(match);
      if (!account) return res.status(404).json({ error: "mailbox_not_found" });
      const otp = await options.mailReader.otp(account, parsed.data.query ?? "");
      if (!otp) return res.status(404).json({ error: "otp_not_found" });
      res.set("Cache-Control", "no-store");
      recordAccess(match, identity, "otp_requested");
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
    async get(id) { return records().find((record) => record.id === id) ?? null; },
    async health() { void records(); }
  };
}
