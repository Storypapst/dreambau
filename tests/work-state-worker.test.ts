import { describe, it, expect, vi } from "vitest";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkStateStore } from "../src/server/work-state/store.js";
import {
  createWorkStateWorker,
  createConfiguredWorkStateWorker,
} from "../src/server/work-state/worker.js";

it("a durable terminal-PR event triggers fresh reads, then hourly reconciliation stops reading its old history", async () => {
  const calls: string[] = [];
  let clock = Date.now(),
    merged = true,
    gqlError = false;
  const server = createServer((req, res) => {
    calls.push(req.url!);
    res.setHeader("Content-Type", "application/json");
    const path = req.url!;
    let value: unknown = [];
    if (path === "/repos/org/repo/pulls/400")
      value = {
        id: 400,
        number: 400,
        title: "Fresh from source",
        user: { login: "author" },
        state: "closed",
        draft: false,
        merged_at: merged ? new Date(clock - 1).toISOString() : null,
        mergeable: true,
        head: { sha: "head", ref: "feature" },
        base: { sha: "base", ref: "dev" },
      };
    if (path.includes("check-runs")) value = { check_runs: [] };
    if (path === "/graphql")
      value = {
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
      };
    if (path === "/graphql" && gqlError)
      value = { errors: [{ message: "private details" }] };
    res.end(JSON.stringify(value));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const dir = mkdtempSync(join(tmpdir(), "worker-restart-")),
    path = join(dir, "work.sqlite");
  let store = createWorkStateStore(path);
  store.configureRepository({
    id: "1",
    project: "oriso",
    fullName: "org/repo",
    integrationBranch: "dev",
  });
  store.acceptEvent("old-closed-event", "1", "pull_request", clock, [400]);
  store.close();
  store = createWorkStateStore(path);
  const worker = createWorkStateWorker({
    store,
    token: async () => "test-only",
    apiUrl: `http://127.0.0.1:${(server.address() as any).port}`,
    now: () => clock,
  });
  expect(calls).toEqual([]);
  expect((await worker.tick())?.complete).toBe(true);
  expect(store.collectorPulls("1")[0]).toMatchObject({
    title: "Fresh from source",
    lifecycle: "merged",
  });
  calls.length = 0;
  clock += 3600001;
  await worker.tick();
  expect(calls).not.toContain("/repos/org/repo/pulls/400");
  merged = false;
  gqlError = true;
  store.acceptEvent("late-delivery", "1", "pull_request", clock, [400]);
  await worker.tick();
  expect(store.collectorPulls("1")[0].lifecycle).toBe("closed");
  store.setRepositoryGrant({
    actorId: "reader",
    project: "oriso",
    repositoryId: "1",
    allowed: true,
  });
  const observed = store.listPullRequests({
    actorId: "reader",
    project: "oriso",
  }).items[0];
  expect(observed.facets.reviewDecision).toMatchObject({
    value: "APPROVED",
    coverage: "partial",
    errorCode: "graphql_errors",
  });
  await worker.stop();
  store.close();
  rmSync(dir, { recursive: true });
  await new Promise<void>((r) => server.close(() => r()));
});

it("parks a bad repository while a healthy repository continues without busy retries", async () => {
  const calls: string[] = [];
  const now = Date.now();
  const server = createServer((req, res) => {
    calls.push(req.url!);
    res.setHeader("Content-Type", "application/json");
    if (req.url!.includes("org/bad")) {
      res.statusCode = 429;
      res.setHeader("retry-after", "600");
      res.end("{}");
    } else res.end("[]");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const store = createWorkStateStore(":memory:");
  for (const [id, name] of [
    ["1", "bad"],
    ["2", "healthy"],
  ])
    store.configureRepository({
      id,
      project: "oriso",
      fullName: `org/${name}`,
      integrationBranch: "dev",
    });
  const worker = createWorkStateWorker({
    store,
    token: async () => "test-only",
    apiUrl: `http://127.0.0.1:${(server.address() as any).port}`,
    now: () => now,
  });
  expect(await worker.tick()).toMatchObject({
    repositoryId: "1",
    complete: false,
    errorCode: "rate_limited",
  });
  expect(await worker.tick()).toMatchObject({
    repositoryId: "2",
    complete: true,
  });
  expect(await worker.tick()).toBeNull();
  expect(calls.filter((p) => p.includes("org/bad"))).toHaveLength(1);
  await worker.stop();
  store.close();
  await new Promise<void>((r) => server.close(() => r()));
});
it("stop aborts its active request and releases owned timers", async () => {
  let received!: () => void;
  const ready = new Promise<void>((resolve) => (received = resolve));
  const server = createServer(() => received());
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const store = createWorkStateStore(":memory:");
  store.configureRepository({
    id: "1",
    project: "oriso",
    fullName: "org/repo",
    integrationBranch: "dev",
  });
  const worker = createWorkStateWorker({
    store,
    token: async () => "test-only",
    apiUrl: `http://127.0.0.1:${(server.address() as any).port}`,
  });
  const pending = worker.tick();
  await ready;
  await worker.stop();
  expect(await pending).toMatchObject({
    complete: false,
    errorCode: "worker_stopped",
  });
  store.close();
  await new Promise<void>((r) => server.close(() => r()));
});

it("does not replace incomplete inventory progress with a mergeability retry", async () => {
  const now = Date.now();
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    const path = req.url!;
    let value: unknown = [];
    if (path.includes("state=open"))
      value = [1, 2].map((number) => ({
        number,
        updated_at: new Date(now).toISOString(),
      }));
    else if (path.endsWith("/pulls/2")) {
      res.statusCode = 403;
      value = {};
    } else if (path.endsWith("/pulls/1"))
      value = {
        id: 1,
        number: 1,
        title: "PR",
        user: null,
        state: "open",
        draft: false,
        merged_at: null,
        mergeable: null,
        head: { sha: "head", ref: "feature" },
        base: { sha: "base", ref: "dev" },
      };
    else if (path.includes("check-runs")) value = { check_runs: [] };
    else if (path === "/graphql")
      value = {
        data: {
          repository: {
            pullRequest: {
              headRefOid: "head",
              baseRefOid: "base",
              headRefName: "feature",
              baseRefName: "dev",
              reviewDecision: null,
              reviewThreads: {
                nodes: [],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        },
      };
    res.end(JSON.stringify(value));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const store = createWorkStateStore(":memory:");
  store.configureRepository({
    id: "1",
    project: "oriso",
    fullName: "org/repo",
    integrationBranch: "dev",
  });
  const worker = createWorkStateWorker({
    store,
    token: async () => "test-only",
    apiUrl: `http://127.0.0.1:${(server.address() as any).port}`,
    now: () => now,
  });
  expect((await worker.tick())?.complete).toBe(false);
  const resumed = store.claimSync(now + 60001)!;
  expect(resumed.checkpoint.numbers).toEqual([1, 2]);
  expect(resumed.checkpoint.index).toBe(1);
  await worker.stop();
  store.close();
  await new Promise<void>((r) => server.close(() => r()));
});

for (const sequence of ["between-slices", "crash-reclaim"] as const) {
  it(`rereads event targets before acknowledgment after ${sequence}`, async () => {
    const calls: string[] = [];
    const server = createServer((req, res) => {
      const path = req.url!;
      calls.push(path);
      res.setHeader("Content-Type", "application/json");
      let value: unknown = [];
      if (path.includes("state=open"))
        value = [1, 2].map((number) => ({
          number,
          updated_at: new Date().toISOString(),
        }));
      else if (/\/pulls\/[12]$/.test(path))
        value = {
          id: Number(path.at(-1)),
          number: Number(path.at(-1)),
          title: "fresh",
          user: null,
          state: "open",
          draft: false,
          merged_at: null,
          mergeable: true,
          head: { sha: "head", ref: "feature" },
          base: { sha: "base", ref: "dev" },
        };
      else if (path.includes("check-runs")) value = { check_runs: [] };
      else if (path === "/graphql")
        value = {
          data: {
            repository: {
              pullRequest: {
                headRefOid: "head",
                baseRefOid: "base",
                headRefName: "feature",
                baseRefName: "dev",
                reviewDecision: null,
                reviewThreads: {
                  nodes: [],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            },
          },
        };
      res.end(JSON.stringify(value));
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const dir = mkdtempSync(join(tmpdir(), "generation-resume-")),
      path = join(dir, "work.sqlite");
    let store = createWorkStateStore(path);
    store.configureRepository({
      id: "1",
      project: "oriso",
      fullName: "org/repo",
      integrationBranch: "dev",
    });
    store.scheduleSyncs(0);
    const job = store.claimSync(0, 10)!;
    const checkpoint = {
      stage: "reads",
      numbers: [1, 2],
      open: [1, 2],
      index: 1,
      pullRequests: [
        {
          id: "1",
          number: 1,
          url: "https://github.com/org/repo/pull/1",
          title: "old",
          author: null,
          base: "dev",
          head: "feature",
          headSha: "head",
          lifecycle: "open",
          draft: false,
          mergedAt: null,
          facets: {},
        },
      ],
    };
    if (sequence === "between-slices")
      store.finishSync(job.token, { now: 1, dueAt: 2, checkpoint });
    else store.saveSyncCheckpoint(job.token, checkpoint, 1);
    store.acceptEvent("fresh-event", "1", "pull_request", 2, [1]);
    store.close();
    store = createWorkStateStore(path);
    const worker = createWorkStateWorker({
      store,
      token: async () => "test",
      apiUrl: `http://127.0.0.1:${(server.address() as any).port}`,
      now: () => 20,
    });
    const report = await worker.tick();
    const freshRead = calls.includes("/repos/org/repo/pulls/1");
    const title = store.collectorPulls("1").find((p) => p.number === 1)?.title;
    const leftover = store.claimSync(21);
    await worker.stop();
    store.close();
    rmSync(dir, { recursive: true });
    await new Promise<void>((r) => server.close(() => r()));
    expect(report?.complete).toBe(true);
    expect(freshRead).toBe(true);
    expect(title).toBe("fresh");
    expect(leftover).toBeNull();
  });
}

it.each([false, true])(
  "finishes one PR across durable facet/cursor slices (revision invalidated: %s)",
  async (invalidate) => {
    let clock = Date.now(),
      head = "head";
    const started = clock,
      calls: string[] = [];
    const server = createServer(async (req, res) => {
      let body = "";
      for await (const chunk of req) body += chunk;
      clock += 10000;
      const path = req.url!;
      calls.push(
        path + (body ? JSON.parse(body).variables.cursor ?? "first" : ""),
      );
      res.setHeader("Content-Type", "application/json");
      let value: unknown = [];
      if (path.includes("state=open"))
        value = [{ number: 1, updated_at: new Date(clock).toISOString() }];
      else if (path.endsWith("/pulls/1"))
        value = {
          id: 1,
          number: 1,
          title: "large",
          user: null,
          state: "open",
          draft: false,
          merged_at: null,
          mergeable: true,
          head: { sha: head, ref: "feature" },
          base: { sha: "base", ref: "dev" },
        };
      else if (path.includes("check-runs") || path.startsWith("/checks")) {
        const page = path.startsWith("/checks") ? Number(path.slice(7)) : 1;
        value = {
          check_runs: [
            {
              id: page,
              name: `${head}:check${page}`,
              status: "completed",
              conclusion: "success",
            },
          ],
        };
        if (page < 3)
          res.setHeader(
            "link",
            `<http://127.0.0.1:${(server.address() as any).port}/checks${page + 1}>; rel="next"`,
          );
      } else if (path.includes("/statuses") || path.startsWith("/statuses")) {
        const page = path.startsWith("/statuses") ? Number(path.slice(9)) : 1;
        value = [
          { context: `context${page}`, state: "success", target_url: null },
        ];
        if (page < 3)
          res.setHeader(
            "link",
            `<http://127.0.0.1:${(server.address() as any).port}/statuses${page + 1}>; rel="next"`,
          );
      } else if (path === "/graphql") {
        const cursor = JSON.parse(body).variables.cursor,
          page = cursor ? Number(cursor.slice(1)) + 1 : 1;
        value = {
          data: {
            repository: {
              pullRequest: {
                headRefOid: head,
                baseRefOid: "base",
                headRefName: "feature",
                baseRefName: "dev",
                reviewDecision: "APPROVED",
                reviewThreads: {
                  nodes: [
                    {
                      id: cursor ?? "first",
                      isResolved: false,
                      isOutdated: false,
                    },
                  ],
                  pageInfo: {
                    hasNextPage: page < 5,
                    endCursor: page < 5 ? `g${page}` : null,
                  },
                },
              },
            },
          },
        };
      }
      res.end(JSON.stringify(value));
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const dir = mkdtempSync(join(tmpdir(), "facet-resume-")),
      path = join(dir, "work.sqlite");
    let store = createWorkStateStore(path);
    store.configureRepository({
      id: "1",
      project: "oriso",
      fullName: "org/repo",
      integrationBranch: "dev",
    });
    let complete = false;
    for (let slice = 0; slice < 6; slice++) {
      const worker = createWorkStateWorker({
        store,
        token: async () => "test",
        apiUrl: `http://127.0.0.1:${(server.address() as any).port}`,
        now: () => clock,
      });
      complete = (await worker.tick())?.complete ?? false;
      await worker.stop();
      store.close();
      store = createWorkStateStore(path);
      if (complete) break;
      if (slice === 0 && invalidate) head = "changed";
      clock++;
    }
    store.setRepositoryGrant({
      actorId: "reader",
      project: "oriso",
      repositoryId: "1",
      allowed: true,
    });
    const repos = store.listRepositories({
      actorId: "reader",
      project: "oriso",
    });
    const history = store.listPullRequestHistory(
      { actorId: "reader", project: "oriso" },
      "1",
      1,
    );
    const pulls = store.listPullRequests({
      actorId: "reader",
      project: "oriso",
    }).items;
    store.close();
    rmSync(dir, { recursive: true });
    await new Promise<void>((r) => server.close(() => r()));
    expect(complete).toBe(true);
    expect(repos[0].coveredPages).toBe(2);
    expect(Date.parse(history[0].observedAt!)).toBe(started);
    expect(pulls[0].facets.checks?.value).toHaveLength(3);
    expect(pulls[0].facets.reviewThreads?.value).toHaveLength(5);
    expect(pulls[0].facets.statuses?.value).toHaveLength(3);
    expect(calls.filter((p) => p === "/graphqlfirst")).toHaveLength(1);
    expect(calls.filter((p) => p === "/statuses2")).toHaveLength(1);
    expect(calls.filter((p) => p === "/checks2")).toHaveLength(
      invalidate ? 2 : 1,
    );
    expect(
      (pulls[0].facets.checks?.value as { name: string }[]).every((check) =>
        check.name.startsWith(head + ":"),
      ),
    ).toBe(true);
  },
);

it("ignores a queued inactive repository and continues with a healthy repository", async () => {
  const calls: string[] = [];
  const server = createServer((req, res) => {
    calls.push(req.url!);
    res.setHeader("Content-Type", "application/json");
    res.end("[]");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const store = createWorkStateStore(":memory:");
  for (const [id, name] of [
    ["1", "inactive"],
    ["2", "healthy"],
  ])
    store.configureRepository({
      id,
      project: "oriso",
      fullName: `org/${name}`,
      integrationBranch: "dev",
    });
  store.enqueueSync("1");
  store.configureRepository({
    id: "1",
    project: "oriso",
    fullName: "org/inactive",
    integrationBranch: "dev",
    active: false,
  });
  const worker = createWorkStateWorker({
    store,
    token: async () => "test",
    apiUrl: `http://127.0.0.1:${(server.address() as any).port}`,
  });
  let result: unknown;
  try {
    result = await worker.tick();
  } catch (error) {
    result = { rejected: true };
  }
  await worker.stop();
  store.close();
  await new Promise<void>((r) => server.close(() => r()));
  expect(result).toMatchObject({ repositoryId: "2", complete: true });
  expect(calls.every((path) => path.includes("healthy"))).toBe(true);
});

it("preserves confirmed mergeability through two 30-second unknown retries and revision change", async () => {
  let clock = Date.now(),
    unknown = false,
    head = "head",
    coreReads = 0;
  const server = createServer((req, res) => {
    const path = req.url!;
    res.setHeader("Content-Type", "application/json");
    let value: unknown = [];
    if (path.includes("state=open"))
      value = [{ number: 1, updated_at: new Date(clock).toISOString() }];
    else if (path.endsWith("/pulls/1")) {
      coreReads++;
      value = {
        id: 1,
        number: 1,
        title: "PR",
        user: null,
        state: "open",
        draft: false,
        merged_at: null,
        mergeable: unknown ? null : true,
        head: { sha: head, ref: "feature" },
        base: { sha: "base", ref: "dev" },
      };
    } else if (path.includes("check-runs")) value = { check_runs: [] };
    else if (path === "/graphql")
      value = {
        data: {
          repository: {
            pullRequest: {
              headRefOid: head,
              baseRefOid: "base",
              headRefName: "feature",
              baseRefName: "dev",
              reviewDecision: null,
              reviewThreads: {
                nodes: [],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        },
      };
    res.end(JSON.stringify(value));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const store = createWorkStateStore(":memory:");
  store.configureRepository({
    id: "1",
    project: "oriso",
    fullName: "org/repo",
    integrationBranch: "dev",
  });
  store.setRepositoryGrant({
    actorId: "reader",
    project: "oriso",
    repositoryId: "1",
    allowed: true,
  });
  const worker = createWorkStateWorker({
    store,
    token: async () => "test",
    apiUrl: `http://127.0.0.1:${(server.address() as any).port}`,
    now: () => clock,
  });
  await worker.tick();
  const confirmed = store.listPullRequests({
    actorId: "reader",
    project: "oriso",
  }).items[0].facets.mergeability!;
  unknown = true;
  clock++;
  store.acceptEvent("unknown", "1", "push", clock, [1]);
  await worker.tick();
  const afterUnknown = store.listPullRequests({
    actorId: "reader",
    project: "oriso",
  }).items[0].facets.mergeability!;
  const count = coreReads;
  clock += 29999;
  await worker.tick();
  const beforeDue = coreReads;
  clock++;
  await worker.tick();
  const firstRetry = coreReads;
  head = "changed";
  clock += 30000;
  await worker.tick();
  const secondRetry = coreReads;
  clock += 30000;
  const exhausted = await worker.tick();
  const final = store.listPullRequests({ actorId: "reader", project: "oriso" })
    .items[0].facets.mergeability!;
  await worker.stop();
  store.close();
  await new Promise<void>((r) => server.close(() => r()));
  expect(afterUnknown).toMatchObject({
    value: confirmed.value,
    coverage: "unknown",
    sourceRevision: confirmed.sourceRevision,
    lastSuccessAt: confirmed.lastSuccessAt,
    errorCode: "mergeability_unknown",
  });
  expect(beforeDue).toBe(count);
  expect(firstRetry).toBe(count + 2);
  expect(secondRetry).toBe(firstRetry + 2);
  expect(exhausted).toBeNull();
  expect(final).toMatchObject({
    value: confirmed.value,
    coverage: "unknown",
    sourceRevision: confirmed.sourceRevision,
  });
});

it("background scheduling recovers from a controlled unexpected tick failure", async () => {
  const store = createWorkStateStore(":memory:");
  store.configureRepository({
    id: "1",
    project: "oriso",
    fullName: "org/repo",
    integrationBranch: "dev",
  });
  const original = store.scheduleSyncs.bind(store);
  let once = true;
  store.scheduleSyncs = (now?: number) => {
    if (once) {
      once = false;
      throw new Error("controlled_private_failure");
    }
    return original(now);
  };
  let calls = 0;
  const server = createServer((_req, res) => {
    calls++;
    res.setHeader("Content-Type", "application/json");
    res.end("[]");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const worker = createWorkStateWorker({
    store,
    token: async () => "test",
    apiUrl: `http://127.0.0.1:${(server.address() as any).port}`,
    intervalMs: 5,
  });
  worker.start();
  await new Promise((resolve) => setTimeout(resolve, 40));
  await worker.stop();
  store.close();
  await new Promise<void>((r) => server.close(() => r()));
  expect(calls).toBeGreaterThan(0);
});

it("a timed-out token provider releases the worker for a healthy repository", async () => {
  vi.useFakeTimers();
  let hanging = true;
  const calls: string[] = [];
  const server = createServer((req, res) => {
    calls.push(req.url!);
    res.setHeader("Content-Type", "application/json");
    res.end("[]");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const store = createWorkStateStore(":memory:");
  for (const [id, name] of [
    ["1", "bad"],
    ["2", "healthy"],
  ])
    store.configureRepository({
      id,
      project: "oriso",
      fullName: `org/${name}`,
      integrationBranch: "dev",
    });
  const worker = createWorkStateWorker({
    store,
    token: () =>
      hanging ? new Promise<string>(() => {}) : Promise.resolve("test"),
    apiUrl: `http://127.0.0.1:${(server.address() as any).port}`,
    now: () => Date.now(),
  });
  const pending = worker.tick();
  await vi.advanceTimersByTimeAsync(30001);
  const bad = await pending;
  hanging = false;
  const healthy = await worker.tick();
  await worker.stop();
  vi.useRealTimers();
  store.close();
  await new Promise<void>((r) => server.close(() => r()));
  expect(bad).toMatchObject({
    repositoryId: "1",
    complete: false,
    errorCode: "network_error",
    requests: 0,
  });
  expect(healthy).toMatchObject({ repositoryId: "2", complete: true });
  expect(calls.every((path) => path.includes("healthy"))).toBe(true);
});

it("stop settles even if its token provider ignores cancellation", async () => {
  const store = createWorkStateStore(":memory:");
  store.configureRepository({
    id: "1",
    project: "oriso",
    fullName: "org/repo",
    integrationBranch: "dev",
  });
  let entered!: () => void;
  const ready = new Promise<void>((resolve) => (entered = resolve));
  const worker = createWorkStateWorker({
    store,
    token: () => {
      entered();
      return new Promise<string>(() => {});
    },
  });
  const pending = worker.tick();
  await ready;
  await worker.stop();
  expect(await pending).toMatchObject({
    complete: false,
    errorCode: "worker_stopped",
    requests: 0,
  });
  store.close();
});

it.each([
  ["app id", { appId: "invalid" }],
  ["installation id", { installationId: "" }],
  ["short signing secret", { webhookSecret: "short" }],
  ["foreign HTTP origin", { apiUrl: "http://github.invalid" }],
  ["credentials in origin", { apiUrl: "https://user:password@api.github.com" }],
  ["unsupported API path", { apiUrl: "https://api.github.com/unexpected" }],
  ["unknown config property", { personalToken: "not-used" }],
])(
  "rejects invalid configured factory %s without invoking its provider",
  async (_name, invalid) => {
    const store = createWorkStateStore(":memory:");
    let calls = 0;
    const configuration = {
      appId: "123",
      installationId: "456",
      webhookSecret: "test-only-webhook-secret-32-bytes-long",
      ...invalid,
    };
    expect(() =>
      createConfiguredWorkStateWorker(configuration, {
        store,
        installationToken: async () => {
          calls++;
          return "test";
        },
      }),
    ).toThrow();
    expect(calls).toBe(0);
    store.close();
  },
);
it("validates registry IDs and duplicate repository names without calling the provider", () => {
  for (const mode of ["id", "duplicate"]) {
    const store = createWorkStateStore(":memory:");
    store.configureRepository({
      id: mode === "id" ? "local-name" : "1",
      project: "oriso",
      fullName: "org/repo",
      integrationBranch: "dev",
    });
    if (mode === "duplicate")
      store.configureRepository({
        id: "2",
        project: "oriso",
        fullName: "ORG/Repo",
        integrationBranch: "dev",
      });
    let calls = 0;
    expect(() =>
      createConfiguredWorkStateWorker(
        {
          appId: "123",
          installationId: "456",
          webhookSecret: "test-only-webhook-secret-32-bytes-long",
        },
        {
          store,
          installationToken: async () => {
            calls++;
            return "test";
          },
        },
      ),
    ).toThrow();
    expect(calls).toBe(0);
    store.close();
  }
});

it("continues completed PR progress after an hour without repeating inventory or the completed PR", async () => {
  let clock = 0,
    coreReads = 0,
    advanced = false;
  const calls: string[] = [];
  const server = createServer((req, res) => {
    const path = req.url!;
    calls.push(path);
    res.setHeader("Content-Type", "application/json");
    let value: unknown = [];
    if (path.includes("state=open"))
      value = [1, 2].map((number) => ({
        number,
        updated_at: new Date().toISOString(),
      }));
    else if (/\/pulls\/[12]$/.test(path)) {
      const number = Number(path.at(-1));
      value = {
        id: number,
        number,
        title: "PR",
        user: null,
        state: "open",
        draft: false,
        merged_at: null,
        mergeable: true,
        head: { sha: "head", ref: "feature" },
        base: { sha: "base", ref: "dev" },
      };
      if (number === 1 && ++coreReads === 2 && !advanced) {
        advanced = true;
        clock = 60_001;
      }
    } else if (path.includes("check-runs")) value = { check_runs: [] };
    else if (path === "/graphql")
      value = {
        data: {
          repository: {
            pullRequest: {
              headRefOid: "head",
              baseRefOid: "base",
              headRefName: "feature",
              baseRefName: "dev",
              reviewDecision: null,
              reviewThreads: {
                nodes: [],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        },
      };
    res.end(JSON.stringify(value));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const dir = mkdtempSync(join(tmpdir(), "hourly-resume-")),
    path = join(dir, "work.sqlite");
  let store = createWorkStateStore(path);
  store.configureRepository({
    id: "1",
    project: "oriso",
    fullName: "org/repo",
    integrationBranch: "dev",
  });
  const options = () => ({
    store,
    token: async () => "test",
    apiUrl: `http://127.0.0.1:${(server.address() as any).port}`,
    now: () => clock,
  });
  let worker = createWorkStateWorker(options());
  const first = await worker.tick();
  await worker.stop();
  store.close();
  store = createWorkStateStore(path);
  clock = 3_600_000;
  calls.length = 0;
  worker = createWorkStateWorker(options());
  const second = await worker.tick();
  await worker.stop();
  const pulls = store.collectorPulls("1");
  store.close();
  rmSync(dir, { recursive: true });
  await new Promise<void>((r) => server.close(() => r()));
  expect(first).toMatchObject({ complete: false, errorCode: "slice_deadline" });
  expect(second?.complete).toBe(true);
  expect(pulls).toHaveLength(2);
  expect(
    calls.some(
      (path) => path.includes("state=") || path === "/repos/org/repo/pulls/1",
    ),
  ).toBe(false);
  expect(calls).toContain("/repos/org/repo/pulls/2");
});
