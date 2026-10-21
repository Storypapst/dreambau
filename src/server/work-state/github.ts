import { z } from "zod";
import { repositorySchema } from "./model.js";
import type {
  Facet,
  PullRequestSnapshot,
  RepositorySnapshot,
  RepositoryInput,
} from "./model.js";
export type CheckValue = {
  headSha?: string | null;
  appId?: number | null;
  suiteId?: number | null;
  startedAt?: string | null;
  completedAt?: string | null;
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  url: string | null;
};
export type StatusValue = {
  context: string;
  state: string;
  url: string | null;
};
export type ReviewThreadValue = {
  url?: string | null;
  id: string;
  resolved: boolean;
  outdated: boolean;
};
export type ReviewDecisionValue =
  | "APPROVED"
  | "CHANGES_REQUESTED"
  | "REVIEW_REQUIRED"
  | null;
export const githubIntegrationSchema = z
  .object({
    appId: z.string().regex(/^\d+$/),
    installationId: z.string().regex(/^\d+$/),
    apiUrl: z.string().url().default("https://api.github.com"),
    webhookSecret: z.string().min(32),
  })
  .strict();
export class GitHubError extends Error {
  constructor(
    public code: string,
    public retryAt?: number,
  ) {
    super(code);
  }
}
interface PageProgress<T> {
  values: T[];
  next?: string;
  done: boolean;
  seen: string[];
}
interface PullReadProgress {
  number: number;
  revision: string;
  observedAt: string;
  facets: PullRequestSnapshot["facets"];
  checks: PageProgress<CheckValue>;
  statuses: PageProgress<StatusValue>;
  reviews: {
    threads: ReviewThreadValue[];
    decision: ReviewDecisionValue;
    cursor: string | null;
    done: boolean;
    seen: string[];
  };
}
export interface CollectionCheckpoint {
  collectedAt?: string;
  coveredPages?: number;
  currentPull?: PullReadProgress;
  extraNumbers?: number[];
  stage?: "open" | "closed" | "reads";
  next?: string;
  numbers?: number[];
  open?: number[];
  index?: number;
  initial?: boolean;
  pullRequests?: PullRequestSnapshot[];
  mergeRetries?: Record<string, number>;
}
export const REVIEW_QUERY = `query WorkStateReviews($owner:String!,$name:String!,$number:Int!,$cursor:String){ repository(owner:$owner,name:$name){ pullRequest(number:$number){ headRefOid baseRefOid headRefName baseRefName reviewDecision reviewThreads(first:100,after:$cursor){nodes{id isResolved isOutdated comments(first:1){nodes{url}}} pageInfo{hasNextPage endCursor}} } } }`;
interface Cache {
  etag?: string;
  value: unknown;
  next?: string;
}
interface Options {
  signal?: AbortSignal;
  repositories: RepositoryInput[];
  token: (signal?: AbortSignal) => Promise<string>;
  apiUrl?: string;
  transport?: typeof fetch;
  now?: () => number;
  cache?: {
    get: (key: string) => Cache | undefined;
    put: (key: string, value: Cache) => void;
  };
  tracked?: (id: string) => PullRequestSnapshot[];
  links?: (id: string, initial: boolean) => number[];
  saveCheckpoint?: (checkpoint: CollectionCheckpoint) => void;
  deadline?: () => number;
}
/** A provider/transport may ignore AbortSignal; the caller must still settle on cancellation. */
async function abortable<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  let rejectAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = () => reject(new Error("operation_aborted"));
    if (signal.aborted) rejectAbort();
    else signal.addEventListener("abort", rejectAbort, { once: true });
  });
  try {
    return await Promise.race([promise, aborted]);
  } finally {
    if (rejectAbort) signal.removeEventListener("abort", rejectAbort);
  }
}
export class GitHubReader {
  private tail: Promise<unknown> = Promise.resolve();
  private now: () => number;
  private origin: string;
  private cache = new Map<string, Cache>();
  requests = 0;
  checkpoint?: CollectionCheckpoint;
  private transientFailures = 0;
  constructor(private options: Options) {
    this.now = options.now ?? Date.now;
    const url = new URL(options.apiUrl ?? "https://api.github.com");
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/" ||
      (url.protocol !== "https:" &&
        !["localhost", "127.0.0.1"].includes(url.hostname))
    )
      throw new Error("invalid_github_api");
    this.origin = url.origin;
    const ids = new Set<string>(),
      names = new Set<string>();
    for (const r of options.repositories) {
      repositorySchema.parse(r);
      if (ids.has(r.id) || names.has(r.fullName.toLowerCase()))
        throw new Error("duplicate_github_registry");
      ids.add(r.id);
      names.add(r.fullName.toLowerCase());
      if (!/^\d+$/.test(r.id) || !/^[-\w.]+\/[-\w.]+$/.test(r.fullName))
        throw new Error("invalid_github_registry");
    }
  }
  private repository(id: string) {
    const r = this.options.repositories.find(
      (r) => r.id === id && r.active !== false,
    );
    if (!r) throw new GitHubError("repository_not_active");
    return r;
  }
  private async request(path: string, body?: unknown): Promise<Cache> {
    const run = async () => {
      const url = new URL(path, this.origin);
      if (url.origin !== this.origin)
        throw new GitHubError("foreign_api_origin");
      const key = url.href + (body ? JSON.stringify(body) : "");
      const old = this.options.cache?.get(key) ?? this.cache.get(key);
      for (let attempt = 0; attempt < 3; attempt++) {
        if (this.transientFailures >= 3)
          throw new GitHubError("upstream_unavailable");
        if (this.options.deadline && this.now() >= this.options.deadline())
          throw new GitHubError("slice_deadline");
        const controller = new AbortController();
        const timer = setTimeout(
          () => controller.abort(),
          Math.min(
            10_000,
            this.options.deadline
              ? Math.max(1, this.options.deadline() - this.now())
              : 10_000,
          ),
        );
        try {
          const signal = this.options.signal
            ? AbortSignal.any([controller.signal, this.options.signal])
            : controller.signal;
          signal.throwIfAborted();
          const token = await abortable(
            Promise.resolve().then(() => this.options.token(signal)),
            signal,
          );
          signal.throwIfAborted();
          this.requests++;
          const response = await abortable(
            (this.options.transport ?? fetch)(url, {
              method: body ? "POST" : "GET",
              headers: {
                Accept: "application/vnd.github+json",
                Authorization: `Bearer ${token}`,
                "X-GitHub-Api-Version": "2026-03-10",
                ...(body ? { "Content-Type": "application/json" } : {}),
                ...(!body && old?.etag ? { "If-None-Match": old.etag } : {}),
              },
              body: body ? JSON.stringify(body) : undefined,
              redirect: "manual",
              signal,
            }),
            signal,
          );
          if (response.status === 304) {
            if (!old) throw new GitHubError("cache_missing");
            return old;
          }
          if (
            response.status === 429 ||
            (response.status === 403 &&
              (response.headers.get("x-ratelimit-remaining") === "0" ||
                response.headers.has("retry-after")))
          ) {
            const retry = response.headers.get("retry-after"),
              reset = response.headers.get("x-ratelimit-reset");
            throw new GitHubError(
              "rate_limited",
              Math.max(
                this.now() + 1000,
                retry
                  ? Number.isFinite(Number(retry))
                    ? this.now() + Number(retry) * 1000
                    : Date.parse(retry)
                  : reset
                    ? Number(reset) * 1000
                    : this.now() + 60_000,
              ),
            );
          }
          if (response.status >= 500) {
            this.transientFailures++;
            if (attempt < 2 && this.transientFailures < 3) continue;
            throw new GitHubError("upstream_unavailable");
          }
          if (!response.ok)
            throw new GitHubError(`github_http_${response.status}`);
          const value: unknown = await abortable(response.json(), signal);
          const link = response.headers.get("link");
          const next = link?.match(/<([^>]+)>;\s*rel="next"/)?.[1];
          if (next && new URL(next, this.origin).origin !== this.origin)
            throw new GitHubError("foreign_api_origin");
          const result = {
            value,
            etag: response.headers.get("etag") ?? undefined,
            next,
          };
          this.cache.set(key, result);
          this.options.cache?.put(key, result);
          return result;
        } catch (error) {
          if (this.options.signal?.aborted)
            throw new GitHubError("worker_stopped");
          if (this.options.deadline && this.now() >= this.options.deadline())
            throw new GitHubError("slice_deadline");
          if (error instanceof GitHubError) throw error;
          this.transientFailures++;
          if (attempt === 2 || this.transientFailures >= 3)
            throw new GitHubError("network_error");
        } finally {
          clearTimeout(timer);
        }
      }
      throw new GitHubError("network_error");
    };
    const result = this.tail.then(run, run);
    this.tail = result.catch(() => undefined);
    return result;
  }
  async readPullRequest(
    repositoryId: string,
    number: number,
    resume?: PullReadProgress,
    saveProgress?: (progress: PullReadProgress) => void,
  ): Promise<PullRequestSnapshot> {
    if (!Number.isSafeInteger(number) || number < 1)
      throw new GitHubError("invalid_pull_number");
    const repo = this.repository(repositoryId),
      root = `/repos/${repo.fullName}`;
    const coreSchema = z.object({
      id: z.number(),
      number: z.number(),
      title: z.string(),
      user: z.object({ login: z.string() }).nullable(),
      state: z.enum(["open", "closed"]),
      draft: z.boolean(),
      requested_reviewers: z.array(z.object({login:z.string()})).optional(),
      requested_teams: z.array(z.object({id:z.number()}).passthrough()).optional(),
      merged_at: z.string().nullable(),
      mergeable: z.boolean().nullable(),
      mergeable_state: z.string().optional(),
      head: z.object({ sha: z.string(), ref: z.string() }),
      base: z.object({ sha: z.string(), ref: z.string() }),
    });
    const read = async () =>
      coreSchema.parse((await this.request(`${root}/pulls/${number}`)).value);
    const before = await read();
    const revisionOf = (core: z.infer<typeof coreSchema>) =>
      `${core.head.sha}:${core.base.sha}:${core.head.ref}:${core.base.ref}`;
    const revision = revisionOf(before),
      attemptAt = new Date(this.now()).toISOString();
    // A resume must first fence the pinned revision. Never reuse pages across a changed head/base.
    const progress: PullReadProgress =
      resume?.number === number && resume.revision === revision
        ? resume
        : {
            number,
            revision,
            observedAt: attemptAt,
            facets: {},
            checks: { values: [], done: false, seen: [] },
            statuses: { values: [], done: false, seen: [] },
            reviews: {
              threads: [],
              decision: null,
              cursor: null,
              done: false,
              seen: [],
            },
          };
    const save = () => saveProgress?.(progress);
    save();
    const facet = (value: unknown, errorCode: string | null = null): Facet => ({
      source: "github",
      value: value as Facet["value"],
      sourceRevision: revision,
      observedAt: errorCode ? null : progress.observedAt,
      lastAttemptAt: attemptAt,
      lastSuccessAt: errorCode ? null : progress.observedAt,
      coverage: errorCode ? "partial" : "complete",
      errorCode,
    });
    const facets = progress.facets;
    const interrupted = (error: unknown) =>
      error instanceof GitHubError &&
      [
        "slice_deadline",
        "rate_limited",
        "worker_stopped",
        "revision_changed",
      ].includes(error.code);
    const paginated = async <T>(
      path: string,
      key: string | undefined,
      pages: PageProgress<T>,
      normalize: (row: unknown) => T,
    ) => {
      while (!pages.done) {
        const next = pages.next ?? path;
        if (pages.seen.includes(next)) throw new GitHubError("pagination_loop");
        const response = await this.request(next);
        const rows = key
          ? (response.value as Record<string, unknown>)[key]
          : response.value;
        if (!Array.isArray(rows)) throw new GitHubError("invalid_response");
        // Save only normalized fields, never raw check output or comment bodies.
        const values = rows.map(normalize);
        pages.values.push(...values);
        pages.seen.push(next);
        pages.next = response.next;
        pages.done = !response.next;
        save();
      }
      return pages.values;
    };
    const aspect = async (
      name: "checks" | "statuses",
      run: () => Promise<unknown>,
    ) => {
      if (facets[name]?.coverage === "complete") return;
      try {
        facets[name] = facet(await run());
      } catch (error) {
        if (interrupted(error)) throw error;
        facets[name] = facet(
          null,
          error instanceof GitHubError ? error.code : "invalid_response",
        );
      }
      save();
    };
    await aspect("checks", async () =>
      paginated(
        `${root}/commits/${before.head.sha}/check-runs?filter=all&per_page=100`,
        "check_runs",
        progress.checks,
        (row) => {
          const raw = z
            .object({
              id: z.number().int(),
              name: z.string(),
              status: z.string(),
              conclusion: z.string().nullable().optional(),
              html_url: z.string().url().nullable().optional(),
              head_sha: z.string().nullable().optional(),
              app: z.object({id:z.number()}).nullable().optional(),
              check_suite: z.object({id:z.number()}).nullable().optional(),
              started_at: z.string().nullable().optional(),
              completed_at: z.string().nullable().optional(),
            })
            .parse(row);
          return {
            ...(raw.head_sha === undefined ? {} : {headSha:raw.head_sha}),
            ...(raw.app === undefined ? {} : {appId:raw.app?.id ?? null}),
            ...(raw.check_suite === undefined ? {} : {suiteId:raw.check_suite?.id ?? null}),
            ...(raw.started_at === undefined ? {} : {startedAt:raw.started_at}),
            ...(raw.completed_at === undefined ? {} : {completedAt:raw.completed_at}),
            id: raw.id,
            name: raw.name,
            status: raw.status,
            conclusion: raw.conclusion ?? null,
            url: raw.html_url ?? null,
          };
        },
      ),
    );
    await aspect("statuses", async () => {
      const rows = await paginated(
        `${root}/commits/${before.head.sha}/statuses?per_page=100`,
        undefined,
        progress.statuses,
        (row) => {
          const raw = z
            .object({
              context: z.string(),
              state: z.string(),
              target_url: z.string().url().nullable().optional(),
            })
            .parse(row);
          return {
            context: raw.context,
            state: raw.state,
            url: raw.target_url ?? null,
          };
        },
      );
      // GitHub returns newest first, including records on later pages of the same context.
      const latest = new Map<string, StatusValue>();
      for (const row of rows)
        if (!latest.has(row.context.toLowerCase()))
          latest.set(row.context.toLowerCase(), row);
      return [...latest.values()];
    });
    if (!progress.reviews.done) {
      try {
        while (!progress.reviews.done) {
          const reviews = progress.reviews;
          const response = await this.request("/graphql", {
            query: REVIEW_QUERY,
            variables: {
              owner: repo.fullName.split("/")[0],
              name: repo.fullName.split("/")[1],
              number,
              cursor: reviews.cursor,
            },
          });
          const parsed = z
            .object({
              errors: z.array(z.unknown()).nullable().optional(),
              data: z
                .object({
                  repository: z.object({
                    pullRequest: z.object({
                      headRefOid: z.string(),
                      baseRefOid: z.string(),
                      headRefName: z.string(),
                      baseRefName: z.string(),
                      reviewDecision: z
                        .enum([
                          "APPROVED",
                          "CHANGES_REQUESTED",
                          "REVIEW_REQUIRED",
                        ])
                        .nullable(),
                      reviewThreads: z.object({
                        nodes: z.array(
                          z.object({
                            id: z.string(),
                            isResolved: z.boolean(),
                            isOutdated: z.boolean(),
                            comments: z.object({nodes:z.array(z.object({url:z.string().url()}))}).optional(),
                          }),
                        ),
                        pageInfo: z.object({
                          hasNextPage: z.boolean(),
                          endCursor: z.string().nullable(),
                        }),
                      }),
                    }),
                  }),
                })
                .optional(),
            })
            .parse(response.value);
          if (parsed.errors?.length || !parsed.data)
            throw new GitHubError("graphql_errors");
          const pr = parsed.data.repository.pullRequest;
          if (
            `${pr.headRefOid}:${pr.baseRefOid}:${pr.headRefName}:${pr.baseRefName}` !==
            revision
          )
            throw new GitHubError("revision_changed");
          const page = pr.reviewThreads.pageInfo;
          if (
            page.hasNextPage &&
            (!page.endCursor || reviews.seen.includes(page.endCursor))
          )
            throw new GitHubError("graphql_pagination");
          reviews.decision = pr.reviewDecision;
          reviews.threads.push(
            ...pr.reviewThreads.nodes.map((t) => ({
              ...(t.comments?.nodes[0]?.url ? {url:t.comments.nodes[0].url} : {}),
              id: t.id,
              resolved: t.isResolved,
              outdated: t.isOutdated,
            })),
          );
          reviews.cursor = page.hasNextPage ? page.endCursor : null;
          reviews.done = !page.hasNextPage;
          if (reviews.cursor) reviews.seen.push(reviews.cursor);
          save();
        }
      } catch (error) {
        if (interrupted(error)) throw error;
        const code =
          error instanceof GitHubError ? error.code : "graphql_partial";
        facets.reviewDecision = facet(null, code);
        facets.reviewThreads = facet(null, code);
        save();
      }
    }
    if (progress.reviews.done) {
      facets.reviewDecision = facet(progress.reviews.decision);
      facets.reviewThreads = facet(progress.reviews.threads);
      save();
    }
    const after = await read();
    if (revisionOf(after) !== revision)
      throw new GitHubError("revision_changed");
    facets.mergeability = facet(
      { mergeable: after.mergeable, state: after.mergeable_state ?? null },
      after.mergeable === null ? "mergeability_unknown" : null,
    );
    if (after.mergeable === null) facets.mergeability.coverage = "unknown";
    return {
      id: String(after.id),
      number,
      url: `https://github.com/${repo.fullName}/pull/${number}`,
      title: after.title,
      author: after.user?.login ?? null,
      base: after.base.ref,
      head: after.head.ref,
      headSha: after.head.sha,
      baseSha: after.base.sha,
      lifecycle: after.merged_at ? "merged" : after.state,
      ...((after.requested_reviewers?.length || after.requested_teams?.length) ? {reviewRequested:true} : after.requested_reviewers && after.requested_teams ? {reviewRequested:false} : {}),
      draft: after.draft,
      mergedAt: after.merged_at,
      facets,
    };
  }
  async collectRepository(
    repository: RepositoryInput,
    checkpoint: CollectionCheckpoint = {},
  ): Promise<RepositorySnapshot> {
    const repo = this.repository(repository.id),
      state: CollectionCheckpoint = {
        stage: "open",
        numbers: [],
        open: [],
        index: 0,
        initial: true,
        ...checkpoint,
      };
    state.collectedAt ??= new Date(this.now()).toISOString();
    state.coveredPages ??= 0;
    const snapshot: RepositorySnapshot = {
      repositoryId: repo.id,
      fullName: repo.fullName,
      collectedAt: state.collectedAt,
      pullRequests: state.pullRequests ?? [],
      closedCandidates: [],
      coveredPages: state.coveredPages,
      complete: false,
    };
    const save = () => {
      this.checkpoint = state;
      this.options.saveCheckpoint?.(state);
    };
    try {
      while (state.stage !== "reads") {
        const stage = state.stage ?? "open";
        let next: string | undefined =
          state.next ??
          `/repos/${repo.fullName}/pulls?state=${stage}&sort=updated&direction=desc&per_page=100`;
        const seen = new Set<string>();
        while (next) {
          if (seen.has(next)) throw new GitHubError("pagination_loop");
          seen.add(next);
          const page = await this.request(next);
          const rows = z
            .array(
              z.object({
                number: z.number().int().positive(),
                updated_at: z.iso.datetime(),
              }),
            )
            .parse(page.value);
          snapshot.coveredPages++;
          state.coveredPages = snapshot.coveredPages;
          let cutoff = false;
          for (const row of rows) {
            if (
              stage === "closed" &&
              Date.parse(row.updated_at) < this.now() - 30 * 86400000
            ) {
              cutoff = true;
              break;
            }
            state.numbers!.push(row.number);
            if (stage === "open") state.open!.push(row.number);
          }
          next = cutoff ? undefined : page.next;
          state.next = next;
          save();
        }
        state.stage = stage === "open" ? "closed" : "reads";
        state.next = undefined;
        save();
      }
      const tracked = state.mergeRetries
        ? []
        : this.options.tracked?.(repo.id) ?? [];
      const explicit = state.mergeRetries
        ? []
        : this.options.links?.(repo.id, state.initial !== false) ?? [];
      state.numbers = [
        ...new Set([
          ...state.numbers!,
          ...(state.extraNumbers ?? []),
          ...explicit,
          ...tracked
            .filter(
              (p) => p.lifecycle === "open" && !state.open!.includes(p.number),
            )
            .map((p) => p.number),
        ]),
      ];
      for (let i = state.index ?? 0; i < state.numbers.length; i++) {
        const pr = await this.readPullRequest(
          repo.id,
          state.numbers[i],
          state.currentPull,
          (progress) => {
            state.currentPull = progress;
            save();
          },
        );
        state.currentPull = undefined;
        snapshot.pullRequests.push(pr);
        state.pullRequests = snapshot.pullRequests as PullRequestSnapshot[];
        state.index = i + 1;
        save();
      }
      snapshot.complete = true;
      return snapshot;
    } catch (error) {
      if (
        error instanceof GitHubError &&
        ["slice_deadline", "rate_limited"].includes(error.code)
      )
        throw Object.assign(error, { checkpoint: state, snapshot });
      snapshot.errorCode =
        error instanceof GitHubError ? error.code : "invalid_response";
      return snapshot;
    }
  }
}
