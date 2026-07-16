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
    fetch,
    now
  });
}

describe("Infisical human access provider", () => {
  it("maps recognized group memberships to normalized project scopes and ignores other groups", async () => {
    const fetch = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/universal-auth/login")) return json({ accessToken: "token", expiresIn: 3600, accessTokenMaxTTL: 3600, tokenType: "Bearer" });
      if (url.endsWith("/api/v1/groups")) return json([
        { id: "g-oriso", slug: "testmails-oriso" },
        { id: "g-dreambau", slug: "testmails-dreambau" },
        { id: "g-other", slug: "engineering" }
      ]);
      if (url.includes("/groups/g-oriso/users")) return json({ users: [{ username: "ShaziaKausarWork@gmail.com", email: "ShaziaKausarWork@gmail.com", isPartOfGroup: true }], totalCount: 1 });
      if (url.includes("/groups/g-dreambau/users")) return json({ users: [{ username: "ShaziaKausarWork@gmail.com", email: "ShaziaKausarWork@gmail.com", isPartOfGroup: true }], totalCount: 1 });
      throw new Error(`Unexpected URL: ${url}`);
    }) satisfies HumanAccessFetch;

    await expect(provider(fetch).projectsFor("shaziakausarwork@gmail.com")).resolves.toEqual(["oriso", "dreambau"]);
    expect(fetch.mock.calls.some(([input]) => String(input).includes("g-other"))).toBe(false);
  });

  it("paginates group members and caches the resulting project map for sixty seconds", async () => {
    let now = 1_000;
    const fetch = vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/auth/universal-auth/login")) return json({ accessToken: "token", expiresIn: 3600, accessTokenMaxTTL: 3600, tokenType: "Bearer" });
      if (url.pathname === "/api/v1/groups") return json([{ id: "g-orimo", slug: "testmails-orimo" }]);
      if (url.pathname === "/api/v1/groups/g-orimo/users") {
        const offset = Number(url.searchParams.get("offset"));
        return json({ users: offset === 0
          ? Array.from({ length: 100 }, (_, index) => ({ username: `member-${index}@example.com`, email: `member-${index}@example.com`, isPartOfGroup: true }))
          : [{ username: "last@example.com", email: "last@example.com", isPartOfGroup: true }], totalCount: 101 });
      }
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

  it("fails with a stable non-secret error when Infisical group lookup fails", async () => {
    const fetch = vi.fn(async (input: string | URL) => String(input).endsWith("/auth/universal-auth/login")
      ? json({ accessToken: "token", expiresIn: 3600, accessTokenMaxTTL: 3600, tokenType: "Bearer" })
      : json({ message: "upstream details must not escape" }, 403)) satisfies HumanAccessFetch;

    await expect(provider(fetch).projectsFor("member@example.com")).rejects.toThrow("Infisical human access lookup failed");
  });
});
