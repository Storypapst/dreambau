import { describe, expect, it } from "vitest";
import {
  assertCommitMatches,
  detectGitHubLogin,
  detectPullRequests,
  detectRepositoryContext,
  GitContextError,
  resolveTarget,
  type CommandResult
} from "../../src/evidence/cli/git.js";

const ok = (stdout: string): CommandResult => ({ code: 0, stdout, stderr: "" });
const fail = (stderr = "boom"): CommandResult => ({ code: 1, stdout: "", stderr });

const headSha = "1111111111111111111111111111111111111111";

function runner(overrides: Record<string, CommandResult> = {}) {
  return (command: string, args: string[]): CommandResult => {
    const key = `${command} ${args[0]}${args[1] ? ` ${args[1]}` : ""}`;
    if (key in overrides) return overrides[key];
    if (command === "git" && args[0] === "rev-parse" && args[1] === "HEAD") return ok(`${headSha}\n`);
    if (command === "git" && args[0] === "rev-parse") return ok("feat/pr-evidence\n");
    if (command === "gh" && args[0] === "repo") return ok("OpenResilienceInitiative/ORISO-E2E\n");
    if (command === "gh" && args[0] === "pr" && args[1] === "list") return ok("[]");
    if (command === "gh" && args[0] === "api") return ok("Storypapst\n");
    return fail(`unexpected command: ${command} ${args.join(" ")}`);
  };
}

const onePullRequest = JSON.stringify([
  { number: 553, url: "https://github.com/OpenResilienceInitiative/ORISO-E2E/pull/553", state: "OPEN", headRefOid: headSha }
]);

describe("detectRepositoryContext", () => {
  it("reads repository, commit and branch from git and gh", () => {
    expect(detectRepositoryContext(runner())).toEqual({
      repository: "OpenResilienceInitiative/ORISO-E2E",
      commitSha: headSha,
      branch: "feat/pr-evidence"
    });
  });

  it("explains that it is not inside a repository", () => {
    expect(() => detectRepositoryContext(runner({ "git rev-parse HEAD": fail() })))
      .toThrow(/not inside a Git repository/);
  });

  it("asks for a gh login when the repository cannot be resolved", () => {
    expect(() => detectRepositoryContext(runner({ "gh repo view": fail() })))
      .toThrow(/gh auth login/);
  });

  it("refuses a repository name that is not owner/repo", () => {
    expect(() => detectRepositoryContext(runner({ "gh repo view": ok("https://github.com/a/b\n") })))
      .toThrow(GitContextError);
  });
});

describe("detectPullRequests", () => {
  it("maps the gh payload onto the pull request context", () => {
    const pullRequests = detectPullRequests(runner({ "gh pr list": ok(onePullRequest) }), "feat/pr-evidence");
    expect(pullRequests).toEqual([{
      number: 553,
      url: "https://github.com/OpenResilienceInitiative/ORISO-E2E/pull/553",
      state: "OPEN",
      headSha
    }]);
  });

  it("treats a gh failure as no pull request rather than crashing", () => {
    expect(detectPullRequests(runner({ "gh pr list": fail() }), "feat/pr-evidence")).toEqual([]);
  });
});

describe("resolveTarget", () => {
  it("uses the single open pull request of the branch", () => {
    const target = resolveTarget(runner({ "gh pr list": ok(onePullRequest) }));
    expect(target.pullRequest?.number).toBe(553);
  });

  it("aborts when the branch has no open pull request", () => {
    expect(() => resolveTarget(runner())).toThrow(/no open pull request/);
  });

  it("allows a draft when there is no pull request", () => {
    const target = resolveTarget(runner(), { draft: true });
    expect(target.pullRequest).toBeNull();
    expect(target.repository).toBe("OpenResilienceInitiative/ORISO-E2E");
  });

  it("demands --pr when the branch has several open pull requests", () => {
    const several = JSON.stringify([
      { number: 1, url: "u1", state: "OPEN", headRefOid: headSha },
      { number: 2, url: "u2", state: "OPEN", headRefOid: headSha }
    ]);
    expect(() => resolveTarget(runner({ "gh pr list": ok(several) }))).toThrow(/pass --pr/);
  });

  it("looks up an explicitly named pull request", () => {
    const view = JSON.stringify({ number: 900, url: "u", state: "OPEN", headRefOid: headSha });
    const target = resolveTarget(runner({ "gh pr view": ok(view) }), { explicitPullRequest: 900 });
    expect(target.pullRequest?.number).toBe(900);
  });

  it("reports a pull request that does not exist", () => {
    expect(() => resolveTarget(runner({ "gh pr view": fail() }), { explicitPullRequest: 900 }))
      .toThrow(/#900 was not found/);
  });

  it("blocks an upload when the pull request head has moved on", () => {
    const moved = JSON.stringify([
      { number: 553, url: "u", state: "OPEN", headRefOid: "2222222222222222222222222222222222222222" }
    ]);
    expect(() => resolveTarget(runner({ "gh pr list": ok(moved) }))).toThrow(/--allow-older-commit/);
  });

  it("lets --allow-older-commit through once it is explicit", () => {
    const moved = JSON.stringify([
      { number: 553, url: "u", state: "OPEN", headRefOid: "2222222222222222222222222222222222222222" }
    ]);
    const target = resolveTarget(runner({ "gh pr list": ok(moved) }), { allowOlderCommit: true });
    expect(target.pullRequest?.number).toBe(553);
  });
});

describe("assertCommitMatches", () => {
  it("compares case-insensitively", () => {
    expect(() => assertCommitMatches(
      { number: 1, url: "u", state: "OPEN", headSha: "ABCDEF1" },
      "abcdef1",
      false
    )).not.toThrow();
  });
});

describe("detectGitHubLogin", () => {
  it("returns the signed-in account or an empty string", () => {
    expect(detectGitHubLogin(runner())).toBe("Storypapst");
    expect(detectGitHubLogin(runner({ "gh api user": fail() }))).toBe("");
  });
});
