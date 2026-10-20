import { describe, expect, it } from "vitest";
import {
  assertCommitMatches,
  detectGitHubLogin,
  detectPullRequests,
  detectRepositoryContext,
  viewPullRequest,
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
    if (command === "gh" && args[0] === "api" && args[1] === "repos/{owner}/{repo}") return ok("OpenResilienceInitiative/ORISO-E2E\n");
    if (command === "gh" && args[0] === "api" && args[1]?.includes("/pulls?")) return ok("[]");
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
    expect(() => detectRepositoryContext(runner({ "gh api repos/{owner}/{repo}": fail() })))
      .toThrow(/gh auth login/);
  });

  it("refuses a repository name that is not owner/repo", () => {
    expect(() => detectRepositoryContext(runner({ "gh api repos/{owner}/{repo}": ok("https://github.com/a/b\n") })))
      .toThrow(GitContextError);
  });
});

describe("detectPullRequests", () => {
  it("maps the gh payload onto the pull request context", () => {
    const pullRequests = detectPullRequests(runner({ "gh api repos/OpenResilienceInitiative/ORISO-E2E/pulls?state=open&per_page=100": ok(onePullRequest) }), "feat/pr-evidence", "OpenResilienceInitiative/ORISO-E2E");
    expect(pullRequests).toEqual([{
      number: 553,
      url: "https://github.com/OpenResilienceInitiative/ORISO-E2E/pull/553",
      state: "OPEN",
      headSha
    }]);
  });

  it("treats a gh failure as no pull request rather than crashing", () => {
    expect(detectPullRequests(runner({ "gh api repos/OpenResilienceInitiative/ORISO-E2E/pulls?state=open&per_page=100": fail() }), "feat/pr-evidence", "OpenResilienceInitiative/ORISO-E2E")).toEqual([]);
  });
});

describe("resolveTarget", () => {
  it("uses the single open pull request of the branch", () => {
    const target = resolveTarget(runner({ "gh api repos/OpenResilienceInitiative/ORISO-E2E/pulls?state=open&per_page=100": ok(onePullRequest) }));
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
    expect(() => resolveTarget(runner({ "gh api repos/OpenResilienceInitiative/ORISO-E2E/pulls?state=open&per_page=100": ok(several) }))).toThrow(/pass --pr/);
  });

  it("looks up an explicitly named pull request", () => {
    const view = JSON.stringify({ number: 900, url: "u", state: "OPEN", headRefOid: headSha });
    const target = resolveTarget(runner({ "gh api repos/OpenResilienceInitiative/ORISO-E2E/pulls/900": ok(view) }), { explicitPullRequest: 900 });
    expect(target.pullRequest?.number).toBe(900);
  });

  it("reports a pull request that does not exist", () => {
    expect(() => resolveTarget(runner({ "gh api repos/OpenResilienceInitiative/ORISO-E2E/pulls/900": fail() }), { explicitPullRequest: 900 }))
      .toThrow(/#900 was not found/);
  });

  it("blocks an upload when the pull request head has moved on", () => {
    const moved = JSON.stringify([
      { number: 553, url: "u", state: "OPEN", headRefOid: "2222222222222222222222222222222222222222" }
    ]);
    expect(() => resolveTarget(runner({ "gh api repos/OpenResilienceInitiative/ORISO-E2E/pulls?state=open&per_page=100": ok(moved) }))).toThrow(/--allow-older-commit/);
  });

  it("lets --allow-older-commit through once it is explicit", () => {
    const moved = JSON.stringify([
      { number: 553, url: "u", state: "OPEN", headRefOid: "2222222222222222222222222222222222222222" }
    ]);
    const target = resolveTarget(runner({ "gh api repos/OpenResilienceInitiative/ORISO-E2E/pulls?state=open&per_page=100": ok(moved) }), { allowOlderCommit: true });
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

describe("findings raised by review", () => {
  it("refuses a detached HEAD instead of matching an unrelated pull request", () => {
    const detached = runner({ "git rev-parse --abbrev-ref": ok("HEAD\n") });
    expect(() => detectRepositoryContext(detached)).toThrow(/detached/);
    const failed = runner({ "git rev-parse --abbrev-ref": fail() });
    expect(() => detectRepositoryContext(failed)).toThrow(/detached|could not be resolved/);
  });

  it("turns unparseable gh output into a clear error rather than a SyntaxError", () => {
    const garbage = runner({ "gh api repos/OpenResilienceInitiative/ORISO-E2E/pulls/7": ok("<html>proxy error</html>") });
    expect(() => resolveTarget(garbage, { explicitPullRequest: 7 })).toThrow(/not valid JSON/);
  });

  it("treats unparseable pull request listings as no pull request", () => {
    const garbage = runner({ "gh api repos/OpenResilienceInitiative/ORISO-E2E/pulls?state=open&per_page=100": ok("not json at all") });
    expect(() => detectPullRequests(garbage, "feat/x", "OpenResilienceInitiative/ORISO-E2E")).toThrow(/not valid JSON/);
  });

  it("refuses an explicitly named pull request that is closed or merged", () => {
    for (const state of ["MERGED", "CLOSED"]) {
      const view = JSON.stringify({ number: 900, url: "u", state, headRefOid: headSha });
      expect(() => resolveTarget(runner({ "gh api repos/OpenResilienceInitiative/ORISO-E2E/pulls/900": ok(view) }), { explicitPullRequest: 900 }), state)
        .toThrow(new RegExp(state.toLowerCase()));
    }
  });
});


describe("REST-only pull request reads", () => {
  it("paginates all branch matches including fork heads and preserves multiple-match rejection", () => {
    const calls: string[][] = [];
    const execute = runner({ "gh api repos/OpenResilienceInitiative/ORISO-E2E/pulls?state=open&per_page=100": ok([
      { number: 1, url: "https://github.com/a/b/pull/1", state: "open", headRefOid: headSha },
      { number: 2, url: "https://github.com/a/b/pull/2", state: "open", headRefOid: headSha }
    ].map((entry) => JSON.stringify(entry)).join("\n")) });
    const run = (command: string, args: string[]) => { calls.push([command, ...args]); return execute(command, args); };
    expect(() => resolveTarget(run)).toThrow("pass --pr");
    const listing = calls.find((args) => args[2]?.includes("/pulls?"));
    expect(listing).toContain("--paginate");
    expect(listing?.join(" ")).toContain(".head.ref");
    expect(calls.every((args) => args[0] !== "gh" || args[1] === "api")).toBe(true);
  });
  it("uses repository-scoped REST for an explicit PR and normalizes closed/merged state", () => {
    const calls: string[][] = [];
    const run = (command: string, args: string[]) => { calls.push([command, ...args]); return ok(JSON.stringify({ number: 7, url: "u", state: "MERGED", headRefOid: headSha })); };
    expect(viewPullRequest(run, 7, "OpenResilienceInitiative/ORISO-E2E")?.state).toBe("MERGED");
    expect(calls[0]).toEqual(expect.arrayContaining(["gh", "api", "repos/OpenResilienceInitiative/ORISO-E2E/pulls/7"]));
  });
});
