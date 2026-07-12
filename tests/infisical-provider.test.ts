import { describe, expect, it } from "vitest";
import {
  createInfisicalRegistryProvider,
  testAccessRecordSchema,
  type FetchLike
} from "../src/server/infisical-provider.js";

const clientSecret = "fake-client-secret-never-log";

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: "oriso/pre-dev/test-consultant-001",
    project: "oriso",
    environment: "pre-dev",
    kind: "app-user",
    displayName: "Test Consultant 001",
    username: "test-consultant-001",
    email: "test-consultant-001@example.test",
    roles: ["consultant"],
    permissionsDescription: "PreDev consultant",
    loginUrl: "https://pre-dev.example.test",
    secret: "fake-account-password",
    responsiblePerson: "qa",
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z",
    expiresAt: null,
    shared: true,
    rotationStatus: "current",
    documentationUrl: "https://docs.example.test/test-account",
    ...overrides
  };
}

describe("Infisical registry provider", () => {
  it("rejects production records at the schema boundary", () => {
    expect(() => testAccessRecordSchema.parse(record({ environment: "production" }))).toThrow();
  });

  it("logs in with Universal Auth and reads only the configured project/environment path", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetch: FetchLike = async (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith("/api/v1/auth/universal-auth/login")) {
        return Response.json({ accessToken: "short-lived-token", expiresIn: 7200, accessTokenMaxTTL: 7200, tokenType: "Bearer" });
      }
      return Response.json({
        secrets: [{ secretKey: "TEST_CONSULTANT_001", secretValue: JSON.stringify(record()) }],
        imports: []
      });
    };
    const provider = createInfisicalRegistryProvider({
      baseUrl: "https://secrets.dreambau.com",
      organizationSlug: "dreambau-test-access",
      clientId: "hub-service",
      clientSecret,
      sources: [{ project: "oriso", projectId: "project-oriso", environment: "pre-dev" }],
      fetch
    });

    await expect(provider.list()).resolves.toEqual([record()]);
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe("https://secrets.dreambau.com/api/v1/auth/universal-auth/login");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      clientId: "hub-service",
      clientSecret,
      organizationSlug: "dreambau-test-access"
    });
    const secretUrl = new URL(calls[1].url);
    expect(secretUrl.pathname).toBe("/api/v4/secrets");
    expect(Object.fromEntries(secretUrl.searchParams)).toMatchObject({
      projectId: "project-oriso",
      environment: "pre-dev",
      secretPath: "/records",
      recursive: "true",
      viewSecretValue: "true",
      includePersonalOverrides: "false"
    });
    expect(new Headers(calls[1].init?.headers).get("Authorization")).toBe("Bearer short-lived-token");
  });

  it("rejects a record whose scope differs from its configured source", async () => {
    const fetch: FetchLike = async (input) => String(input).includes("/login")
      ? Response.json({ accessToken: "token", expiresIn: 60, accessTokenMaxTTL: 60, tokenType: "Bearer" })
      : Response.json({ secrets: [{ secretKey: "BAD", secretValue: JSON.stringify(record({ project: "orimo" })) }], imports: [] });
    const provider = createInfisicalRegistryProvider({
      baseUrl: "https://secrets.dreambau.com",
      organizationSlug: "dreambau-test-access",
      clientId: "hub-service",
      clientSecret,
      sources: [{ project: "oriso", projectId: "project-oriso", environment: "pre-dev" }],
      fetch
    });
    await expect(provider.list()).rejects.toThrow(/scope/i);
  });

  it("uses one in-flight authentication exchange for concurrent source reads", async () => {
    let loginCalls = 0;
    const fetch: FetchLike = async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/login")) {
        loginCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return Response.json({ accessToken: "token", expiresIn: 60, accessTokenMaxTTL: 60, tokenType: "Bearer" });
      }
      const environment = url.searchParams.get("environment");
      return Response.json({
        secrets: [{ secretKey: `RECORD_${environment}`, secretValue: JSON.stringify(record({ id: `oriso/${environment}/record`, environment })) }],
        imports: []
      });
    };
    const provider = createInfisicalRegistryProvider({
      baseUrl: "https://secrets.dreambau.com",
      organizationSlug: "dreambau-test-access",
      clientId: "hub-service",
      clientSecret,
      sources: [
        { project: "oriso", projectId: "project-oriso", environment: "pre-dev" },
        { project: "oriso", projectId: "project-oriso", environment: "dev" }
      ],
      fetch
    });
    await expect(provider.list()).resolves.toHaveLength(2);
    expect(loginCalls).toBe(1);
  });

  it("never includes credentials or upstream response bodies in errors", async () => {
    const fetch: FetchLike = async () => new Response(`upstream leaked ${clientSecret}`, { status: 401 });
    const provider = createInfisicalRegistryProvider({
      baseUrl: "https://secrets.dreambau.com",
      organizationSlug: "dreambau-test-access",
      clientId: "hub-service",
      clientSecret,
      sources: [{ project: "oriso", projectId: "project-oriso", environment: "pre-dev" }],
      fetch
    });
    const error = await provider.list().catch((value: unknown) => value);
    expect(String(error)).toContain("Infisical authentication failed");
    expect(String(error)).not.toContain(clientSecret);
    expect(String(error)).not.toContain("upstream leaked");
  });

  it("checks readiness without requesting secret values", async () => {
    const urls: string[] = [];
    const fetch: FetchLike = async (input) => {
      const url = String(input);
      urls.push(url);
      return url.includes("/login")
        ? Response.json({ accessToken: "token", expiresIn: 60, accessTokenMaxTTL: 60, tokenType: "Bearer" })
        : Response.json({ secrets: [], imports: [] });
    };
    const provider = createInfisicalRegistryProvider({
      baseUrl: "https://secrets.dreambau.com", organizationSlug: "dreambau-test-access",
      clientId: "hub-service", clientSecret,
      sources: [{ project: "oriso", projectId: "project-oriso", environment: "pre-dev" }], fetch
    });
    await expect(provider.health?.()).resolves.toBeUndefined();
    const healthUrl = new URL(urls[1]);
    expect(healthUrl.searchParams.get("viewSecretValue")).toBe("false");
    expect(healthUrl.searchParams.get("recursive")).toBe("false");
  });
});
