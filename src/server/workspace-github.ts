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
function filterClosingPullRequests(facts: StoredGithubSnapshot["facts"], canReadReference: (fullName: string, url: string) => boolean): StoredGithubSnapshot["facts"] {
  if (!facts) return null;
  const filtered = facts.closingPullRequests.filter(item => { const target = parseGithubReference(item.url); return target && canReadReference(target.fullName, target.url); });
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
  const observers = new Set<{ urls: Set<string>; overflow: boolean }>();
  const referenceDenied = (url: string) => { const value = options.store.get(url); return value?.status === "denied" && value.errorCode === "github_reference_unavailable"; };
  const sanitizeFacts = (facts: StoredGithubSnapshot["facts"]) => filterClosingPullRequests(facts, (name, url) => !knownDenied.has(name.toLowerCase()) && !referenceDenied(url));
  const privateKey = options.clients ? null : readFileSync(options.config.privateKeyFile, "utf8");
  for (const installation of options.config.installations) {
    const client = options.clients?.get(installation.installationId) ?? createGithubTransport({ token: createGithubAppToken({ appId: options.config.appId, installationId: installation.installationId,
      privateKey: privateKey!, repositories: installation.repositories.map(repo => repo.fullName.split("/")[1]), boards: installation.repositories.some(repo => repo.boards.length > 0), now }), now });
    for (const repo of installation.repositories) registry.set(repo.fullName.toLowerCase(), { repo, client, installationId: installation.installationId });
  }
  return { async read(references, canReadProject, refresh = false) {
    const refs = references.filter(item => (item.kind === "issue" || item.kind === "pull-request") && item.url);
    if (observers.size >= 32) return { status: "unavailable", items: [], limitReached: refs.length > 10, retryAfter: new Date(now() + 60_000).toISOString() };
    // Keep exact denials until this entire read finishes, including later awaits after an item was built.
    const observer = { urls: new Set<string>(), overflow: false }; observers.add(observer);
    try {
    const invalidated = (url: string) => observer.urls.has(url.toLowerCase());
    const sanitizeForRead = (facts: StoredGithubSnapshot["facts"]) => observer.overflow ? null : filterClosingPullRequests(sanitizeFacts(facts), (_name, url) => !invalidated(url));
    const budget: GithubBudget = { remaining: 20, deadline: now() + 15_000 }; const items: WorkspaceGithubSnapshot[] = []; let retryAfter = 0;
    const allowed = (fullName: string) => { const entry = registry.get(fullName.toLowerCase()); return entry && canReadProject(entry.repo.project) ? entry : null; };
    // Permission knowledge outlives retry cooldown; only a successful core read restores it.
    const blocked = (fullName: string) => knownDenied.has(fullName.toLowerCase());
    const scopedClient = (fullName: string): GithubTransport | null => {
      const entry = allowed(fullName); if (!entry) return null;
      return { async request(path, body, requestBudget) {
        const match = /^\/repos\/([^/]+\/[^/]+)\/(issues|pulls)\/([1-9]\d*)$/.exec(path);
        const core = !body && match && match[1].toLowerCase() === fullName.toLowerCase() ? parseGithubReference(`https://github.com/${match[1]}/${match[2] === "issues" ? "issues" : "pull"}/${match[3]}`) : null;
        if (!allowed(fullName)) throw new GithubReadError("repository_scope_denied");
        if ((deniedUntil.get(fullName.toLowerCase()) ?? 0) > now()) throw new GithubReadError("github_access_denied");
        if (core && referenceDenied(core.url) && (options.store.get(core.url)?.retryAt ?? 0) > now()) throw new GithubReadError("github_reference_unavailable");
        try {
          const response = await entry.client.request(path, body, requestBudget);
          if (core) { knownDenied.delete(fullName.toLowerCase()); deniedUntil.delete(fullName.toLowerCase()); options.store.restoreReference(core.url); }
          return response;
        }
        catch (error) {
          if (error instanceof GithubReadError && error.code === "github_not_found" && core) {
            // A 404 can hide a private repository. Confirm App access before localizing the denial.
            try {
              if (!allowed(fullName)) throw new GithubReadError("repository_scope_denied");
              const probe = await entry.client.request(`/repos/${fullName}`, undefined, requestBudget);
              const value = probe.value as { full_name?: unknown } | null;
              if (!value || typeof value.full_name !== "string" || value.full_name.toLowerCase() !== fullName.toLowerCase()) throw new GithubReadError("github_access_denied");
              for (const active of observers) {
                if (active.urls.size < 256 || active.urls.has(core.url)) active.urls.add(core.url);
                else active.overflow = true; // Never forget a denial silently when the bounded observer fills.
              }
              options.store.denyReference(core.url, new Date(now()).toISOString(), now() + 60_000);
              throw new GithubReadError("github_reference_unavailable");
            } catch (probeError) {
              if (probeError instanceof GithubReadError && ["github_reference_unavailable", "repository_scope_denied"].includes(probeError.code)) throw probeError;
              error = probeError instanceof GithubReadError && probeError.code === "github_auth_denied" ? probeError : new GithubReadError("github_access_denied", probeError instanceof GithubReadError ? probeError.retryAt : undefined);
            }
          }
          if (error instanceof GithubReadError && (error.code === "github_auth_denied" || error.code === "github_access_denied" && core)) {
            for (const [name, target] of registry) if (error.code === "github_auth_denied" ? target.installationId === entry.installationId : name === fullName.toLowerCase()) {
              const retryAt = Math.max(now() + 60_000, error.retryAt ?? 0);
              knownDenied.add(name); deniedUntil.set(name, retryAt); options.store.denyRepository(name, new Date(now()).toISOString(), retryAt);
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
              if (observer.overflow) throw new GithubReadError("github_busy");
              if (invalidated(parsed.url)) throw new GithubReadError("github_reference_unavailable");
              if (blocked(parsed.fullName)) throw new GithubReadError("github_access_denied");
              const sanitized = sanitizeForRead(result.facts)!;
              const value: StoredGithubSnapshot = { ...result, facts: sanitized, status: sanitized !== result.facts && result.status === "ready" ? "partial" : result.status, observedAt: new Date(now()).toISOString(), lastAttemptAt, retryAt: Math.max(now() + 60_000, result.retryAt) };
              options.store.put(parsed.url, value); return value;
            } catch (error) {
              const denied = blocked(parsed.fullName) || invalidated(parsed.url) || referenceDenied(parsed.url) || error instanceof GithubReadError && ["github_auth_denied", "github_access_denied", "github_reference_unavailable", "repository_scope_denied"].includes(error.code);
              // Another request may have invalidated nested facts since this job captured `prior`.
              const currentFallback = options.store.get(parsed.url);
              const value: StoredGithubSnapshot = { facts: denied ? null : sanitizeForRead(currentFallback?.facts ?? null), observedAt: denied || observer.overflow ? null : currentFallback?.observedAt ?? null, lastAttemptAt, status: denied ? "denied" : "unavailable", errorCode: observer.overflow ? "github_busy" : error instanceof GithubReadError ? error.code : "github_unavailable", retryAt: Math.max(now() + 60_000, error instanceof GithubReadError ? error.retryAt ?? 0 : 0) };
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
        const filtered = filterClosingPullRequests(facts, (name, url) => !!allowed(name) && !blocked(name) && !referenceDenied(url) && !invalidated(url));
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
      else if (target && (referenceDenied(target.url) || invalidated(target.url))) { item.status = "denied"; item.facts = null; item.observedAt = null; item.stale = false; item.errorCode = "github_reference_unavailable"; }
      else if (item.facts) {
        const filtered = filterClosingPullRequests(item.facts, (name, url) => !!allowed(name) && !blocked(name) && !referenceDenied(url) && !invalidated(url));
        if (filtered !== item.facts) { item.facts = filtered; if (item.status === "ready") item.status = "partial"; }
      }
    }
    if (observer.overflow) {
      for (const item of items) { item.facts = null; item.observedAt = null; item.lastAttemptAt = null; item.status = "unavailable"; item.stale = false; item.cached = false; item.errorCode = "github_busy"; }
      return { status: "unavailable", items, limitReached: refs.length > 10, retryAfter: new Date(now() + 60_000).toISOString() };
    }
    const statuses = new Set(items.map(item => item.status));
    const status: WorkspaceGithubStatus = statuses.size > 1 ? "partial" : items[0]?.status ?? "ready";
    return { status, items, limitReached: refs.length > 10, retryAfter: retryAfter ? new Date(retryAfter).toISOString() : null };
    } finally { observers.delete(observer); }
  } };
}
