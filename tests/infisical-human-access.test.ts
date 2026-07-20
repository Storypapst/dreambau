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
  it("maps pure no-access project memberships to normalized project scopes", async () => {
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
        { user: { username: "mixed@example.com", email: "mixed@example.com" }, roles: [{ role: "no-access" }, { role: "viewer" }] }
      ] });
      throw new Error(`Unexpected URL: ${url}`);
    }) satisfies HumanAccessFetch;

    await expect(provider(fetch).projectsFor("shaziakausarwork@gmail.com")).resolves.toEqual(["oriso", "dreambau"]);
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
});
