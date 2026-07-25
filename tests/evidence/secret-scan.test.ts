import { describe, expect, it } from "vitest";
import { isRedactedValue, scanTextForSecrets } from "../../src/evidence/secret-scan.js";

const rules = (text: string) => scanTextForSecrets(text).map((finding) => finding.rule);

describe("scanTextForSecrets", () => {
  it("finds private key blocks", () => {
    expect(rules("-----BEGIN OPENSSH PRIVATE KEY-----")).toContain("private_key_block");
    expect(rules("-----BEGIN PRIVATE KEY-----")).toContain("private_key_block");
  });

  it("finds provider tokens", () => {
    expect(rules(`aws=AKIA${"A".repeat(16)}`)).toContain("aws_access_key_id");
    expect(rules(`ghp_${"a".repeat(36)}`)).toContain("github_token");
    expect(rules(`github_pat_${"a".repeat(50)}`)).toContain("github_fine_grained_token");
    expect(rules(`xoxb-${"1".repeat(12)}-abcdef`)).toContain("slack_token");
    expect(rules(`st.${"a".repeat(20)}.${"b".repeat(20)}`)).toContain("infisical_service_token");
  });

  it("finds JSON web tokens", () => {
    const token = `eyJ${"a".repeat(12)}.${"b".repeat(12)}.${"c".repeat(12)}`;
    expect(rules(`token: ${token}`)).toContain("json_web_token");
  });

  it("finds credential headers and cookies", () => {
    expect(rules("authorization: Bearer abcdefghijklmnop")).toContain("authorization_bearer");
    expect(rules("Set-Cookie: session=abc")).toContain("set_cookie_header");
    expect(rules("cookie: JSESSIONID=0123456789abcdef")).toContain("cookie_header");
    expect(rules("https://admin:hunter2secret@dreambau.com")).toContain("basic_auth_url");
  });

  it("finds assignments, flags and one-time codes", () => {
    expect(rules('password: "hunter2secret"')).toContain("secret_assignment");
    expect(rules("client_secret=abcdefgh12345678")).toContain("secret_assignment");
    expect(rules("playwright --password hunter2secret")).toContain("secret_flag");
    expect(rules("otp: 481923")).toContain("one_time_code");
  });

  it("finds a Playwright storage state by its shape", () => {
    const storageState = '{"cookies":[{"name":"session"}],"origins":[{"origin":"https://dreambau.com"}]}';
    expect(rules(storageState)).toContain("browser_storage_state");
  });

  it("reports the line number and archive entry", () => {
    const findings = scanTextForSecrets("clean line\n-----BEGIN PRIVATE KEY-----", { entry: "trace/log.txt" });
    expect(findings[0]).toMatchObject({ rule: "private_key_block", line: 2, entry: "trace/log.txt" });
  });

  it("leaves ordinary evidence text alone", () => {
    const log = [
      "2026-07-22T09:00:00Z step=login result=PASS",
      "expect(page.getByLabel('Password')).toBeVisible()",
      "the user forgot their password and requested a reset",
      "GET /api/v1/runs 200 in 41ms",
      "Bearer token handling is covered by the auth suite"
    ].join("\n");
    expect(scanTextForSecrets(log)).toEqual([]);
  });

  it("accepts values that are already redacted", () => {
    expect(scanTextForSecrets('password: "***"')).toEqual([]);
    expect(scanTextForSecrets("api_key: <redacted>")).toEqual([]);
    expect(scanTextForSecrets("client_secret: ${CLIENT_SECRET}")).toEqual([]);
    expect(scanTextForSecrets("session_secret: process.env.SESSION_SECRET")).toEqual([]);
    expect(scanTextForSecrets("access_token: xxxxxxxxxxxx")).toEqual([]);
  });

  it("stops at the configured finding limit", () => {
    const noisy = Array.from({ length: 40 }, () => "-----BEGIN PRIVATE KEY-----").join("\n");
    expect(scanTextForSecrets(noisy, { limit: 5 })).toHaveLength(5);
  });
});

describe("isRedactedValue", () => {
  it("treats masks, placeholders and interpolations as safe", () => {
    for (const value of ["***", "xxxxxxxx", "<redacted>", "${SECRET}", "process.env.TOKEN", "null", '""']) {
      expect(isRedactedValue(value), value).toBe(true);
    }
  });

  it("treats real looking values as unsafe", () => {
    for (const value of ["hunter2secret", "abcd1234efgh", "S3cret-Value!"]) {
      expect(isRedactedValue(value), value).toBe(false);
    }
  });
});
