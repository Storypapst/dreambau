import { readFileSync } from "node:fs";
import { z } from "zod";
import type { WorkspaceEnvironment, WorkspaceFile, WorkspaceProject } from "../shared/workspace.js";

const fileSchema = z.object({ id: z.string(), runId: z.string(), kind: z.enum(["screenshot", "video", "playwright-report", "trace", "log", "document", "other"]), filename: z.string(), caption: z.string(), contentType: z.string(), byteSize: z.number(), sha256: z.string(), publicUrl: z.string().nullable(), viewerUrl: z.string().nullable(), processingState: z.enum(["pending", "ready", "rejected"]) });
const runSchema = z.object({ id: z.string(), project: z.enum(["oriso", "orimo", "dreambau"]), environment: z.enum(["local", "pre-dev", "dev", "production-test"]), repository: z.string(), pullRequestNumber: z.number().nullable(), pullRequestUrl: z.string().nullable(), commitSha: z.string(), title: z.string(), result: z.enum(["PASS", "FAIL", "FLAKY", "BLOCKED", "INFORMATIONAL"]), source: z.string(), createdAt: z.iso.datetime(), state: z.enum(["draft", "processing", "quarantined", "published", "archived"]), files: z.array(fileSchema).default([]), filesCount: z.number().optional(), events: z.array(z.object({ eventType: z.string(), actorId: z.string(), createdAt: z.string() })).default([]) });
export type WorkspaceGatewayRun = z.infer<typeof runSchema>;
export type WorkspaceGatewayFile = Omit<WorkspaceFile, "previewUrl" | "downloadUrl">;
export interface EvidenceReadQuery { project: WorkspaceProject; environments: WorkspaceEnvironment[]; environment?: WorkspaceEnvironment; limit: number; cursor?: string; q?: string; result?: string; ids?: string[] }
export interface WorkspaceEvidenceClient {
  list(query: EvidenceReadQuery): Promise<{ items: WorkspaceGatewayRun[]; nextCursor: string | null }>;
  documents(query: EvidenceReadQuery): Promise<{ items: Array<{ run: WorkspaceGatewayRun; file: WorkspaceGatewayFile }>; nextCursor: string | null }>;
  get(id: string): Promise<WorkspaceGatewayRun | null>;
  content(runId: string, fileId: string, range?: string, download?: boolean): Promise<Response>;
}
export class WorkspaceEvidenceUnavailable extends Error {}
/** Fixed upstream and server-only secret file. Never accepts a caller-supplied URL/token. */
export function createWorkspaceEvidenceClient(config: { baseUrl: string; tokenFile: string }, fetcher: typeof fetch = fetch): WorkspaceEvidenceClient {
  const url = new URL(config.baseUrl);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("invalid evidence bridge URL");
  const base = url.href.replace(/\/$/, "");
  const call = async (path: string, range?: string, content = false) => {
    try {
      const token = readFileSync(config.tokenFile, "utf8").trim();
      if (!token) throw new Error("missing token");
      return await fetcher(`${base}${path}`, { headers: { authorization: `Bearer ${token}`, ...(range ? { Range: range } : {}) }, redirect: "error", signal: AbortSignal.timeout(content ? 10 * 60_000 : 15_000) });
    } catch { throw new WorkspaceEvidenceUnavailable("evidence unavailable"); }
  };
  const json = async (path: string): Promise<unknown> => {
    const response = await call(path);
    if (!response.ok) { await response.body?.cancel(); throw new WorkspaceEvidenceUnavailable("evidence unavailable"); }
    try { return await response.json(); } catch { throw new WorkspaceEvidenceUnavailable("evidence unavailable"); }
  };
  return {
    async list(query) { try { return z.object({ items: z.array(runSchema), nextCursor: z.string().nullable() }).parse(await json(`/runs?${new URLSearchParams(Object.entries(query).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]))}`)); } catch { throw new WorkspaceEvidenceUnavailable("evidence unavailable"); } },
    async documents(query) { try { return z.object({ items: z.array(z.object({ run: runSchema, file: fileSchema })), nextCursor: z.string().nullable() }).parse(await json(`/documents?${new URLSearchParams(Object.entries(query).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]))}`)); } catch { throw new WorkspaceEvidenceUnavailable("evidence unavailable"); } },
    async get(id) {
      const response = await call(`/runs/${encodeURIComponent(id)}`);
      if (response.status === 404) { await response.body?.cancel(); return null; }
      if (!response.ok) { await response.body?.cancel(); throw new WorkspaceEvidenceUnavailable("evidence unavailable"); }
      try { return runSchema.parse(await response.json()); } catch { throw new WorkspaceEvidenceUnavailable("evidence unavailable"); }
    },
    content(runId, fileId, range, download) { return call(`/runs/${encodeURIComponent(runId)}/files/${encodeURIComponent(fileId)}/content${download ? "?download=1" : ""}`, range, true); }
  };
}
