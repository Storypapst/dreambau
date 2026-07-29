import { describe, expect, it, vi } from "vitest";
import type { TestAccessRecord } from "../src/server/infisical-provider.js";
import { secretNameForRecord } from "../src/server/infisical-import.js";
import { createInfisicalRegistryWriter, type WriterFetch } from "../src/server/infisical-writer.js";

const writerSecret = "writer-client-secret-never-log";
const totpSecret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

function record(patch: Partial<TestAccessRecord> = {}): TestAccessRecord {
  return {
    id: "oriso/pre-dev/e2e-platform-admin-predev",
    project: "oriso",
    environment: "pre-dev",
    kind: "admin",
    displayName: "Abe Simpson",
    username: "abe.simpson@dreambau.de",
    email: "abe.simpson@dreambau.de",
    roles: ["platform-admin"],
    permissionsDescription: "Dedicated PreDev test administrator",
    loginUrl: "https://admin.oriso-dev.site",
    secret: "application-password",
    responsiblePerson: "qa",
    createdAt: "2026-07-29T08:00:00.000Z",
    updatedAt: "2026-07-29T08:00:00.000Z",
    expiresAt: null,
    shared: true,
    rotationStatus: "current",
    documentationUrl: "https://dreambau.com/testmails/",
    ...patch
  };
}

describe("Infisical TOTP writer", () => {
  it("reads the current scoped record and patches only a validated TOTP update", async () => {
    const calls: Array<{ url: URL; init?: RequestInit }> = [];
    const current = record();
    const fetch: WriterFetch = async (input, init) => {
      const url = new URL(String(input));
      calls.push({ url, init });
      if (url.pathname.endsWith("/login")) {
        return Response.json({ accessToken: "short-lived-writer-token", expiresIn: 60, accessTokenMaxTTL: 60, tokenType: "Bearer" });
      }
      if (init?.method === "PATCH") return Response.json({ secret: { id: "updated" } });
      return Response.json({
        secret: {
          secretKey: secretNameForRecord(current.id),
          secretValue: JSON.stringify(current)
        }
      });
    };
    const writer = createInfisicalRegistryWriter({
      baseUrl: "https://secrets.dreambau.com",
      organizationSlug: "dreambau-test-access",
      clientId: "test-access-writer",
      clientSecret: writerSecret,
      projectIds: { oriso: "project-oriso", orimo: "project-orimo", dreambau: "project-dreambau" },
      fetch
    });

    await expect(writer.enrollTotp(current, totpSecret, "2026-07-29T10:00:00.000Z")).resolves.toEqual({
      recordId: current.id,
      updatedAt: "2026-07-29T10:00:00.000Z"
    });
    expect(calls).toHaveLength(3);
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      clientId: "test-access-writer",
      clientSecret: writerSecret,
      organizationSlug: "dreambau-test-access"
    });
    const read = calls[1];
    expect(read.url.pathname).toBe(`/api/v4/secrets/${secretNameForRecord(current.id)}`);
    expect(Object.fromEntries(read.url.searchParams)).toMatchObject({
      projectId: "project-oriso",
      environment: "pre-dev",
      secretPath: "/records",
      type: "shared",
      viewSecretValue: "true",
      expandSecretReferences: "false"
    });
    const patch = calls[2];
    expect(patch.init?.method).toBe("PATCH");
    expect(new Headers(patch.init?.headers).get("Authorization")).toBe("Bearer short-lived-writer-token");
    const body = JSON.parse(String(patch.init?.body));
    expect(body).toMatchObject({
      projectId: "project-oriso",
      environment: "pre-dev",
      secretPath: "/records",
      type: "shared",
      skipMultilineEncoding: true,
      secretComment: "TOTP managed by Dreambau Test Access Hub"
    });
    expect(JSON.parse(body.secretValue)).toEqual({
      ...current,
      totpSecret,
      updatedAt: "2026-07-29T10:00:00.000Z"
    });
  });

  it("rejects scope drift before patching", async () => {
    const fetch = vi.fn(async (input: string | URL, init?: RequestInit) => {
      if (String(input).includes("/login")) {
        return Response.json({ accessToken: "token", expiresIn: 60, accessTokenMaxTTL: 60, tokenType: "Bearer" });
      }
      if (init?.method === "PATCH") throw new Error("must not patch");
      return Response.json({
        secret: {
          secretKey: secretNameForRecord(record().id),
          secretValue: JSON.stringify(record({ environment: "dev" }))
        }
      });
    });
    const writer = createInfisicalRegistryWriter({
      baseUrl: "https://secrets.dreambau.com",
      organizationSlug: "dreambau-test-access",
      clientId: "writer",
      clientSecret: writerSecret,
      projectIds: { oriso: "project-oriso", orimo: "project-orimo", dreambau: "project-dreambau" },
      fetch: fetch as WriterFetch
    });

    await expect(writer.enrollTotp(record(), totpSecret, "2026-07-29T10:00:00.000Z"))
      .rejects.toThrow("Infisical TOTP record validation failed");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("serializes enrollment per record so concurrent requests cannot replace a TOTP", async () => {
    let current = record();
    const fetch: WriterFetch = async (input, init) => {
      if (String(input).includes("/login")) {
        return Response.json({ accessToken: "token", expiresIn: 60, accessTokenMaxTTL: 60, tokenType: "Bearer" });
      }
      if (init?.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        current = JSON.parse(body.secretValue) as TestAccessRecord;
        return Response.json({ secret: { id: "updated" } });
      }
      return Response.json({
        secret: {
          secretKey: secretNameForRecord(current.id),
          secretValue: JSON.stringify(current)
        }
      });
    };
    const writer = createInfisicalRegistryWriter({
      baseUrl: "https://secrets.dreambau.com",
      organizationSlug: "dreambau-test-access",
      clientId: "writer",
      clientSecret: writerSecret,
      projectIds: { oriso: "project-oriso", orimo: "project-orimo", dreambau: "project-dreambau" },
      fetch
    });

    const results = await Promise.allSettled([
      writer.enrollTotp(record(), totpSecret, "2026-07-29T10:00:00.000Z"),
      writer.enrollTotp(record(), "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP", "2026-07-29T10:00:01.000Z")
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(current.totpSecret).toBe(totpSecret);
  });

  it("refuses an enrollment when the latest Infisical record already has TOTP", async () => {
    const current = record({ totpSecret });
    const fetch = vi.fn(async (input: string | URL, init?: RequestInit) => {
      if (String(input).includes("/login")) {
        return Response.json({ accessToken: "token", expiresIn: 60, accessTokenMaxTTL: 60, tokenType: "Bearer" });
      }
      if (init?.method === "PATCH") throw new Error("must not patch");
      return Response.json({
        secret: {
          secretKey: secretNameForRecord(current.id),
          secretValue: JSON.stringify(current)
        }
      });
    });
    const writer = createInfisicalRegistryWriter({
      baseUrl: "https://secrets.dreambau.com",
      organizationSlug: "dreambau-test-access",
      clientId: "writer",
      clientSecret: writerSecret,
      projectIds: { oriso: "project-oriso", orimo: "project-orimo", dreambau: "project-dreambau" },
      fetch: fetch as WriterFetch
    });

    await expect(writer.enrollTotp(record(), "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP", "2026-07-29T10:00:00.000Z"))
      .rejects.toThrow("TOTP already enrolled");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("creates a new provisioned record secret in the right scope", async () => {
    const calls: Array<{ url: URL; init?: RequestInit }> = [];
    const fetch: WriterFetch = async (input, init) => {
      const url = new URL(String(input));
      calls.push({ url, init });
      if (url.pathname.endsWith("/login")) {
        return Response.json({ accessToken: "writer-token", expiresIn: 60, accessTokenMaxTTL: 60, tokenType: "Bearer" });
      }
      return Response.json({ secret: { id: "created" } });
    };
    const writer = createInfisicalRegistryWriter({
      baseUrl: "https://secrets.dreambau.com",
      organizationSlug: "dreambau-test-access",
      clientId: "writer",
      clientSecret: writerSecret,
      projectIds: { oriso: "project-oriso", orimo: "project-orimo", dreambau: "project-dreambau" },
      fetch
    });
    const created = record({ id: "oriso/pre-dev/lisa.simpson", email: "lisa.simpson@oriso.org", username: "lisa.simpson@oriso.org" });

    await expect(writer.createRecord!(created)).resolves.toEqual({ recordId: created.id });
    const post = calls[1];
    expect(post.url.pathname).toBe(`/api/v4/secrets/${secretNameForRecord(created.id)}`);
    expect(post.init?.method).toBe("POST");
    const body = JSON.parse(String(post.init?.body));
    expect(body).toMatchObject({
      projectId: "project-oriso",
      environment: "pre-dev",
      secretPath: "/records",
      type: "shared",
      skipMultilineEncoding: true,
      secretComment: "Provisioned by Dreambau Test Access Hub"
    });
    expect(JSON.parse(body.secretValue)).toEqual(created);
  });

  it("updates only the scoped record when provisioning state changes", async () => {
    const calls: Array<{ url: URL; init?: RequestInit }> = [];
    const fetch: WriterFetch = async (input, init) => {
      const url = new URL(String(input));
      calls.push({ url, init });
      if (url.pathname.endsWith("/login")) {
        return Response.json({ accessToken: "writer-token", expiresIn: 60, accessTokenMaxTTL: 60, tokenType: "Bearer" });
      }
      if (init?.method === "PATCH") return Response.json({ secret: { id: "updated" } });
      return Response.json({
        secret: {
          secretKey: secretNameForRecord(record().id),
          secretValue: JSON.stringify(record({ permissionsDescription: "Concurrent metadata survives" }))
        }
      });
    };
    const writer = createInfisicalRegistryWriter({
      baseUrl: "https://secrets.dreambau.com",
      organizationSlug: "dreambau-test-access",
      clientId: "writer",
      clientSecret: writerSecret,
      projectIds: { oriso: "project-oriso", orimo: "project-orimo", dreambau: "project-dreambau" },
      fetch
    });
    const updated = record({
      provisioningStatus: "ready",
      updatedAt: "2026-07-29T11:00:00.000Z"
    });

    await expect(writer.updateRecord!(updated)).resolves.toEqual({
      recordId: updated.id,
      updatedAt: updated.updatedAt
    });
    const patch = calls[2];
    expect(patch.url.pathname).toBe(`/api/v4/secrets/${secretNameForRecord(updated.id)}`);
    expect(patch.init?.method).toBe("PATCH");
    const body = JSON.parse(String(patch.init?.body));
    expect(body).toMatchObject({
      projectId: "project-oriso",
      environment: "pre-dev",
      secretPath: "/records",
      type: "shared",
      secretComment: "Provisioning state managed by Dreambau Test Access Hub"
    });
    expect(JSON.parse(body.secretValue)).toEqual({
      ...record({ permissionsDescription: "Concurrent metadata survives" }),
      provisioningStatus: "ready",
      updatedAt: updated.updatedAt
    });
  });

  it("rejects failed and unsupported provisioning-state updates", async () => {
    const fetch: WriterFetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/login")) {
        return Response.json({ accessToken: "writer-token", expiresIn: 60, accessTokenMaxTTL: 60, tokenType: "Bearer" });
      }
      if (init?.method !== "PATCH") {
        return Response.json({
          secret: {
            secretKey: secretNameForRecord(record().id),
            secretValue: JSON.stringify(record())
          }
        });
      }
      return Response.json({ error: "upstream failed" }, { status: 502 });
    };
    const writer = createInfisicalRegistryWriter({
      baseUrl: "https://secrets.dreambau.com",
      organizationSlug: "dreambau-test-access",
      clientId: "writer",
      clientSecret: writerSecret,
      projectIds: { oriso: "project-oriso", orimo: "project-orimo", dreambau: "project-dreambau" },
      fetch
    });

    await expect(writer.updateRecord!(record())).rejects.toThrow("Infisical record update failed");
    await expect(writer.updateRecord!(record({ kind: "mailbox" }))).rejects.toThrow(
      "Infisical record update only supports application records"
    );
  });

  it("creates the records folder once when the secret path does not exist yet", async () => {
    const calls: Array<{ url: URL; init?: RequestInit }> = [];
    let folderCreated = false;
    const fetch: WriterFetch = async (input, init) => {
      const url = new URL(String(input));
      calls.push({ url, init });
      if (url.pathname.endsWith("/login")) {
        return Response.json({ accessToken: "writer-token", expiresIn: 60, accessTokenMaxTTL: 60, tokenType: "Bearer" });
      }
      if (url.pathname === "/api/v2/folders") {
        folderCreated = true;
        return Response.json({ folder: { id: "records" } });
      }
      if (!folderCreated) return Response.json({ error: "SecretPathNotFound" }, { status: 404 });
      return Response.json({ secret: { id: "created" } });
    };
    const writer = createInfisicalRegistryWriter({
      baseUrl: "https://secrets.dreambau.com",
      organizationSlug: "dreambau-test-access",
      clientId: "writer",
      clientSecret: writerSecret,
      projectIds: { oriso: "project-oriso", orimo: "project-orimo", dreambau: "project-dreambau" },
      fetch
    });

    await expect(writer.createRecord!(record({ id: "oriso/pre-dev/lisa.simpson" }))).resolves.toEqual({ recordId: "oriso/pre-dev/lisa.simpson" });
    expect(calls.filter((call) => call.url.pathname === "/api/v2/folders")).toHaveLength(1);
  });

  it("refuses to create non-application records and reports creation failures generically", async () => {
    const fetch: WriterFetch = async (input) => {
      if (String(input).includes("/login")) {
        return Response.json({ accessToken: "writer-token", expiresIn: 60, accessTokenMaxTTL: 60, tokenType: "Bearer" });
      }
      return new Response(`duplicate ${writerSecret}`, { status: 400 });
    };
    const writer = createInfisicalRegistryWriter({
      baseUrl: "https://secrets.dreambau.com",
      organizationSlug: "dreambau-test-access",
      clientId: "writer",
      clientSecret: writerSecret,
      projectIds: { oriso: "project-oriso", orimo: "project-orimo", dreambau: "project-dreambau" },
      fetch
    });

    await expect(writer.createRecord!(record({ kind: "mailbox" })))
      .rejects.toThrow("Infisical record creation only supports application records");
    const error = await writer.createRecord!(record()).catch((value: unknown) => value);
    expect(String(error)).toContain("Infisical record creation failed");
    expect(String(error)).not.toContain(writerSecret);
  });

  it("never includes credentials, seed or upstream bodies in errors", async () => {
    const fetch: WriterFetch = async () => new Response(`leaked ${writerSecret} ${totpSecret}`, { status: 403 });
    const writer = createInfisicalRegistryWriter({
      baseUrl: "https://secrets.dreambau.com",
      organizationSlug: "dreambau-test-access",
      clientId: "writer",
      clientSecret: writerSecret,
      projectIds: { oriso: "project-oriso", orimo: "project-orimo", dreambau: "project-dreambau" },
      fetch
    });

    const error = await writer.enrollTotp(record(), totpSecret, "2026-07-29T10:00:00.000Z").catch((value: unknown) => value);
    expect(String(error)).toContain("Infisical TOTP authentication failed");
    expect(String(error)).not.toContain(writerSecret);
    expect(String(error)).not.toContain(totpSecret);
    expect(String(error)).not.toContain("leaked");
  });
});
