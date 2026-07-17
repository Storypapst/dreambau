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
  const selected: SelectedRunAccount[] = [];
  const used = new Set<string>();
  const missing: AccountShortage[] = [];

  for (const demand of demands) {
    const matches = available.filter((candidate) =>
      !used.has(candidate.accountId) && candidate.roles.includes(demand.role)
    );
    if (matches.length < demand.count) {
      missing.push({
        role: demand.role,
        requested: demand.count,
        available: matches.length
      });
      continue;
    }
    for (const candidate of matches.slice(0, demand.count)) {
      used.add(candidate.accountId);
      selected.push({ ...candidate, requestedRole: demand.role });
    }
  }

  return missing.length > 0
    ? { ok: false, missing }
    : { ok: true, accounts: selected };
}
