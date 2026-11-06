import { z } from "zod";

export const identifierSchema = z.string().trim().min(1).max(200);
export const projectSchema = z.literal("oriso");
export const scopeSchema = z.object({ project: projectSchema, actorId: identifierSchema });
/** repositoryIds, if supplied by an internal caller, never constitute grants. */
export type RepoScope = z.infer<typeof scopeSchema>;
const text = z.string().max(16_384);
const timestamp = z.iso.datetime();
export const safeUrlSchema = z.string().url().max(2048).refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password &&
    ![...url.searchParams.keys()].some((key) => /token|secret|password|credential|authorization|api.?key/i.test(key));
}, "https_url_without_credentials_required");
export const repositorySchema = z.object({
  id: identifierSchema, project: projectSchema,
  fullName: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
  integrationBranch: z.string().min(1).max(255), active: z.boolean().default(true)
}).strict();
export type RepositoryInput = z.input<typeof repositorySchema>;
export const repositoryGrantSchema = z.object({ actorId: identifierSchema, project: projectSchema, repositoryId: identifierSchema, allowed: z.boolean() }).strict();
export const internalGrantSchema = repositoryGrantSchema.omit({ repositoryId: true });
export const linkSchema = z.object({
  repositoryId: identifierSchema, kind: z.enum(["repository", "pull", "issue"]), number: z.number().int().positive().optional()
}).strict().refine((value) => value.kind === "repository" ? value.number === undefined : value.number !== undefined, "link_number_required_only_for_issue_or_pull");
export type WorkItemLinkInput = z.infer<typeof linkSchema>;
export const workItemSchema = z.object({
  goal: text.min(1), links: z.array(linkSchema).max(100), owner: identifierSchema.nullable().default(null),
  priority: z.enum(["P0", "P1", "P2", "P3"]).nullable().default(null),
  state: z.enum(["open", "in_progress", "blocked", "done"]).default("open")
}).strict();
export type WorkItemInput = z.input<typeof workItemSchema>;
export const checkpointSchema = z.object({
  expectedVersion: z.number().int().positive(), goal: text.min(1), branch: z.string().max(255).nullable().optional(),
  commit: z.string().max(255).nullable().optional(), lastVerifiedAction: text,
  blockers: z.array(z.string().max(4096)).max(100), nextAction: text,
  evidenceLinks: z.array(safeUrlSchema).max(100), optionalSessionUrl: safeUrlSchema.nullable().optional(),
  optionalMachineCheckoutHint: z.string().max(2048).nullable().optional()
}).strict();
export type CheckpointInput = z.infer<typeof checkpointSchema>;
export const linksUpdateSchema = z.object({ expectedVersion: z.number().int().positive(), links: z.array(linkSchema).max(100) }).strict();
export const facetSchema = z.object({
  source: z.literal("github").default("github"),
  value: z.json().nullable(), sourceRevision: z.string().max(255).nullable(), observedAt: timestamp.nullable(),
  lastAttemptAt: timestamp.nullable(), lastSuccessAt: timestamp.nullable(),
  coverage: z.enum(["complete", "partial", "unknown"]), errorCode: z.string().regex(/^[a-zA-Z0-9_.:-]{1,100}$/).nullable()
}).strict();
export type Facet = z.infer<typeof facetSchema>;
const facetsSchema = z.object({ checks: facetSchema.optional(), statuses: facetSchema.optional(), reviewDecision: facetSchema.optional(), reviewThreads: facetSchema.optional(), mergeability: facetSchema.optional() }).strict();
export const pullRequestSchema = z.object({
  id: identifierSchema, number: z.number().int().positive(), url: safeUrlSchema, title: z.string().max(4096),
  author: identifierSchema.nullable(), base: z.string().min(1).max(255), head: z.string().min(1).max(255), headSha: z.string().min(1).max(255),
  lifecycle: z.enum(["open", "closed", "merged"]), draft: z.boolean(), mergedAt: timestamp.nullable(), facets: facetsSchema
}).strict().refine((pr) => pr.lifecycle === "merged" ? pr.mergedAt !== null : pr.mergedAt === null, "merged_time_must_match_lifecycle");
export type PullRequestSnapshot = z.infer<typeof pullRequestSchema>;
export const repositorySnapshotSchema = z.object({
  repositoryId: identifierSchema, fullName: repositorySchema.shape.fullName, collectedAt: timestamp,
  pullRequests: z.array(pullRequestSchema), closedCandidates: z.array(z.number().int().positive()),
  coveredPages: z.number().int().nonnegative(), complete: z.boolean(),
  errorCode: facetSchema.shape.errorCode.optional()
}).strict();
export type RepositorySnapshot = z.input<typeof repositorySnapshotSchema>;
export const pullQuerySchema = z.object({
  repositoryId: identifierSchema.optional(), lifecycle: z.enum(["open", "closed", "merged"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25), cursor: z.coerce.number().int().nonnegative().default(0)
}).strict();
export type PullQuery = z.input<typeof pullQuerySchema>;

export class WorkStateError extends Error {
  constructor(public readonly status: number, code: string) { super(code); this.name = "WorkStateError"; }
}
