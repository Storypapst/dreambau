import { describe, expect, it, vi } from "vitest";
import { createInfisicalHumanAccessProvider, type HumanAccessFetch } from "../src/server/infisical-human-access.js";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function provider(fetch: HumanAccessFetch, now = () => 1_000) {
  return createInfisicalHumanAccessProvider({
    baseUrl: "https://secrets.dreambau.com",
    organizationSlug: "dreambau-test-access",
    clientId: "client-id",
    clientSecret: "client-secret",
    projectIds: {
      oriso: "p-oriso",
      orimo: "p-orimo",
      dreambau: "p-dreambau"
    },
    fetch,
    now
  });
}

describe("Infisical human access provider", () => {
  it("maps no-access and administrator memberships to normalized project scopes", async () => {
    const fetch = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/universal-auth/login")) return json({ accessToken: "token", expiresIn: 3600, accessTokenMaxTTL: 3600, tokenType: "Bearer" });
      if (url.endsWith("/projects/p-oriso/memberships")) return json({ memberships: [
        { user: { username: "ShaziaKausarWork@gmail.com", email: "ShaziaKausarWork@gmail.com" }, roles: [{ role: "no-access" }] },
        { user: { username: "secret-reader@example.com", email: "secret-reader@example.com" }, roles: [{ role: "viewer" }] }
      ] });
      if (url.endsWith("/projects/p-orimo/memberships")) return json({ memberships: [] });
      if (url.endsWith("/projects/p-dreambau/memberships")) return json({ memberships: [
        { user: { username: "ShaziaKausarWork@gmail.com", email: "ShaziaKausarWork@gmail.com" }, roles: [{ role: "no-access" }] },
        { user: { username: "Christoph@ag-prop.com", email: "Christoph@ag-prop.com" }, roles: [{ role: "admin" }] },
        { user: { username: "mixed@example.com", email: "mixed@example.com" }, roles: [{ role: "no-access" }, { role: "viewer" }] }
      ] });
      throw new Error(`Unexpected URL: ${url}`);
    }) satisfies HumanAccessFetch;

    await expect(provider(fetch).projectsFor("shaziakausarwork@gmail.com")).resolves.toEqual(["oriso", "dreambau"]);
    await expect(provider(fetch).projectsFor("christoph@ag-prop.com")).resolves.toEqual(["dreambau"]);
    await expect(provider(fetch).projectsFor("secret-reader@example.com")).resolves.toEqual([]);
    await expect(provider(fetch).projectsFor("mixed@example.com")).resolves.toEqual([]);
  });

  it("caches project memberships for sixty seconds", async () => {
    let now = 1_000;
    const fetch = vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/auth/universal-auth/login")) return json({ accessToken: "token", expiresIn: 3600, accessTokenMaxTTL: 3600, tokenType: "Bearer" });
      if (url.pathname === "/api/v1/projects/p-orimo/memberships") return json({ memberships: [
        { user: { username: "last@example.com", email: "last@example.com" }, roles: [{ role: "no-access" }] }
      ] });
      if (url.pathname === "/api/v1/projects/p-oriso/memberships" || url.pathname === "/api/v1/projects/p-dreambau/memberships") return json({ memberships: [] });
      throw new Error(`Unexpected URL: ${url}`);
    }) satisfies HumanAccessFetch;
    const target = provider(fetch, () => now);

    await expect(target.projectsFor("last@example.com")).resolves.toEqual(["orimo"]);
    const callsAfterFirstLoad = fetch.mock.calls.length;
    await expect(target.projectsFor("last@example.com")).resolves.toEqual(["orimo"]);
    expect(fetch).toHaveBeenCalledTimes(callsAfterFirstLoad);

    now += 60_001;
    await expect(target.projectsFor("last@example.com")).resolves.toEqual(["orimo"]);
    expect(fetch.mock.calls.length).toBeGreaterThan(callsAfterFirstLoad);
  });

  it("fails with a stable non-secret error when Infisical project membership lookup fails", async () => {
    const fetch = vi.fn(async (input: string | URL) => String(input).endsWith("/auth/universal-auth/login")
      ? json({ accessToken: "token", expiresIn: 3600, accessTokenMaxTTL: 3600, tokenType: "Bearer" })
      : json({ message: "upstream details must not escape" }, 403)) satisfies HumanAccessFetch;

    await expect(provider(fetch).projectsFor("member@example.com")).rejects.toThrow("Infisical human access lookup failed");
  });

  it("forwards an abort signal to the underlying Infisical request", async () => {
    const controller = new AbortController();
    let internalSignal: AbortSignal | null = null;
    const fetch = vi.fn((_input: string | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      internalSignal = init?.signal ?? null;
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    })) satisfies HumanAccessFetch;

    const lookup = provider(fetch).projectsFor("member@example.com", { signal: controller.signal });
    controller.abort();

    await expect(lookup).rejects.toMatchObject({ name: "AbortError" });
    expect(internalSignal).not.toBe(controller.signal);
    expect(internalSignal?.aborted).toBe(true);
  });

  it("keeps a shared pending lookup alive while another caller still needs it", async () => {
    let resolveAuthentication!: (response: Response) => void;
    let internalSignal: AbortSignal | null = null;
    const firstController = new AbortController();
    const secondController = new AbortController();
    const fetch = vi.fn((input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/auth/universal-auth/login")) {
        internalSignal = init?.signal ?? null;
        return new Promise<Response>((resolve) => { resolveAuthentication = resolve; });
      }
      return Promise.resolve(json({ memberships: [] }));
    }) satisfies HumanAccessFetch;
    const target = provider(fetch);

    const first = target.projectsFor("first@example.com", { signal: firstController.signal });
    const second = target.projectsFor("second@example.com", { signal: secondController.signal });
    expect(fetch).toHaveBeenCalledTimes(1);
    firstController.abort();

    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    expect(internalSignal?.aborted).toBe(false);
    resolveAuthentication(json({ accessToken: "token", expiresIn: 3600, accessTokenMaxTTL: 3600, tokenType: "Bearer" }));
    await expect(second).resolves.toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("aborts and clears a shared lookup after every caller cancels", async () => {
    let authenticationAttempts = 0;
    let firstInternalSignal: AbortSignal | null = null;
    const firstController = new AbortController();
    const secondController = new AbortController();
    const fetch = vi.fn((input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/auth/universal-auth/login")) {
        authenticationAttempts += 1;
        if (authenticationAttempts === 1) {
          firstInternalSignal = init?.signal ?? null;
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
          });
        }
        return Promise.resolve(json({ accessToken: "token", expiresIn: 3600, accessTokenMaxTTL: 3600, tokenType: "Bearer" }));
      }
      return Promise.resolve(json({ memberships: [] }));
    }) satisfies HumanAccessFetch;
    const target = provider(fetch);

    const first = target.projectsFor("first@example.com", { signal: firstController.signal });
    const second = target.projectsFor("second@example.com", { signal: secondController.signal });
    expect(fetch).toHaveBeenCalledTimes(1);
    firstController.abort();
    secondController.abort();

    const cancelled = await Promise.allSettled([first, second]);
    expect(cancelled.map((result) => result.status)).toEqual(["rejected", "rejected"]);
    expect(firstInternalSignal?.aborted).toBe(true);
    await expect(target.projectsFor("third@example.com", { signal: new AbortController().signal })).resolves.toEqual([]);
    expect(authenticationAttempts).toBe(2);
  });
});
