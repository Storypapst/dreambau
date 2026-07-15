import cookieParser from "cookie-parser";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installAuth } from "./auth.js";
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
import { createInfisicalRegistryProvider, type RegistryProvider, type TestEnvironment, type TestProject } from "./infisical-provider.js";
import { createPasskeyStore, type HumanUser, type PasskeyStore } from "./passkey-store.js";
import { installPasskeyAuth, type WebAuthnAdapter } from "./passkey-auth.js";
import type { SessionPrincipal } from "./sessions.js";
import {
  coordinationForProjects,
  coordinationItemById,
  type CoordinationProject
} from "./coordination.js";
import { loadRuntimeStatuses, type RuntimeStatus } from "./runtime-status.js";

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
  now?: () => Date;
  passkeyStore?: PasskeyStore;
  webauthn?: WebAuthnAdapter;
  rpId?: string;
  expectedOrigin?: string;
  bootstrapUser?: { email: string; name: string; projects: Array<"oriso" | "orimo" | "dreambau">; role: "admin" };
  runtimeStatusLoader?: (projects: CoordinationProject[]) => Promise<RuntimeStatus[]>;
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
    bootstrapUser: options.bootstrapUser ?? { email: "fg@dreambau.com", name: "Frank Gerhardt", projects: ["oriso", "orimo", "dreambau"], role: "admin" }
  });
  const requireActivePasskeySession = (req: express.Request, res: express.Response, next: express.NextFunction) =>
    requireStrongSession(req, res, () => {
      const principal = res.locals.session as SessionPrincipal;
      const user = principal.userId ? passkeyStore.getUser(principal.userId) : null;
      if (!user || user.status !== "active") return res.status(403).json({ error: "user_disabled" });
      res.locals.humanUser = user;
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
  app.get("/testmails/health/ready", async (_req, res) => {
    try {
      if (registryProvider.health) await registryProvider.health();
      else await registryProvider.list();
      res.json({ status: "ok" });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  });
  api.use("/v1", createTestAccessRouter({
    identities: options.machineIdentityLoader
      ?? (options.machineIdentities ? () => options.machineIdentities! : () => loadMachineIdentities(config.machineIdentitiesPath)),
    registryProvider,
    database,
    mailReader: options.mailReader ?? createJmapTestMailReader(),
    now: options.now
  }));
  api.get("/accounts", requireActivePasskeySession, (_req, res, next) => { try { res.json(scopedAccountViews(res.locals.humanUser)); } catch (error) { next(error); } });
  api.patch("/accounts/:email", requireActivePasskeySession, async (req, res) => {
    const email = decodeURIComponent(String(req.params.email)); if (!scopedAccountViews(res.locals.humanUser).some((account) => account.email === email)) return res.status(404).json({ error: "account_not_found" });
    try { const value = database.upsertMetadata(email, metadataPatchSchema.parse(req.body)); await regenerate(); res.json(value); } catch (error) { handleValidation(error, res); }
  });
  api.post("/accounts/bulk-status", requireActivePasskeySession, async (req, res) => {
    try { const body = z.object({ emails: z.array(z.string().email()).min(1), status: z.enum(lifecycleStatuses) }).parse(req.body); const allowed = new Set(scopedAccountViews(res.locals.humanUser).map((account) => account.email)); if (body.emails.some((email) => !allowed.has(email))) return res.status(403).json({ error: "scope_denied" }); const updated = database.bulkStatus(body.emails, body.status); await regenerate(); res.json({ updated }); } catch (error) { handleValidation(error, res); }
  });
  api.get("/taxonomies", requireActivePasskeySession, (_req, res) => res.json(database.getTaxonomies()));
  api.get("/machine-identities/usage", requireActivePasskeySession, (_req, res) => res.json(database.getMachineIdentityUsage()));
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
  api.get("/coordination", requireActivePasskeySession, (_req, res) => {
    res.json(scopedCoordination(res.locals.humanUser));
  });
  api.get("/coordination/runtime", requireActivePasskeySession, async (_req, res, next) => {
    try {
      const loader = options.runtimeStatusLoader ?? loadRuntimeStatuses;
      res.json(await loader(coordinationProjects(res.locals.humanUser)));
    } catch (error) {
      next(error);
    }
  });
  api.post("/coordination/items/:itemId/tags", requireActivePasskeySession, (req, res) => {
    const scoped = scopedCoordinationItem(String(req.params.itemId), res.locals.humanUser);
    if (scoped.status !== 200) return res.status(scoped.status).json({ error: scoped.status === 403 ? "scope_denied" : "coordination_item_not_found" });
    try {
      const { tag } = coordinationTagSchema.parse(req.body);
      res.status(201).json(database.addCoordinationTag(scoped.item.id, tag));
    } catch (error) {
      handleValidation(error, res);
    }
  });
  api.post("/coordination/items/:itemId/discussions", requireActivePasskeySession, (req, res) => {
    const scoped = scopedCoordinationItem(String(req.params.itemId), res.locals.humanUser);
    if (scoped.status !== 200) return res.status(scoped.status).json({ error: scoped.status === 403 ? "scope_denied" : "coordination_item_not_found" });
    try {
      const discussion = coordinationDiscussionSchema.parse(req.body);
      res.status(201).json(database.addCoordinationDiscussion(scoped.item.id, discussion));
    } catch (error) {
      handleValidation(error, res);
    }
  });
  api.put("/taxonomies/:kind", requireActivePasskeySession, async (req, res) => {
    try { const kind = taxonomyKindSchema.parse(String(req.params.kind)); const { values } = taxonomyValuesSchema.parse(req.body); const result = database.putTaxonomy(kind, values); await regenerate(); res.json(result); } catch (error) { handleValidation(error, res); }
  });
  api.get("/export/markdown", requireActivePasskeySession, (_req, res) => res.type("text/markdown; charset=utf-8").send(generateMarkdown(scopedAccountViews(res.locals.humanUser), database.getTaxonomies())));
  app.use("/testmails/api", api);
  app.get("/testmails/testmails.md", requireActivePasskeySession, (_req, res) => res.type("text/markdown; charset=utf-8").send(generateMarkdown(scopedAccountViews(res.locals.humanUser), database.getTaxonomies())));

  const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../client");
  app.use("/testmails", express.static(clientDir, { index: false }));
  app.get(["/testmails", "/testmails/", "/testmails/*splat"], (_req, res) => res.sendFile(path.join(clientDir, "index.html")));
  return app;
}

function handleValidation(error: unknown, res: express.Response) {
  if (error instanceof z.ZodError) return res.status(400).json({ error: "validation_failed", fieldErrors: error.flatten().fieldErrors });
  throw error;
}
