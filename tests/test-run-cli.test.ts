import { describe, expect, it, vi } from "vitest";
import { buildRunApiRequest, runTestRunCli } from "../src/server/test-run-cli.js";

describe("test-access run CLI", () => {
  it("builds the exact three headless requests and validates their identifiers locally", () => {
    const runId = "59c238e5-6115-4aef-bfb4-2f19091017cf";
    const resourceId = "7ecdd754-8d9f-4abc-8a77-e15bdbec38d2";
    const bindingHash = "a".repeat(64);
    const path = `/runs/${runId}/headless-registration`;
    expect(buildRunApiRequest(["headless-prepare", runId])).toEqual({ method: "GET", path });
    expect(buildRunApiRequest(["headless-claim", runId, "--binding-hash", bindingHash]))
      .toEqual({ method: "POST", path, body: { bindingHash } });
    expect(buildRunApiRequest(["headless-report", runId, "--resource-id", resourceId, "--result", "uncertain"]))
      .toEqual({ method: "POST", path: `${path}/${resourceId}/outcome`, body: { result: "uncertain" } });
    expect(() => buildRunApiRequest(["headless-prepare", "run-1"])).toThrow();
    expect(() => buildRunApiRequest(["headless-claim", runId, "--binding-hash", "bad"])).toThrow();
    expect(() => buildRunApiRequest(["headless-report", runId, "--resource-id", resourceId, "--result", "present"])).toThrow();
  });

  it("accepts optional measured finish evidence while preserving old finish payloads", () => {
    expect(buildRunApiRequest(["finish", "run-1", "--result", "failed", "--checks", "12", "--failures", "1", "--report-url", "https://evidence.dreambau.com/r/existing"])).toEqual({ method: "POST", path: "/runs/run-1/finish", body: { result: "failed", evidence: { checks: 12, failures: 1, reportUrl: "https://evidence.dreambau.com/r/existing" } } });
    expect(buildRunApiRequest(["finish", "run-1", "--result", "passed"]).body).toEqual({ result: "passed" });
    expect(() => buildRunApiRequest(["finish", "run-1", "--result", "passed", "--checks", "-1"])).toThrow();
    expect(() => buildRunApiRequest(["finish", "run-1", "--result", "passed", "--report-url", "javascript:alert(1)"])).toThrow();
    expect(() => buildRunApiRequest(["finish", "run-1", "--result", "passed", "--checks"])).toThrow();
    expect(() => buildRunApiRequest(["finish", "run-1", "--result", "passed", "--report-url", "https://example.test/report?api_key=private-token"])).toThrow();
  });
  it("builds a versioned cohort request from repeated role flags", () => {
    expect(buildRunApiRequest([
      "create",
      "--project", "oriso",
      "--target", "pre-dev",
      "--pool", "production-test",
      "--version", "4.9",
      "--commit", "abcdef1",
      "--scenario", "three-way-chat",
      "--role", "consultant=2",
      "--role", "user=1"
    ])).toEqual({
      method: "POST",
      path: "/runs",
      body: {
        project: "oriso",
        targetEnvironment: "pre-dev",
        poolEnvironment: "production-test",
        applicationVersion: "4.9",
        commitSha: "abcdef1",
        scenario: "three-way-chat",
        roles: [
          { role: "consultant", count: 2 },
          { role: "user", count: 1 }
        ]
      }
    });
  });

  it("rejects a create command with missing required flags locally", () => {
    expect(() => buildRunApiRequest(["create", "--project", "oriso"]))
      .toThrow(/--target is required/);
  });

  it("keeps the bearer token out of request bodies and output", async () => {
    const output: string[] = [];
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect(String(init.headers)).not.toContain("machine-secret-token");
      expect(init.headers).toEqual({ authorization: "Bearer machine-secret-token", "content-type": "application/json" });
      expect(String(init.body)).not.toContain("machine-secret-token");
      return Response.json({ id: "run-1", status: "reserved", accounts: [] }, { status: 201 });
    });
    const result = await runTestRunCli([
      "create", "--project", "oriso", "--target", "pre-dev", "--pool", "production-test",
      "--version", "4.9", "--commit", "abcdef1", "--scenario", "smoke", "--role", "user=1"
    ], {
      baseUrl: "https://dreambau.com/testmails/api/v1",
      identity: "kio-oriso",
      readKeychainToken: () => "machine-secret-token",
      fetch: fetchMock as unknown as typeof fetch,
      write: (value) => output.push(value),
      writeError: (value) => output.push(value)
    });
    expect(result).toBe(0);
    expect(output.join("")).not.toContain("machine-secret-token");
  });
});
