import { z } from "zod";
import type { AccountRecord } from "./accounts.js";
import type { TestAccessRecord } from "./infisical-provider.js";
import { lifecycleStatuses, type MetadataPatch } from "./metadata.js";

const dashboardProjects = {
  oriso: "ORISO",
  orimo: "ORIMO",
  dreambau: "DREAMBAU"
} as const;

const catalogSyncInputSchema = z.object({
  applicationVersion: z.string().regex(/^\d+(\.\d+){0,2}$/),
  lifecycleStatus: z.enum(lifecycleStatuses).default("active"),
  topics: z.array(z.string().min(1)).default([]),
  notes: z.string().max(4000).default("")
}).strict();

export const accountAccessActions = [
  "catalog_sync",
  "secret_requested",
  "mail_requested",
  "otp_requested",
  "environment_requested",
  "browser_session_opened"
] as const;
export type AccountAccessAction = typeof accountAccessActions[number];

const accountAccessContextSchema = z.object({
  runId: z.string().min(1).max(100).optional(),
  applicationVersion: z.string().min(1).max(40).optional(),
  environment: z.enum(["local", "pre-dev", "dev", "production-test"]).optional()
}).strict();

export const accountAccessEventInputSchema = z.object({
  accountId: z.string().min(1).max(240),
  email: z.string().email(),
  actorId: z.string().min(1).max(160),
  action: z.enum(accountAccessActions),
  createdAt: z.string().datetime(),
  context: accountAccessContextSchema.default({})
}).strict();

export type AccountAccessEventInput = z.infer<typeof accountAccessEventInputSchema>;
export type AccountAccessEvent = AccountAccessEventInput & { id: number };
export interface AccountAccessSummary {
  latest: AccountAccessEvent | null;
  events: AccountAccessEvent[];
}

export interface LinkedTestAccount {
  id: string;
  project: TestAccessRecord["project"];
  environment: TestAccessRecord["environment"];
  kind: TestAccessRecord["kind"];
  displayName: string;
  username: string;
  email: string;
  roles: string[];
  loginUrl: string;
  hasTotp: boolean;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function recordPriority(record: TestAccessRecord) {
  if ((record.kind === "app-user" || record.kind === "admin") && record.totpSecret) return 0;
  if (record.kind === "app-user" || record.kind === "admin") return 1;
  if (record.kind === "mailbox") return 2;
  return 3;
}

export function linkedRecordsForEmail(email: string, records: TestAccessRecord[]): TestAccessRecord[] {
  const normalized = normalizeEmail(email);
  return records
    .filter((record) => record.email && normalizeEmail(record.email) === normalized)
    .sort((left, right) => recordPriority(left) - recordPriority(right) || left.id.localeCompare(right.id));
}

export function publicLinkedAccount(record: TestAccessRecord): LinkedTestAccount | null {
  if (!record.email) return null;
  return {
    id: record.id,
    project: record.project,
    environment: record.environment,
    kind: record.kind,
    displayName: record.displayName,
    username: record.username,
    email: record.email,
    roles: [...record.roles],
    loginUrl: record.loginUrl,
    hasTotp: Boolean(record.totpSecret)
  };
}

export function isKnownSyntheticEmail(email: string, accounts: AccountRecord[]) {
  const normalized = normalizeEmail(email);
  return accounts.some((account) => normalizeEmail(account.email) === normalized);
}

function dashboardRoles(roles: string[]) {
  const result = new Set<string>();
  if (roles.some((role) => role === "admin" || role === "platform-admin" || role.endsWith("-admin"))) result.add("Admin");
  if (roles.some((role) => role === "consultant" || role === "counselor")) result.add("Berater");
  if (roles.some((role) => role === "user" || role === "asker" || role === "client")) result.add("Ratsuchender");
  if (roles.some((role) => role === "tenant" || role === "carrier")) result.add("Träger");
  const order = ["Admin", "Berater", "Ratsuchender", "Träger"];
  return order.filter((role) => result.has(role));
}

export function derivedCatalogPatch(record: TestAccessRecord, input: unknown): {
  accountId: string;
  email: string;
  metadata: Pick<MetadataPatch, "shippedVersion" | "lifecycleStatus" | "project" | "roles" | "topics" | "notes">;
} {
  if (!record.email) throw new Error("test access record has no synthetic email");
  const parsed = catalogSyncInputSchema.parse(input);
  return {
    accountId: record.id,
    email: normalizeEmail(record.email),
    metadata: {
      shippedVersion: parsed.applicationVersion,
      lifecycleStatus: parsed.lifecycleStatus,
      project: dashboardProjects[record.project],
      roles: dashboardRoles(record.roles),
      topics: parsed.topics,
      notes: parsed.notes
    }
  };
}
