import { z } from "zod";
import type { WorkspaceGithubFacts } from "../shared/workspace-github.js";
import type { WorkspaceGithubRepository } from "./workspace-github-config.js";
import { GithubReadError, type GithubBudget, type GithubTransport } from "./github-app-reader.js";

export function parseGithubReference(value: string): { fullName: string; kind: "issue" | "pull-request"; number: number; url: string } | null {
  const match = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/(issues|pull)\/([1-9]\d*)\/?$/.exec(value);
  if (!match || !Number.isSafeInteger(Number(match[3]))) return null;
  return { fullName: match[1], kind: match[2] === "issues" ? "issue" : "pull-request", number: Number(match[3]), url: value.replace(/\/$/, "").toLowerCase() };
}
const githubUrl = z.string().url().refine(value => { const url = new URL(value); return url.protocol === "https:" && url.hostname === "github.com" && !url.username && !url.password && !url.search && !url.hash; });
const coreSchema = z.object({ title: z.string().max(4096), state: z.enum(["open", "closed"]), draft: z.boolean().optional(), state_reason: z.string().max(100).nullable().optional(), merged_at: z.string().nullable().optional(), merge_commit_sha: z.string().nullable().optional(), pull_request: z.unknown().optional(), milestone: z.object({ title: z.string().max(200), html_url: githubUrl }).nullable().optional() });
const commitOid = z.string().regex(/^[a-f\d]{40}$/i);
const mergeCommitSchema = z.object({ data: z.object({ repository: z.object({ pullRequest: z.object({ mergeCommit: z.object({ oid: commitOid }).nullable() }) }) }) });
const linkSchema = z.object({ url: githubUrl, repository: z.object({ nameWithOwner: z.string() }) });
const linkedSchema = z.object({ nodes: z.array(linkSchema).max(20), pageInfo: z.object({ hasNextPage: z.boolean() }) });
const namedOptions = z.array(z.object({ name: z.string().max(200) })).max(50);
const fieldSchema = z.object({ name: z.string().max(200).optional(), text: z.string().max(200).optional(), options: namedOptions.optional(), issueFieldValue: z.object({ name: z.string().max(200).optional(), options: namedOptions.optional() }).nullable().optional() }).nullable();
const fieldFragment = "...on ProjectV2ItemFieldSingleSelectValue{name} ...on ProjectV2ItemFieldTextValue{text} ...on ProjectV2ItemFieldMultiSelectValue{options{name}} ...on ProjectV2ItemIssueFieldValue{issueFieldValue{...on IssueFieldMultiSelectValue{options{name}} ...on IssueFieldSingleSelectValue{name}}}";
function fieldValues(field: z.infer<typeof fieldSchema> | undefined): string[] {
  if (!field) return [];
  return [...new Set([field.name, field.text, ...(field.options ?? []).map(item => item.name), field.issueFieldValue?.name, ...(field.issueFieldValue?.options ?? []).map(item => item.name)].filter((value): value is string => typeof value === "string" && value.length > 0))];
}
const boardItemsSchema = z.object({ nodes: z.array(z.object({ project: z.object({ id: z.string() }), status: fieldSchema, release: fieldSchema.optional() })).max(20), pageInfo: z.object({ hasNextPage: z.boolean() }) });

/** Every caller supplies an already-authorized repository. Relations receive their own authorization. */
export async function readWorkspaceGithubFacts(client: GithubTransport, repo: WorkspaceGithubRepository, reference: { kind: "issue" | "pull-request"; number: number }, budget?: GithubBudget,
  relatedClient?: (fullName: string) => GithubTransport | null): Promise<{ facts: WorkspaceGithubFacts; status: "ready" | "partial"; errorCode: string | null; retryAt: number }> {
  const root = `/repos/${repo.fullName}`;
  const core = coreSchema.parse((await client.request(`${root}/${reference.kind === "issue" ? "issues" : "pulls"}/${reference.number}`, undefined, budget)).value);
  if (reference.kind === "issue" && core.pull_request) throw new GithubReadError("reference_kind_mismatch");
  const merged = reference.kind === "pull-request" && core.merged_at != null;
  const facts: WorkspaceGithubFacts = { kind: reference.kind, title: core.title, state: merged ? "merged" : core.state, stateReason: reference.kind === "issue" ? core.state_reason ?? null : null,
    draft: reference.kind === "pull-request" && core.draft === true, mergedAt: merged ? core.merged_at! : null,
    releaseAssignments: core.milestone ? [{ title: core.milestone.title, url: core.milestone.html_url, source: "milestone" }] : [],
    boards: [], closingPullRequests: [], closingPullRequestsComplete: reference.kind !== "issue", publishedReleases: [], releaseCoverage: "unknown" };
  let partial = false; let errorCode: string | null = null; let retryAt = 0;
  const incomplete = (error?: unknown) => { partial = true; errorCode ??= error instanceof GithubReadError ? error.code : "github_partial"; if (error instanceof GithubReadError) retryAt = Math.max(retryAt, error.retryAt ?? 0); };
  if (reference.kind === "issue") {
    try {
      // Cross-repository titles/states are not requested until that repository is authorized.
      const response = (await client.request("/graphql", { query: "query WorkspaceClosing($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){issue(number:$number){closedByPullRequestsReferences(first:20,includeClosedPrs:true){nodes{url repository{nameWithOwner}} pageInfo{hasNextPage}}}}}", variables: { owner: repo.fullName.split("/")[0], name: repo.fullName.split("/")[1], number: reference.number } }, budget)).value;
      const data = z.object({ data: z.object({ repository: z.object({ issue: z.object({ closedByPullRequestsReferences: linkedSchema }) }) }) }).parse(response);
      const links = data.data.repository.issue.closedByPullRequestsReferences; facts.closingPullRequestsComplete = !links.pageInfo.hasNextPage;
      for (const link of links.nodes) {
        const parsed = parseGithubReference(link.url); const other = parsed?.fullName.toLowerCase() === repo.fullName.toLowerCase() ? client : parsed ? relatedClient?.(parsed.fullName) : null;
        if (!parsed || parsed.kind !== "pull-request" || parsed.fullName.toLowerCase() !== link.repository.nameWithOwner.toLowerCase() || !other) { facts.closingPullRequestsComplete = false; continue; }
        try {
          const value = coreSchema.parse((await other.request(`/repos/${parsed.fullName}/pulls/${parsed.number}`, undefined, budget)).value);
          facts.closingPullRequests.push({ url: parsed.url, title: value.title, state: value.merged_at ? "merged" : value.state, draft: value.draft === true });
        } catch (error) { facts.closingPullRequestsComplete = false; incomplete(error); if (error instanceof GithubReadError && ["rate_limited", "request_budget_exhausted", "request_timeout"].includes(error.code)) break; }
      }
      if (!facts.closingPullRequestsComplete) incomplete();
    } catch (error) { incomplete(error); }
  }
  for (const board of repo.boards) {
    try {
      const subject = reference.kind === "issue" ? "issue" : "pullRequest";
      const response = (await client.request("/graphql", { query: `query WorkspaceBoard($owner:String!,$name:String!,$number:Int!,$status:String!${board.releaseField ? ",$release:String!" : ""}){repository(owner:$owner,name:$name){${subject}(number:$number){projectItems(first:20,includeArchived:false){nodes{project{id} status:fieldValueByName(name:$status){${fieldFragment}} ${board.releaseField ? `release:fieldValueByName(name:$release){${fieldFragment}}` : ""}} pageInfo{hasNextPage}}}}}`, variables: { owner: repo.fullName.split("/")[0], name: repo.fullName.split("/")[1], number: reference.number, status: board.statusField, ...(board.releaseField ? { release: board.releaseField } : {}) } }, budget)).value;
      const parsed = z.object({ data: z.object({ repository: z.record(z.string(), z.object({ projectItems: boardItemsSchema })) }) }).parse(response);
      const items = parsed.data.repository[subject].projectItems;
      const item = items.nodes.find(item => item.project.id === board.projectId);
      if (item) {
        facts.boards.push({ title: board.title, url: board.url, status: fieldValues(item.status).join(", ") || null });
        facts.releaseAssignments.push(...fieldValues(item.release).map(title => ({ title, url: board.url, source: "project-field" as const })));
      }
      if (items.pageInfo.hasNextPage || !item || !fieldValues(item.status).length || (board.releaseField && !item.release)) incomplete();
    } catch (error) { incomplete(error); }
  }
  if (merged) {
    try {
      // The 2026-03-10 REST version no longer includes merge_commit_sha.
      const legacyOid = commitOid.safeParse(core.merge_commit_sha);
      let mergeOid = legacyOid.success ? legacyOid.data : undefined;
      if (!mergeOid) {
        const [owner, name] = repo.fullName.split("/");
        const response = await client.request("/graphql", {
          query: "query WorkspaceMergeCommit($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){mergeCommit{oid}}}}",
          variables: { owner, name, number: reference.number },
        }, budget);
        mergeOid = mergeCommitSchema.parse(response.value).data.repository.pullRequest.mergeCommit?.oid;
      }
      if (!mergeOid) throw new GithubReadError("github_partial");
      const response = await client.request(`${root}/releases?per_page=5`, undefined, budget);
      const releases = z.array(z.object({ tag_name: z.string().min(1).max(200), name: z.string().nullable().optional(), html_url: githubUrl, published_at: z.string().nullable(), draft: z.boolean() })).max(5).parse(response.value);
      facts.releaseCoverage = response.next ? "partial" : "complete";
      for (const release of releases.filter(item => !item.draft && item.published_at)) {
        // Only page one includes the changed files; the ancestry fields are also on page two.
        const result = z.object({ status: z.string(), merge_base_commit: z.object({ sha: z.string() }) }).parse((await client.request(`${root}/compare/${mergeOid}...${encodeURIComponent(`refs/tags/${release.tag_name}`)}?per_page=1&page=2`, undefined, budget)).value);
        if ((result.status === "ahead" || result.status === "identical") && result.merge_base_commit.sha === mergeOid) facts.publishedReleases.push({ tag: release.tag_name, title: release.name ?? release.tag_name, url: release.html_url, publishedAt: release.published_at! });
      }
      if (response.next) incomplete();
    } catch (error) { facts.releaseCoverage = "partial"; incomplete(error); }
  }
  return { facts, status: partial ? "partial" : "ready", errorCode, retryAt };
}
