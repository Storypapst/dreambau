import { z } from "zod";
import type { CommandResult } from "./git.js";
import { commentMarker } from "./comment.js";

/**
 * All GitHub work goes through `gh`, so the pipeline never holds a token of its
 * own: locally that is the developer's `gh auth login`, in CI the workflow's
 * `GITHUB_TOKEN`. Comment bodies travel on stdin, never in argv, so they cannot
 * appear in a process listing.
 */
export interface GhRunner {
  (args: string[], input?: string): CommandResult;
}

export class GitHubError extends Error {}

const commentSchema = z.object({
  id: z.number().int().positive(),
  body: z.string(),
  html_url: z.string()
});

export interface ExistingComment {
  id: number;
  url: string;
}

function parseNdjson(stdout: string): Array<z.infer<typeof commentSchema>> {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .flatMap((line) => {
      const parsed = commentSchema.safeParse(JSON.parse(line));
      return parsed.success ? [parsed.data] : [];
    });
}

export function findRunComment(
  gh: GhRunner,
  repository: string,
  pullRequestNumber: number,
  runId: string
): ExistingComment | null {
  const result = gh([
    "api", "--paginate",
    `repos/${repository}/issues/${pullRequestNumber}/comments`,
    "--jq", ".[] | {id: .id, body: .body, html_url: .html_url}"
  ]);
  if (result.code !== 0) throw new GitHubError(`could not read pull request comments: ${result.stderr.trim()}`);
  const marker = commentMarker(runId);
  const match = parseNdjson(result.stdout).find((comment) => comment.body.includes(marker));
  return match ? { id: match.id, url: match.html_url } : null;
}

function writeComment(gh: GhRunner, args: string[], body: string): ExistingComment {
  const result = gh(args, JSON.stringify({ body }));
  if (result.code !== 0) throw new GitHubError(`GitHub rejected the evidence comment: ${result.stderr.trim()}`);
  const parsed = commentSchema.safeParse(JSON.parse(result.stdout || "{}"));
  if (!parsed.success) throw new GitHubError("GitHub returned an unexpected comment payload");
  return { id: parsed.data.id, url: parsed.data.html_url };
}

/**
 * Idempotent by run id: the same run always updates its own comment, while a
 * different run on the same pull request gets a comment of its own.
 */
export function upsertRunComment(options: {
  gh: GhRunner;
  repository: string;
  pullRequestNumber: number;
  runId: string;
  body: string;
}): { comment: ExistingComment; created: boolean } {
  const existing = findRunComment(options.gh, options.repository, options.pullRequestNumber, options.runId);
  if (existing) {
    return {
      comment: writeComment(
        options.gh,
        ["api", "--method", "PATCH", `repos/${options.repository}/issues/comments/${existing.id}`, "--input", "-"],
        options.body
      ),
      created: false
    };
  }
  return {
    comment: writeComment(
      options.gh,
      ["api", "--method", "POST", `repos/${options.repository}/issues/${options.pullRequestNumber}/comments`, "--input", "-"],
      options.body
    ),
    created: true
  };
}
