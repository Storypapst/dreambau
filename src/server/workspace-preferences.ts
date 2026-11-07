import { z } from "zod";
import type { WorkspacePreferences } from "../shared/workspace-preferences.js";
import type { HumanUser } from "./passkey-store.js";
import type { HumanProjectGrant } from "./human-grants.js";
const filters = z.object({ source: z.enum(["all", "test-run", "evidence-run"]), environment: z.enum(["all", "local", "pre-dev", "dev", "production-test"]) }).strict();
export const workspacePreferencesSchema = z.object({ rememberFilters: z.boolean().default(true), refreshMinutes: z.union([z.literal(0), z.literal(15), z.literal(60)]).default(15), filtersByProject: z.object({ oriso: filters.optional(), orimo: filters.optional(), dreambau: filters.optional() }).strict().default({}) }).strict();
export function clampWorkspacePreferences(value: unknown, user: HumanUser, grants: HumanProjectGrant[]): WorkspacePreferences | null {
  if (value == null) return null;
  const parsed = workspacePreferencesSchema.safeParse(value); if (!parsed.success) return null;
  const filtersByProject: WorkspacePreferences["filtersByProject"] = {};
  for (const project of ["oriso", "orimo", "dreambau"] as const) {
    const saved = parsed.data.filtersByProject[project]; const grant = grants.find(item => item.project === project);
    if (!saved || !user.projects.includes(project) || !grant?.environments.length) continue;
    filtersByProject[project] = { ...saved, environment: saved.environment === "all" || grant.environments.includes(saved.environment) ? saved.environment : "all" };
  }
  return { ...parsed.data, filtersByProject };
}
