import { z } from "zod";

export const evidenceProjects = ["oriso", "orimo", "dreambau"] as const;
export const evidenceEnvironments = ["local", "pre-dev", "dev", "production-test"] as const;
export const evidenceKinds = [
  "screenshot",
  "video",
  "playwright-report",
  "trace",
  "log",
  "document",
  "other"
] as const;
export const evidenceResults = ["PASS", "FAIL", "FLAKY", "BLOCKED", "INFORMATIONAL"] as const;
export const evidenceStates = ["draft", "processing", "quarantined", "published", "archived"] as const;
export const evidenceSources = ["codex", "claude", "kio", "github-actions", "obs", "cap", "manual"] as const;
export const fileProcessingStates = ["pending", "ready", "rejected"] as const;

export type EvidenceProject = typeof evidenceProjects[number];
export type EvidenceEnvironment = typeof evidenceEnvironments[number];
export type EvidenceKind = typeof evidenceKinds[number];
export type EvidenceResult = typeof evidenceResults[number];
export type EvidenceState = typeof evidenceStates[number];
export type EvidenceSource = typeof evidenceSources[number];
export type FileProcessingState = typeof fileProcessingStates[number];

export const evidenceSchemaVersion = 1;

/** `owner/repo` as GitHub spells it; the CLI never sends a URL in this field. */
export const repositorySchema = z.string().regex(/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/, "repository must be owner/repo");
export const commitShaSchema = z.string().regex(/^[a-f0-9]{7,64}$/i, "commitSha must be a hex commit id");

const controlCharacters = new RegExp("[\\u0000-\\u001f\\u007f]");
const captionText = (max: number) => z.string().trim().max(max).refine(
  (value) => !controlCharacters.test(value),
  "control characters are not allowed"
);

export const primaryActorSchema = z.object({
  accountId: z.string().trim().min(1).max(240),
  username: z.string().trim().min(1).max(120),
  syntheticEmail: z.string().email().max(240),
  role: z.string().trim().min(1).max(60)
}).strict();
export type PrimaryActor = z.infer<typeof primaryActorSchema>;

export const createRunInputSchema = z.object({
  project: z.enum(evidenceProjects),
  repository: repositorySchema,
  pullRequestNumber: z.number().int().positive().max(1_000_000).nullable().default(null),
  commitSha: commitShaSchema,
  environment: z.enum(evidenceEnvironments),
  title: captionText(200).pipe(z.string().min(1)),
  result: z.enum(evidenceResults),
  source: z.enum(evidenceSources)
}).strict();
export type CreateRunInput = z.infer<typeof createRunInputSchema>;

export interface EvidenceRun {
  schemaVersion: typeof evidenceSchemaVersion;
  id: string;
  publicId: string | null;
  project: EvidenceProject;
  repository: string;
  pullRequestNumber: number | null;
  pullRequestUrl: string | null;
  commitSha: string;
  environment: EvidenceEnvironment;
  title: string;
  result: EvidenceResult;
  source: EvidenceSource;
  createdAt: string;
  publishedAt: string | null;
  githubCommentUrl: string | null;
  state: EvidenceState;
}

export interface EvidenceFile {
  id: string;
  runId: string;
  kind: EvidenceKind;
  filename: string;
  caption: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  primaryActor?: PrimaryActor;
  publicUrl: string | null;
  viewerUrl: string | null;
  processingState: FileProcessingState;
}

export const initFileInputSchema = z.object({
  kind: z.enum(evidenceKinds),
  filename: z.string().min(1).max(180),
  caption: captionText(400).default(""),
  contentType: z.string().trim().min(1).max(120),
  byteSize: z.number().int().nonnegative().max(2 * 1024 * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  primaryActor: primaryActorSchema.optional()
}).strict();
export type InitFileInput = z.infer<typeof initFileInputSchema>;

export const publishInputSchema = z.object({
  pullRequestNumber: z.number().int().positive().max(1_000_000),
  repository: repositorySchema,
  commitSha: commitShaSchema
}).strict();
export type PublishInput = z.infer<typeof publishInputSchema>;

export const githubReferenceSchema = z.object({
  githubCommentUrl: z.string().url().max(400).refine(
    (value) => new URL(value).hostname === "github.com",
    "githubCommentUrl must point at github.com"
  )
}).strict();

export function pullRequestUrl(repository: string, pullRequestNumber: number | null): string | null {
  return pullRequestNumber === null ? null : `https://github.com/${repository}/pull/${pullRequestNumber}`;
}

const runTransitions: Record<EvidenceState, EvidenceState[]> = {
  draft: ["processing", "quarantined", "archived"],
  processing: ["draft", "published", "quarantined"],
  published: ["archived"],
  quarantined: ["archived"],
  archived: []
};

export class InvalidRunTransitionError extends Error {
  constructor(readonly from: EvidenceState, readonly to: EvidenceState) {
    super(`invalid evidence run transition: ${from} -> ${to}`);
  }
}

export function assertRunTransition(from: EvidenceState, to: EvidenceState): void {
  if (!runTransitions[from].includes(to)) throw new InvalidRunTransitionError(from, to);
}

/** A run only ever becomes publicly reachable while it is published. */
export function isPubliclyReachable(state: EvidenceState): boolean {
  return state === "published";
}
