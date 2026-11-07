import { readFileSync } from "node:fs";
import { z } from "zod";
const project = z.enum(["oriso", "orimo", "dreambau"]);
const board = z.object({ projectId: z.string().min(1).max(200), title: z.string().min(1).max(200), url: z.string().url().refine(value => /^https:\/\/github\.com\/(orgs\/[^/]+|users\/[^/]+)\/projects\/\d+$/.test(value)), statusField: z.string().min(1).max(100), releaseField: z.string().min(1).max(100).optional() }).strict();
const repository = z.object({ fullName: z.string().regex(/^[\w.-]+\/[\w.-]+$/), project, boards: z.array(board).max(3).default([]) }).strict();
export type WorkspaceGithubRepository = z.infer<typeof repository>;
const config = z.object({ appId: z.string().regex(/^\d+$/), privateKeyFile: z.string().startsWith("/"), installations: z.array(z.object({ installationId: z.string().regex(/^\d+$/), repositories: z.array(repository).min(1).max(100) }).strict()).min(1).max(10) }).strict().superRefine((value, ctx) => {
  const names = new Set<string>(); const ids = new Set<string>();
  for (const installation of value.installations) {
    if (ids.has(installation.installationId)) ctx.addIssue({ code: "custom", message: "duplicate_installation" });
    ids.add(installation.installationId); const owners = new Set<string>();
    for (const repo of installation.repositories) { const name = repo.fullName.toLowerCase(); if (names.has(name)) ctx.addIssue({ code: "custom", message: "duplicate_repository" }); names.add(name); owners.add(name.split("/")[0]); }
    if (owners.size !== 1) ctx.addIssue({ code: "custom", message: "installation_owner_mismatch" });
  }
});
export type WorkspaceGithubConfig = z.infer<typeof config>;
export function parseWorkspaceGithubConfig(value: unknown): WorkspaceGithubConfig { return config.parse(value); }
export function loadWorkspaceGithubConfig(file: string): WorkspaceGithubConfig {
  try { return parseWorkspaceGithubConfig(JSON.parse(readFileSync(file, "utf8"))); }
  catch { throw new Error("invalid_workspace_github_configuration"); }
}
