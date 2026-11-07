import express from "express";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import type { RegistryDatabase } from "./db.js";
import type { HumanUser } from "./passkey-store.js";
import type { HumanProjectGrant } from "./human-grants.js";
import type { TestRun, TestRunEvent } from "./test-run-store.js";
import { beforeForSource, decodeWorkspaceCursor, encodeWorkspaceCursor, workspaceQuerySchema, type WorkspaceQuery } from "./workspace-query.js";
import { WorkspaceEvidenceUnavailable, type EvidenceReadQuery, type WorkspaceEvidenceClient, type WorkspaceGatewayFile, type WorkspaceGatewayRun } from "./workspace-evidence-client.js";
import { safeWorkspaceUrl as safeHttp } from "./workspace-url.js";
import { unconfiguredGithub, type WorkspaceGithubClient } from "./workspace-github.js";
import type { WorkspaceDocument, WorkspaceEvent, WorkspaceFile, WorkspacePage, WorkspaceReference, WorkspaceReferenceInput, WorkspaceResult, WorkspaceRunDetail, WorkspaceRunSummary, WorkspaceSource } from "../shared/workspace.js";

const sourceSchema = z.enum(["test-run", "evidence-run"]);
const referenceSchema = z.union([
  z.object({ kind: z.enum(["issue", "pull-request"]), url: z.string().url().max(400) }).strict(),
  z.object({ kind: sourceSchema, runId: z.string().min(1).max(240) }).strict(),
  z.object({ kind: z.literal("document"), evidenceRunId: z.string().min(1).max(240), fileId: z.string().min(1).max(240) }).strict()
]);
const resultMap = { PASS: "passed", FAIL: "failed", FLAKY: "flaky", BLOCKED: "blocked", INFORMATIONAL: "informational" } as const;
const upstreamResults = { passed: "PASS", failed: "FAIL", flaky: "FLAKY", blocked: "BLOCKED", informational: "INFORMATIONAL" };
class NotFound extends Error {}
const descending = (left: string, right: string) => left === right ? 0 : left > right ? -1 : 1;
const compare = (a: { createdAt: string; source: string; id: string }, b: { createdAt: string; source: string; id: string }) => descending(a.createdAt, b.createdAt) || descending(a.source, b.source) || descending(a.id, b.id);
/** At most four upstream reads are active; a failure stops scheduling further batches. */
async function readBatches<T, R>(inputs: T[], read: (input: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(inputs.length); let index = 0; let failed = false;
  await Promise.all(Array.from({ length: Math.min(4, inputs.length) }, async () => {
    while (!failed && index < inputs.length) {
      const current = index++;
      try { results[current] = await read(inputs[current]); }
      catch (error) { failed = true; throw error; }
    }
  }));
  return results;
}
function measuredPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const key of ["checks", "failures"] as const) if (Number.isSafeInteger(payload[key]) && Number(payload[key]) >= 0) safe[key] = payload[key];
  const report = safeHttp(payload.reportUrl); if (report) safe.reportUrl = report;
  return safe;
}
function ledgerSummary(run: Omit<TestRun, "accounts">, outcome?: TestRunEvent): WorkspaceRunSummary {
  return { id: run.id, source: "test-run", title: run.scenario, project: run.project, environment: run.targetEnvironment, createdAt: run.createdAt,
    lifecycle: run.status, result: outcome?.type === "run_failed" ? "failed" : outcome?.type === "run_passed" ? "passed" : null,
    commitSha: run.commitSha, applicationVersion: run.applicationVersion, repository: null, pullRequestUrl: null, filesCount: null, owner: run.initiatedBy.id };
}
function evidenceSummary(run: WorkspaceGatewayRun): WorkspaceRunSummary {
  return { id: run.id, source: "evidence-run", title: run.title, project: run.project, environment: run.environment, createdAt: run.createdAt,
    lifecycle: run.state, result: resultMap[run.result], commitSha: run.commitSha, applicationVersion: null, repository: run.repository,
    pullRequestUrl: run.pullRequestNumber ? `https://github.com/${run.repository}/pull/${run.pullRequestNumber}` : null, filesCount: run.filesCount ?? run.files.length, owner: run.source };
}

export function createWorkspaceRouter(options: { database: RegistryDatabase; grantsFor(user: HumanUser): HumanProjectGrant[]; evidence: WorkspaceEvidenceClient | null; github?: WorkspaceGithubClient | null; now?: () => Date }) {
  const router = express.Router();
  router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  const scopesFor = (user: HumanUser) => options.grantsFor(user).filter(grant => user.projects.includes(grant.project));
  const canSee = (user: HumanUser, project: string, environment: string) => scopesFor(user).some(grant => grant.project === project && grant.environments.some(item => item === environment));
  const visibleLedger = (user: HumanUser, id: string) => {
    const run = options.database.testRuns.get(id);
    if (!run || !canSee(user, run.project, run.targetEnvironment) || !canSee(user, run.project, run.poolEnvironment)) throw new NotFound();
    return run;
  };
  const visibleEvidence = async (user: HumanUser, id: string) => {
    if (!options.evidence) throw new WorkspaceEvidenceUnavailable("evidence_unconfigured");
    const run = await options.evidence.get(id);
    if (!run || !canSee(user, run.project, run.environment)) throw new NotFound();
    return run;
  };
  const fileView = (file: WorkspaceGatewayFile, run: WorkspaceGatewayRun, user: HumanUser): WorkspaceFile => {
    const allowed = file.runId === run.id && file.processingState === "ready" && !["quarantined", "archived"].includes(run.state);
    const content = `/testmails/api/workspace/evidence/${encodeURIComponent(run.id)}/files/${encodeURIComponent(file.id)}/content?viewer=${encodeURIComponent(user.id)}`;
    const mime = file.contentType.split(";")[0];
    const preview = /^(image\/(png|jpeg|webp)|video\/mp4|text\/(plain|markdown)|application\/json)$/.test(mime);
    const download = preview || mime === "application/pdf" || mime === "application/zip";
    return { id: file.id, runId: file.runId, kind: file.kind, filename: file.filename, caption: file.caption, contentType: file.contentType,
      byteSize: file.byteSize, sha256: file.sha256, processingState: file.processingState,
      publicUrl: run.state === "published" ? safeHttp(file.publicUrl) : null, viewerUrl: run.state === "published" ? safeHttp(file.viewerUrl) : null,
      previewUrl: allowed && preview ? content : null, downloadUrl: allowed && download ? `${content}&download=1` : null };
  };
  const resolveReference = async (input: WorkspaceReferenceInput, id: string, user: HumanUser, owner: WorkspaceRunSummary): Promise<{ reference: WorkspaceReference; files: WorkspaceFile[] }> => {
    if (input.kind === "issue" || input.kind === "pull-request") {
      const url = new URL(input.url);
      const match = /^\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/(issues|pull)\/([1-9][0-9]*)\/?$/.exec(url.pathname);
      if (url.protocol !== "https:" || url.hostname !== "github.com" || url.username || url.password || url.search || url.hash || !match || (input.kind === "issue" ? match[2] !== "issues" : match[2] !== "pull")) throw new Error("invalid_reference");
      return { reference: { id, kind: input.kind, label: `${match[1]}#${match[3]}`, url: `https://github.com/${match[1]}/${match[2]}/${match[3]}` }, files: [] };
    }
    if (input.kind === "test-run") {
      const target = visibleLedger(user, input.runId);
      if (target.project !== owner.project || target.targetEnvironment !== owner.environment) throw new NotFound();
      return { reference: { id, kind: input.kind, label: target.scenario, url: null, target: { source: "test-run", id: target.id } }, files: [] };
    }
    if (input.kind !== "document" && !("runId" in input)) throw new Error("invalid_reference");
    const target = await visibleEvidence(user, input.kind === "document" ? input.evidenceRunId : input.runId);
    if (target.project !== owner.project || target.environment !== owner.environment) throw new NotFound();
    if (input.kind === "document") {
      const file = target.files.find(item => item.id === input.fileId && item.kind === "document" && item.processingState === "ready");
      if (!file || target.state === "quarantined" || target.state === "archived") throw new NotFound();
      const value = fileView(file, target, user);
      return { reference: { id, kind: "document", label: file.filename, url: value.downloadUrl, target: { source: "evidence-run", id: target.id }, fileId: file.id }, files: [value] };
    }
    return { reference: { id, kind: "evidence-run", label: target.title, url: null, target: { source: "evidence-run", id: target.id } }, files: target.files.map(file => fileView(file, target, user)) };
  };

  const detail = async (source: WorkspaceSource, id: string, user: HumanUser): Promise<WorkspaceRunDetail> => {
    let summary: WorkspaceRunSummary; let events: WorkspaceEvent[]; let files: WorkspaceFile[] = []; const references: WorkspaceReference[] = [];
    if (source === "test-run") {
      const run = visibleLedger(user, id); const raw = options.database.testRuns.events(id);
      const outcome = raw.find(event => event.type === "run_passed" || event.type === "run_failed");
      summary = ledgerSummary(run, outcome);
      events = raw.filter(event => ["run_reserved", "run_running", "run_passed", "run_failed", "run_released"].includes(event.type)).map(event => ({ type: event.type, actor: event.actor.id, createdAt: event.createdAt, payload: measuredPayload(event.payload) }));
      for (const event of raw) {
        if (["run_passed", "run_failed"].includes(event.type) && typeof event.payload.reportUrl === "string") references.push({ id: `legacy:${event.id}`, kind: "legacy-report", label: "Report", url: safeHttp(event.payload.reportUrl) });
      }
    } else {
      const run = await visibleEvidence(user, id); summary = evidenceSummary(run);
      events = run.events.map(event => ({ type: event.eventType, actor: event.actorId, createdAt: event.createdAt, payload: {} }));
      files = run.files.map(file => fileView(file, run, user));
      if (summary.pullRequestUrl) references.push({ id: "recorded-pr", kind: "pull-request", label: `${run.repository}#${run.pullRequestNumber}`, url: summary.pullRequestUrl });
    }
    let evidenceStatus: WorkspaceRunDetail["evidenceStatus"] = options.evidence ? "available" : "unconfigured";
    for (const stored of options.database.workspaceReferences.list(source, id)) {
      const remote = stored.input.kind === "evidence-run" || stored.input.kind === "document";
      if (remote && evidenceStatus !== "available") continue;
      try { const value = await resolveReference(stored.input, stored.id, user, summary); references.push(value.reference); files.push(...value.files); }
      catch (error) { if (error instanceof WorkspaceEvidenceUnavailable) evidenceStatus = options.evidence ? "unavailable" : "unconfigured"; else if (!(error instanceof NotFound)) throw error; }
    }
    events.push(...options.database.workspaceReferences.events(source, id)); events.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    files = [...new Map(files.map(file => [`${file.runId}:${file.id}`, file])).values()];
    return { ...summary, events, files, references, evidenceStatus };
  };
  const fail = (error: unknown, res: express.Response, next: express.NextFunction) => {
    if (error instanceof NotFound) return res.status(404).json({ error: "run_not_found" });
    if (error instanceof WorkspaceEvidenceUnavailable) return res.status(503).json({ error: options.evidence ? "evidence_unavailable" : "evidence_unconfigured" });
    if (error instanceof z.ZodError || (error instanceof Error && error.message === "invalid_reference")) return res.status(400).json({ error: "invalid_reference" });
    next(error);
  };
  const parseQuery = (req: express.Request, res: express.Response) => {
    const parsed = workspaceQuerySchema.safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ error: "invalid_query" }); return null; }
    const user = res.locals.humanUser as HumanUser; const query = parsed.data;
    if (query.project && !user.projects.includes(query.project)) { res.status(403).json({ error: "scope_denied" }); return null; }
    if (query.environment && !scopesFor(user).some(scope => (!query.project || scope.project === query.project) && scope.environments.includes(query.environment!))) { res.status(403).json({ error: "scope_denied" }); return null; }
    try { return { query, cursor: decodeWorkspaceCursor(query), user }; }
    catch { res.status(400).json({ error: "invalid_cursor" }); return null; }
  };
  const evidenceQueries = (query: WorkspaceQuery, user: HumanUser, before?: { createdAt: string; id: string }): EvidenceReadQuery[] => scopesFor(user)
    .filter(scope => !query.project || scope.project === query.project).map(scope => ({ project: scope.project,
      environments: query.environment ? scope.environments.filter(environment => environment === query.environment) : scope.environments,
      limit: query.limit + 1, ...(before ? { cursor: Buffer.from(JSON.stringify(before)).toString("base64url") } : {}), q: query.q, result: query.result ? upstreamResults[query.result] : undefined }))
    .filter(scope => scope.environments.length);

  router.get("/runs", async (req, res, next) => {
    const parsed = parseQuery(req, res); if (!parsed) return;
    const { query, cursor, user } = parsed; const items: WorkspaceRunSummary[] = [];
    const referenceIds = query.q && query.source !== "test-run" && options.evidence
      ? options.database.workspaceReferences.matchingEvidenceOwners(query.q, scopesFor(user), query) : [];
    if (referenceIds.length > 1000) return res.status(422).json({ error: "reference_search_too_broad" });
    if (query.source !== "evidence-run") {
      const runs = options.database.testRuns.workspacePage({ ...query, scopes: scopesFor(user), before: beforeForSource(cursor, "test-run"), limit: query.limit + 1 });
      const outcomes = options.database.testRuns.workspaceOutcomes(runs.map(run => run.id));
      items.push(...runs.map(run => ledgerSummary(run, outcomes.get(run.id))));
    }
    let evidenceStatus: WorkspacePage<WorkspaceRunSummary>["evidenceStatus"] = options.evidence ? "available" : "unconfigured";
    try {
      if (query.source !== "test-run" && options.evidence) {
        const normal = evidenceQueries(query, user, beforeForSource(cursor, "evidence-run"));
        const byReference = normal.flatMap(input => {
          const batches: EvidenceReadQuery[] = [];
          for (let offset = 0; offset < referenceIds.length; offset += 50) batches.push({ ...input, q: undefined, ids: referenceIds.slice(offset, offset + 50) });
          return batches;
        });
        const pages = await readBatches([...normal, ...byReference], input => options.evidence!.list(input));
        items.push(...pages.flatMap(page => page.items).filter(run => canSee(user, run.project, run.environment)).map(evidenceSummary));
      }
    } catch { evidenceStatus = "unavailable"; }
    try {
      const unique = [...new Map(items.map(item => [`${item.source}:${item.id}`, item])).values()].filter(item => !cursor || compare(item, cursor) > 0).sort(compare);
      const visible = unique.slice(0, query.limit); const last = visible.at(-1);
      const nextCursor = unique.length > query.limit && last ? encodeWorkspaceCursor({ id: last.id, source: last.source, createdAt: last.createdAt }, query) : null;
      return res.json({ items: visible, nextCursor, evidenceStatus } satisfies WorkspacePage<WorkspaceRunSummary>);
    } catch (error) { next(error); }
  });
  router.get("/documents", async (req, res) => {
    const parsed = parseQuery(req, res); if (!parsed) return;
    const { query, cursor, user } = parsed;
    if (!options.evidence) return res.json({ items: [], nextCursor: null, evidenceStatus: "unconfigured" });
    try {
      const pages = await Promise.all(evidenceQueries(query, user, beforeForSource(cursor, "evidence-run")).map(input => options.evidence!.documents(input)));
      const documents = pages.flatMap(page => page.items).filter(({ run, file }) => canSee(user, run.project, run.environment) && file.kind === "document" && file.processingState === "ready" && !["quarantined", "archived"].includes(run.state))
        .map(({ run, file }) => ({ ...fileView(file, run, user), project: run.project, environment: run.environment, createdAt: run.createdAt, runTitle: run.title } satisfies WorkspaceDocument));
      documents.sort((a, b) => descending(a.createdAt, b.createdAt) || descending(a.id, b.id));
      const items = documents.slice(0, query.limit); const last = items.at(-1);
      return res.json({ items, nextCursor: documents.length > query.limit && last ? encodeWorkspaceCursor({ createdAt: last.createdAt, id: last.id, source: "evidence-run" }, query) : null, evidenceStatus: "available" } satisfies WorkspacePage<WorkspaceDocument>);
    } catch { return res.json({ items: [], nextCursor: null, evidenceStatus: "unavailable" }); }
  });
  const githubStatus = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.method === "POST" && req.get("Origin") && req.get("Origin") !== `${req.protocol}://${req.get("host")}` && req.get("Origin") !== "https://dreambau.com") return res.status(403).json({ error: "origin_denied" });
    try {
      const source = sourceSchema.parse(req.params.source); const id = String(req.params.id); const user = res.locals.humanUser as HumanUser;
      const references: WorkspaceReference[] = []; let project: string; let environment: string; let pool: string | undefined;
      if (source === "test-run") { const run = visibleLedger(user, id); project = run.project; environment = run.targetEnvironment; pool = run.poolEnvironment; }
      else {
        const run = await visibleEvidence(user, id); project = run.project; environment = run.environment;
        if (run.pullRequestNumber) references.push({ id: "recorded-pr", kind: "pull-request", label: "", url: `https://github.com/${run.repository}/pull/${run.pullRequestNumber}` });
      }
      for (const stored of options.database.workspaceReferences.list(source, id)) if (stored.input.kind === "issue" || stored.input.kind === "pull-request") references.push({ id: stored.id, kind: stored.input.kind, label: "", url: stored.input.url });
      const response = options.github ? await options.github.read(references, repoProject => scopesFor(user).some(grant => grant.project === repoProject && grant.environments.length > 0), req.method === "POST") : unconfiguredGithub(references);
      if (!canSee(user, project, environment) || (pool && !canSee(user, project, pool))) throw new NotFound();
      return res.json(response);
    } catch (error) { fail(error, res, next); }
  };
  router.get("/runs/:source/:id/github", githubStatus);
  router.post("/runs/:source/:id/github/refresh", githubStatus);
  router.get("/runs/:source/:id", async (req, res, next) => {
    try { return res.json(await detail(sourceSchema.parse(req.params.source), String(req.params.id), res.locals.humanUser)); }
    catch (error) { fail(error, res, next); }
  });
  router.post("/runs/:source/:id/references", async (req, res, next) => {
    if (req.get("Origin") && req.get("Origin") !== `${req.protocol}://${req.get("host")}` && req.get("Origin") !== "https://dreambau.com") return res.status(403).json({ error: "origin_denied" });
    try {
      const source = sourceSchema.parse(req.params.source); const id = String(req.params.id); const input = referenceSchema.parse(req.body);
      const user = res.locals.humanUser as HumanUser; const owner = await detail(source, id, user);
      const resolved = await resolveReference(input, "validation", user, owner);
      if (options.database.workspaceReferences.list(source, id).length >= 50) return res.status(409).json({ error: "reference_limit" });
      const normalized = input.kind === "issue" || input.kind === "pull-request" ? { ...input, url: resolved.reference.url! } : input;
      options.database.workspaceReferences.attach(source, id, normalized, user.id, (options.now?.() ?? new Date()).toISOString(), { project: owner.project, environment: owner.environment });
      return res.status(201).json(await detail(source, id, user));
    } catch (error) { fail(error, res, next); }
  });
  router.get("/evidence/:runId/files/:fileId/content", async (req, res, next) => {
    try {
      const user = res.locals.humanUser as HumanUser;
      if (req.query.viewer !== user.id) return res.status(403).json({ error: "viewer_mismatch" });
      const run = await visibleEvidence(user, String(req.params.runId));
      const file = run.files.find(item => item.id === String(req.params.fileId));
      if (!file) throw new NotFound();
      const view = fileView(file, run, user);
      if (!view.downloadUrl) throw new NotFound();
      const response = await options.evidence!.content(run.id, file.id, req.get("Range"), req.query.download === "1");
      if (response.status === 404) { await response.body?.cancel(); throw new NotFound(); }
      if (response.status !== 200 && response.status !== 206 && response.status !== 416) { await response.body?.cancel(); throw new WorkspaceEvidenceUnavailable(); }
      res.status(response.status).set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Referrer-Policy": "no-referrer" });
      const mime = file.contentType.split(";")[0];
      res.set("Content-Type", mime === "text/markdown" ? "text/plain; charset=utf-8" : file.contentType);
      const inline = Boolean(view.previewUrl) && req.query.download !== "1";
      res.set("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${file.filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`);
      for (const header of ["content-length", "content-range", "accept-ranges"]) { const value = response.headers.get(header); if (value) res.set(header, value); }
      if (req.method === "HEAD") { await response.body?.cancel(); return res.end(); }
      if (!response.body) return res.end();
      await pipeline(Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]), res);
    } catch (error) { if (res.headersSent) res.destroy(); else fail(error, res, next); }
  });
  return router;
}
