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
    expect(calls).toHaveLength(5);
    expect(calls.slice(0, 2).every((call) => new URL(call.url).searchParams.get("viewSecretValue") === "false")).toBe(true);
    const creates = calls.slice(2);
    expect(creates.every((call) => call.url.includes("/api/v4/secrets/RECORD_"))).toBe(true);
    expect(new Headers(creates[0].init?.headers).get("Authorization")).toBe("Bearer short-lived-admin-token");
    const body = JSON.parse(String(creates[0].init?.body));
    expect(body).toMatchObject({ projectId: "project-oriso", secretPath: "/records" });
    expect(body).toMatchObject({ skipMultilineEncoding: true, secretComment: "Managed by Dreambau Test Access Hub import", type: "shared" });
  });

  it("bootstraps the first import when the empty /records path does not exist yet", async () => {
    const writes: Array<{ url: string; body: unknown }> = [];
    const fetch: ImportFetch = async (input, init) => {
      if (!init?.method || init.method === "GET") {
        return Response.json({ error: "SecretPathNotFound" }, { status: 404 });
      }
      writes.push({ url: String(input), body: JSON.parse(String(init.body)) });
      return String(input).endsWith("/api/v2/folders")
        ? Response.json({ folder: { id: "folder-id" } })
        : Response.json({ secret: { id: "secret-id" } });
    };

    await expect(importTestAccessRecords({
      baseUrl: "https://secrets.dreambau.com",
      accessToken: "short-lived-admin-token",
      projectIds: { oriso: "project-oriso", orimo: "project-orimo", dreambau: "project-dreambau" },
      records: [record("oriso/pre-dev/first")],
      fetch,
    })).resolves.toEqual({ imported: 1, batches: 1 });
    expect(writes).toHaveLength(2);
    expect(writes[0]).toEqual({
      url: "https://secrets.dreambau.com/api/v2/folders",
      body: { projectId: "project-oriso", environment: "pre-dev", name: "records", path: "/", description: "Dreambau Test Access Hub records" },
    });
    expect(writes[1]).toMatchObject({
      url: `https://secrets.dreambau.com/api/v4/secrets/${secretNameForRecord("oriso/pre-dev/first")}`,
      body: { projectId: "project-oriso", environment: "pre-dev", secretPath: "/records", type: "shared" },
    });
  });

  it("keeps unrelated 404 responses as hard preflight failures", async () => {
    let writes = 0;
    const fetch: ImportFetch = async (_input, init) => {
      if (init?.method === "POST") writes += 1;
      return Response.json({ error: "ProjectNotFound" }, { status: 404 });
    };

    await expect(importTestAccessRecords({
      baseUrl: "https://secrets.dreambau.com",
      accessToken: "short-lived-admin-token",
      projectIds: { oriso: "project-oriso", orimo: "project-orimo", dreambau: "project-dreambau" },
      records: [record("oriso/pre-dev/blocked")],
      fetch,
    })).rejects.toThrow("Infisical import preflight failed");
    expect(writes).toBe(0);
  });

  it("rolls back secrets created earlier in the same import when a later create fails", async () => {
    const first = record("oriso/pre-dev/first-created");
    const second = record("oriso/pre-dev/second-fails");
    const calls: Array<{ url: string; method: string; body?: unknown }> = [];
    let creates = 0;
    const fetch: ImportFetch = async (input, init) => {
      const method = init?.method ?? "GET";
      calls.push({ url: String(input), method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (method === "GET") return Response.json({ secrets: [], imports: [] });
      if (method === "DELETE") return Response.json({ secret: { id: "deleted" } });
      creates += 1;
      return creates === 1
        ? Response.json({ secret: { id: "created" } })
        : Response.json({ error: "write failed" }, { status: 500 });
    };

    await expect(importTestAccessRecords({
      baseUrl: "https://secrets.dreambau.com",
      accessToken: "short-lived-admin-token",
      projectIds: { oriso: "project-oriso", orimo: "project-orimo", dreambau: "project-dreambau" },
      records: [first, second],
      fetch,
    })).rejects.toThrow("Infisical record import failed");

    const deletes = calls.filter((call) => call.method === "DELETE");
    expect(deletes.map((entry) => entry.url)).toEqual([
      `https://secrets.dreambau.com/api/v4/secrets/${secretNameForRecord(second.id)}`,
      `https://secrets.dreambau.com/api/v4/secrets/${secretNameForRecord(first.id)}`
    ]);
  });

  it("continues rollback after an independent delete failure and reports unresolved cleanup", async () => {
    const records = [record("oriso/pre-dev/first"), record("oriso/pre-dev/second"), record("oriso/pre-dev/third")];
    const deleted: string[] = [];
    let creates = 0;
    const fetch: ImportFetch = async (input, init) => {
      const method = init?.method ?? "GET";
      if (method === "GET") return Response.json({ secrets: [], imports: [] });
      if (method === "POST") {
        creates += 1;
        if (creates === 3) throw new Error("connection lost after possible write");
        return Response.json({ secret: { id: "created" } });
      }
      deleted.push(String(input));
      if (deleted.length === 1) throw new Error("delete unavailable");
      return Response.json({ secret: { id: "deleted" } });
    };

    await expect(importTestAccessRecords({
      baseUrl: "https://secrets.dreambau.com", accessToken: "token",
      projectIds: { oriso: "project-oriso", orimo: "project-orimo", dreambau: "project-dreambau" }, records, fetch
    })).rejects.toThrow(/rollback is incomplete.*1 unresolved/i);
    expect(deleted).toHaveLength(3);
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
