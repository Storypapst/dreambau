/** Observed GitHub facts for explicit references; never a deployment assertion. */
export type WorkspaceGithubStatus = "unconfigured" | "ready" | "partial" | "unavailable" | "denied";
export interface WorkspaceGithubPullRequest {
  url: string; title: string; state: "open" | "closed" | "merged"; draft: boolean;
}
export interface WorkspaceGithubFacts {
  kind: "issue" | "pull-request"; title: string; state: "open" | "closed" | "merged";
  stateReason: string | null; draft: boolean; mergedAt: string | null;
  releaseAssignments: Array<{ title: string; url: string; source: "project-field" | "milestone" }>;
  boards: Array<{ title: string; status: string | null; url: string }>;
  closingPullRequests: WorkspaceGithubPullRequest[];
  closingPullRequestsComplete: boolean;
  /** Only published releases whose tag contains this PR's merge commit. */
  publishedReleases: Array<{ tag: string; title: string; url: string; publishedAt: string }>;
  releaseCoverage: "complete" | "partial" | "unknown";
}
export interface WorkspaceGithubSnapshot {
  referenceId: string; url: string; status: WorkspaceGithubStatus;
  observedAt: string | null; lastAttemptAt: string | null; cached: boolean; stale: boolean;
  errorCode: string | null; facts: WorkspaceGithubFacts | null;
}
export interface WorkspaceGithubResponse {
  status: WorkspaceGithubStatus; items: WorkspaceGithubSnapshot[];
  limitReached: boolean; retryAfter: string | null;
}
