import { describe, expect, it, vi } from "vitest";
import { runInfisicalImportCli } from "../src/server/infisical-import-cli.js";

describe("Infisical import CLI", () => {
  it("reads records from memory, token from Keychain dependency and emits counts only", async () => {
    const output: string[] = [];
    const secret = "fake-imported-password";
    const fetch = vi.fn(async (_input: string | URL, init?: RequestInit) =>
      init?.method === "POST" ? Response.json({ secrets: [] }) : Response.json({ secrets: [], imports: [] }));
    const result = await runInfisicalImportCli(JSON.stringify([{
      id: "oriso/pre-dev/test-user-001", project: "oriso", environment: "pre-dev", kind: "app-user",
      displayName: "Test User 001", username: "test-user-001", email: null, roles: ["user"],
      permissionsDescription: "PreDev user", loginUrl: "https://pre-dev.example.test", secret,
      responsiblePerson: "qa", createdAt: "2026-07-12T00:00:00.000Z", updatedAt: "2026-07-12T00:00:00.000Z",
      expiresAt: null, shared: true, rotationStatus: "current", documentationUrl: "https://docs.example.test"
    }]), {
      readKeychainToken: () => "short-lived-admin-token",
      fetch: fetch as unknown as typeof fetch,
      write: (value) => output.push(value),
      baseUrl: "https://secrets.dreambau.com",
      projectIds: { oriso: "project-oriso", orimo: "project-orimo", dreambau: "project-dreambau" }
    });
    expect(result).toBe(0);
    expect(output).toEqual(["Imported 1 record in 1 batch.\n"]);
    expect(output.join("")).not.toContain(secret);
  });

  it("prints no input or upstream body when validation fails", async () => {
    const errors: string[] = [];
    const fetchMock = vi.fn();
    const result = await runInfisicalImportCli('[{"secret":"do-not-print"}]', {
      readKeychainToken: () => "token", fetch: fetchMock as unknown as typeof fetch, write: () => {}, writeError: (value) => errors.push(value),
      baseUrl: "https://secrets.dreambau.com",
      projectIds: { oriso: "project-oriso", orimo: "project-orimo", dreambau: "project-dreambau" }
    });
    expect(result).toBe(1);
    expect(errors.join("")).toBe("Test access import failed validation.\n");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
