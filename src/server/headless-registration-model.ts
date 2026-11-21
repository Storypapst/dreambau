import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import type { TestRun } from "./test-run-store.js";

const stableId = z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._:@/+!-]*$/);
const actorId = z.string().regex(/^oriso\/dev\/[a-z0-9][a-z0-9._-]{0,127}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const approvalSchema = z.object({
  runId: z.uuid(),
  machineId: stableId,
  approvedBy: stableId,
  commitSha: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/),
  expiresAt: z.iso.datetime(),
  askerMailboxId: stableId,
  counsellorMailboxId: stableId,
  counsellorAccountId: actorId,
  fixture: z.object({
    agencyId: z.number().int().positive(),
    topicId: z.number().int().positive(),
    consultingType: z.number().int().nonnegative(),
    postcode: z.string().regex(/^\d{5}$/)
  }).strict(),
  onlySignedDevices: z.boolean()
}).strict().refine(value => value.askerMailboxId !== value.counsellorMailboxId);
const approvalsSchema = z.array(approvalSchema).max(180)
  .refine(approvals => new Set(approvals.map(approval => approval.runId)).size === approvals.length);
export const headlessClaimInput = z.object({ bindingHash: hash }).strict();
export const headlessOutcomeInput = z.object({ result: z.enum(["created", "uncertain"]) }).strict();
export const headlessResourceId = z.uuid();

export type HeadlessApproval = z.infer<typeof approvalSchema>;
export type HeadlessOutcome = z.infer<typeof headlessOutcomeInput>["result"];

export function isHeadlessDevRun(run: TestRun): boolean {
  return run.project === "oriso" && run.targetEnvironment === "dev" && run.scenario === "headless-counselling";
}

export class HeadlessRegistrationError extends Error {
  constructor(readonly code: string, readonly status: 404 | 409 | 503 = 409) { super(code); }
}

export function readHeadlessApproval(file: string | null, runId: string, machineId: string, now: Date): HeadlessApproval {
  let approvals: HeadlessApproval[] = [];
  if (file) {
    try {
      approvals = approvalsSchema.parse(JSON.parse(readFileSync(file, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new HeadlessRegistrationError("approval_unavailable", 503);
      }
    }
  }
  const approval = approvals.find(item => item.runId === runId && item.machineId === machineId);
  if (!approval || Date.parse(approval.expiresAt) <= now.getTime()) {
    throw new HeadlessRegistrationError("approval_required", 404);
  }
  return approval;
}

export function headlessAskerUsername(runId: string): string {
  return `ai-load-${createHash("sha256").update(runId).digest("hex").slice(0, 10)}-asker`;
}
