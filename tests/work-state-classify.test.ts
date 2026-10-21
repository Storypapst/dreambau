import { describe, expect, it } from "vitest";
import { classifyPullRequest } from "../src/server/work-state/classify.js";
import type {
  PullRequestSnapshot,
  Facet,
} from "../src/server/work-state/model.js";
const now = Date.parse("2026-10-20T12:00:00Z");
const revision = "head1:base1:feature:dev";
const facet = (value: Facet["value"], minutes = 1): Facet => ({
  source: "github",
  value,
  sourceRevision: revision,
  observedAt: new Date(now - minutes * 60000).toISOString(),
  lastAttemptAt: new Date(now).toISOString(),
  lastSuccessAt: new Date(now - minutes * 60000).toISOString(),
  coverage: "complete",
  errorCode: null,
});
function pull(): PullRequestSnapshot & { reviewRequested?: boolean } {
  return {
    id: "101",
    number: 1,
    url: "https://github.com/org/repo/pull/1",
    title: "Example",
    author: "author",
    base: "dev",
    head: "feature",
    headSha: "head1",
    baseSha: "base1",
    lifecycle: "open",
    draft: false,
    mergedAt: null,
    facets: {
      checks: facet([]),
      statuses: facet([]),
      reviewDecision: facet("APPROVED"),
      reviewThreads: facet([]),
      mergeability: facet({ mergeable: true, state: "clean" }),
    },
  };
}
const check = (
  id: number,
  conclusion: string | null,
  status = "completed",
  startedAt = "2026-10-20T11:00:00Z",
) => ({
  id,
  name: "build",
  status,
  conclusion,
  url: `https://github.com/org/repo/actions/runs/${id}`,
  headSha: "head1",
  appId: 1,
  suiteId: 2,
  startedAt,
});
const codes = (
  pr: ReturnType<typeof pull>,
  mode: "normal" | "polling_pilot" = "normal",
) => classifyPullRequest({ ...pr, mode }, now).map((r) => r.code);
describe("source-backed PR attention", () => {
  it("links a failing current-head check to its actual run", () => {
    const pr = pull();
    pr.facets.checks = facet([check(1, "failure")]);
    const reasons = classifyPullRequest(pr, now);
    expect(reasons.find((r) => r.code === "checks_failed")?.url).toBe(
      "https://github.com/org/repo/actions/runs/1",
    );
  });
  it.each(["cancelled", "timed_out"])(
    "treats %s on current head as a failed observation",
    (conclusion) => {
      const pr = pull();
      pr.facets.checks = facet([check(1, conclusion)]);
      expect(codes(pr)).toContain("checks_failed");
    },
  );
  it("does not reuse old-head green checks", () => {
    const pr = pull();
    pr.facets.checks = facet([check(1, "success")]);
    pr.headSha = "new-head";
    expect(codes(pr)).toContain("data_incomplete");
    expect(codes(pr)).not.toContain("checks_failed");
  });
  it("newer rerun wins even if an older failure finishes later", () => {
    const pr = pull();
    pr.facets.checks = facet([
      { ...check(1, "failure"), completedAt: "2026-10-20T11:59:00Z" },
      check(2, "success", "completed", "2026-10-20T11:30:00Z"),
    ]);
    expect(codes(pr)).not.toContain("checks_failed");
  });
  it("newer queued rerun remains pending", () => {
    const pr = pull();
    pr.facets.checks = facet([
      check(1, "failure"),
      check(2, null, "in_progress", "2026-10-20T11:30:00Z"),
    ]);
    expect(codes(pr)).toContain("checks_pending");
    expect(codes(pr)).not.toContain("checks_failed");
  });
  it("does not merge equally named checks from different apps", () => {
    const pr = pull();
    pr.facets.checks = facet([
      check(1, "failure"),
      { ...check(2, "success"), appId: 9 },
    ]);
    expect(codes(pr)).toContain("checks_failed");
  });
  it("keeps test-merge checks unknown without current head/base proof", () => {
    const pr = pull();
    pr.facets.checks = facet([
      { ...check(1, "success"), headSha: "test-merge-sha" },
    ]);
    expect(codes(pr)).toContain("checks_unknown");
  });
  it("distinguishes a change request from unresolved conversations", () => {
    const pr = pull();
    pr.facets.reviewDecision = facet("CHANGES_REQUESTED");
    expect(codes(pr)).toContain("changes_requested");
    pr.facets.reviewDecision = facet("APPROVED");
    pr.facets.reviewThreads = facet([
      {
        id: "thread",
        resolved: false,
        outdated: false,
        url: "https://github.com/org/repo/pull/1#discussion_r123",
      },
    ]);
    const reasons = classifyPullRequest(pr, now);
    expect(reasons.find((r) => r.code === "threads_unresolved")?.url).toContain(
      "discussion_r123",
    );
    expect(codes(pr)).not.toContain("changes_requested");
  });
  it("keeps null mergeability unknown and reports a confirmed conflict separately", () => {
    const pr = pull();
    pr.facets.mergeability = facet({ mergeable: null, state: null });
    expect(codes(pr)).toContain("mergeability_unknown");
    expect(codes(pr)).not.toContain("conflict");
    pr.facets.mergeability = facet({ mergeable: false, state: "dirty" });
    expect(codes(pr)).toContain("conflict");
  });
  it("marks draft, required review and an explicit request separately", () => {
    const pr = pull();
    pr.draft = true;
    pr.reviewRequested = true;
    pr.facets.reviewDecision = facet("REVIEW_REQUIRED");
    expect(codes(pr)).toEqual(
      expect.arrayContaining(["draft", "review_required", "review_requested"]),
    );
  });
  it("does not call an empty observed check set passed", () => {
    expect(codes(pull())).toContain("no_checks");
  });
  it.each([
    [61, "normal", false],
    [76, "normal", true],
    [16, "polling_pilot", true],
  ] as const)("uses source age %s minutes in %s mode", (age, mode, stale) => {
    const pr = pull();
    for (const key of Object.keys(pr.facets) as Array<keyof typeof pr.facets>)
      pr.facets[key] = facet(pr.facets[key]!.value, age);
    expect(codes(pr, mode).includes("data_stale")).toBe(stale);
  });
  it("shows source failure immediately despite a fresh last-known value", () => {
    const pr = pull();
    pr.facets.checks = {
      ...facet([check(1, "success")]),
      coverage: "partial",
      errorCode: "http_403",
    };
    expect(codes(pr)).toContain("data_incomplete");
  });
  it("merged and closed PRs leave open attention without implying deployment", () => {
    const pr = pull();
    pr.facets.checks = facet([check(1, "failure")]);
    pr.lifecycle = "merged";
    pr.mergedAt = "2026-10-20T11:00:00Z";
    expect(classifyPullRequest(pr, now)).toEqual([]);
    pr.lifecycle = "closed";
    pr.mergedAt = null;
    expect(classifyPullRequest(pr, now)).toEqual([]);
  });
});
it("marks conflicting suites unknown without a proven common workflow identity", () => {
  const pr = pull();
  pr.facets.checks = facet([
    check(1, "failure"),
    {
      ...check(2, "success", "completed", "2026-10-20T11:30:00Z"),
      suiteId: 99,
    },
  ]);
  expect(codes(pr)).toContain("checks_unknown");
});
it("does not choose a winner from contradictory same-time reruns", () => {
  const pr = pull();
  pr.facets.checks = facet([check(1, "failure"), check(2, "success")]);
  expect(codes(pr)).toContain("checks_unknown");
});
