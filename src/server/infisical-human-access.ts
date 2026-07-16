import { z } from "zod";
import type { HumanProject } from "./passkey-store.js";

const projectByGroupSlug = {
  "testmails-oriso": "oriso",
  "testmails-orimo": "orimo",
  "testmails-dreambau": "dreambau"
} as const satisfies Record<string, HumanProject>;

const authResponseSchema = z.object({
  accessToken: z.string().min(1),
  expiresIn: z.number().positive(),
  accessTokenMaxTTL: z.number().positive(),
  tokenType: z.literal("Bearer")
});
const groupsResponseSchema = z.array(z.object({
  id: z.string().min(1),
  slug: z.string().min(1)
}).passthrough());
const groupUsersResponseSchema = z.object({
  users: z.array(z.object({
    username: z.string().min(1),
    email: z.string().nullable().optional(),
    isPartOfGroup: z.boolean().optional()
  }).passthrough()),
  totalCount: z.number().int().nonnegative()
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

  async function groupUsers(groupId: string, token: string) {
    const users: Array<z.infer<typeof groupUsersResponseSchema>["users"][number]> = [];
    let offset = 0;
    do {
      const url = new URL(`/api/v1/groups/${encodeURIComponent(groupId)}/users`, baseUrl);
      url.search = new URLSearchParams({ offset: String(offset), limit: "100", filter: "existingMembers" }).toString();
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error("Infisical human access lookup failed");
      let page: z.infer<typeof groupUsersResponseSchema>;
      try { page = groupUsersResponseSchema.parse(await response.json()); }
      catch { throw new Error("Infisical human access lookup failed"); }
      users.push(...page.users.filter((user) => user.isPartOfGroup !== false));
      offset += page.users.length;
      if (page.users.length === 0 || offset >= page.totalCount) break;
    } while (true);
    return users;
  }

  async function loadProjects() {
    const token = await accessToken();
    const response = await fetch(`${baseUrl}/api/v1/groups`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error("Infisical human access lookup failed");
    let groups: z.infer<typeof groupsResponseSchema>;
    try { groups = groupsResponseSchema.parse(await response.json()); }
    catch { throw new Error("Infisical human access lookup failed"); }
    const recognized = groups.filter((group) => group.slug in projectByGroupSlug);
    const memberships = await Promise.all(recognized.map(async (group) => ({
      project: projectByGroupSlug[group.slug as keyof typeof projectByGroupSlug],
      users: await groupUsers(group.id, token)
    })));
    const result = new Map<string, HumanProject[]>();
    for (const membership of memberships) {
      for (const user of membership.users) {
        const email = normalizedEmail(user.email ?? user.username);
        if (!email.includes("@")) continue;
        const projects = result.get(email) ?? [];
        if (!projects.includes(membership.project)) projects.push(membership.project);
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
