import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { createServer, type Server } from "node:http";
import {classifyPullRequest} from "../src/server/work-state/classify.js";
import { GitHubReader, GitHubError } from "../src/server/work-state/github.js";
const repo = {
  id: "1",
  project: "oriso" as const,
  fullName: "org/repo",
  integrationBranch: "dev",
};
const core = (n = 1) => ({
  id: n,
  number: n,
  title: "PR",
  user: { login: "person" },
  state: "open",
  draft: false,
  merged_at: null,
  mergeable: true,
  head: { sha: "head", ref: "feature" },
  base: { sha: "base", ref: "dev" },
});
let server: Server,
  url: string,
  requests: string[],
  handler: (
    path: string,
    body: any,
    headers: any,
  ) => { status?: number; body?: unknown; headers?: Record<string, string> };
beforeEach(async () => {
  requests = [];
  server = createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    requests.push(req.url!);
    const result = handler(
      req.url!,
      body ? JSON.parse(body) : undefined,
      req.headers,
    );
    res.writeHead(result.status ?? 200, {
      "Content-Type": "application/json",
      ...result.headers,
    });
    res.end(JSON.stringify(result.body ?? {}));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterEach(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});
function defaults(path: string) {
  if (path === "/graphql")
    return {
      body: {
        data: {
          repository: {
            pullRequest: {
              headRefOid: "head",
              baseRefOid: "base",
              headRefName: "feature",
              baseRefName: "dev",
              reviewDecision: "APPROVED",
              reviewThreads: {
                nodes: [],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        },
      },
    };
  if (path.includes("/check-runs")) return { body: { check_runs: [] } };
  if (path.includes("/statuses")) return { body: [] };
  return { body: core(Number(path.split("/").at(-1))) };
}
function reader(
  extra: Partial<ConstructorParameters<typeof GitHubReader>[0]> = {},
) {
  return new GitHubReader({
    repositories: [repo],
    token: async () => "test-only",
    apiUrl: url,
    ...extra,
  });
}
describe("GitHub source", () => {
  it("reads 205 open PRs over three inventory pages and all facets", async () => {
    handler = (path) => {
      if (path.includes("state=closed")) return { body: [] };
      if (path.includes("state=open") || path.startsWith("/page")) {
        const page = path.startsWith("/page") ? Number(path.slice(5)) : 1;
        const start = (page - 1) * 100;
        return {
          body: Array.from({ length: Math.min(100, 205 - start) }, (_, i) => ({
            number: start + i + 1,
            updated_at: new Date().toISOString(),
          })),
          headers:
            page < 3 ? { link: `<${url}/page${page + 1}>; rel="next"` } : {},
        };
      }
      return defaults(path);
    };
    const result = await reader().collectRepository(repo);
    expect(result.complete).toBe(true);
    expect(result.pullRequests).toHaveLength(205);
    expect(requests).toContain("/page3");
  });
  it.each(["head", "base"])(
    "rejects a %s change during facet reads",
    async (field) => {
      let reads = 0;
      handler = (path) => {
        const result = defaults(path);
        if (path === "/repos/org/repo/pulls/1") {
          reads++;
          return {
            body: {
              ...core(),
              [field]: {
                sha: reads > 1 ? "changed" : field,
                ref: field === "head" ? "feature" : "dev",
              },
            },
          };
        }
        return result;
      };
      await expect(reader().readPullRequest("1", 1)).rejects.toMatchObject({
        code: "revision_changed",
      });
    },
  );
  it("paginates review threads independently beyond 100", async () => {
    handler = (path, body) => {
      if (path !== "/graphql") return defaults(path);
      const result = defaults(path).body as any;
      const pr = result.data.repository.pullRequest;
      pr.reviewThreads = {
        nodes: Array.from(
          { length: body.variables.cursor ? 5 : 100 },
          (_, i) => ({ id: String(i), isResolved: false, isOutdated: false }),
        ),
        pageInfo: {
          hasNextPage: !body.variables.cursor,
          endCursor: body.variables.cursor ? null : "next",
        },
      };
      return { body: result };
    };
    const pr = await reader().readPullRequest("1", 1);
    expect(pr.facets.reviewThreads?.value).toHaveLength(105);
    expect(requests.filter((p) => p === "/graphql")).toHaveLength(2);
  });
  it("records GraphQL errors and missing second pages as partial facets", async () => {
    handler = (path) =>
      path === "/graphql"
        ? { body: { errors: [{ message: "private upstream details" }] } }
        : path.includes("check-runs")
          ? {
              body: { check_runs: [] },
              headers: { link: `<${url}/missing>; rel="next"` },
            }
          : path === "/missing"
            ? { status: 404 }
            : defaults(path);
    const pr = await reader().readPullRequest("1", 1);
    expect(pr.facets.reviewThreads?.errorCode).toBe("graphql_errors");
    expect(pr.facets.checks?.errorCode).toBe("github_http_404");
  });
  it("uses complete cached pagination representations on 304 and still reads facets", async () => {
    let conditional = false;
    let checks = 0;
    handler = (path, _body, headers) => {
      if (path.includes("check-runs")) {
        checks++;
        return {
          body: {
            check_runs: [
              {
                id: checks,
                name: "CI",
                status: "completed",
                conclusion: checks === 1 ? "failure" : "success",
              },
            ],
          },
        };
      }
      if (path === "/repos/org/repo/pulls/1") {
        if (headers["if-none-match"]) {
          conditional = true;
          return { status: 304 };
        }
        return { body: core(), headers: { etag: "one" } };
      }
      return defaults(path);
    };
    const r = reader();
    await r.readPullRequest("1", 1);
    const next = await r.readPullRequest("1", 1);
    expect(conditional).toBe(true);
    expect((next.facets.checks?.value as any)[0].conclusion).toBe("success");
  });
  it.each([403, 404, 429])(
    "handles HTTP %s without leaking bodies",
    async (status) => {
      handler = () => ({
        status,
        headers: status === 429 ? { "retry-after": "60" } : {},
        body: { message: "secret" },
      });
      await expect(reader().readPullRequest("1", 1)).rejects.toMatchObject({
        code: status === 429 ? "rate_limited" : `github_http_${status}`,
      });
      expect(requests).toHaveLength(1);
    },
  );
  it("refuses foreign pagination before sending credentials", async () => {
    handler = () => ({
      body: [],
      headers: { link: '<http://foreign.invalid/page>; rel="next"' },
    });
    const result = await reader().collectRepository(repo);
    expect(result.errorCode).toBe("foreign_api_origin");
    expect(requests).toHaveLength(1);
  });
  it("does not repeatedly read terminal history and targets missing open PRs", async () => {
    handler = (path) =>
      path.includes("state=") ? { body: [] } : defaults(path);
    const r = reader({
      tracked: () => [
        { ...core(), lifecycle: "closed", number: 40 } as any,
        { ...core(), lifecycle: "open", number: 41 } as any,
      ],
    });
    await r.collectRepository(repo, { initial: false });
    expect(requests).not.toContain("/repos/org/repo/pulls/40");
    expect(requests).toContain("/repos/org/repo/pulls/41");
  });
  it("keeps close, merge and reopen distinct", async () => {
    let state = "closed",
      merged: string | null = null;
    handler = (path) =>
      path === "/repos/org/repo/pulls/1"
        ? { body: { ...core(), state, merged_at: merged } }
        : defaults(path);
    const r = reader();
    expect((await r.readPullRequest("1", 1)).lifecycle).toBe("closed");
    merged = new Date().toISOString();
    expect((await r.readPullRequest("1", 1)).lifecycle).toBe("merged");
    state = "open";
    merged = null;
    expect((await r.readPullRequest("1", 1)).lifecycle).toBe("open");
  });
  it("resumes a persisted slice after completed PRs without starting inventory over", async () => {
    let clock = 0;
    let checkpoint: any;
    handler = (path) => {
      if (path.includes("state=open"))
        return {
          body: [
            { number: 1, updated_at: new Date().toISOString() },
            { number: 2, updated_at: new Date().toISOString() },
          ],
        };
      if (path.includes("state=closed")) return { body: [] };
      return defaults(path);
    };
    const first = reader({
      now: () => clock,
      deadline: () => 10,
      saveCheckpoint: (c) => {
        checkpoint = JSON.parse(JSON.stringify(c));
        if (c.index === 1) clock = 11;
      },
    });
    await expect(first.collectRepository(repo)).rejects.toMatchObject({
      code: "slice_deadline",
    });
    expect(checkpoint.index).toBe(1);
    requests = [];
    const next = await reader().collectRepository(repo, checkpoint);
    expect(next.complete).toBe(true);
    expect(next.pullRequests.map((p) => p.number)).toEqual([1, 2]);
    expect(requests.some((p) => p.includes("state="))).toBe(false);
    expect(requests).not.toContain("/repos/org/repo/pulls/1");
  });
  it("retains cached next-page links across conditional inventory requests", async () => {
    const cache = new Map();
    let conditional = false;
    handler = (path, _body, headers) => {
      if (path.includes("state=closed")) return { body: [] };
      if (path.includes("state=open")) {
        if (headers["if-none-match"]) {
          conditional = true;
          return { status: 304 };
        }
        return {
          body: [],
          headers: { etag: "page", link: `<${url}/second>; rel="next"` },
        };
      }
      if (path === "/second") return { body: [] };
      return defaults(path);
    };
    const r = reader({
      cache: { get: (k) => cache.get(k), put: (k, v) => cache.set(k, v) },
    });
    await r.collectRepository(repo);
    requests = [];
    const next = await reader({
      cache: { get: (k) => cache.get(k), put: (k, v) => cache.set(k, v) },
    }).collectRepository(repo);
    expect(next.complete).toBe(true);
    expect(conditional).toBe(true);
    expect(requests).toContain("/second");
  });
  it("bounds transient retries at three and honors a reset deadline", async () => {
    handler = () => ({ status: 503 });
    await expect(reader().readPullRequest("1", 1)).rejects.toMatchObject({
      code: "upstream_unavailable",
    });
    expect(requests).toHaveLength(3);
    requests = [];
    handler = () => ({
      status: 403,
      headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "100" },
    });
    await expect(
      reader({ now: () => 1000 }).readPullRequest("1", 1),
    ).rejects.toMatchObject({ code: "rate_limited", retryAt: 100000 });
    expect(requests).toHaveLength(1);
  });
  it("normalizes only newest commit status per context across page boundaries", async () => {
    handler = (path) =>
      path.includes("/statuses")
        ? {
            body: [
              { context: "ci", state: "success", target_url: null },
              { context: "deploy", state: "pending", target_url: null },
            ],
            headers: { link: `<${url}/older-statuses>; rel="next"` },
          }
        : path === "/older-statuses"
          ? {
              body: [
                { context: "ci", state: "failure", target_url: null },
                { context: "lint", state: "success", target_url: null },
              ],
            }
          : defaults(path);
    const pr = await reader().readPullRequest("1", 1);
    expect(pr.facets.statuses?.value).toEqual([
      { context: "ci", state: "success", url: null },
      { context: "deploy", state: "pending", url: null },
      { context: "lint", state: "success", url: null },
    ]);
  });

  it.each(["timeout", "deadline", "abort"])(
    "bounds a hung token provider on %s",
    async (mode) => {
      vi.useFakeTimers();
      handler = defaults;
      let release!: (token: string) => void;
      const token = new Promise<string>((resolve) => (release = resolve));
      const controller = new AbortController();
      const started = Date.now();
      let settled = false;
      let result: unknown;
      const pending = reader({
        token: () => token,
        signal: controller.signal,
        now: () => Date.now(),
        deadline: mode === "deadline" ? () => started + 5000 : undefined,
      })
        .collectRepository(repo)
        .then(
          (value) => {
            settled = true;
            result = value;
          },
          (error) => {
            settled = true;
            result = error;
          },
        );
      if (mode === "abort") controller.abort();
      await vi.advanceTimersByTimeAsync(
        mode === "timeout" ? 30001 : mode === "deadline" ? 5001 : 1,
      );
      const bounded = settled;
      controller.abort();
      release("test");
      await vi.advanceTimersByTimeAsync(1);
      await pending;
      vi.useRealTimers();
      expect(bounded).toBe(true);
      expect(requests).toEqual([]);
    },
  );

  it.each(["coverage", "observation time"])(
    "keeps cumulative %s across a completed-PR slice",
    async (metric) => {
      let clock = Date.now();
      const started = clock;
      let checkpoint: any;
      handler = (path) =>
        path.includes("state=open")
          ? {
              body: [
                { number: 1, updated_at: new Date(clock).toISOString() },
                { number: 2, updated_at: new Date(clock).toISOString() },
              ],
            }
          : path.includes("state=closed")
            ? { body: [] }
            : defaults(path);
      await reader({
        now: () => clock,
        deadline: () => started + 100,
        saveCheckpoint: (c) => {
          checkpoint = JSON.parse(JSON.stringify(c));
          if (c.index === 1) clock = started + 101;
        },
      })
        .collectRepository(repo)
        .catch(() => undefined);
      clock = started + 1000;
      const result = await reader({ now: () => clock }).collectRepository(
        repo,
        checkpoint,
      );
      expect(result.complete).toBe(true);
      if (metric === "coverage") expect(result.coveredPages).toBe(2);
      else expect(Date.parse(result.collectedAt)).toBe(started);
    },
  );
  it("deduplicates case-insensitive status contexts across pages and keeps the newest label", async () => {
    handler = (path) =>
      path.includes("/statuses")
        ? {
            body: [{ context: "ci", state: "success", target_url: null }],
            headers: { link: `<${url}/older-case-statuses>; rel="next"` },
          }
        : path === "/older-case-statuses"
          ? { body: [{ context: "CI", state: "failure", target_url: null }] }
          : defaults(path);
    const pr = await reader().readPullRequest("1", 1);
    expect(pr.facets.statuses?.value).toEqual([
      { context: "ci", state: "success", url: null },
    ]);
  });
});

it("retains only the provenance and source permalinks needed by attention", async () => {
  handler = (path) => {
    if(path.includes("/check-runs")) return {body:{check_runs:[{id:9,name:"build",status:"completed",conclusion:"failure",html_url:"https://github.com/org/repo/actions/runs/9",head_sha:"head",app:{id:2},check_suite:{id:8},started_at:"2026-10-20T11:00:00Z",completed_at:"2026-10-20T11:02:00Z"}]}};
    if(path === "/graphql") { const result=defaults(path) as any;result.body.data.repository.pullRequest.reviewThreads.nodes=[{id:"thread",isResolved:false,isOutdated:false,comments:{nodes:[{url:"https://github.com/org/repo/pull/1#discussion_r9"}]}}];return result; }
    const result=defaults(path);if(path.includes("/pulls/1"))return {body:{...core(),requested_reviewers:[{login:"reviewer"}],requested_teams:[]}};return result;
  };
  const pr=await reader().readPullRequest("1",1);
  expect(pr.facets.checks?.value).toEqual([expect.objectContaining({headSha:"head",appId:2,suiteId:8,startedAt:"2026-10-20T11:00:00Z"})]);
  expect(pr.facets.reviewThreads?.value).toEqual([expect.objectContaining({url:"https://github.com/org/repo/pull/1#discussion_r9"})]);
  expect(pr).toHaveProperty("reviewRequested",true);
});

it("does not let completion-time source filtering hide a newer pending rerun",async()=>{
 handler=(path)=>{
  if(path.includes("/check-runs")){
   const previous={id:1,name:"build",status:"completed",conclusion:"failure",head_sha:"head",app:{id:1},check_suite:{id:2},started_at:"2026-10-20T10:00:00Z",completed_at:"2026-10-20T11:59:00Z"};
   const current={...previous,id:2,status:"in_progress",conclusion:null,started_at:"2026-10-20T11:00:00Z",completed_at:null};
   return {body:{check_runs:new URL(path,url).searchParams.get("filter")==="all"?[previous,current]:[previous]}};
  }
  return defaults(path);
 };
 const pr=await reader().readPullRequest("1",1);const reasons=classifyPullRequest(pr,Date.now()).map(reason=>reason.code);
 expect(reasons).toContain("checks_pending");expect(reasons).not.toContain("checks_failed");
});
