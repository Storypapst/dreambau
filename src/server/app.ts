import cookieParser from "cookie-parser";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installAuth } from "./auth.js";
import { createDocsMirrorRouter } from "./docs-mirror.js";
import { loadAccounts as loadAccountsFile, type AccountRecord } from "./accounts.js";
import { loadConfig } from "./config.js";
import { createDatabase, type RegistryDatabase } from "./db.js";
import { lifecycleStatuses, metadataPatchSchema } from "./metadata.js";
import { taxonomyKindSchema, taxonomyValuesSchema } from "./taxonomies.js";
import { z } from "zod";
import { generateMarkdown, writeMarkdownAtomically } from "./markdown.js";
import { loadMachineIdentities, type MachineIdentity } from "./machine-access.js";
import { createAccountRegistryProvider, createTestAccessRouter } from "./test-access.js";
import { createJmapTestMailReader, type TestMailReader } from "./test-mail.js";
import { createInfisicalRegistryProvider, type RegistryProvider, type TestAccessRecord, type TestEnvironment, type TestProject } from "./infisical-provider.js";
import { createInfisicalRegistryWriter, type RegistryWriter } from "./infisical-writer.js";
import { createPasskeyStore, type HumanProject, type HumanUser, type PasskeyStore } from "./passkey-store.js";
import { installPasskeyAuth, type WebAuthnAdapter } from "./passkey-auth.js";
import type { SessionPrincipal } from "./sessions.js";
import {
  coordinationForProjects,
  coordinationItemById,
  type CoordinationProject
} from "./coordination.js";
import { loadRuntimeStatuses, type RuntimeStatus } from "./runtime-status.js";
import { dashboardRoles, linkedApplicationRecordsForEmail, publicLinkedAccount } from "./account-link.js";
import { generateCompatibleOrisoTotp, generateTotp } from "./totp.js";
import { createInfisicalHumanAccessProvider, type HumanAccessProvider } from "./infisical-human-access.js";
import { createDeadlineQueue } from "./deadline-queue.js";
import { ALL_TEST_ENVIRONMENTS } from "./human-grants.js";
import { canProvisionOriso, humanEntitlementsFor, type HumanEntitlements } from "./human-entitlements.js";
import { createSmtpEmailOtpSender, installEmailOtpAuth, type EmailOtpSender } from "./email-otp.js";
import { enrollTotpForRecord, totpEnrollmentHttpError } from "./totp-enrollment.js";
import {
  buildProvisionedRecord,
  createOrisoProvisioningService,
  environmentForOrisoEmail,
  generateApplicationPassword,
  orisoProvisioningRoles,
  provisioningRoleForRecord,
  readyStateForProvisionedRecord,
  recordRolesForProvisioningRole,
  OrisoProvisioningError,
  type OrisoProvisioningEnvironment,
  type OrisoProvisioningService
} from "./oriso-provisioning.js";

interface AppOptions {
  passwordHash?: string;
  sessionSecret?: string;
  secureCookies?: boolean;
  loadAccounts?: () => AccountRecord[];
  database?: RegistryDatabase;
  exportPath?: string | null;
  machineIdentities?: MachineIdentity[];
  machineIdentityLoader?: () => MachineIdentity[];
  mailReader?: TestMailReader;
  registryProvider?: RegistryProvider;
  registryWriter?: RegistryWriter;
  now?: () => Date;
  passkeyStore?: PasskeyStore;
  webauthn?: WebAuthnAdapter;
  rpId?: string;
  expectedOrigin?: string;
  bootstrapUser?: { email: string; name: string; projects: Array<"oriso" | "orimo" | "dreambau">; role: "admin" };
  runtimeStatusLoader?: (projects: CoordinationProject[]) => Promise<RuntimeStatus[]>;
  humanAccessProvider?: HumanAccessProvider;
  humanAccessTimeoutMs?: number;
  emailOtpSender?: EmailOtpSender;
  emailOtpHmacKey?: string;
  orisoProvisioning?: OrisoProvisioningService;
  orisoProvisioningServices?: Partial<Record<OrisoProvisioningEnvironment, OrisoProvisioningService>>;
  docsMirrorDir?: string | null;
}

export function createApp(options: AppOptions = {}) {
  const config = loadConfig();
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "64kb" }));
  app.use(cookieParser());
  app.get("/testmails/health/live", (_req, res) => res.json({ status: "ok" }));
  const api = express.Router();
  const passkeyStore = options.passkeyStore ?? createPasskeyStore(options.loadAccounts ? ":memory:" : config.databasePath);
  const humanAccessProvider = options.humanAccessProvider ?? (config.registryProvider === "infisical" && config.infisical
    ? createInfisicalHumanAccessProvider({
      baseUrl: config.infisical.baseUrl,
      organizationSlug: config.infisical.organizationSlug,
      clientId: config.infisical.clientId,
      clientSecret: config.infisical.clientSecret,
      projectIds: config.infisical.projectIds
    })
    : undefined);
  /**
   * Synchronizes only the Infisical-derived grants and leaves local grants
   * alone. The effective scope is the union of both sources, so an employee an
   * administrator granted access to locally keeps it whatever Infisical
   * reports — including reporting nothing at all.
   *
   * `user.projects` is now a derived projection of the grant rows rather than
   * authoritative storage.
   */
  const humanAccessTimeoutMs = options.humanAccessTimeoutMs ?? 10_000;
  const syncHumanUserUnsafe = async (user: HumanUser, deadlineAt = Date.now() + humanAccessTimeoutMs) => {
    if (!humanAccessProvider || user.role === "admin") return user;
    const remainingMs = deadlineAt - Date.now();
    if (remainingMs <= 0) throw new Error("human_access_timeout");
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new Error("human_access_timeout"));
      }, remainingMs);
    });
    let projects: HumanProject[];
    try {
      projects = await Promise.race([
        humanAccessProvider.projectsFor(user.email, { signal: controller.signal }),
        deadline
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
    if (Date.now() >= deadlineAt) throw new Error("human_access_timeout");
    passkeyStore.grants.replaceInfisical(user.id, projects.map((project) => ({
      userId: user.id,
      project,
      environments: [...ALL_TEST_ENVIRONMENTS],
      source: "infisical" as const
    })));
    return { ...user, projects: passkeyStore.grants.effective(user.id).map((grant) => grant.project) };
  };
  // This queue is deliberately process-wide: the employee-list snapshot and
  // rollback must be mutually exclusive with every grants.replaceInfisical
  // writer, including auth/me. Provider reads are shared and cached, while the
  // enqueue-time deadline bounds every caller's total wait.
  const serializeHumanAccess = createDeadlineQueue(
    humanAccessTimeoutMs,
    () => Date.now(),
    () => new Error("human_access_timeout")
  );
  const syncHumanUser = (user: HumanUser) => serializeHumanAccess((deadlineAt) => syncHumanUserUnsafe(user, deadlineAt));
  const { requireSession, requireStrongSession, sessions } = installAuth(
    api,
    options.passwordHash ?? config.passwordHash,
    options.sessionSecret ?? config.sessionSecret,
    options.secureCookies ?? config.secureCookies,
    () => passkeyStore.credentialCount() === 0
  );
  const accountLoader = options.loadAccounts ?? (() => loadAccountsFile(config.accountsPath));
  const database = options.database ?? createDatabase(options.loadAccounts ? ":memory:" : config.databasePath);
  installPasskeyAuth(api, {
    store: passkeyStore,
    sessions,
    requireSession,
    requireStrongSession,
    secureCookies: options.secureCookies ?? config.secureCookies,
    rpId: options.rpId ?? "dreambau.com",
    expectedOrigin: options.expectedOrigin ?? "https://dreambau.com",
    webauthn: options.webauthn,
    now: options.now,
    bootstrapUser: options.bootstrapUser ?? { email: "fg@dreambau.com", name: "Frank Gerhardt", projects: ["oriso", "orimo", "dreambau"], role: "admin" },
    syncHumanUser: syncHumanUserUnsafe,
    serializeHumanAccess,
    entitlementsFor: (user, principal) => humanEntitlementsFor(user, passkeyStore.grants, principal.method)
  });
  installEmailOtpAuth(api, {
    store: passkeyStore,
    sessions,
    secureCookies: options.secureCookies ?? config.secureCookies,
    sender: options.emailOtpSender ?? (config.smtp ? createSmtpEmailOtpSender(config.smtp) : undefined),
    hmacKey: options.emailOtpHmacKey ?? config.emailOtpHmacKey,
    now: options.now,
    syncHumanUser
  });
  const requireActiveHumanSession = (req: express.Request, res: express.Response, next: express.NextFunction) =>
    requireSession(req, res, () => {
      void (async () => {
        try {
          const principal = res.locals.session as SessionPrincipal;
          if (principal.method !== "passkey" && principal.method !== "email-otp") {
            return res.status(403).json({ error: "strong_auth_required" });
          }
          let user = principal.userId ? passkeyStore.getUser(principal.userId) : null;
          if (!user || user.status !== "active") return res.status(403).json({ error: "user_disabled" });
          try { user = await syncHumanUser(user); }
          catch { return res.status(503).json({ error: "human_access_unavailable" }); }
          res.locals.humanUser = user;
          next();
        } catch (error) {
          next(error);
        }
      })();
    });
  const requireAdminSession = (req: express.Request, res: express.Response, next: express.NextFunction) =>
    requireStrongSession(req, res, () => {
      const principal = res.locals.session as SessionPrincipal;
      const user = principal.userId ? passkeyStore.getUser(principal.userId) : null;
      if (!user || user.status !== "active") return res.status(403).json({ error: "user_disabled" });
      res.locals.humanUser = user;
      if ((res.locals.humanUser as HumanUser).role !== "admin") {
        return res.status(403).json({ error: "admin_required" });
      }
      next();
    });
  const requireOrisoProvisioningSession = (req: express.Request, res: express.Response, next: express.NextFunction) =>
    requireActiveHumanSession(req, res, () => {
      const user = res.locals.humanUser as HumanUser;
      const principal = res.locals.session as SessionPrincipal;
      if (principal.method !== "passkey") {
        return res.status(403).json({ error: "passkey_required" });
      }
      const entitlements = humanEntitlementsFor(user, passkeyStore.grants, principal.method);
      if (entitlements.orisoProvisioning.environments.length === 0) {
        return res.status(403).json({ error: "oriso_provisioning_required" });
      }
      res.locals.humanEntitlements = entitlements;
      next();
    });
  const accountViews = () => accountLoader().map((account) => ({ ...account, metadata: database.getMetadata(account.email) }));
  const viewProject = (view: ReturnType<typeof accountViews>[number]) => {
    if (view.metadata.project === "ORISO") return "oriso" as const;
    if (view.metadata.project === "ORIMO" || view.metadata.project === "TRAIL.IST") return "orimo" as const;
    if (view.metadata.project === "DREAMBAU") return "dreambau" as const;
    if (view.domain === "oriso.org" || view.domain === "openresilience.cc") return "oriso" as const;
    if (view.domain === "trail.ist") return "orimo" as const;
    return "dreambau" as const;
  };
  const scopedAccountViews = (user: HumanUser) => accountViews().filter((view) => user.projects.includes(viewProject(view)));
  const exportPath = options.exportPath === undefined ? (options.loadAccounts ? null : config.exportPath) : options.exportPath;
  const markdown = () => generateMarkdown(accountViews(), database.getTaxonomies());
  const regenerate = async () => { if (exportPath) await writeMarkdownAtomically(exportPath, markdown()); };
  void regenerate();
  const environments: TestEnvironment[] = ["local", "pre-dev", "dev", "production-test"];
  const runtimeRegistryProvider = () => {
    if (config.registryProvider !== "infisical" || !config.infisical) return createAccountRegistryProvider(accountLoader, database);
    const projects = Object.entries(config.infisical.projectIds) as Array<[TestProject, string]>;
    return createInfisicalRegistryProvider({
      baseUrl: config.infisical.baseUrl,
      organizationSlug: config.infisical.organizationSlug,
      clientId: config.infisical.clientId,
      clientSecret: config.infisical.clientSecret,
      sources: projects.flatMap(([project, projectId]) => environments.map((environment) => ({ project, projectId, environment })))
    });
  };
  const registryProvider = options.registryProvider ?? runtimeRegistryProvider();
  const registryWriter = options.registryWriter ?? (
    config.registryProvider === "infisical" && config.infisical?.writer
      ? createInfisicalRegistryWriter({
          baseUrl: config.infisical.baseUrl,
          organizationSlug: config.infisical.organizationSlug,
          clientId: config.infisical.writer.clientId,
          clientSecret: config.infisical.writer.clientSecret,
          projectIds: config.infisical.projectIds
        })
      : undefined
  );
  const mailReader = options.mailReader ?? createJmapTestMailReader();
  const runtimeOrisoProvisioningServices = Object.fromEntries(
    (Object.entries(config.orisoProvisioningTargets) as Array<
      [OrisoProvisioningEnvironment, NonNullable<typeof config.orisoProvisioningTargets[OrisoProvisioningEnvironment]>]
    >)
      .filter(([, target]) => Boolean(target))
      .map(([environment, target]) => [
        environment,
        createOrisoProvisioningService({
          ...target,
          environment,
          registryProvider,
          now: options.now
        })
      ])
  ) as Partial<Record<OrisoProvisioningEnvironment, OrisoProvisioningService>>;
  const orisoProvisioningServices = options.orisoProvisioningServices
    ?? (options.orisoProvisioning ? { "pre-dev": options.orisoProvisioning } : runtimeOrisoProvisioningServices);
  const reconcileRecords = (records: TestAccessRecord[]) =>
    database.reconcileTestAccessLinks(
      accountLoader().map((account) => account.email),
      records,
      (options.now?.() ?? new Date()).toISOString()
    );
  const linkedFromStore = (email: string, records: TestAccessRecord[]) => {
    const ids = new Set(database.getTestAccessLinks(email).map((link) => link.recordId));
    return records
      .filter((record) => ids.has(record.id))
      .filter((record) => record.kind === "app-user" || record.kind === "admin");
  };
  const linkedForAccountView = (
    account: ReturnType<typeof accountViews>[number],
    records: TestAccessRecord[],
    user: HumanUser
  ) => {
    const project = viewProject(account);
    const environment = project === "oriso"
      ? account.domain === "dreambau.de" || account.domain === "dreambau.com"
        ? "pre-dev"
        : account.domain === "oriso.org" || account.domain === "openresilience.cc"
          ? "dev"
          : null
      : null;
    return linkedFromStore(account.email, records)
      .filter((record) => record.project === project)
      .filter((record) => environment === null || record.environment === environment)
      .filter((record) => user.projects.includes(record.project));
  };
  app.get("/testmails/health/ready", async (_req, res) => {
    try {
      if (registryProvider.health) await registryProvider.health();
      else await registryProvider.list();
      res.json({
        status: "ok",
        humanAccessQueue: {
          enqueued: serializeHumanAccess.metrics.enqueued,
          expired: serializeHumanAccess.metrics.expired
        }
      });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  });
  api.use("/v1", createTestAccessRouter({
    identities: options.machineIdentityLoader
      ?? (options.machineIdentities ? () => options.machineIdentities! : () => loadMachineIdentities(config.machineIdentitiesPath)),
    registryProvider,
    registryWriter,
    database,
    accounts: accountLoader,
    mailReader,
    now: options.now
  }));
  api.get("/accounts", requireActiveHumanSession, async (_req, res, next) => {
    try {
      const user = res.locals.humanUser as HumanUser;
      const records = await registryProvider.list();
      reconcileRecords(records);
      res.json(scopedAccountViews(user).map((account) => {
        const linked = linkedForAccountView(account, records, user);
        // The roles a mailbox can actually sign in with are shown alongside the
        // roles recorded in the catalog. Recovered from the running image
        // (Package A run-state §5.3).
        const linkedRoles = dashboardRoles(linked.flatMap((record) => record.roles));
        return {
          ...account,
          metadata: {
            ...account.metadata,
            roles: [...new Set([...account.metadata.roles, ...linkedRoles])]
          },
          linkedAccess: linked
            .map(publicLinkedAccount)
            .filter((record) => record !== null),
          access: database.getAccountAccess(account.email)
        };
      }));
    } catch (error) {
      next(error);
    }
  });
  const humanOtpQuerySchema = z.object({
    accountId: z.string().min(1).max(240).optional(),
    query: z.string().max(200).optional()
  });
  api.get("/accounts/:email/application-secret", requireActiveHumanSession, async (req, res, next) => {
    const user = res.locals.humanUser as HumanUser;
    const email = decodeURIComponent(String(req.params.email)).trim().toLowerCase();
    const current = scopedAccountViews(user).find((account) => account.email.toLowerCase() === email);
    if (!current) return res.status(404).json({ error: "account_not_found" });
    try {
      const parsed = z.object({ accountId: z.string().min(1).max(240) }).parse(req.query);
      const records = await registryProvider.list();
      reconcileRecords(records);
      const selected = linkedForAccountView(current, records, user)
        .find((record) => record.id === parsed.accountId);
      if (!selected) return res.status(404).json({ error: "linked_account_not_found" });
      const accessedAt = options.now?.() ?? new Date();
      database.recordAccountAccess({
        accountId: selected.id,
        email,
        actorId: user.id,
        action: "secret_requested",
        createdAt: accessedAt.toISOString(),
        context: { environment: selected.environment }
      });
      res.set("Cache-Control", "no-store");
      res.json({ accountId: selected.id, secret: selected.secret });
    } catch (error) {
      if (error instanceof z.ZodError) return handleValidation(error, res);
      next(error);
    }
  });
  const humanTotpEnrollmentSchema = z.object({
    accountId: z.string().min(1).max(240),
    totpSecret: z.string().trim().min(16).max(256)
  }).strict();
  api.post("/accounts/:email/totp", requireActiveHumanSession, async (req, res, next) => {
    const user = res.locals.humanUser as HumanUser;
    const email = decodeURIComponent(String(req.params.email)).trim().toLowerCase();
    const current = scopedAccountViews(user).find((account) => account.email.toLowerCase() === email);
    if (!current) return res.status(404).json({ error: "account_not_found" });
    if (!registryWriter) return res.status(503).json({ error: "totp_enrollment_unavailable" });
    try {
      const parsed = humanTotpEnrollmentSchema.parse(req.body);
      const records = await registryProvider.list();
      reconcileRecords(records);
      const selected = linkedForAccountView(current, records, user)
        .find((record) => record.id === parsed.accountId);
      if (!selected) return res.status(404).json({ error: "linked_account_not_found" });
      const result = await enrollTotpForRecord({
        record: selected,
        rawSecret: parsed.totpSecret,
        writer: registryWriter,
        now: options.now?.() ?? new Date()
      });
      database.recordAccountAccess({
        accountId: selected.id,
        email,
        actorId: user.id,
        action: "totp_enrolled",
        createdAt: result.updatedAt,
        context: { environment: selected.environment }
      });
      res.set("Cache-Control", "no-store");
      res.json({ accountId: result.recordId, enrolled: true, updatedAt: result.updatedAt });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: "validation_failed" });
      const mapped = totpEnrollmentHttpError(error);
      if (mapped) return res.status(mapped.status).json(mapped.body);
      next(error);
    }
  });
  api.get("/accounts/:email/otp", requireActiveHumanSession, async (req, res, next) => {
    const user = res.locals.humanUser as HumanUser;
    const email = decodeURIComponent(String(req.params.email)).trim().toLowerCase();
    const current = scopedAccountViews(user).find((account) => account.email.toLowerCase() === email);
    if (!current) return res.status(404).json({ error: "account_not_found" });
    try {
      const parsed = humanOtpQuerySchema.parse(req.query);
      const records = await registryProvider.list();
      reconcileRecords(records);
      const linked = linkedForAccountView(current, records, user);
      const selected = parsed.accountId
        ? linked.find((record) => record.id === parsed.accountId)
        : linked[0];
      if (!selected) return res.status(404).json({ error: "linked_account_not_found" });
      const generatedAt = options.now?.() ?? new Date();
      const result = selected.totpSecret
        ? {
            accountId: selected.id,
            source: "totp" as const,
            ...(selected.project === "oriso"
              ? generateCompatibleOrisoTotp(selected.totpSecret, generatedAt)
              : generateTotp(selected.totpSecret, generatedAt))
          }
        : await (async () => {
            const otp = await mailReader.otp(current, parsed.query ?? "");
            return otp ? { accountId: selected.id, source: "mail" as const, ...otp } : null;
          })();
      if (!result) return res.status(404).json({ error: "otp_not_found" });
      database.recordAccountAccess({
        accountId: selected.id,
        email,
        actorId: user.id,
        action: "otp_requested",
        createdAt: generatedAt.toISOString(),
        context: { environment: selected.environment }
      });
      res.set("Cache-Control", "no-store");
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) return handleValidation(error, res);
      next(error);
    }
  });
  const orisoProvisionBodySchema = z.object({
    environment: z.enum(["local", "pre-dev", "dev", "production-test"]),
    role: z.enum(orisoProvisioningRoles),
    applicationPassword: z.string().min(1).max(512)
      .refine((value) => value.trim().length > 0)
      .optional()
  }).strict();
  const orisoLinkedRecord = (
    email: string,
    records: TestAccessRecord[],
    environment: OrisoProvisioningEnvironment
  ) =>
    linkedFromStore(email, records)
      .find((record) => record.project === "oriso" && record.environment === environment) ?? null;
  const orisoProvisioningHttpError = (error: unknown, res: express.Response) => {
    if (!(error instanceof OrisoProvisioningError)) return false;
    const status = error.code === "invite_template_missing" ? 409
      : error.code === "account_credentials_mismatch" ? 409
      : error.code === "admin_record_unavailable" ? 503
      : 502;
    res.status(status).json({ error: error.code });
    return true;
  };
  api.get("/accounts/:email/oriso-provisioning", requireOrisoProvisioningSession, async (req, res, next) => {
    const user = res.locals.humanUser as HumanUser;
    const email = decodeURIComponent(String(req.params.email)).trim().toLowerCase();
    const current = scopedAccountViews(user).find((account) => account.email.toLowerCase() === email);
    if (!current) return res.status(404).json({ error: "account_not_found" });
    const environment = environmentForOrisoEmail(email);
    if (!environment) return res.status(422).json({ error: "environment_not_supported" });
    if (!canProvisionOriso(res.locals.humanEntitlements as HumanEntitlements, environment)) {
      return res.status(403).json({ error: "oriso_provisioning_environment_denied" });
    }
    if (viewProject(current) !== "oriso") return res.status(422).json({ error: "mailbox_project_mismatch" });
    const orisoProvisioning = orisoProvisioningServices[environment];
    res.set("Cache-Control", "no-store");
    if (!orisoProvisioning) {
      return res.json({
        configured: false,
        supportedRoles: [...orisoProvisioningRoles],
        environment,
        state: null,
        provisioningRole: null,
        linked: null,
        requiresApplicationPassword: false
      });
    }
    try {
      const records = await registryProvider.list();
      reconcileRecords(records);
      const linked = orisoLinkedRecord(email, records, environment);
      const managedState = linked?.totpSecret ? readyStateForProvisionedRecord(linked) : null;
      const state = managedState ?? await orisoProvisioning.status(email);
      const provisioningRole = state?.role ?? (linked ? provisioningRoleForRecord(linked) : null);
      res.json({
        configured: true,
        supportedRoles: [...orisoProvisioningRoles],
        environment,
        state,
        provisioningRole,
        linked: linked ? publicLinkedAccount(linked) : null,
        requiresApplicationPassword: Boolean(
          provisioningRole
          && (
            !linked
            || (!linked.totpSecret && linked.provisioningStatus === "failed")
          )
        )
      });
    } catch (error) {
      if (orisoProvisioningHttpError(error, res)) return;
      next(error);
    }
  });
  api.post("/accounts/:email/oriso-provisioning", requireOrisoProvisioningSession, async (req, res, next) => {
    const user = res.locals.humanUser as HumanUser;
    const email = decodeURIComponent(String(req.params.email)).trim().toLowerCase();
    const current = scopedAccountViews(user).find((account) => account.email.toLowerCase() === email);
    if (!current) return res.status(404).json({ error: "account_not_found" });
    let body: z.infer<typeof orisoProvisionBodySchema>;
    try {
      body = orisoProvisionBodySchema.parse(req.body);
    } catch {
      return res.status(400).json({ error: "validation_failed" });
    }
    const environment = environmentForOrisoEmail(email);
    if (!environment) return res.status(422).json({ error: "environment_not_supported" });
    if (!canProvisionOriso(res.locals.humanEntitlements as HumanEntitlements, environment)) {
      return res.status(403).json({ error: "oriso_provisioning_environment_denied" });
    }
    if (body.environment !== environment) return res.status(422).json({ error: "environment_mismatch", environment });
    if (viewProject(current) !== "oriso") return res.status(422).json({ error: "mailbox_project_mismatch" });
    const orisoProvisioning = orisoProvisioningServices[environment];
    if (!orisoProvisioning) return res.status(503).json({ error: "oriso_provisioning_unavailable" });
    if (!registryWriter?.createRecord || !registryWriter.updateRecord) {
      return res.status(503).json({ error: "record_creation_unavailable" });
    }
    try {
      // A mailbox that already carries a record for its routed environment is only re-provisioned
      // with the same role; a different role would leave record and ORISO
      // identity in contradiction.
      const existingRecords = await registryProvider.list();
      const existingRecord = orisoLinkedRecord(email, existingRecords, environment)
        ?? linkedApplicationRecordsForEmail(email, existingRecords)
          .find((record) => record.project === "oriso" && record.environment === environment) ?? null;
      const requestedRoles = recordRolesForProvisioningRole(body.role);
      if (existingRecord && existingRecord.roles.join(",") !== requestedRoles.join(",")) {
        return res.status(409).json({ error: "record_role_conflict", linked: publicLinkedAccount(existingRecord) });
      }
      const records = existingRecords;
      let linkedRecord = existingRecord;
      const nowDate = options.now?.() ?? new Date();
      let recordCreated = false;
      const createLinkedRecord = async (secret: string) => {
        const record = buildProvisionedRecord({
          email,
          displayName: current.displayName,
          role: body.role,
          adminBaseUrl: orisoProvisioning.target.adminBaseUrl,
          appBaseUrl: orisoProvisioning.target.appBaseUrl,
          responsiblePerson: user.email,
          now: nowDate,
          secret,
          environment
        });
        try {
          await registryWriter.createRecord!(record);
          return record;
        } catch {
          return null;
        }
      };
      const onboardingState = (!existingRecord || body.applicationPassword)
        ? await orisoProvisioning.status(email)
        : null;

      // An invitation that already exists belongs to the human onboarding
      // flow. Its password was (or will be) chosen there, so generating a new
      // unrelated password and attempting direct creation can only leave a
      // misleading half-record behind. Link the actual credential first and
      // let the existing inline TOTP step complete the handoff.
      if (!existingRecord && onboardingState && !body.applicationPassword) {
        return res.status(409).json({ error: "application_password_required" });
      }
      if (
        existingRecord
        && !existingRecord.totpSecret
        && existingRecord.provisioningStatus === "failed"
        && !body.applicationPassword
      ) {
        return res.status(409).json({ error: "application_password_required" });
      }
      if (body.applicationPassword) {
        if (existingRecord?.totpSecret || existingRecord?.provisioningStatus === "ready") {
          return res.status(409).json({ error: "managed_record_password_locked" });
        }
        const canRepairFromRecord = Boolean(
          !onboardingState
          && existingRecord
          && existingRecord.provisioningStatus === "failed"
          && !existingRecord.totpSecret
          && provisioningRoleForRecord(existingRecord) === body.role
        );
        if (
          !canRepairFromRecord
          && (!onboardingState || !onboardingState.role || onboardingState.role !== body.role)
        ) {
          return res.status(409).json({ error: "oriso_onboarding_state_mismatch" });
        }
        if (!linkedRecord) {
          linkedRecord = await createLinkedRecord(body.applicationPassword);
          if (!linkedRecord) return res.status(502).json({ error: "record_creation_failed" });
          recordCreated = true;
        } else {
          if (!registryWriter.updateApplicationPassword) {
            return res.status(503).json({ error: "record_password_update_unavailable" });
          }
          try {
            await registryWriter.updateApplicationPassword(
              linkedRecord,
              body.applicationPassword,
              nowDate.toISOString()
            );
          } catch {
            return res.status(502).json({ error: "record_password_update_failed" });
          }
          linkedRecord = {
            ...linkedRecord,
            secret: body.applicationPassword,
            provisioningStatus: "pending",
            updatedAt: nowDate.toISOString()
          };
          database.recordAccountAccess({
            accountId: linkedRecord.id,
            email,
            actorId: user.id,
            action: "application_password_updated",
            createdAt: nowDate.toISOString(),
            context: { environment }
          });
        }
        reconcileRecords([...records.filter((record) => record.id !== linkedRecord!.id), linkedRecord]);
        if (recordCreated) {
          database.recordAccountAccess({
            accountId: linkedRecord.id,
            email,
            actorId: user.id,
            action: "record_linked",
            createdAt: nowDate.toISOString(),
            context: { environment }
          });
        }
        const linkedView = publicLinkedAccount(linkedRecord);
        if (!linkedView) return res.status(500).json({ error: "record_projection_failed" });
        res.set("Cache-Control", "no-store");
        return res.status(recordCreated ? 201 : 200).json({
          created: false,
          recordCreated,
          state: onboardingState,
          provisioningRole: body.role,
          linked: linkedView,
          requiresApplicationPassword: false
        });
      }
      if (!linkedRecord) {
        linkedRecord = await createLinkedRecord(generateApplicationPassword());
        if (!linkedRecord) return res.status(502).json({ error: "record_creation_failed" });
        recordCreated = true;
      }
      const nameParts = current.displayName.trim().split(/\s+/);
      let provisioned: Awaited<ReturnType<OrisoProvisioningService["provision"]>>;
      try {
        provisioned = await orisoProvisioning.provision({
          record: linkedRecord,
          firstName: nameParts[0] || email.split("@")[0],
          lastName: nameParts.slice(1).join(" ") || "-",
          role: body.role,
          storeTotp: async (totpSecret) => {
            await registryWriter.enrollTotp(linkedRecord!, totpSecret, nowDate.toISOString());
            linkedRecord = {
              ...linkedRecord!,
              totpSecret,
              provisioningStatus: "pending",
              updatedAt: nowDate.toISOString()
            };
          }
        });
        const readyRecord = {
          ...linkedRecord,
          provisioningStatus: "ready" as const,
          updatedAt: nowDate.toISOString()
        };
        await registryWriter.updateRecord(readyRecord);
        linkedRecord = readyRecord;
      } catch (error) {
        if (linkedRecord.provisioningStatus !== "ready") {
          linkedRecord = {
            ...linkedRecord,
            provisioningStatus: "failed",
            updatedAt: nowDate.toISOString()
          };
          try {
            await registryWriter.updateRecord(linkedRecord);
          } catch {
            // Preserve the original provisioning error. A failed status update
            // must never turn a recoverable ORISO failure into a misleading one.
          }
        }
        throw error;
      }
      reconcileRecords([...records.filter((record) => record.id !== linkedRecord!.id), linkedRecord]);
      database.recordAccountAccess({
        accountId: linkedRecord.id,
        email,
        actorId: user.id,
        action: "oriso_account_provisioned",
        createdAt: nowDate.toISOString(),
        context: { environment }
      });
      if (recordCreated) {
        database.recordAccountAccess({
          accountId: linkedRecord.id,
          email,
          actorId: user.id,
          action: "record_linked",
          createdAt: nowDate.toISOString(),
          context: { environment }
        });
      }
      const linkedView = publicLinkedAccount(linkedRecord);
      if (!linkedView) return res.status(500).json({ error: "record_projection_failed" });
      res.set("Cache-Control", "no-store");
      res.status(provisioned.created ? 201 : 200).json({
        created: provisioned.created,
        recordCreated,
        state: provisioned.state,
        provisioningRole: body.role,
        linked: linkedView,
        requiresApplicationPassword: false
      });
    } catch (error) {
      if (orisoProvisioningHttpError(error, res)) return;
      next(error);
    }
  });
  api.patch("/accounts/:email", requireActiveHumanSession, async (req, res) => {
    const email = decodeURIComponent(String(req.params.email));
    const current = scopedAccountViews(res.locals.humanUser).find((account) => account.email === email);
    if (!current) return res.status(404).json({ error: "account_not_found" });
    try {
      const patch = metadataPatchSchema.parse(req.body);
      const destination = viewProject({ ...current, metadata: { ...current.metadata, ...patch } });
      if (!res.locals.humanUser.projects.includes(destination)) return res.status(403).json({ error: "scope_denied" });
      const value = database.upsertMetadata(email, patch);
      await regenerate();
      res.json(value);
    } catch (error) { handleValidation(error, res); }
  });
  api.post("/accounts/bulk-status", requireActiveHumanSession, async (req, res) => {
    try { const body = z.object({ emails: z.array(z.string().email()).min(1), status: z.enum(lifecycleStatuses) }).parse(req.body); const allowed = new Set(scopedAccountViews(res.locals.humanUser).map((account) => account.email)); if (body.emails.some((email) => !allowed.has(email))) return res.status(403).json({ error: "scope_denied" }); const updated = database.bulkStatus(body.emails, body.status); await regenerate(); res.json({ updated }); } catch (error) { handleValidation(error, res); }
  });
  api.get("/taxonomies", requireActiveHumanSession, (_req, res) => res.json(database.getTaxonomies()));
  api.get("/machine-identities/usage", requireAdminSession, (_req, res) => res.json(database.getMachineIdentityUsage()));
  const coordinationProjects = (user: HumanUser) =>
    user.projects.filter((project): project is CoordinationProject =>
      ["oriso", "orimo", "dreambau"].includes(project)
    );
  const scopedCoordination = (user: HumanUser) => {
    const catalog = coordinationForProjects(coordinationProjects(user));
    return {
      ...catalog,
      items: catalog.items.map((item) => ({
        ...item,
        ...database.getCoordinationMetadata(item.id)
      }))
    };
  };
  const scopedCoordinationItem = (itemId: string, user: HumanUser) => {
    const item = coordinationItemById(itemId);
    if (!item) return { status: 404 as const };
    if (!item.projects.some((project) => coordinationProjects(user).includes(project))) {
      return { status: 403 as const };
    }
    return { status: 200 as const, item };
  };
  const coordinationTagSchema = z.object({
    tag: z.string().trim().min(1).max(40).regex(/^[\p{L}\p{N}][\p{L}\p{N} ._/-]*$/u)
  });
  const coordinationDiscussionSchema = z.object({
    label: z.string().trim().min(1).max(80),
    url: z.string().url().refine((value) => {
      const hostname = new URL(value).hostname;
      return hostname === "github.com" || hostname.endsWith(".slack.com") || hostname === "matrix.dreambau.com";
    }, "discussion host is not allowed")
  });
  api.get("/coordination", requireActiveHumanSession, (_req, res) => {
    res.json(scopedCoordination(res.locals.humanUser));
  });
  api.get("/coordination/runtime", requireActiveHumanSession, async (_req, res, next) => {
    try {
      const loader = options.runtimeStatusLoader ?? loadRuntimeStatuses;
      res.json(await loader(coordinationProjects(res.locals.humanUser)));
    } catch (error) {
      next(error);
    }
  });
  api.post("/coordination/items/:itemId/tags", requireActiveHumanSession, (req, res) => {
    const scoped = scopedCoordinationItem(String(req.params.itemId), res.locals.humanUser);
    if (scoped.status !== 200) return res.status(scoped.status).json({ error: scoped.status === 403 ? "scope_denied" : "coordination_item_not_found" });
    try {
      const { tag } = coordinationTagSchema.parse(req.body);
      res.status(201).json(database.addCoordinationTag(scoped.item.id, tag));
    } catch (error) {
      handleValidation(error, res);
    }
  });
  api.post("/coordination/items/:itemId/discussions", requireActiveHumanSession, (req, res) => {
    const scoped = scopedCoordinationItem(String(req.params.itemId), res.locals.humanUser);
    if (scoped.status !== 200) return res.status(scoped.status).json({ error: scoped.status === 403 ? "scope_denied" : "coordination_item_not_found" });
    try {
      const discussion = coordinationDiscussionSchema.parse(req.body);
      res.status(201).json(database.addCoordinationDiscussion(scoped.item.id, discussion));
    } catch (error) {
      handleValidation(error, res);
    }
  });
  api.put("/taxonomies/:kind", requireAdminSession, async (req, res) => {
    try { const kind = taxonomyKindSchema.parse(String(req.params.kind)); const { values } = taxonomyValuesSchema.parse(req.body); const result = database.putTaxonomy(kind, values); await regenerate(); res.json(result); } catch (error) { handleValidation(error, res); }
  });
  api.get("/export/markdown", requireActiveHumanSession, (_req, res) => res.type("text/markdown; charset=utf-8").send(generateMarkdown(scopedAccountViews(res.locals.humanUser), database.getTaxonomies())));
  app.use("/testmails/api", api);
  app.get("/testmails/testmails.md", requireActiveHumanSession, (_req, res) => res.type("text/markdown; charset=utf-8").send(generateMarkdown(scopedAccountViews(res.locals.humanUser), database.getTaxonomies())));
  const docsMirrorDir = options.docsMirrorDir === undefined ? process.env.DOCS_MIRROR_DIR ?? null : options.docsMirrorDir;
  if (docsMirrorDir) app.use("/testmails/docs", requireActiveHumanSession, createDocsMirrorRouter(docsMirrorDir));

  const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../client");
  app.use("/testmails", express.static(clientDir, { index: false }));
  app.get(["/testmails", "/testmails/", "/testmails/*splat"], (_req, res) => res.sendFile(path.join(clientDir, "index.html")));
  return app;
}

function handleValidation(error: unknown, res: express.Response) {
  if (error instanceof z.ZodError) return res.status(400).json({ error: "validation_failed", fieldErrors: error.flatten().fieldErrors });
  throw error;
}
