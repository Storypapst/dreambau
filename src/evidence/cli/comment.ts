import type { EvidenceFile, EvidenceRun } from "../model.js";

export const commentMarkerPrefix = "dreambau-pr-evidence:v1";

export function commentMarker(runId: string): string {
  return `<!-- ${commentMarkerPrefix} run=${runId} -->`;
}

/** Matches this run's marker only, so two runs on one PR keep separate comments. */
export function hasMarker(body: string, runId: string): boolean {
  return body.includes(commentMarker(runId));
}

const environmentLabels: Record<EvidenceRun["environment"], string> = {
  local: "Local",
  "pre-dev": "Pre-Dev",
  dev: "Dev",
  "production-test": "Production test"
};

const sourceLabels: Record<EvidenceRun["source"], string> = {
  codex: "Codex",
  claude: "Claude",
  kio: "Kio",
  "github-actions": "GitHub Actions",
  obs: "OBS",
  cap: "Cap",
  manual: "Manual"
};

/**
 * Captions are author-supplied text that lands in a GitHub comment, so every
 * markdown control character is neutralised before it gets there.
 */
export function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_{}[\]()#+\-.!|<>]/g, (character) => `\\${character}`).replace(/\s+/g, " ").trim();
}

function actorLine(file: EvidenceFile): string | null {
  if (!file.primaryActor) return null;
  const actor = file.primaryActor;
  return `Test user: \`${escapeMarkdown(actor.username)}\` (\`${actor.syntheticEmail}\`) — ${escapeMarkdown(actor.role)}`;
}

function fileSection(file: EvidenceFile, run: EvidenceRun, reportBaseUrl: string): string[] {
  const heading = escapeMarkdown(file.caption || file.filename);
  const lines = [`### ${heading}`, ""];
  const actor = actorLine(file);
  if (actor) lines.push(actor, "");

  if (!file.publicUrl) {
    lines.push(`_${escapeMarkdown(file.filename)} is not publicly reachable._`, "");
    return lines;
  }
  if (file.kind === "screenshot") {
    lines.push(`![${heading}](${file.publicUrl})`, "");
    return lines;
  }
  if (file.kind === "video") {
    lines.push(`[▶ Watch video](${file.viewerUrl ?? file.publicUrl})`, "");
    return lines;
  }
  if (file.kind === "playwright-report") {
    lines.push(`[Playwright report](${reportBaseUrl}/reports/${run.publicId}/${file.id}/index.html)`, "");
    return lines;
  }
  lines.push(`[Download ${escapeMarkdown(file.filename)}](${file.publicUrl})`, "");
  return lines;
}

export interface RenderCommentOptions {
  run: EvidenceRun;
  files: EvidenceFile[];
  /** Base for the isolated report route; defaults to the run's own host. */
  publicBaseUrl: string;
}

export function renderComment({ run, files, publicBaseUrl }: RenderCommentOptions): string {
  const base = publicBaseUrl.replace(/\/$/, "");
  const lines = [
    commentMarker(run.id),
    "",
    "## Verification evidence",
    "",
    "| Result | Environment | Commit | Source |",
    "|---|---|---|---|",
    `| ${run.result} | ${environmentLabels[run.environment]} | \`${run.commitSha.slice(0, 7)}\` | ${sourceLabels[run.source]} |`,
    ""
  ];
  if (files.length === 0) lines.push("_No evidence files._", "");
  for (const file of files) lines.push(...fileSection(file, run, base));
  if (run.publicId) lines.push(`[All evidence for this run](${base}/r/${run.publicId})`, "");
  return `${lines.join("\n").trimEnd()}\n`;
}
