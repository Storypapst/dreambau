import { createHash } from "node:crypto";
import { z } from "zod";
import { orisoProvisioningRoles } from "./oriso-provisioning.js";

export const fixtureTemplateVersion = "synthetic-dev-v1" as const;
export const fixturePlanInputSchema = z.object({ templateVersion: z.literal(fixtureTemplateVersion) }).strict();
export const observationTtlMs = 15 * 60 * 1000;
export const clockSkewMs = 30_000;
const publicString = z.string().min(1).max(255).regex(/^[^\x00-\x1f\x7f-\x9f]+$/);
export const fixtureActorSchema = z.object({
  accountId: publicString, email: z.string().email().nullable(), requestedRole: publicString,
  role: z.enum(orisoProvisioningRoles).nullable(), accessRecordId: publicString.nullable(),
  recordExpiries: z.object({ mailbox: z.string().datetime().nullable(), access: z.string().datetime().nullable() }).strict().nullable(),
  selectors: z.object({ username: publicString, email: z.string().email(), identityId: publicString.optional() }).strict().nullable(),
  decision: z.enum(["fresh-candidate", "reference-pending-reconciliation", "blocked", "unknown"]),
  reason: z.enum(["not-observed", "mapping-invalid", "free-observed", "occupied-reconciliation-required", "identity-conflict", "observation-unknown", "observation-unavailable", "observation-time-invalid", "dispatch-budget-exhausted"]),
  observedAt: z.string().datetime().nullable(),
  counts: z.object({ identities: z.number().int().min(0).max(20), facts: z.number().int().min(0).max(80) }).strict()
}).strict();
export type FixtureActor = z.infer<typeof fixtureActorSchema>;
export const fixturePlanSchema = z.object({
  id: z.string().uuid(), runId: publicString, revision: z.number().int().positive(),
  templateVersion: z.literal(fixtureTemplateVersion), targetOrigin: z.literal("https://dev.oriso.org"),
  snapshotHash: z.string().regex(/^[a-f0-9]{64}$/), authorityHash: z.string().regex(/^[a-f0-9]{64}$/),
  snapshot: z.object({
    run: z.object({ id: publicString, project: z.literal("oriso"), targetEnvironment: z.literal("dev"), poolEnvironment: z.enum(["local", "pre-dev", "dev", "production-test"]), applicationVersion: publicString, commitSha: publicString, scenario: publicString, status: z.enum(["reserved", "running", "passed", "failed"]), requestedAccounts: z.number().int().min(1).max(180), createdAt: z.string().datetime() }).strict(),
    leases: z.array(z.object({ accountId: publicString, leasedAt: z.string().datetime(), expiresAt: z.string().datetime().nullable() }).strict()).min(1).max(180),
    authorityHash: z.string().regex(/^[a-f0-9]{64}$/), templateVersion: z.literal(fixtureTemplateVersion), actors: z.array(fixtureActorSchema).min(1).max(180) }).strict(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.string().datetime(), observedAt: z.string().datetime().nullable(), expiresAt: z.string().datetime(),
  actors: z.array(fixtureActorSchema).min(1).max(180),
  inspectionComplete: z.boolean(), applyReady: z.literal(false),
  blockers: z.tuple([z.literal("native-creation-receipts-required"), z.literal("authoritative-role-hierarchy-reconciliation-required"), z.literal("tenant-scoped-catalogue-required")]),
  counts: z.object({ total: z.number().int().min(1).max(180), observed: z.number().int().min(0).max(180), unknown: z.number().int().min(0).max(180), blocked: z.number().int().min(0).max(180) }).strict(),
  hierarchy: z.object({ tenant: z.object({ name: z.string().min(1).max(40), subdomain: z.string().regex(/^[a-z0-9-]+$/) }).strict(), agency: z.object({ name: publicString, status: z.literal("unresolved"), required: z.tuple([z.literal("tenant-native-receipt"), z.literal("consulting-type-catalogue"), z.literal("team-agency-choice"), z.literal("external-choice"), z.literal("conditional-demographics")]) }).strict() }).strict()
}).strict();
export type FixturePlan = z.infer<typeof fixturePlanSchema>;
export type FixturePlanView = FixturePlan & { usability: "current" | "expired" | "run-changed" | "mapping-changed" | "superseded" | "mapping-unavailable" };
export function publicHash(value: unknown): string {
  const canonical = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(canonical);
    if (item !== null && typeof item === "object") return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)]));
    return item;
  };
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
export class FixturePlanConflict extends Error { constructor() { super("run_changed"); } }

export class FixtureMappingChangedError extends Error { constructor() { super("mapping_changed"); } }
