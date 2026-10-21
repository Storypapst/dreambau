import {
  safeUrlSchema,
  type PullRequestSnapshot,
  type Facet,
} from "./model.js";
export type FreshnessMode = "normal" | "polling_pilot";
export interface AttentionReason {
  code: string;
  category: "action" | "waiting" | "data" | "info";
  url: string | null;
  observedAt: string | null;
  count?: number;
}
export type ClassifiablePullRequest = PullRequestSnapshot & {
  mode?: FreshnessMode;
  reviewRequested?: boolean;
};
export function sourceUrl(
  value: unknown,
  fallback: string | null = null,
): string | null {
  const result = safeUrlSchema.safeParse(value);
  return result.success ? result.data : fallback;
}
const records = (value: unknown): Array<Record<string, unknown>> | null =>
  Array.isArray(value) &&
  value.every(
    (row) => row !== null && typeof row === "object" && !Array.isArray(row),
  )
    ? value
    : null;
const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
/** A stored value can be retained after failure: provenance, coverage and time all matter. */
export function classifyPullRequest(
  pr: ClassifiablePullRequest,
  now: number,
): AttentionReason[] {
  if (pr.lifecycle !== "open") return [];
  const reasons: AttentionReason[] = [];
  const revision = pr.baseSha
    ? `${pr.headSha}:${pr.baseSha}:${pr.head}:${pr.base}`
    : null;
  const maxAge = (pr.mode === "polling_pilot" ? 15 : 75) * 60_000;
  const usable = (facet?: Facet) =>
    Boolean(
      facet &&
      revision &&
      facet.sourceRevision === revision &&
      facet.coverage === "complete" &&
      !facet.errorCode &&
      facet.observedAt &&
      Number.isFinite(Date.parse(facet.observedAt)) &&
      Date.parse(facet.observedAt) <= now + 60_000 &&
      now - Date.parse(facet.observedAt) <= maxAge,
    );
  const add = (
    code: string,
    category: AttentionReason["category"],
    facet?: Facet,
    url?: unknown,
    count?: number,
  ) => {
    if (
      !reasons.some(
        (reason) =>
          reason.code === code && reason.url === sourceUrl(url, pr.url),
      )
    )
      reasons.push({
        code,
        category,
        url: sourceUrl(url, pr.url),
        observedAt: facet?.observedAt ?? null,
        ...(count === undefined ? {} : { count }),
      });
  };
  for (const name of [
    "checks",
    "statuses",
    "reviewDecision",
    "reviewThreads",
    "mergeability",
  ] as const) {
    const facet = pr.facets[name];
    const time = facet?.observedAt ? Date.parse(facet.observedAt) : NaN;
    if (
      !facet ||
      facet.coverage !== "complete" ||
      facet.errorCode ||
      facet.sourceRevision !== revision ||
      !Number.isFinite(time) ||
      time > now + 60_000
    )
      add("data_incomplete", "data", facet);
    if (Number.isFinite(time) && now - time > maxAge)
      add("data_stale", "data", facet);
  }
  const checks = usable(pr.facets.checks)
    ? records(pr.facets.checks?.value)
    : null;
  const statuses = usable(pr.facets.statuses)
    ? records(pr.facets.statuses?.value)
    : null;
  if (checks) {
    const groups = new Map<string, Array<Record<string, unknown>>>();
    for (const check of checks) {
      if (
        typeof check.name !== "string" ||
        typeof check.appId !== "number" ||
        check.headSha !== pr.headSha
      ) {
        add("checks_unknown", "data", pr.facets.checks);
        continue;
      }
      const key = `${check.appId}:${check.suiteId ?? "unknown"}:${check.name}`;
      groups.set(key, [...(groups.get(key) ?? []), check]);
    }
    const suitesByName = new Map<string, Set<unknown>>();
    for (const runs of groups.values())
      for (const run of runs) {
        const identity = `${run.appId}:${run.name}`;
        const suites = suitesByName.get(identity) ?? new Set();
        suites.add(run.suiteId);
        suitesByName.set(identity, suites);
      }
    for (const runs of groups.values()) {
      if (
        suitesByName.get(`${runs[0]!.appId}:${runs[0]!.name}`)!.size > 1 ||
        typeof runs[0]!.suiteId !== "number"
      ) {
        add("checks_unknown", "data", pr.facets.checks);
        continue;
      }

      if (
        runs.length > 1 &&
        runs.some(
          (run) =>
            typeof run.startedAt !== "string" ||
            !Number.isFinite(Date.parse(run.startedAt)),
        )
      ) {
        add("checks_unknown", "data", pr.facets.checks);
        continue;
      }
      if (
        runs.length > 1 &&
        new Set(runs.map((run) => run.startedAt)).size !== runs.length
      ) {
        add("checks_unknown", "data", pr.facets.checks);
        continue;
      }
      const run = [...runs].sort(
        (a, b) =>
          Date.parse(String(b.startedAt)) - Date.parse(String(a.startedAt)) ||
          Number(b.id) - Number(a.id),
      )[0]!;
      if (
        [
          "failure",
          "cancelled",
          "timed_out",
          "action_required",
          "startup_failure",
          "stale",
        ].includes(String(run.conclusion))
      )
        add("checks_failed", "action", pr.facets.checks, run.url);
      else if (
        ["queued", "in_progress", "waiting", "pending", "requested"].includes(
          String(run.status),
        )
      )
        add("checks_pending", "waiting", pr.facets.checks, run.url);
      else if (
        run.status !== "completed" ||
        !["success", "neutral", "skipped"].includes(String(run.conclusion))
      )
        add("checks_unknown", "data", pr.facets.checks, run.url);
    }
  } else if (usable(pr.facets.checks))
    add("checks_unknown", "data", pr.facets.checks);
  if (statuses)
    for (const status of statuses) {
      if (["failure", "error"].includes(String(status.state)))
        add("checks_failed", "action", pr.facets.statuses, status.url);
      else if (status.state === "pending")
        add("checks_pending", "waiting", pr.facets.statuses, status.url);
      else if (status.state !== "success")
        add("checks_unknown", "data", pr.facets.statuses, status.url);
    }
  else if (usable(pr.facets.statuses))
    add("checks_unknown", "data", pr.facets.statuses);
  if (checks?.length === 0 && statuses?.length === 0)
    add("no_checks", "info", pr.facets.checks, `${pr.url}/checks`);
  if (usable(pr.facets.reviewDecision)) {
    if (pr.facets.reviewDecision?.value === "CHANGES_REQUESTED")
      add(
        "changes_requested",
        "action",
        pr.facets.reviewDecision,
        `${pr.url}#pullrequestreview`,
      );
    else if (pr.facets.reviewDecision?.value === "REVIEW_REQUIRED")
      add(
        "review_required",
        "waiting",
        pr.facets.reviewDecision,
        `${pr.url}#discussion_bucket`,
      );
    else if (pr.facets.reviewDecision?.value !== "APPROVED")
      add("data_incomplete", "data", pr.facets.reviewDecision);
  }
  if (usable(pr.facets.reviewThreads)) {
    const threads = records(pr.facets.reviewThreads?.value);
    if (
      !threads ||
      threads.some((thread) => typeof thread.resolved !== "boolean")
    )
      add("data_incomplete", "data", pr.facets.reviewThreads);
    else {
      const unresolved = threads.filter((thread) => !thread.resolved);
      if (unresolved.length)
        add(
          "threads_unresolved",
          "action",
          pr.facets.reviewThreads,
          unresolved.find((thread) => sourceUrl(thread.url))?.url ??
            `${pr.url}#discussion_bucket`,
          unresolved.length,
        );
    }
  }
  const mergeability = usable(pr.facets.mergeability)
    ? object(pr.facets.mergeability?.value)
    : null;
  if (!mergeability || typeof mergeability.mergeable !== "boolean")
    add("mergeability_unknown", "data", pr.facets.mergeability);
  else if (mergeability.mergeable === false)
    add("conflict", "action", pr.facets.mergeability);
  if (pr.draft) add("draft", "waiting");
  if (pr.reviewRequested)
    add(
      "review_requested",
      "waiting",
      pr.facets.reviewDecision,
      `${pr.url}#discussion_bucket`,
    );
  return reasons;
}
