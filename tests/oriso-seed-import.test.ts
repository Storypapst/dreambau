import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { convertOrisoSeedStore, runOrisoSeedImport, runOrisoSeedImportCli } from "../src/server/oriso-seed-import.js";

describe("ORISO seed import", () => {
  it("rejects production before any test access record is created", () => {
    const source = JSON.stringify({
      users: [{ username: "test-user-001", password: "ephemeral-test-secret", role: "user", env: "production" }]
    });

    expect(() => convertOrisoSeedStore(source, {
      environment: "production" as never,
      loginUrl: "https://app.oriso.example",
      documentationUrl: "https://docs.oriso.example/test-access",
      responsiblePerson: "ORISO QA",
      now: () => new Date("2026-07-13T00:00:00.000Z")
    })).toThrow(/production/i);
  });

  it("converts one PreDev Keycloak seed user into a scoped app-user record", () => {
    const source = JSON.stringify({
      users: [{
        username: "test-consultant-001",
        password: "ephemeral-test-secret",
        role: "consultant",
        env: "predev",
        tenant: "t1"
      }]
    });

    expect(convertOrisoSeedStore(source, {
      environment: "pre-dev",
      loginUrl: "https://app.oriso-dev.site",
      documentationUrl: "https://docs.oriso.example/test-access",
      responsiblePerson: "ORISO QA",
      now: () => new Date("2026-07-13T00:00:00.000Z")
    })).toEqual([expect.objectContaining({
      id: "oriso/pre-dev/test-consultant-001",
      project: "oriso",
      environment: "pre-dev",
      kind: "app-user",
      username: "test-consultant-001",
      roles: ["consultant"],
      loginUrl: "https://app.oriso-dev.site",
      secret: "ephemeral-test-secret",
      responsiblePerson: "ORISO QA",
      createdAt: "2026-07-13T00:00:00.000Z",
      updatedAt: "2026-07-13T00:00:00.000Z",
      shared: true
    })]);
  });

  it("rejects a source user whose declared environment does not match the target", () => {
    const source = JSON.stringify({
      users: [{ username: "test-user-001", password: "test-secret", role: "user", env: "dev" }]
    });

    expect(() => convertOrisoSeedStore(source, {
      environment: "pre-dev",
      loginUrl: "https://app.oriso-dev.site",
      documentationUrl: "https://docs.oriso.example/test-access",
      responsiblePerson: "ORISO QA"
    })).toThrow(/environment/i);
  });

  it("imports validated seed users without writing their passwords", async () => {
    const secret = "must-not-appear-in-output";
    const output: string[] = [];
    const fetch = vi.fn(async (_input: string | URL, init?: RequestInit) =>
      init?.method === "POST" ? Response.json({ secrets: [] }) : Response.json({ secrets: [], imports: [] }));

    const result = await runOrisoSeedImport(JSON.stringify({ users: [{
      username: "test-user-001", password: secret, role: "user", env: "predev"
    }] }), {
      environment: "pre-dev",
      loginUrl: "https://app.oriso-dev.site",
      documentationUrl: "https://docs.oriso.example/test-access",
      responsiblePerson: "ORISO QA",
      baseUrl: "https://secrets.dreambau.com",
      projectId: "oriso-project",
      accessToken: "short-lived-admin-token",
      fetch: fetch as unknown as typeof fetch,
      write: (value) => output.push(value),
      now: () => new Date("2026-07-13T00:00:00.000Z")
    });

    expect(result).toBe(0);
    expect(output).toEqual(["Imported 1 ORISO pre-dev test access record.\n"]);
    expect(output.join("")).not.toContain(secret);
  });

  it("reports invalid seed input without echoing it", async () => {
    const errors: string[] = [];
    const result = await runOrisoSeedImport('{"secret":"do-not-print"}', {
      environment: "pre-dev",
      loginUrl: "https://app.oriso-dev.site",
      documentationUrl: "https://docs.oriso.example/test-access",
      responsiblePerson: "ORISO QA",
      baseUrl: "https://secrets.dreambau.com",
      projectId: "oriso-project",
      accessToken: "short-lived-admin-token",
      fetch,
      write: () => {},
      writeError: (value) => errors.push(value)
    });

    expect(result).toBe(1);
    expect(errors).toEqual(["ORISO seed import failed validation.\n"]);
    expect(errors.join("")).not.toContain("do-not-print");
  });

  it("loads the Infisical write credential from the operator Keychain boundary", async () => {
    const readKeychainToken = vi.fn(() => "short-lived-admin-token");
    const fetch = vi.fn(async (_input: string | URL, init?: RequestInit) =>
      init?.method === "POST" ? Response.json({ secrets: [] }) : Response.json({ secrets: [], imports: [] }));

    const result = await runOrisoSeedImportCli(JSON.stringify({ users: [{
      username: "test-user-001", password: "test-secret", role: "user", env: "predev"
    }] }), {
      environment: "pre-dev",
      loginUrl: "https://app.oriso-dev.site",
      documentationUrl: "https://docs.oriso.example/test-access",
      responsiblePerson: "ORISO QA",
      baseUrl: "https://secrets.dreambau.com",
      projectId: "oriso-project"
    }, {
      readKeychainToken,
      fetch: fetch as unknown as typeof fetch,
      write: () => {}
    });

    expect(result).toBe(0);
    expect(readKeychainToken).toHaveBeenCalledOnce();
  });

  it("creates an E2E seed profile containing account references but no passwords", () => {
    const password = "must-stay-in-app-user-only";
    const records = convertOrisoSeedStore(JSON.stringify({
      users: [{ username: "test-user-001", password, role: "user", env: "predev" }],
      profile: {
        id: "e2e-default",
        variables: {
          BASE_URL: "https://app.oriso-dev.site",
          TEST_USER_ACCOUNT_ID: "oriso/pre-dev/test-user-001"
        }
      }
    }), {
      environment: "pre-dev",
      loginUrl: "https://app.oriso-dev.site",
      documentationUrl: "https://docs.oriso.example/test-access",
      responsiblePerson: "ORISO QA",
      now: () => new Date("2026-07-13T00:00:00.000Z")
    });

    const profile = records.find((record) => record.kind === "seed-profile");
    expect(profile).toMatchObject({
      id: "oriso/pre-dev/e2e-default",
      project: "oriso",
      environment: "pre-dev",
      kind: "seed-profile",
      username: "e2e-default"
    });
    expect(JSON.parse(profile!.secret)).toEqual({
      BASE_URL: "https://app.oriso-dev.site",
      TEST_USER_ACCOUNT_ID: "oriso/pre-dev/test-user-001"
    });
    expect(profile!.secret).not.toContain(password);
  });

  it("allows a profile-only follow-up import without rewriting existing app users", () => {
    const records = convertOrisoSeedStore(JSON.stringify({
      users: [],
      profile: { id: "e2e-default", variables: { BASE_URL: "https://app.oriso-dev.site" } }
    }), {
      environment: "pre-dev",
      loginUrl: "https://app.oriso-dev.site",
      documentationUrl: "https://docs.oriso.example/test-access",
      responsiblePerson: "ORISO QA"
    });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ id: "oriso/pre-dev/e2e-default", kind: "seed-profile" });
  });
});
