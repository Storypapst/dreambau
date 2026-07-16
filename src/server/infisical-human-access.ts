import { z } from "zod";
import type { HumanProject } from "./passkey-store.js";

const authResponseSchema = z.object({
  accessToken: z.string().min(1),
  expiresIn: z.number().positive(),
  accessTokenMaxTTL: z.number().positive(),
  tokenType: z.literal("Bearer")
});
const membershipsResponseSchema = z.object({
  memberships: z.array(z.object({
    user: z.object({
    username: z.string().min(1),
      email: z.string().nullable().optional()
    }).passthrough(),
    roles: z.array(z.object({ role: z.string().min(1) }).passthrough())
  }).passthrough())
});

export type HumanAccessFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface HumanAccessProvider {
  projectsFor(email: string, options?: { force?: boolean }): Promise<HumanProject[]>;
}

interface InfisicalHumanAccessOptions {
  baseUrl: string;
  organizationSlug: string;
  clientId: string;
  clientSecret: string;
  projectIds: Record<HumanProject, string>;
  fetch?: HumanAccessFetch;
  now?: () => number;
  cacheTtlMs?: number;
}

function normalizedBaseUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Infisical base URL must use HTTPS");
  return url.origin;
}

function normalizedEmail(value: string) {
  return value.trim().toLowerCase();
}

export function createInfisicalHumanAccessProvider(options: InfisicalHumanAccessOptions): HumanAccessProvider {
  const baseUrl = normalizedBaseUrl(options.baseUrl);
  const fetch = options.fetch ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  const cacheTtlMs = options.cacheTtlMs ?? 60_000;
  let cachedToken: { value: string; expiresAt: number } | null = null;
  let cachedProjects: { value: Map<string, HumanProject[]>; expiresAt: number } | null = null;
  let pendingProjects: Promise<Map<string, HumanProject[]>> | null = null;

  async function accessToken() {
    if (cachedToken && cachedToken.expiresAt > now() + 30_000) return cachedToken.value;
    const response = await fetch(`${baseUrl}/api/v1/auth/universal-auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: options.clientId,
        clientSecret: options.clientSecret,
        organizationSlug: options.organizationSlug
      })
    });
    if (!response.ok) throw new Error("Infisical human access authentication failed");
    let parsed: z.infer<typeof authResponseSchema>;
    try { parsed = authResponseSchema.parse(await response.json()); }
    catch { throw new Error("Infisical human access authentication failed"); }
    cachedToken = { value: parsed.accessToken, expiresAt: now() + parsed.expiresIn * 1000 };
    return cachedToken.value;
  }

  async function loadProjects() {
    const token = await accessToken();
    const memberships = await Promise.all((Object.entries(options.projectIds) as Array<[HumanProject, string]>).map(async ([project, projectId]) => {
      const response = await fetch(`${baseUrl}/api/v1/projects/${encodeURIComponent(projectId)}/memberships`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error("Infisical human access lookup failed");
      try { return { project, memberships: membershipsResponseSchema.parse(await response.json()).memberships }; }
      catch { throw new Error("Infisical human access lookup failed"); }
    }));
    const result = new Map<string, HumanProject[]>();
    for (const projectMemberships of memberships) {
      for (const membership of projectMemberships.memberships) {
        if (membership.roles.length === 0 || !membership.roles.every(({ role }) => role === "no-access")) continue;
        const email = normalizedEmail(membership.user.email ?? membership.user.username);
        if (!email.includes("@")) continue;
        const projects = result.get(email) ?? [];
        if (!projects.includes(projectMemberships.project)) projects.push(projectMemberships.project);
        result.set(email, projects);
      }
    }
    cachedProjects = { value: result, expiresAt: now() + cacheTtlMs };
    return result;
  }

  async function projects(optionsForRead?: { force?: boolean }) {
    if (!optionsForRead?.force && cachedProjects && cachedProjects.expiresAt > now()) return cachedProjects.value;
    if (!pendingProjects) pendingProjects = loadProjects().finally(() => { pendingProjects = null; });
    return pendingProjects;
  }

  return {
    async projectsFor(email, optionsForRead) {
      return [...((await projects(optionsForRead)).get(normalizedEmail(email)) ?? [])];
    }
  };
}
