import { describe, expect, it, vi } from "vitest";
import { commentMarker, escapeMarkdown, hasMarker, renderComment } from "../../src/evidence/cli/comment.js";
import { findRunComment, GitHubError, upsertRunComment, type GhRunner } from "../../src/evidence/cli/github.js";
import type { EvidenceFile, EvidenceRun } from "../../src/evidence/model.js";

const run: EvidenceRun = {
  schemaVersion: 1,
  id: "run-1",
  publicId: "abcdefghjkmnpqrstuvwxyz23456782",
  project: "oriso",
  repository: "OpenResilienceInitiative/ORISO-E2E",
  pullRequestNumber: 42,
  pullRequestUrl: "https://github.com/OpenResilienceInitiative/ORISO-E2E/pull/42",
  commitSha: "abc1234def",
  environment: "pre-dev",
  title: "Money path",
  result: "PASS",
  source: "codex",
  createdAt: "2026-07-22T09:00:00.000Z",
  publishedAt: "2026-07-22T09:02:00.000Z",
  githubCommentUrl: null,
  state: "published"
};

function file(overrides: Partial<EvidenceFile> = {}): EvidenceFile {
  return {
    id: "file-1",
    runId: "run-1",
    kind: "screenshot",
    filename: "redirect.png",
    caption: "Invitation redirect",
    contentType: "image/png",
    byteSize: 100,
    sha256: "a".repeat(64),
    publicUrl: "https://evidence.dreambau.com/e/abcdefghjkmnpqrstuvwxyz23456782/file-1/redirect.png",
    viewerUrl: "https://evidence.dreambau.com/r/abcdefghjkmnpqrstuvwxyz23456782",
    processingState: "ready",
    ...overrides
  };
}

const render = (files: EvidenceFile[]) =>
  renderComment({ run, files, publicBaseUrl: "https://evidence.dreambau.com" });

describe("renderComment", () => {
  it("carries the run marker and the summary table", () => {
    const body = render([file()]);
    expect(body).toContain(commentMarker("run-1"));
    expect(body).toContain("| PASS | Pre-Dev | `abc1234` | Codex |");
    expect(body).toContain("## Verification evidence");
  });

  it("embeds a screenshot so GitHub renders it inline", () => {
    expect(render([file()])).toContain(
      "![Invitation redirect](https://evidence.dreambau.com/e/abcdefghjkmnpqrstuvwxyz23456782/file-1/redirect.png)"
    );
  });

  it("links a video instead of embedding it", () => {
    const body = render([file({ kind: "video", filename: "flow.mp4", caption: "Full flow" })]);
    expect(body).toContain("[▶ Watch video](https://evidence.dreambau.com/r/abcdefghjkmnpqrstuvwxyz23456782)");
    expect(body).not.toContain("![Full flow]");
  });

  it("links a Playwright report on the isolated report route", () => {
    const body = render([file({ kind: "playwright-report", filename: "report.zip", caption: "Report" })]);
    expect(body).toContain(
      "[Playwright report](https://evidence.dreambau.com/reports/abcdefghjkmnpqrstuvwxyz23456782/file-1/index.html)"
    );
  });

  it("offers logs and traces as downloads", () => {
    const body = render([file({ kind: "log", filename: "run.log", caption: "Run log" })]);
    expect(body).toContain("[Download run\\.log]");
  });

  it("names the test user without any password material", () => {
    const body = render([file({
      primaryActor: {
        accountId: "oriso/pre-dev/e2e-consultant",
        username: "brave_otter",
        syntheticEmail: "brave.otter@oriso.org",
        role: "consultant"
      }
    })]);
    expect(body).toContain("Test user: `brave\\_otter` (`brave.otter@oriso.org`) — consultant");
    expect(body).not.toMatch(/password|secret|token/i);
  });

  it("says so plainly when a file has no public address", () => {
    const body = render([file({ publicUrl: null, viewerUrl: null, processingState: "rejected" })]);
    expect(body).toContain("is not publicly reachable");
    expect(body).not.toContain("![");
  });

  it("neutralises markdown and html in a caption", () => {
    const body = render([file({ caption: "](https://evil.example) <img src=x onerror=alert(1)>" })]);
    // Every dangerous character survives only in its escaped form.
    expect(body).toContain("\\<img");
    expect(body).not.toMatch(/(^|[^\\])<img/);
    expect(body).not.toMatch(/(^|[^\\])\]\(https:\/\/evil\.example\)/);
  });
});

describe("escapeMarkdown", () => {
  it("escapes link, emphasis and html characters and collapses newlines", () => {
    expect(escapeMarkdown("a [b](c) *d* <e>\nf")).toBe("a \\[b\\]\\(c\\) \\*d\\* \\<e\\> f");
  });
});

describe("comment markers", () => {
  it("only matches its own run", () => {
    const body = render([file()]);
    expect(hasMarker(body, "run-1")).toBe(true);
    expect(hasMarker(body, "run-2")).toBe(false);
  });
});

describe("upsertRunComment", () => {
  const listed = (bodies: Array<{ id: number; body: string }>) =>
    bodies.map((entry) => JSON.stringify({ ...entry, html_url: `https://github.com/a/b#issuecomment-${entry.id}` })).join("\n");

  it("creates a comment when the run has none", () => {
    const gh = vi.fn<GhRunner>((args) => {
      if (args[1] === "--paginate") return { code: 0, stdout: listed([]), stderr: "" };
      return { code: 0, stdout: JSON.stringify({ id: 7, body: "x", html_url: "https://github.com/a/b#issuecomment-7" }), stderr: "" };
    });
    const result = upsertRunComment({ gh, repository: "a/b", pullRequestNumber: 42, runId: "run-1", body: "body" });
    expect(result.created).toBe(true);
    expect(gh.mock.calls[1][0]).toEqual(expect.arrayContaining(["--method", "POST"]));
  });

  it("updates the run's own comment instead of adding a second one", () => {
    const gh = vi.fn<GhRunner>((args) => {
      if (args[1] === "--paginate") {
        return {
          code: 0,
          stdout: listed([
            { id: 5, body: "unrelated review note" },
            { id: 6, body: `${commentMarker("run-1")}\n\nold body` }
          ]),
          stderr: ""
        };
      }
      return { code: 0, stdout: JSON.stringify({ id: 6, body: "new", html_url: "https://github.com/a/b#issuecomment-6" }), stderr: "" };
    });
    const result = upsertRunComment({ gh, repository: "a/b", pullRequestNumber: 42, runId: "run-1", body: "new body" });
    expect(result.created).toBe(false);
    expect(result.comment.id).toBe(6);
    expect(gh.mock.calls[1][0]).toEqual(expect.arrayContaining(["--method", "PATCH", "repos/a/b/issues/comments/6"]));
  });

  it("passes the body on stdin so it never reaches the process list", () => {
    const gh = vi.fn<GhRunner>((args) => args[1] === "--paginate"
      ? { code: 0, stdout: "", stderr: "" }
      : { code: 0, stdout: JSON.stringify({ id: 1, body: "b", html_url: "https://github.com/a/b#issuecomment-1" }), stderr: "" });
    upsertRunComment({ gh, repository: "a/b", pullRequestNumber: 42, runId: "run-1", body: "secret free body" });
    const [args, input] = gh.mock.calls[1];
    expect(args).toContain("--input");
    expect(args).toContain("-");
    expect(args.join(" ")).not.toContain("secret free body");
    expect(JSON.parse(String(input))).toEqual({ body: "secret free body" });
  });

  it("reports a GitHub failure instead of pretending the comment exists", () => {
    const gh = vi.fn<GhRunner>(() => ({ code: 1, stdout: "", stderr: "HTTP 403" }));
    expect(() => upsertRunComment({ gh, repository: "a/b", pullRequestNumber: 42, runId: "run-1", body: "b" }))
      .toThrow(GitHubError);
  });

  it("finds nothing when no comment carries the marker", () => {
    const gh = vi.fn<GhRunner>(() => ({ code: 0, stdout: listed([{ id: 5, body: "unrelated" }]), stderr: "" }));
    expect(findRunComment(gh, "a/b", 42, "run-1")).toBeNull();
  });
});
