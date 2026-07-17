import { z } from "zod";

export const roleDemandSchema = z.object({
  role: z.string().trim().min(1).max(60),
  count: z.number().int().positive().max(180)
}).strict();

export const createRunInputSchema = z.object({
  project: z.enum(["oriso", "orimo", "dreambau"]),
  targetEnvironment: z.enum(["local", "pre-dev", "dev", "production-test"]),
  poolEnvironment: z.enum(["local", "pre-dev", "dev", "production-test"]),
  applicationVersion: z.string().trim().min(1).max(40),
  commitSha: z.string().regex(/^[a-f0-9]{7,64}$/i),
  scenario: z.string().regex(/^[a-z0-9][a-z0-9-]{1,79}$/),
  roles: z.array(roleDemandSchema).min(1).max(20)
}).strict().superRefine((input, context) => {
  const roles = new Set<string>();
  for (const demand of input.roles) {
    if (roles.has(demand.role)) {
      context.addIssue({
        code: "custom",
        path: ["roles"],
        message: "duplicate role demand"
      });
    }
    roles.add(demand.role);
  }
});
export type CreateRunInput = z.infer<typeof createRunInputSchema>;

export interface RoleDemand {
  role: string;
  count: number;
}

export interface PoolCandidate {
  accountId: string;
  email: string | null;
  roles: string[];
}

export interface SelectedRunAccount extends PoolCandidate {
  requestedRole: string;
}

export interface AccountShortage {
  role: string;
  requested: number;
  available: number;
}

export type AccountSelection =
  | { ok: true; accounts: SelectedRunAccount[] }
  | { ok: false; missing: AccountShortage[] };

export const runStatuses = ["reserved", "running", "passed", "failed", "released"] as const;
export type RunStatus = typeof runStatuses[number];

const runTransitions: Record<RunStatus, RunStatus[]> = {
  reserved: ["running", "released"],
  running: ["passed", "failed"],
  passed: ["released"],
  failed: ["released"],
  released: []
};

export function assertRunTransition(from: RunStatus, to: RunStatus): void {
  if (!runTransitions[from].includes(to)) {
    throw new Error(`invalid run transition: ${from} -> ${to}`);
  }
}

export function selectRunAccounts(
  demands: RoleDemand[],
  candidates: PoolCandidate[],
  leasedAccountIds: Set<string>
): AccountSelection {
  const available = candidates
    .filter((candidate) => !leasedAccountIds.has(candidate.accountId))
    .sort((left, right) => left.accountId.localeCompare(right.accountId));
  const slots = demands.flatMap((demand) =>
    Array.from({ length: demand.count }, () => demand.role)
  );
  const candidateToSlot = new Array<number>(available.length).fill(-1);
  const slotToCandidate = new Array<number>(slots.length).fill(-1);

  function augment(slotIndex: number, visitedCandidates: Set<number>): boolean {
    for (let candidateIndex = 0; candidateIndex < available.length; candidateIndex += 1) {
      const candidate = available[candidateIndex];
      if (visitedCandidates.has(candidateIndex) || !candidate.roles.includes(slots[slotIndex])) continue;
      visitedCandidates.add(candidateIndex);
      const previousSlot = candidateToSlot[candidateIndex];
      if (previousSlot === -1 || augment(previousSlot, visitedCandidates)) {
        candidateToSlot[candidateIndex] = slotIndex;
        slotToCandidate[slotIndex] = candidateIndex;
        return true;
      }
    }
    return false;
  }

  let maximumAssigned = 0;
  for (let slotIndex = slots.length - 1; slotIndex >= 0; slotIndex -= 1) {
    if (!augment(slotIndex, new Set())) break;
    maximumAssigned += 1;
  }
  if (maximumAssigned === slots.length) {
    return {
      ok: true,
      accounts: slots.map((role, slotIndex) => ({
        ...available[slotToCandidate[slotIndex]],
        requestedRole: role
      }))
    };
  }
  const missing = demands.flatMap((demand) => {
    const matching = available.filter((candidate) => candidate.roles.includes(demand.role)).length;
    return matching < demand.count
      ? [{ role: demand.role, requested: demand.count, available: matching }]
      : [];
  });
  return {
    ok: false,
    missing: missing.length > 0
      ? missing
      : [{ role: "cohort", requested: slots.length, available: maximumAssigned }]
  };
}
