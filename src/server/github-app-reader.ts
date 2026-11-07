import { createPrivateKey, sign } from "node:crypto";

/** Adapted from PR190 @6e6500d7 installation-token.ts and github.ts transport only.
 * The unfinished work-state collector, grants and scheduler are intentionally not imported. */
export class GithubReadError extends Error {
  constructor(public readonly code: string, public readonly retryAt?: number) { super(code); }
}
function rateLimitDeadline(headers: Headers, now: number): number {
  const wait = Number(headers.get("retry-after")); const reset = Number(headers.get("x-ratelimit-reset"));
  return Math.max(now + 60_000, Number.isFinite(wait) && wait > 0 ? now + wait * 1000 : reset > 0 ? reset * 1000 : 0);
}
async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  let cancel: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    cancel = () => reject(new GithubReadError("request_timeout"));
    if (signal.aborted) cancel(); else signal.addEventListener("abort", cancel, { once: true });
  });
  try { return await Promise.race([promise, aborted]); }
  finally { if (cancel) signal.removeEventListener("abort", cancel); }
}
async function responseText(response: Response, signal: AbortSignal, limit = 512 * 1024): Promise<string> {
  const reader = response.body?.getReader(); if (!reader) return "";
  let text = ""; let bytes = 0; const decoder = new TextDecoder();
  try {
    while (true) {
      const chunk = await abortable(reader.read(), signal); if (chunk.done) break;
      bytes += chunk.value.byteLength; if (bytes > limit) throw new GithubReadError("github_response_too_large");
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally { void reader.cancel().catch(() => undefined); }
}
async function rateLimited(response: Response, signal: AbortSignal): Promise<boolean> {
  if (response.status === 429) return true;
  if (response.status !== 403) return false;
  if (response.headers.get("x-ratelimit-remaining") === "0" || response.headers.has("retry-after")) return true;
  try {
    const value = JSON.parse(await responseText(response, signal, 8192)) as { message?: unknown };
    return typeof value.message === "string" && /secondary rate limit|API rate limit exceeded/i.test(value.message);
  } catch { return false; } // Unknown 403 bodies remain access denials, never stale-data fallbacks.
}
export function createGithubAppToken(options: {
  appId: string; installationId: string; privateKey: string; repositories: string[]; boards: boolean;
  transport?: typeof fetch; now?: () => number;
}) {
  const key = createPrivateKey(options.privateKey);
  if (key.asymmetricKeyType !== "rsa" || !/^\d+$/.test(options.appId) || !/^\d+$/.test(options.installationId)
    || !options.repositories.length || options.repositories.length > 100 || options.repositories.some(name => !/^[\w.-]+$/.test(name))) throw new Error("invalid_github_app_configuration");
  const now = options.now ?? Date.now;
  let cached: { token: string; expires: number } | undefined;
  let pending: Promise<string> | undefined;
  return async (signal?: AbortSignal): Promise<string> => {
    if (cached && cached.expires - now() > 60_000) return cached.token;
    if (!pending) {
      pending = (async () => {
        const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 10_000);
        try {
          const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
          const payload = Buffer.from(JSON.stringify({ iss: options.appId, iat: Math.floor(now() / 1000) - 60, exp: Math.floor(now() / 1000) + 540 })).toString("base64url");
          const unsigned = `${header}.${payload}`;
          const jwt = `${unsigned}.${sign("RSA-SHA256", Buffer.from(unsigned), key).toString("base64url")}`;
          const response = await abortable((options.transport ?? fetch)(`https://api.github.com/app/installations/${options.installationId}/access_tokens`, {
            method: "POST", redirect: "error", signal: controller.signal,
            headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${jwt}`, "X-GitHub-Api-Version": "2026-03-10", "Content-Type": "application/json" },
            body: JSON.stringify({ repositories: options.repositories, permissions: { metadata: "read", issues: "read", pull_requests: "read", contents: "read", ...(options.boards ? { organization_projects: "read" } : {}) } })
          }), controller.signal);
          if (!response.ok) {
            if (await rateLimited(response, controller.signal)) {
              throw new GithubReadError("rate_limited", rateLimitDeadline(response.headers, now()));
            }
            if ([401, 403, 404].includes(response.status)) throw new GithubReadError("github_auth_denied");
            throw new Error();
          }
          const data = await abortable(response.json(), controller.signal) as { token?: unknown; expires_at?: unknown };
          const expires = typeof data.expires_at === "string" ? Date.parse(data.expires_at) : NaN;
          if (typeof data.token !== "string" || !data.token || !Number.isFinite(expires) || expires - now() <= 60_000) throw new Error();
          cached = { token: data.token, expires }; return data.token;
        } catch (error) { if (error instanceof GithubReadError && ["github_auth_denied", "rate_limited"].includes(error.code)) throw error; throw new GithubReadError("github_auth_unavailable"); }
        finally { clearTimeout(timer); }
      })().finally(() => { pending = undefined; });
    }
    return signal ? abortable(pending, signal) : pending;
  };
}
export interface GithubBudget { remaining: number; deadline: number }
interface CachedResponse { value: unknown; next: boolean; etag?: string; bytes: number }
export interface GithubTransport {
  request(path: string, body?: unknown, budget?: GithubBudget): Promise<{ value: unknown; next: boolean }>;
}
/** Fixed-origin, serialized read transport with a bounded in-memory conditional-response cache. */
export function createGithubTransport(options: { token(signal?: AbortSignal): Promise<string>; transport?: typeof fetch; now?: () => number }): GithubTransport {
  const now = options.now ?? Date.now; const cache = new Map<string, CachedResponse>();
  let tail: Promise<unknown> = Promise.resolve(); let retryAt = 0; let cacheBytes = 0;
  const request = async (path: string, body?: unknown, budget?: GithubBudget): Promise<CachedResponse> => {
    if (retryAt > now()) throw new GithubReadError("rate_limited", retryAt);
    const url = new URL(path, "https://api.github.com");
    if (url.origin !== "https://api.github.com" || url.username || url.password || url.hash) throw new GithubReadError("invalid_github_path");
    const key = url.href + (body ? JSON.stringify(body) : ""); const old = cache.get(key);
    for (let attempt = 0; attempt < 2; attempt++) {
      if (budget && (budget.remaining-- <= 0 || budget.deadline <= now())) throw new GithubReadError("request_budget_exhausted");
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), Math.min(10_000, budget ? Math.max(1, budget.deadline - now()) : 10_000));
      try {
        const token = await abortable(options.token(controller.signal), controller.signal);
        const response = await abortable((options.transport ?? fetch)(url, {
          method: body ? "POST" : "GET", redirect: "error", signal: controller.signal,
          headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2026-03-10", ...(body ? { "Content-Type": "application/json" } : {}), ...(!body && old?.etag ? { "If-None-Match": old.etag } : {}) },
          body: body ? JSON.stringify(body) : undefined
        }), controller.signal);
        if (response.status === 304 && old) return old;
        if (await rateLimited(response, controller.signal)) {
          retryAt = rateLimitDeadline(response.headers, now());
          throw new GithubReadError("rate_limited", retryAt);
        }
        if (!response.ok) {
          if (response.status >= 500 && attempt === 0) continue;
          throw new GithubReadError(response.status === 401 ? "github_auth_denied" : response.status === 403 ? "github_access_denied" : response.status === 404 ? "github_not_found" : "github_unavailable");
        }
        const text = await responseText(response, controller.signal); const bytes = Buffer.byteLength(text);
        const result: CachedResponse = { value: JSON.parse(text), next: /rel="next"/.test(response.headers.get("link") ?? ""), etag: response.headers.get("etag") ?? undefined, bytes };
        if (old) { cacheBytes -= old.bytes; cache.delete(key); }
        cache.set(key, result); cacheBytes += bytes;
        while (cache.size > 100 || cacheBytes > 2 * 1024 * 1024) { const first = cache.keys().next().value!; cacheBytes -= cache.get(first)!.bytes; cache.delete(first); }
        return result;
      } catch (error) {
        if (error instanceof GithubReadError) {
          if (error.code === "rate_limited") retryAt = Math.max(retryAt, error.retryAt ?? now() + 60_000);
          throw error;
        }
        if (attempt === 1 || controller.signal.aborted) throw new GithubReadError(controller.signal.aborted ? "request_timeout" : "github_unavailable");
      } finally { clearTimeout(timer); }
    }
    throw new GithubReadError("github_unavailable");
  };
  return { request(path, body, budget) {
    const bounded = budget ?? { remaining: 2, deadline: now() + 10_000 };
    const result = tail.then(() => request(path, body, bounded)); tail = result.catch(() => undefined);
    // Waiting behind another caller is part of this request's deadline too.
    return abortable(result, AbortSignal.timeout(Math.max(1, bounded.deadline - now())));
  } };
}
