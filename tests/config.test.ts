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
    vi.stubEnv("INFISICAL_WRITER_CLIENT_ID", "hub-writer");
    vi.stubEnv("INFISICAL_WRITER_CLIENT_SECRET", "fake-writer-secret");
    const config = loadConfig();
    expect(config.registryProvider).toBe("infisical");
    expect(config.infisical).toEqual({
      baseUrl: "https://secrets.dreambau.com",
      organizationSlug: "dreambau-test-access",
      clientId: "hub-service",
      clientSecret: "fake-client-secret",
      writer: { clientId: "hub-writer", clientSecret: "fake-writer-secret" },
      projectIds: { oriso: "project-oriso", orimo: "project-orimo", dreambau: "project-dreambau" }
    });
    expect(JSON.stringify(config.infisical)).not.toContain("production");
  });

  it("keeps TOTP enrollment disabled unless both separate writer credentials exist", () => {
    vi.stubEnv("TEST_ACCESS_PROVIDER", "infisical");
    vi.stubEnv("INFISICAL_BASE_URL", "https://secrets.dreambau.com");
    vi.stubEnv("INFISICAL_ORGANIZATION_SLUG", "dreambau-test-access");
    vi.stubEnv("INFISICAL_CLIENT_ID", "hub-service");
    vi.stubEnv("INFISICAL_CLIENT_SECRET", "fake-client-secret");
    vi.stubEnv("TEST_ACCESS_INFISICAL_ORISO_PROJECT_ID", "project-oriso");
    vi.stubEnv("TEST_ACCESS_INFISICAL_ORIMO_PROJECT_ID", "project-orimo");
    vi.stubEnv("TEST_ACCESS_INFISICAL_DREAMBAU_PROJECT_ID", "project-dreambau");
    expect(loadConfig().infisical?.writer).toBeNull();
    vi.stubEnv("INFISICAL_WRITER_CLIENT_ID", "writer-only");
    expect(() => loadConfig()).toThrow(/INFISICAL_WRITER/);
  });

  it("rejects reusing the reader identity as the TOTP writer", () => {
    vi.stubEnv("TEST_ACCESS_PROVIDER", "infisical");
    vi.stubEnv("INFISICAL_BASE_URL", "https://secrets.dreambau.com");
    vi.stubEnv("INFISICAL_ORGANIZATION_SLUG", "dreambau-test-access");
    vi.stubEnv("INFISICAL_CLIENT_ID", "shared-identity");
    vi.stubEnv("INFISICAL_CLIENT_SECRET", "reader-secret");
    vi.stubEnv("INFISICAL_WRITER_CLIENT_ID", "shared-identity");
    vi.stubEnv("INFISICAL_WRITER_CLIENT_SECRET", "writer-secret");
    vi.stubEnv("TEST_ACCESS_INFISICAL_ORISO_PROJECT_ID", "project-oriso");
    vi.stubEnv("TEST_ACCESS_INFISICAL_ORIMO_PROJECT_ID", "project-orimo");
    vi.stubEnv("TEST_ACCESS_INFISICAL_DREAMBAU_PROJECT_ID", "project-dreambau");

    expect(() => loadConfig()).toThrow(/separate.*identity/i);
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

  it("loads complete SMTP configuration only with a separate OTP HMAC key", () => {
    vi.stubEnv("TESTMAILS_SMTP_HOST", "mail.dreambau.com");
    vi.stubEnv("TESTMAILS_SMTP_PORT", "465");
    vi.stubEnv("TESTMAILS_SMTP_USERNAME", "otp@dreambau.com");
    vi.stubEnv("TESTMAILS_SMTP_PASSWORD", "test-only-secret");
    vi.stubEnv("TESTMAILS_SMTP_FROM_ADDRESS", "otp@dreambau.com");
    expect(() => loadConfig()).toThrow(/HMAC/);
    vi.stubEnv("TESTMAILS_EMAIL_OTP_HMAC_KEY", "1234567890123456789012345678901");
    expect(() => loadConfig()).toThrow(/at least 32 characters/);
    vi.stubEnv("TESTMAILS_EMAIL_OTP_HMAC_KEY", "12345678901234567890123456789012");
    expect(loadConfig().smtp).toMatchObject({ host: "mail.dreambau.com", port: 465, secure: true });
  });
});
