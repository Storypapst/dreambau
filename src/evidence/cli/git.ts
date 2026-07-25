import { z } from "zod";

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface CommandRunner {
  (command: string, args: string[]): CommandResult;
}

export interface RepositoryContext {
  repository: string;
  commitSha: string;
  branch: string;
}

export interface PullRequestContext {
  number: number;
  headSha: string;
  url: string;
  state: string;
}

export class GitContextError extends Error {}

const repositoryPattern = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

/** `JSON.parse` on subprocess output, normalised into this module's error type. */
function parseJson(raw: string, what: string): unknown {
  try {
    return JSON.parse(raw || "null");
  } catch {
    throw new GitContextError(`gh returned output that is not valid JSON while reading ${what}`);
  }
}

/** `gh repo view` is authoritative; it resolves the remote the user is signed in to. */
export function detectRepositoryContext(run: CommandRunner): RepositoryContext {
  const head = run("git", ["rev-parse", "HEAD"]);
  if (head.code !== 0) throw new GitContextError("not inside a Git repository");
  const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  // An unchecked failure here yields "" or "HEAD", which would turn into an
  // empty `--head` filter and silently match an unrelated pull request.
  if (branch.code !== 0 || !branch.stdout.trim() || branch.stdout.trim() === "HEAD") {
    throw new GitContextError("HEAD is detached or the branch could not be resolved; check out a branch first");
  }
  const repository = run("gh", ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]);
  if (repository.code !== 0) {
    throw new GitContextError("could not resolve the GitHub repository; run `gh auth login` first");
  }
  const name = repository.stdout.trim();
  if (!repositoryPattern.test(name)) throw new GitContextError(`unexpected repository name: ${name}`);
  return { repository: name, commitSha: head.stdout.trim(), branch: branch.stdout.trim() };
}

const pullRequestListSchema = z.array(z.object({
  number: z.number().int().positive(),
  url: z.string(),
  state: z.string(),
  headRefOid: z.string()
}));

/**
 * Returns every open pull request whose head is the current branch. More than
 * one match is not resolved silently — the caller must pass `--pr`.
 */
export function detectPullRequests(run: CommandRunner, branch: string): PullRequestContext[] {
  const result = run("gh", [
    "pr", "list", "--state", "open", "--head", branch,
    "--json", "number,url,state,headRefOid"
  ]);
  if (result.code !== 0) return [];
  const parsed = pullRequestListSchema.safeParse(parseJson(result.stdout || "[]", "the open pull requests"));
  if (!parsed.success) return [];
  return parsed.data.map((entry) => ({
    number: entry.number,
    url: entry.url,
    state: entry.state,
    headSha: entry.headRefOid
  }));
}

const pullRequestViewSchema = z.object({
  number: z.number().int().positive(),
  url: z.string(),
  state: z.string(),
  headRefOid: z.string()
});

/** Only an open pull request may receive evidence. */
export const openStates = ["OPEN"];

export function viewPullRequest(run: CommandRunner, pullRequestNumber: number): PullRequestContext | null {
  const result = run("gh", [
    "pr", "view", String(pullRequestNumber),
    "--json", "number,url,state,headRefOid"
  ]);
  if (result.code !== 0) return null;
  const parsed = pullRequestViewSchema.safeParse(parseJson(result.stdout || "{}", "the pull request"));
  if (!parsed.success) return null;
  return {
    number: parsed.data.number,
    url: parsed.data.url,
    state: parsed.data.state,
    headSha: parsed.data.headRefOid
  };
}

export function detectGitHubLogin(run: CommandRunner): string {
  const result = run("gh", ["api", "user", "--jq", ".login"]);
  return result.code === 0 ? result.stdout.trim() : "";
}

export interface ResolvedTarget {
  repository: string;
  commitSha: string;
  branch: string;
  pullRequest: PullRequestContext | null;
}

export interface ResolveOptions {
  explicitPullRequest?: number;
  allowOlderCommit?: boolean;
  draft?: boolean;
}

/**
 * Resolves what a run belongs to. Without an open pull request the default is a
 * clear abort: an accidental public upload is worse than a failed command.
 */
export function resolveTarget(run: CommandRunner, options: ResolveOptions = {}): ResolvedTarget {
  const context = detectRepositoryContext(run);
  if (options.explicitPullRequest !== undefined) {
    const pullRequest = viewPullRequest(run, options.explicitPullRequest);
    if (!pullRequest) throw new GitContextError(`pull request #${options.explicitPullRequest} was not found`);
    // `gh pr view` is not state-filtered, unlike the branch lookup, so a closed
    // or merged pull request would otherwise accept evidence.
    if (!openStates.includes(pullRequest.state.toUpperCase())) {
      throw new GitContextError(
        `pull request #${pullRequest.number} is ${pullRequest.state.toLowerCase()}; evidence only goes onto an open pull request`
      );
    }
    assertCommitMatches(pullRequest, context.commitSha, options.allowOlderCommit ?? false);
    return { ...context, pullRequest };
  }
  const candidates = detectPullRequests(run, context.branch);
  if (candidates.length > 1) {
    const numbers = candidates.map((candidate) => `#${candidate.number}`).join(", ");
    throw new GitContextError(`branch ${context.branch} has several open pull requests (${numbers}); pass --pr`);
  }
  if (candidates.length === 0) {
    if (options.draft) return { ...context, pullRequest: null };
    throw new GitContextError(
      `branch ${context.branch} has no open pull request; open one or upload with --draft (private, 60 day retention)`
    );
  }
  assertCommitMatches(candidates[0], context.commitSha, options.allowOlderCommit ?? false);
  return { ...context, pullRequest: candidates[0] };
}

export function assertCommitMatches(pullRequest: PullRequestContext, commitSha: string, allowOlderCommit: boolean): void {
  if (allowOlderCommit || pullRequest.headSha.toLowerCase() === commitSha.toLowerCase()) return;
  throw new GitContextError(
    `local commit ${commitSha.slice(0, 7)} is not the head of pull request #${pullRequest.number} `
    + `(${pullRequest.headSha.slice(0, 7)}); push first or pass --allow-older-commit`
  );
}
