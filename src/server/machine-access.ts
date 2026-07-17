import { createHash, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";

const projects = ["oriso", "orimo", "dreambau"] as const;
const environments = ["local", "pre-dev", "dev", "production-test"] as const;
export const machineActions = [
  "accounts:read",
  "sessions:open",
  "runs:read",
  "runs:create",
  "runs:execute",
  "runs:cleanup"
] as const;
export type MachineAction = typeof machineActions[number];

export const machineIdentitySchema = z.object({
  id: z.string().min(1),
  tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
  projects: z.array(z.enum(projects)).min(1),
  environments: z.array(z.enum(environments)).min(1),
  actions: z.array(z.enum(machineActions)).min(1).optional(),
  expiresAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable()
}).strict();

export type MachineIdentity = z.infer<typeof machineIdentitySchema>;
export type TestProject = MachineIdentity["projects"][number];
export type TestEnvironment = MachineIdentity["environments"][number];

const legacyMachineActions: MachineAction[] = ["accounts:read", "sessions:open"];

export function machineCan(identity: MachineIdentity, action: MachineAction): boolean {
  return (identity.actions ?? legacyMachineActions).includes(action);
}

export function hashMachineToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function loadMachineIdentities(filePath: string): MachineIdentity[] {
  if (!filePath || !existsSync(filePath)) return [];
  return z.array(machineIdentitySchema).parse(JSON.parse(readFileSync(filePath, "utf8")));
}

export function authenticateMachineToken(
  token: string,
  identities: MachineIdentity[],
  now = new Date()
): MachineIdentity | null {
  if (!token) return null;
  const digest = Buffer.from(hashMachineToken(token), "hex");
  for (const identity of identities) {
    if (identity.revokedAt || new Date(identity.expiresAt) <= now) continue;
    const expected = Buffer.from(identity.tokenHash, "hex");
    if (expected.length === digest.length && timingSafeEqual(expected, digest)) return identity;
  }
  return null;
}
