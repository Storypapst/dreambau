import { readFileSync } from "node:fs";
import type { WorkspaceProject, WorkspaceReference } from "../shared/workspace.js";
import type { WorkspaceGithubResponse, WorkspaceGithubSnapshot, WorkspaceGithubStatus } from "../shared/workspace-github.js";
import { createGithubAppToken, createGithubTransport, GithubReadError, type GithubBudget, type GithubTransport } from "./github-app-reader.js";
import type { WorkspaceGithubConfig, WorkspaceGithubRepository } from "./workspace-github-config.js";
import { parseGithubReference, readWorkspaceGithubFacts } from "./workspace-github-reader.js";
import { type StoredGithubSnapshot, WorkspaceGithubStore } from "./workspace-github-store.js";

export interface WorkspaceGithubClient {
  read(references: WorkspaceReference[], canReadProject: (project: WorkspaceProject) => boolean, refresh?: boolean): Promise<WorkspaceGithubResponse>;
}
function filterClosingPullRequests(facts: StoredGithubSnapshot["facts"], canReadRepository: (fullName: string) => boolean): StoredGithubSnapshot["facts"] {
  if (!facts) return null;
  const filtered = facts.closingPullRequests.filter(item => { const target = parseGithubReference(item.url); return target && canReadRepository(target.fullName); });
  return filtered.length === facts.closingPullRequests.length ? facts : { ...facts, closingPullRequests: filtered, closingPullRequestsComplete: false };
}
export function unconfiguredGithub(references: WorkspaceReference[]): WorkspaceGithubResponse {
  const refs = references.filter(item => (item.kind === "issue" || item.kind === "pull-request") && item.url);
  return { status: "unconfigured", limitReached: refs.length > 10, retryAfter: null, items: refs.slice(0, 10).map(item => ({ referenceId: item.id, url: item.url!, status: "unconfigured", observedAt: null, lastAttemptAt: null, cached: false, stale: false, facts: null, errorCode: "github_unconfigured" })) };
}
/** Scope is checked before cache access and again after every asynchronous read. */
export function createWorkspaceGithub(options: { config: WorkspaceGithubConfig; store: WorkspaceGithubStore; clients?: Map<string, GithubTransport>; now?: () => number }): WorkspaceGithubClient {
  const now = options.now ?? Date.now; const registry = new Map<string, { repo: WorkspaceGithubRepository; client: GithubTransport; installationId: string }>();
  const pending = new Map<string, Promise<StoredGithubSnapshot>>();
  const deniedUntil = new Map<string, number>();
  const knownDenied = new Set<string>();
  const sanitizeFacts = (facts: StoredGithubSnapshot["facts"]) => filterClosingPullRequests(facts, name => !knownDenied.has(name.toLowerCase()));
  const privateKey = options.clients ? null : readFileSync(options.config.privateKeyFile, "utf8");
  for (const installation of options.config.installations) {
    const client = options.clients?.get(installation.installationId) ?? createGithubTransport({ token: createGithubAppToken({ appId: options.config.appId, installationId: installation.installationId,
      privateKey: privateKey!, repositories: installation.repositories.map(repo => repo.fullName.split("/")[1]), boards: installation.repositories.some(repo => repo.boards.length > 0), now }), now });
    for (const repo of installation.repositories) registry.set(repo.fullName.toLowerCase(), { repo, client, installationId: installation.installationId });
  }
  return { async read(references, canReadProject, refresh = false) {
    const refs = references.filter(item => (item.kind === "issue" || item.kind === "pull-request") && item.url);
    const budget: GithubBudget = { remaining: 20, deadline: now() + 15_000 }; const items: WorkspaceGithubSnapshot[] = []; let retryAfter = 0;
    const allowed = (fullName: string) => { const entry = registry.get(fullName.toLowerCase()); return entry && canReadProject(entry.repo.project) ? entry : null; };
    // Permission knowledge outlives retry cooldown; only a successful core read restores it.
    const blocked = (fullName: string) => knownDenied.has(fullName.toLowerCase());
    const scopedClient = (fullName: string): GithubTransport | null => {
      const entry = allowed(fullName); if (!entry) return null;
      return { async request(path, body, requestBudget) {
        if (!allowed(fullName)) throw new GithubReadError("repository_scope_denied");
        if ((deniedUntil.get(fullName.toLowerCase()) ?? 0) > now()) throw new GithubReadError("github_access_denied");
        try {
          const response = await entry.client.request(path, body, requestBudget);
          if (/^\/repos\/[^/]+\/[^/]+\/(issues|pulls)\/[1-9]\d*$/.test(path) && !body) { knownDenied.delete(fullName.toLowerCase()); deniedUntil.delete(fullName.toLowerCase()); }
          return response;
        }
        catch (error) {
          if (error instanceof GithubReadError && ["github_auth_denied", "github_access_denied"].includes(error.code)) {
            for (const [name, target] of registry) if (error.code === "github_auth_denied" ? target.installationId === entry.installationId : name === fullName.toLowerCase()) {
              knownDenied.add(name); deniedUntil.set(name, now() + 60_000); options.store.denyRepository(name, new Date(now()).toISOString(), now() + 60_000);
            }
          }
          throw error;
        }
      } };
    };
    for (const ref of refs.slice(0, 10)) {
      const parsed = parseGithubReference(ref.url!); const entry = parsed ? allowed(parsed.fullName) : null;
      const denied = (): WorkspaceGithubSnapshot => ({ referenceId: ref.id, url: ref.url!, status: "denied", observedAt: null, lastAttemptAt: null, cached: false, stale: false, facts: null, errorCode: "repository_scope_denied" });
      if (!entry || !parsed) { items.push(denied()); continue; }
      const prior = options.store.get(parsed.url); let snapshot = prior; let cached = true;
      const current = pending.get(parsed.url);
      const fresh = prior?.status !== "unavailable" && prior?.observedAt && now() - Date.parse(prior.observedAt) < 15 * 60_000;
      const cooldown = prior ? Math.max(Date.parse(prior.lastAttemptAt) + 60_000, prior.retryAt) : 0;
      retryAfter = Math.max(retryAfter, cooldown > now() ? cooldown : 0);
      if (current) { snapshot = await current; cached = false; }
      else if ((!fresh || refresh) && cooldown <= now()) {
        if (pending.size >= 8) snapshot = { facts: prior?.facts ?? null, observedAt: prior?.observedAt ?? null, lastAttemptAt: new Date(now()).toISOString(), status: "unavailable", errorCode: "github_busy", retryAt: now() + 60_000 };
        else {
          const job = (async (): Promise<StoredGithubSnapshot> => {
            const lastAttemptAt = new Date(now()).toISOString();
            try {
              const result = await readWorkspaceGithubFacts(scopedClient(parsed.fullName)!, entry.repo, parsed, budget, scopedClient);
              if (blocked(parsed.fullName)) throw new GithubReadError("github_access_denied");
              const sanitized = sanitizeFacts(result.facts)!;
              const value: StoredGithubSnapshot = { ...result, facts: sanitized, status: sanitized !== result.facts && result.status === "ready" ? "partial" : result.status, observedAt: new Date(now()).toISOString(), lastAttemptAt, retryAt: Math.max(now() + 60_000, result.retryAt) };
              options.store.put(parsed.url, value); return value;
            } catch (error) {
              const denied = blocked(parsed.fullName) || error instanceof GithubReadError && ["github_auth_denied", "github_access_denied", "repository_scope_denied"].includes(error.code);
              // Another request may have invalidated nested facts since this job captured `prior`.
              const currentFallback = options.store.get(parsed.url);
              const value: StoredGithubSnapshot = { facts: denied ? null : sanitizeFacts(currentFallback?.facts ?? null), observedAt: denied ? null : currentFallback?.observedAt ?? null, lastAttemptAt, status: denied ? "denied" : "unavailable", errorCode: error instanceof GithubReadError ? error.code : "github_unavailable", retryAt: Math.max(now() + 60_000, error instanceof GithubReadError ? error.retryAt ?? 0 : 0) };
              options.store.put(parsed.url, value); return value;
            }
          })();
          pending.set(parsed.url, job);
          try { snapshot = await job; cached = false; } finally { pending.delete(parsed.url); }
        }
      }
      if (!allowed(parsed.fullName)) { items.push(denied()); continue; }
      if (blocked(parsed.fullName)) {
        retryAfter = Math.max(retryAfter, deniedUntil.get(parsed.fullName.toLowerCase()) ?? 0);
        items.push({ ...denied(), lastAttemptAt: snapshot?.lastAttemptAt ?? null, errorCode: "github_access_denied" }); continue;
      }
      if (!snapshot) { items.push({ ...denied(), status: "unavailable", errorCode: "github_unavailable" }); continue; }
      retryAfter = Math.max(retryAfter, snapshot.retryAt > now() ? snapshot.retryAt : 0);
      let facts = snapshot.facts; let status = snapshot.status;
      if (facts) {
        const filtered = filterClosingPullRequests(facts, name => !!allowed(name) && !blocked(name));
        if (filtered !== facts) { facts = filtered; if (status === "ready") status = "partial"; }
      }
      items.push({ referenceId: ref.id, url: parsed.url, status, facts, observedAt: snapshot.observedAt, lastAttemptAt: snapshot.lastAttemptAt, cached,
        stale: status !== "denied" && (status === "unavailable" || !snapshot.observedAt || now() - Date.parse(snapshot.observedAt) >= 15 * 60_000), errorCode: snapshot.errorCode });
    }
    // Another concurrent refresh may have learned an installation denial after an earlier item completed.
    for (const item of items) {
      const target = parseGithubReference(item.url);
      if (target && !allowed(target.fullName)) { item.status = "denied"; item.facts = null; item.observedAt = null; item.lastAttemptAt = null; item.cached = false; item.stale = false; item.errorCode = "repository_scope_denied"; }
      else if (target && blocked(target.fullName)) { item.status = "denied"; item.facts = null; item.observedAt = null; item.stale = false; item.errorCode = "github_access_denied"; }
      else if (item.facts) {
        const filtered = filterClosingPullRequests(item.facts, name => !!allowed(name) && !blocked(name));
        if (filtered !== item.facts) { item.facts = filtered; if (item.status === "ready") item.status = "partial"; }
      }
    }
    const statuses = new Set(items.map(item => item.status));
    const status: WorkspaceGithubStatus = statuses.size > 1 ? "partial" : items[0]?.status ?? "ready";
    return { status, items, limitReached: refs.length > 10, retryAfter: retryAfter ? new Date(retryAfter).toISOString() : null };
  } };
}
