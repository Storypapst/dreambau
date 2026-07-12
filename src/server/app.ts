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
import { createTestAccessRouter } from "./test-access.js";
import { createJmapTestMailReader, type TestMailReader } from "./test-mail.js";

interface AppOptions {
  passwordHash?: string;
  sessionSecret?: string;
  secureCookies?: boolean;
  loadAccounts?: () => AccountRecord[];
  database?: RegistryDatabase;
  exportPath?: string | null;
  machineIdentities?: MachineIdentity[];
  mailReader?: TestMailReader;
}

export function createApp(options: AppOptions = {}) {
  const config = loadConfig();
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "64kb" }));
  app.use(cookieParser());
  app.get("/testmails/health/live", (_req, res) => res.json({ status: "ok" }));
  app.get("/testmails/health/ready", (_req, res) => res.json({ status: "ok" }));
  const api = express.Router();
  const { requireSession } = installAuth(
    api,
    options.passwordHash ?? config.passwordHash,
    options.sessionSecret ?? config.sessionSecret,
    options.secureCookies ?? config.secureCookies
  );
  const accountLoader = options.loadAccounts ?? (() => loadAccountsFile(config.accountsPath));
  const database = options.database ?? createDatabase(options.loadAccounts ? ":memory:" : config.databasePath);
  const accountViews = () => accountLoader().map((account) => ({ ...account, metadata: database.getMetadata(account.email) }));
  const exportPath = options.exportPath === undefined ? (options.loadAccounts ? null : config.exportPath) : options.exportPath;
  const markdown = () => generateMarkdown(accountViews(), database.getTaxonomies());
  const regenerate = async () => { if (exportPath) await writeMarkdownAtomically(exportPath, markdown()); };
  void regenerate();
  api.use("/v1", createTestAccessRouter({
    identities: options.machineIdentities ?? loadMachineIdentities(config.machineIdentitiesPath),
    loadAccounts: accountLoader,
    database,
    mailReader: options.mailReader ?? createJmapTestMailReader()
  }));
  api.get("/accounts", requireSession, (_req, res, next) => { try { res.json(accountViews()); } catch (error) { next(error); } });
  api.patch("/accounts/:email", requireSession, async (req, res) => {
    const email = decodeURIComponent(String(req.params.email)); if (!accountLoader().some((account) => account.email === email)) return res.status(404).json({ error: "account_not_found" });
    try { const value = database.upsertMetadata(email, metadataPatchSchema.parse(req.body)); await regenerate(); res.json(value); } catch (error) { handleValidation(error, res); }
  });
  api.post("/accounts/bulk-status", requireSession, async (req, res) => {
    try { const body = z.object({ emails: z.array(z.string().email()).min(1), status: z.enum(lifecycleStatuses) }).parse(req.body); const updated = database.bulkStatus(body.emails, body.status); await regenerate(); res.json({ updated }); } catch (error) { handleValidation(error, res); }
  });
  api.get("/taxonomies", requireSession, (_req, res) => res.json(database.getTaxonomies()));
  api.put("/taxonomies/:kind", requireSession, async (req, res) => {
    try { const kind = taxonomyKindSchema.parse(String(req.params.kind)); const { values } = taxonomyValuesSchema.parse(req.body); const result = database.putTaxonomy(kind, values); await regenerate(); res.json(result); } catch (error) { handleValidation(error, res); }
  });
  api.get("/export/markdown", requireSession, (_req, res) => res.type("text/markdown; charset=utf-8").send(markdown()));
  app.use("/testmails/api", api);
  app.get("/testmails/testmails.md", requireSession, (_req, res) => res.type("text/markdown; charset=utf-8").send(markdown()));

  const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../client");
  app.use("/testmails", express.static(clientDir, { index: false }));
  app.get(["/testmails", "/testmails/", "/testmails/*splat"], (_req, res) => res.sendFile(path.join(clientDir, "index.html")));
  return app;
}

function handleValidation(error: unknown, res: express.Response) {
  if (error instanceof z.ZodError) return res.status(400).json({ error: "validation_failed", fieldErrors: error.flatten().fieldErrors });
  throw error;
}
