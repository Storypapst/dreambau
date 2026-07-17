import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/server/config.js";

afterEach(() => vi.unstubAllEnvs());

describe("runtime config", () => {
  it("rejects an unsupported non-empty Test Access provider", () => {
    vi.stubEnv("TEST_ACCESS_PROVIDER", "typo-provider");
    expect(() => loadConfig()).toThrow(/TEST_ACCESS_PROVIDER/);
  });
  it("requires an explicit Infisical switch and maps only the three test projects", () => {
    vi.stubEnv("TEST_ACCESS_PROVIDER", "infisical");
    vi.stubEnv("INFISICAL_BASE_URL", "https://secrets.dreambau.com");
    vi.stubEnv("INFISICAL_ORGANIZATION_SLUG", "dreambau-test-access");
    vi.stubEnv("INFISICAL_CLIENT_ID", "hub-service");
    vi.stubEnv("INFISICAL_CLIENT_SECRET", "fake-client-secret");
    vi.stubEnv("TEST_ACCESS_INFISICAL_ORISO_PROJECT_ID", "project-oriso");
    vi.stubEnv("TEST_ACCESS_INFISICAL_ORIMO_PROJECT_ID", "project-orimo");
    vi.stubEnv("TEST_ACCESS_INFISICAL_DREAMBAU_PROJECT_ID", "project-dreambau");
    const config = loadConfig();
    expect(config.registryProvider).toBe("infisical");
    expect(config.infisical).toEqual({
      baseUrl: "https://secrets.dreambau.com",
      organizationSlug: "dreambau-test-access",
      clientId: "hub-service",
      clientSecret: "fake-client-secret",
      projectIds: { oriso: "project-oriso", orimo: "project-orimo", dreambau: "project-dreambau" }
    });
    expect(JSON.stringify(config.infisical)).not.toContain("production");
  });

  it("rejects incomplete Infisical configuration instead of silently falling back to files", () => {
    vi.stubEnv("TEST_ACCESS_PROVIDER", "infisical");
    vi.stubEnv("INFISICAL_BASE_URL", "https://secrets.dreambau.com");
    vi.stubEnv("INFISICAL_ORGANIZATION_SLUG", "dreambau-test-access");
    vi.stubEnv("INFISICAL_CLIENT_ID", "hub-service");
    vi.stubEnv("INFISICAL_CLIENT_SECRET", "");
    vi.stubEnv("TEST_ACCESS_INFISICAL_ORISO_PROJECT_ID", "project-oriso");
    vi.stubEnv("TEST_ACCESS_INFISICAL_ORIMO_PROJECT_ID", "project-orimo");
    vi.stubEnv("TEST_ACCESS_INFISICAL_DREAMBAU_PROJECT_ID", "project-dreambau");
    expect(() => loadConfig()).toThrow(/INFISICAL_CLIENT_SECRET/);
  });
});
