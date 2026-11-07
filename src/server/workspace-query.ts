import { z } from "zod";
import type { WorkspaceSource } from "../shared/workspace.js";

export const workspaceQuerySchema = z.object({ source: z.enum(["all", "test-run", "evidence-run"]).default("all"), project: z.enum(["oriso", "orimo", "dreambau"]).optional(), environment: z.enum(["local", "pre-dev", "dev", "production-test"]).optional(), result: z.enum(["passed", "failed", "flaky", "blocked", "informational"]).optional(), q: z.string().trim().max(200).optional(), cursor: z.string().max(1200).optional(), limit: z.coerce.number().int().min(1).max(50).default(20) }).strict();
export type WorkspaceQuery = z.infer<typeof workspaceQuerySchema>;
const cursorSchema = z.object({ createdAt: z.iso.datetime(), source: z.enum(["test-run", "evidence-run"]), id: z.string().min(1).max(300), query: z.string() }).strict();
export type WorkspaceCursor = z.infer<typeof cursorSchema>;
const fingerprint = (query: WorkspaceQuery) => JSON.stringify([query.source, query.project ?? null, query.environment ?? null, query.result ?? null, query.q ?? null]);
export function decodeWorkspaceCursor(query: WorkspaceQuery): WorkspaceCursor | undefined {
  if (!query.cursor) return undefined;
  const parsed = cursorSchema.parse(JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8")));
  if (parsed.query !== fingerprint(query)) throw new Error("cursor query changed");
  return parsed;
}
export function encodeWorkspaceCursor(item: { createdAt: string; source: WorkspaceSource; id: string }, query: WorkspaceQuery) {
  return Buffer.from(JSON.stringify({ ...item, query: fingerprint(query) })).toString("base64url");
}
export function beforeForSource(cursor: WorkspaceCursor | undefined, source: WorkspaceSource) {
  if (!cursor) return undefined;
  return { createdAt: cursor.createdAt, id: cursor.source === source ? cursor.id : source < cursor.source ? "\uffff" : "" };
}
