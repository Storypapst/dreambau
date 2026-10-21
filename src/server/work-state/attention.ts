import type {SourceFacts} from "./sources.js";
import { z } from "zod";
import {
  classifyPullRequest,
  type AttentionReason,
  type FreshnessMode,
} from "./classify.js";
import type { WorkStateStore } from "./store.js";
import type { PullRequestSnapshot, RepoScope } from "./model.js";
export const attentionQuerySchema = z
  .object({
    view: z.enum(["action", "waiting", "merged", "data"]).default("action"),
    repositoryId: z.string().min(1).optional(),
    person: z.string().min(1).optional(),
    priority: z.enum(["P0", "P1", "P2", "P3", "unknown"]).optional(),
    reason: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
    cursor: z.coerce.number().int().min(0).default(0),
  })
  .strict();
export type AttentionQuery = z.input<typeof attentionQuerySchema>;
export type AttentionView = "action" | "waiting" | "merged" | "data";
type StoredPull = PullRequestSnapshot & { repositoryId: string };
export interface Assignment {
  id: string;
  goal: string;
  owner: string | null;
  priority: "P0" | "P1" | "P2" | "P3" | null;
}
export interface AttentionRow {
  pr: Omit<StoredPull, "facets">;
  repository: { id: string; fullName: string };
  reasons: AttentionReason[];
  assignments: Assignment[];
  /** Oldest stored facet observation, never the repository inventory timestamp. */
  observedAt: string | null;
  deployment: SourceFacts["deployment"];
  acceptance: SourceFacts["acceptance"];
  sources?:SourceFacts;
}
export interface AttentionList {
  items: AttentionRow[];
  nextCursor: number | null;
  total: number;
  counts: Record<AttentionView, number>;
  generatedAt: string;
  mode: FreshnessMode;
  repositories: ReturnType<WorkStateStore["listRepositories"]>;
  options: { people: string[]; priorities: string[]; reasons: string[] };
}
export interface AttentionDetail extends Omit<AttentionRow, "pr"> {
  pr: StoredPull;
  workItems: ReturnType<WorkStateStore["listWorkItems"]>;
}
export function createAttentionService(
  store: WorkStateStore,
  options: { now?: () => number; mode?: FreshnessMode } = {},
) {
  const mode = options.mode ?? "normal";
  const now = options.now ?? Date.now;
  const assignments = (
    items: ReturnType<WorkStateStore["listWorkItems"]>,
    pr: StoredPull,
  ) =>
    items.filter((item) =>
      item.links.some(
        (link) =>
          link.kind === "pull" &&
          link.repositoryId === pr.repositoryId &&
          link.number === pr.number,
      ),
    );
  const row = (
    pr: StoredPull,
    repos: ReturnType<WorkStateStore["listRepositories"]>,
    items: ReturnType<WorkStateStore["listWorkItems"]>,
    time: number,
    scope: RepoScope,
  ): AttentionRow => {
    const repo = repos.find((repo) => repo.id === pr.repositoryId)!;
    const { facets: _facets, ...core } = pr;
    const observations = Object.values(pr.facets).map(
      (facet) => facet?.observedAt,
    );
    const observedAt =
      observations.length &&
      observations.every(
        (at) =>
          at &&
          Number.isFinite(Date.parse(at)) &&
          Date.parse(at) <= time + 60_000,
      )
        ? observations.sort()[0]!
        : null;
    const sources=store.sourceFacts(scope,pr.repositoryId,pr.number,pr.headSha,time);
    const reasons=classifyPullRequest({ ...pr, mode }, time);
    if(sources.board.some(b=>b.coverage!=="complete"||b.stale))reasons.push({code:"board_source_incomplete",category:"data",url:sources.board[0]?.url??pr.url,observedAt:sources.board[0]?.observedAt??null});
    if((sources.deploymentReceipt||sources.acceptanceReceipt)&&sources.feed.coverage!=="complete")reasons.push({code:"delivery_source_incomplete",category:"data",url:sources.deploymentReceipt?.evidenceLinks[0]??sources.acceptanceReceipt?.evidenceLinks[0]??pr.url,observedAt:sources.deploymentReceipt?.observedAt??sources.acceptanceReceipt?.observedAt??null});
    return {
      pr: core,
      observedAt,
      repository: { id: repo.id, fullName: repo.fullName },
      reasons,
      assignments: assignments(items, pr).map(
        ({ id, goal, owner, priority }) => ({ id, goal, owner, priority }),
      ),
      deployment:sources.deployment,
      acceptance:sources.acceptance,
      sources,
    };
  };
  const belongs = (item: AttentionRow, view: AttentionView) =>
    view === "merged"
      ? item.pr.lifecycle === "merged"
      : item.pr.lifecycle === "open" &&
        item.reasons.some((reason) =>
          view === "action"
            ? reason.category === "action" || reason.category === "data"
            : reason.category === view ||
              (view === "data" && reason.code === "no_checks"),
        );
  return {
    listAttention(scope: RepoScope, input: unknown = {}): AttentionList {
      const query = attentionQuerySchema.parse(input);
      return store.readSnapshot(() => {
        const repos = store.listRepositories(scope);
        const items = store.listWorkItems(scope);
        const pulls: StoredPull[] = [];
        let cursor: number | null = 0;
        do {
          const page = store.listPullRequests(scope, {
            repositoryId: query.repositoryId,
            limit: 100,
            cursor,
          });
          pulls.push(...page.items);
          cursor = page.nextCursor;
        } while (cursor !== null);
        const time = now();
        const all = pulls.map((pr) => row(pr, repos, items, time,scope));
        const filtered = all.filter(
          (item) =>
            (!query.person ||
              (query.person === "unknown"
                ? item.assignments.length === 0 ||
                  item.assignments.some((item) => !item.owner)
                : item.assignments.some(
                    (item) => item.owner === query.person,
                  ))) &&
            (!query.priority ||
              (query.priority === "unknown"
                ? !item.assignments.some(a=>a.priority)&&!item.sources?.board.some(b=>b.priority)
                : item.assignments.some(a=>a.priority===query.priority)||item.sources?.board.some(b=>b.priority===query.priority))) &&
            (!query.reason ||
              item.reasons.some((reason) => reason.code === query.reason)),
        );
        const views: AttentionView[] = ["action", "waiting", "merged", "data"];
        const counts = Object.fromEntries(
          views.map((view) => [
            view,
            filtered.filter((item) => belongs(item, view)).length,
          ]),
        ) as Record<AttentionView, number>;
        const priority = (item: AttentionRow) =>
          Math.min(
            9,
            ...(item.sources?.board.map(b=>b.priority?Number(b.priority[1]):9)??[]),
            ...item.assignments.map((item) =>
              item.priority ? Number(item.priority[1]) : 9,
            ),
          );
        const severity = (item: AttentionRow) =>
          item.reasons.some((reason) => reason.category === "action")
            ? 0
            : item.reasons.some((reason) => reason.category === "data")
              ? 1
              : 2;
        const visible = filtered
          .filter((item) => belongs(item, query.view))
          .sort(
            (a, b) =>
              (query.view === "merged"
                ? String(b.pr.mergedAt).localeCompare(String(a.pr.mergedAt))
                : priority(a) - priority(b) || severity(a) - severity(b)) ||
              a.pr.title.localeCompare(b.pr.title, "en") ||
              a.repository.id.localeCompare(b.repository.id) ||
              a.pr.number - b.pr.number,
          );
        const page = visible.slice(query.cursor, query.cursor + query.limit);
        return {
          items: page,
          nextCursor:
            query.cursor + page.length < visible.length
              ? query.cursor + page.length
              : null,
          total: visible.length,
          counts,
          generatedAt: new Date(time).toISOString(),
          mode,
          repositories: repos,
          options: {
            people: [
              ...new Set(
                all.flatMap((item) =>
                  item.assignments.flatMap((item) =>
                    item.owner ? [item.owner] : [],
                  ),
                ),
              ),
            ].sort(),
            priorities: [
              ...new Set(
                all.flatMap((item) =>
                  [...item.assignments.flatMap((item) => item.priority ? [item.priority] : []),...(item.sources?.board.flatMap(board=>board.priority?[board.priority]:[])??[])],
                ),
              ),
            ].sort(),
            reasons: [
              ...new Set(
                all.flatMap((item) =>
                  item.reasons.map((reason) => reason.code),
                ),
              ),
            ].sort(),
          },
        };
      });
    },
    detail(
      scope: RepoScope,
      repositoryId: string,
      number: number,
    ): AttentionDetail {
      return store.readSnapshot(() => {
        const pr = store.getPullRequest(scope, repositoryId, number);
        const repos = store.listRepositories(scope);
        const items = store.listWorkItems(scope);
        return {
          ...row(pr, repos, items, now(),scope),
          pr,
          workItems: assignments(items, pr),
        };
      });
    },
  };
}
