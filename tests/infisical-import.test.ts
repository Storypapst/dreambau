import { describe, expect, it } from "vitest";
import { importTestAccessRecords, secretNameForRecord, type ImportFetch } from "../src/server/infisical-import.js";
import type { TestAccessRecord } from "../src/server/infisical-provider.js";

function record(id: string, environment: "pre-dev" | "dev" = "pre-dev"): TestAccessRecord {
  return {
    id, project: "oriso", environment, kind: "app-user", displayName: id, username: id,
    email: null, roles: ["consultant"], permissionsDescription: "Test account", loginUrl: "https://example.test",
    secret: `secret-for-${id}`, responsiblePerson: "qa", createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z", expiresAt: null, shared: true,
    rotationStatus: "current", documentationUrl: "https://docs.example.test"
  };
}

describe("Infisical record import", () => {
  it("uses opaque stable secret names that do not expose account IDs", () => {
    const name = secretNameForRecord("oriso/pre-dev/test-consultant-001");
    expect(name).toMatch(/^RECORD_[A-F0-9]{24}$/);
    expect(name).not.toContain("CONSULTANT");
    expect(name).toBe(secretNameForRecord("oriso/pre-dev/test-consultant-001"));
  });

  it("preflights without values then creates grouped records under /records", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetch: ImportFetch = async (input, init) => {
      calls.push({ url: String(input), init });
      if (!init?.method || init.method === "GET") return Response.json({ secrets: [], imports: [] });
      return Response.json({ secrets: [] });
    };
    const records = [record("oriso/pre-dev/one"), record("oriso/pre-dev/two"), record("oriso/dev/three", "dev")];
    await expect(importTestAccessRecords({
      baseUrl: "https://secrets.dreambau.com", accessToken: "short-lived-admin-token",
      projectIds: { oriso: "project-oriso", orimo: "project-orimo", dreambau: "project-dreambau" }, records, fetch
    })).resolves.toEqual({ imported: 3, batches: 2 });
    expect(calls).toHaveLength(4);
    expect(calls.slice(0, 2).every((call) => new URL(call.url).searchParams.get("viewSecretValue") === "false")).toBe(true);
    const batch = calls.find((call) => call.url.endsWith("/api/v4/secrets/batch"))!;
    expect(new Headers(batch.init?.headers).get("Authorization")).toBe("Bearer short-lived-admin-token");
    const body = JSON.parse(String(batch.init?.body));
    expect(body).toMatchObject({ projectId: "project-oriso", secretPath: "/records" });
    expect(body.secrets[0]).toMatchObject({ skipMultilineEncoding: true, secretComment: "Managed by Dreambau Test Access Hub import" });
  });

  it("blocks existing keys before any write and never leaks secrets in the error", async () => {
    const target = record("oriso/pre-dev/existing");
    let writes = 0;
    const fetch: ImportFetch = async (_input, init) => {
      if (init?.method === "POST") writes += 1;
      return Response.json({ secrets: [{ secretKey: secretNameForRecord(target.id) }], imports: [] });
    };
    const error = await importTestAccessRecords({
      baseUrl: "https://secrets.dreambau.com", accessToken: "token",
      projectIds: { oriso: "project-oriso", orimo: "project-orimo", dreambau: "project-dreambau" }, records: [target], fetch
    }).catch((value: unknown) => value);
    expect(String(error)).toContain("already exists");
    expect(String(error)).not.toContain(target.secret);
    expect(writes).toBe(0);
  });
});
