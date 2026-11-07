/** Transport-only contract. These records always come from their named source. */
export type WorkspaceSource = "test-run" | "evidence-run";
export type WorkspaceProject = "oriso" | "orimo" | "dreambau";
export type WorkspaceEnvironment = "local" | "pre-dev" | "dev" | "production-test";
export type WorkspaceResult = "passed" | "failed" | "flaky" | "blocked" | "informational";
export type WorkspaceEvidenceStatus = "available" | "unconfigured" | "unavailable";
export type WorkspaceFileKind = "screenshot" | "video" | "playwright-report" | "trace" | "log" | "document" | "other";
export interface WorkspaceRunSummary {
  id: string; source: WorkspaceSource; title: string; project: WorkspaceProject; environment: WorkspaceEnvironment;
  createdAt: string; lifecycle: "reserved" | "running" | "passed" | "failed" | "released" | "draft" | "processing" | "quarantined" | "published" | "archived";
  result: WorkspaceResult | null; commitSha: string; applicationVersion: string | null; repository: string | null;
  pullRequestUrl: string | null; filesCount: number | null; owner: string | null;
}
export interface WorkspaceFile {
  id: string; runId: string; kind: WorkspaceFileKind; filename: string; caption: string; contentType: string;
  byteSize: number; sha256: string; publicUrl: string | null; viewerUrl: string | null;
  /** Same-origin authenticated URLs, bound to the current viewer; never credentials or object keys. */
  previewUrl: string | null; downloadUrl: string | null; processingState: "pending" | "ready" | "rejected";
}
export interface WorkspaceDocument extends WorkspaceFile {
  project: WorkspaceProject; environment: WorkspaceEnvironment; createdAt: string; runTitle: string;
}
export interface WorkspaceEvent { type: string; createdAt: string; actor: string | null; payload: Record<string, unknown> }
export interface WorkspaceReference {
  id: string; kind: "issue" | "pull-request" | "document" | "evidence-run" | "test-run" | "legacy-report";
  label: string; url: string | null; target?: { source: WorkspaceSource; id: string }; fileId?: string;
}
export type WorkspaceReferenceInput =
  | { kind: "issue" | "pull-request"; url: string }
  | { kind: WorkspaceSource; runId: string }
  | { kind: "document"; evidenceRunId: string; fileId: string };
export interface WorkspaceRunDetail extends WorkspaceRunSummary {
  events: WorkspaceEvent[]; files: WorkspaceFile[]; references: WorkspaceReference[]; evidenceStatus: WorkspaceEvidenceStatus;
}
export interface WorkspacePage<T> { items: T[]; nextCursor: string | null; evidenceStatus: WorkspaceEvidenceStatus }
