import { describe, expect, it } from "vitest";
import { createInfisicalHumanAccessProvider, type HumanAccessFetch } from "../src/server/infisical-human-access.js";

/**
 * Characterization of which Infisical project roles grant a Testmails project
 * scope. This is the decision recorded as run-state §5.2: the reviewed rule
 * accepts pure `no-access` membership, while the running image also accepts
 * `admin`. Pinning the rule here makes any change to it loud and deliberate.
 *
 * Infisical semantics that matter for the decision:
 *   no-access — belongs to the project, can read no secrets. A pure membership marker.
 *   viewer    — can read the project's secrets.
 *   member    — can read and write the project's secrets.
 *   admin     — full control of the project, including all its secrets.
 */
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function providerFor(roles: string[]) {
  const fetch: HumanAccessFetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/auth/universal-auth/login")) {
      return json({ accessToken: "token", expiresIn: 3600, accessTokenMaxTTL: 3600, tokenType: "Bearer" });
    }
    if (url.endsWith("/projects/p-oriso/memberships")) {
      return json({ memberships: [{ user: { username: "lisa@dreambau.com", email: "lisa@dreambau.com" }, roles: roles.map((role) => ({ role })) }] });
    }
    return json({ memberships: [] });
  };
  return createInfisicalHumanAccessProvider({
    baseUrl: "https://secrets.dreambau.com",
    organizationSlug: "dreambau-test-access",
    clientId: "client-id",
    clientSecret: "client-secret",
    projectIds: { oriso: "p-oriso", orimo: "p-orimo", dreambau: "p-dreambau" },
    fetch,
    now: () => 1_000
  });
}

const grants = (roles: string[]) => providerFor(roles).projectsFor("lisa@dreambau.com");

describe("Infisical roles that grant a Testmails project scope", () => {
  it("grants scope for pure no-access membership", async () => {
    await expect(grants(["no-access"])).resolves.toEqual(["oriso"]);
  });

  it("grants nothing for a membership that can read secrets", async () => {
    await expect(grants(["viewer"])).resolves.toEqual([]);
    await expect(grants(["member"])).resolves.toEqual([]);
  });

  it("grants nothing when any role falls outside the accepted set", async () => {
    await expect(grants(["no-access", "viewer"])).resolves.toEqual([]);
  });

  it("grants nothing for an empty role list", async () => {
    await expect(grants([])).resolves.toEqual([]);
  });

  /**
   * §5.2 DECISION POINT.
   *
   * Reviewed source rejects a project admin, so an Infisical project admin gets
   * no Testmails scope. The running image accepts `admin`, which is almost
   * certainly why it was changed: administrators are project admins in
   * Infisical, not `no-access` members, so they saw nothing.
   *
   * Accepting `admin` is not a privilege escalation on its own — an Infisical
   * project admin can already read every secret in that project directly. What
   * it does create is an inconsistent rule: the highest privilege (admin) and
   * the lowest (no-access) grant scope, while everything between them
   * (member, viewer) does not.
   *
   * Flip these two expectations to widen the rule to match production.
   */
  it("rejects a project admin (reviewed rule; production accepts it)", async () => {
    await expect(grants(["admin"])).resolves.toEqual([]);
    await expect(grants(["no-access", "admin"])).resolves.toEqual([]);
  });
});
