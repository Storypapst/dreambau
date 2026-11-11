import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGithubAppToken, createGithubTransport, GithubReadError } from "../src/server/github-app-reader.js";
import { readWorkspaceGithubFacts } from "../src/server/workspace-github-reader.js";
import { parseWorkspaceGithubConfig } from "../src/server/workspace-github-config.js";

afterEach(() => vi.useRealTimers());

const repo = { fullName: "Storypapst/dreambau", project: "dreambau" as const, boards: [] };
function setup(responses: Record<string, unknown>) {
  const transport = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input); const key = url.endsWith("/graphql") ? "graphql" : new URL(url).pathname;
    if (key.includes("/compare/")) expect(new URL(url).searchParams.toString()).toBe("per_page=1&page=2");
    if (!(key in responses)) throw new Error(`unexpected request ${key}`);
    return Response.json(responses[key], { headers: { etag: "fixture-etag" } });
  });
  const client = createGithubTransport({ token: async () => "private-test-token", transport });
  return { client, transport };
}
const pull = { title: "Actual fix", state: "closed", draft: false, merged_at: "2026-11-07T10:00:00Z", merge_commit_sha: "a".repeat(40), milestone: { title: "2.0 planned", html_url: "https://github.com/Storypapst/dreambau/milestone/1" } };
describe("selected-reference GitHub reader", () => {
  it("reads actual GitHub checkmarks without projecting the issue body, code block, or secret text", async () => {
    const f = setup({ "/repos/Storypapst/dreambau/pulls/12": {
      title: "Fix", state: "open",
      body: ["Internal description", "- [x] Open [the login page](https://example.test/login)", "  * [ ] Verify keyboard focus", "```md", "- [x] fake", "```", "<!--", "- [x] fake comment", "-->", "- [ ] password=super-secret-value"].join("\n")
    } });
    const result = await readWorkspaceGithubFacts(f.client, repo, { kind: "pull-request", number: 12 });
    expect(result.facts.taskList).toEqual({ total: 3, checked: 1, items: [
      { label: "Open the login page", checked: true },
      { label: "Verify keyboard focus", checked: false },
      { label: null, checked: false }
    ] });
    expect(JSON.stringify(result)).not.toMatch(/Internal description|super-secret-value|https:\/\/example.test|fake/);
  });

  it("parks all references on the installation when token minting is rate limited", async () => {
    let now = 1000; let limited = true;
    const token = vi.fn(async () => { if (limited) throw new GithubReadError("rate_limited", 181000); return "restored-token"; });
    const transport = vi.fn(async () => Response.json({ title: "restored" }));
    const client = createGithubTransport({ token, transport, now: () => now });
    await expect(client.request("/repos/Storypapst/dreambau/issues/1")).rejects.toMatchObject({ code: "rate_limited" });
    await expect(client.request("/repos/Storypapst/dreambau/issues/2")).rejects.toMatchObject({ code: "rate_limited" });
    expect(token).toHaveBeenCalledTimes(1);
    now = 181001; limited = false; await client.request("/repos/Storypapst/dreambau/issues/2");
    expect(token).toHaveBeenCalledTimes(2); expect(transport).toHaveBeenCalledTimes(1);
  });
  it("preserves both actual issue-field release assignments without claiming either was shipped", async () => {
    const board = { projectId: "approved-board", title: "Roadmap", url: "https://github.com/orgs/OpenResilienceInitiative/projects/1", statusField: "Status", releaseField: "Platform release" };
    const f = setup({ "/repos/Storypapst/dreambau/pulls/12": { ...pull, merged_at: null, milestone: null },
      graphql: { data: { repository: { pullRequest: { projectItems: { nodes: [
        { project: { id: "other-board" }, status: { name: "Private other board" }, release: null },
        { project: { id: "approved-board" }, status: { name: "QA internal" }, release: { issueFieldValue: { options: [{ name: "v2.0.16" }, { name: "v2.0.13" }] } } }
      ], pageInfo: { hasNextPage: false } } } } } }
    });
    const result = await readWorkspaceGithubFacts(f.client, { ...repo, boards: [board] }, { kind: "pull-request", number: 12 });
    expect(result.facts.boards).toEqual([{ title: "Roadmap", url: board.url, status: "QA internal" }]);
    expect(result.facts.releaseAssignments).toEqual([{ title: "v2.0.16", url: board.url, source: "project-field" }, { title: "v2.0.13", url: board.url, source: "project-field" }]);
    expect(result.facts.publishedReleases).toEqual([]); expect(result.status).toBe("ready");
  });
  it("marks missing or truncated configured board fields partial rather than complete", async () => {
    const f = setup({ "/repos/Storypapst/dreambau/pulls/12": { ...pull, merged_at: null }, graphql: { data: { repository: { pullRequest: { projectItems: { nodes: [], pageInfo: { hasNextPage: true } } } } } } });
    const result = await readWorkspaceGithubFacts(f.client, { ...repo, boards: [{ projectId: "approved", title: "Roadmap", url: "https://github.com/orgs/example/projects/1", statusField: "Status" }] }, { kind: "pull-request", number: 12 });
    expect(result.status).toBe("partial"); expect(result.facts.boards).toEqual([]);
  });
  it("proves a published release contains the merge commit, not merely that a later release exists", async () => {
    const f = setup({ "/repos/Storypapst/dreambau/pulls/12": { ...pull, merge_commit_sha: undefined },
      graphql: { data: { repository: { pullRequest: { mergeCommit: { oid: "a".repeat(40) } } } } },
      "/repos/Storypapst/dreambau/releases": [
        { tag_name: "v2", name: "Actual release", html_url: "https://github.com/Storypapst/dreambau/releases/tag/v2", published_at: "2026-11-07T11:00:00Z", draft: false },
        { tag_name: "unrelated", html_url: "https://github.com/Storypapst/dreambau/releases/tag/unrelated", published_at: "2026-11-07T12:00:00Z", draft: false }],
      [`/repos/Storypapst/dreambau/compare/${"a".repeat(40)}...refs%2Ftags%2Fv2`]: { status: "ahead", merge_base_commit: { sha: "a".repeat(40) } },
      [`/repos/Storypapst/dreambau/compare/${"a".repeat(40)}...refs%2Ftags%2Funrelated`]: { status: "diverged", merge_base_commit: { sha: "b".repeat(40) } }
    });
    const result = await readWorkspaceGithubFacts(f.client, repo, { kind: "pull-request", number: 12 });
    expect(result.facts).toMatchObject({ state: "merged", releaseAssignments: [{ title: "2.0 planned", source: "milestone" }], publishedReleases: [{ tag: "v2" }], releaseCoverage: "complete" });
    expect(JSON.stringify(result)).not.toMatch(/deployed|private-test-token/);
  });
  it("keeps closed Issues and a partial set of closing PRs separate from delivery", async () => {
    const f = setup({ "/repos/Storypapst/dreambau/issues/12": { title: "Several fixes", state: "closed", state_reason: "completed", milestone: null },
      "/repos/Storypapst/dreambau/pulls/1": { ...pull, title: "First" },
      "/repos/Storypapst/dreambau/pulls/2": { ...pull, title: "Remaining", state: "open", merged_at: null },
      graphql: { data: { repository: { issue: { closedByPullRequestsReferences: { nodes: [
        { url: "https://github.com/Storypapst/dreambau/pull/1", title: "First", state: "MERGED", isDraft: false, repository: { nameWithOwner: "Storypapst/dreambau" } },
        { url: "https://github.com/Storypapst/dreambau/pull/2", title: "Remaining", state: "OPEN", isDraft: false, repository: { nameWithOwner: "Storypapst/dreambau" } },
        { url: "https://github.com/private/other/pull/3", title: "Secret cross-project title", state: "MERGED", repository: { nameWithOwner: "private/other" } }
      ], pageInfo: { hasNextPage: false } } } } } }
    });
    const result = await readWorkspaceGithubFacts(f.client, repo, { kind: "issue", number: 12 });
    expect(result.status).toBe("partial");
    expect(result.facts).toMatchObject({ state: "closed", closingPullRequestsComplete: false, closingPullRequests: [{ state: "merged" }, { state: "open" }], publishedReleases: [], releaseCoverage: "unknown" });
    expect(JSON.stringify(result)).not.toContain("Secret cross-project title");
  });
  it("uses conditional ETags and parks requests after rate limiting", async () => {
    let calls = 0; let now = 1000;
    const transport = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      calls++;
      if (calls === 1) return Response.json({ title: "cached" }, { headers: { etag: "same" } });
      if (calls === 2) { expect(new Headers(init?.headers).get("If-None-Match")).toBe("same"); return new Response(null, { status: 304 }); }
      return new Response(null, { status: 429, headers: { "retry-after": "90" } });
    });
    const client = createGithubTransport({ token: async () => "test", transport, now: () => now });
    expect((await client.request("/repos/Storypapst/dreambau/issues/12")).value).toEqual({ title: "cached" });
    expect((await client.request("/repos/Storypapst/dreambau/issues/12")).value).toEqual({ title: "cached" });
    await expect(client.request("/repos/Storypapst/dreambau/issues/12")).rejects.toMatchObject({ code: "rate_limited", retryAt: 91000 });
    now = 2000;
    await expect(client.request("/repos/Storypapst/dreambau/issues/12")).rejects.toMatchObject({ code: "rate_limited" });
    expect(transport).toHaveBeenCalledTimes(3);
  });
  it("settles even if an upstream ignores cancellation and never resolves", async () => {
    vi.useFakeTimers();
    const client = createGithubTransport({ token: async () => "test", transport: vi.fn(() => new Promise<Response>(() => undefined)) });
    const failure = expect(client.request("/repos/Storypapst/dreambau/issues/1", undefined, { remaining: 1, deadline: Date.now() + 30 })).rejects.toMatchObject({ code: "request_timeout" });
    await vi.advanceTimersByTimeAsync(35); await failure;
  });
  it("uses least-privilege per-installation App tokens, deduplicates exchange and renews near expiry", async () => {
    const privateKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    let now = 1_000_000;
    const transport = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({ repositories: ["dreambau"], permissions: { metadata: "read", issues: "read", pull_requests: "read", contents: "read" } });
      return Response.json({ token: "never-exposed-token", expires_at: new Date(now + 120_000).toISOString() });
    });
    const token = createGithubAppToken({ appId: "1", installationId: "2", privateKey, repositories: ["dreambau"], boards: false, transport, now: () => now });
    await Promise.all([token(), token()]); await token(); expect(transport).toHaveBeenCalledTimes(1);
    now += 70_000; await token(); expect(transport).toHaveBeenCalledTimes(2);
  });
  it("rejects ambiguous repository mappings and separates installations for different owners", () => {
    const config = { appId: "1", privateKeyFile: "/run/secrets/github/app.pem", installations: [{ installationId: "2", repositories: [repo] }, { installationId: "3", repositories: [{ fullName: "OpenResilienceInitiative/ORISO-Frontend", project: "oriso" }] }] };
    expect(parseWorkspaceGithubConfig(config).installations).toHaveLength(2);
    expect(() => parseWorkspaceGithubConfig({ ...config, installations: [{ installationId: "2", repositories: [repo, { ...repo, fullName: "storypapst/DREAMBAU", project: "oriso" }] }] })).toThrow();
    expect(() => parseWorkspaceGithubConfig({ ...config, installations: [{ installationId: "2", repositories: [repo, { fullName: "OpenResilienceInitiative/ORISO-Frontend", project: "oriso" }] }] })).toThrow();
  });
});
