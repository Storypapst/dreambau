import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/server/app.js";
import { createDatabase } from "../src/server/db.js";
import type { MachineIdentity } from "../src/server/machine-access.js";

const validToken = "fake-kit-subscription-token";
const revokedToken = "fake-revoked-kit-token";
const expiredToken = "fake-expired-kit-token";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

function identities(): MachineIdentity[] {
  return [
    {
      id: "kit-subscriber",
      tokenHash: hash(validToken),
      projects: ["oriso"],
      environments: ["pre-dev"],
      expiresAt: "2099-01-01T00:00:00.000Z",
      revokedAt: null
    },
    {
      id: "kit-subscriber-revoked",
      tokenHash: hash(revokedToken),
      projects: ["oriso"],
      environments: ["pre-dev"],
      expiresAt: "2099-01-01T00:00:00.000Z",
      revokedAt: "2026-01-01T00:00:00.000Z"
    },
    {
      id: "kit-subscriber-expired",
      tokenHash: hash(expiredToken),
      projects: ["oriso"],
      environments: ["pre-dev"],
      expiresAt: "2020-01-01T00:00:00.000Z",
      revokedAt: null
    }
  ];
}

const manifest = {
  name: "oriso-understand-kit",
  version: "0.2.0",
  date: "2026-09-05",
  changelog: ["0.2.0 — subscription endpoint"],
  files: [{ path: "README.md", sha256: hash("readme") }]
};

const archiveBody = Buffer.from("not-a-real-gzip-but-bytes-are-bytes");

/** A kit directory with a manifest and, optionally, a built bundle. */
function kitDir(options: { withBundle: boolean }) {
  const dir = mkdtempSync(path.join(tmpdir(), "understand-kit-"));
  writeFileSync(path.join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  if (options.withBundle) {
    mkdirSync(path.join(dir, "dist"));
    writeFileSync(path.join(dir, "dist", `understand-kit-${manifest.version}.tar.gz`), archiveBody);
  }
  return dir;
}

function app(options: { withBundle: boolean }) {
  const database = createDatabase(path.join(mkdtempSync(path.join(tmpdir(), "kit-db-")), "test.sqlite"));
  return createApp({
    passwordHash: "unused",
    secureCookies: false,
    database,
    loadAccounts: () => [],
    machineIdentities: identities(),
    understandKitDir: kitDir(options)
  });
}

const bundleEtag = `"${createHash("sha256").update(archiveBody).digest("hex")}"`;

describe("understand kit subscription API v1", () => {
  it("rejects a request without a token", async () => {
    const response = await request(app({ withBundle: true })).get("/understand/api/v1/kit/manifest");
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "unauthorized" });
  });

  it("rejects a revoked token", async () => {
    const response = await request(app({ withBundle: true }))
      .get("/understand/api/v1/kit/manifest")
      .set("authorization", `Bearer ${revokedToken}`);
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "unauthorized" });
  });

  it("rejects an expired token", async () => {
    const response = await request(app({ withBundle: true }))
      .get("/understand/api/v1/kit/bundle")
      .set("authorization", `Bearer ${expiredToken}`);
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "unauthorized" });
  });

  it("serves the manifest to a valid token", async () => {
    const response = await request(app({ withBundle: true }))
      .get("/understand/api/v1/kit/manifest")
      .set("authorization", `Bearer ${validToken}`);
    expect(response.status).toBe(200);
    expect(response.body.version).toBe("0.2.0");
    expect(response.body.files).toHaveLength(1);
  });

  it("serves the bundle with a sha256 ETag and a download filename", async () => {
    const response = await request(app({ withBundle: true }))
      .get("/understand/api/v1/kit/bundle")
      .set("authorization", `Bearer ${validToken}`);
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("application/gzip");
    expect(response.headers["content-disposition"]).toBe('attachment; filename="understand-kit-0.2.0.tar.gz"');
    expect(response.headers.etag).toBe(bundleEtag);
    expect(Buffer.from(response.body).equals(archiveBody)).toBe(true);
  });

  it("answers 304 when the client already has that bundle", async () => {
    const response = await request(app({ withBundle: true }))
      .get("/understand/api/v1/kit/bundle")
      .set("authorization", `Bearer ${validToken}`)
      .set("if-none-match", bundleEtag);
    expect(response.status).toBe(304);
  });

  it("answers 503 bundle not built when dist/ is missing", async () => {
    const response = await request(app({ withBundle: false }))
      .get("/understand/api/v1/kit/bundle")
      .set("authorization", `Bearer ${validToken}`);
    expect(response.status).toBe(503);
    expect(response.body.error).toBe("bundle_not_built");
    expect(response.body.message).toContain("bundle not built");
  });
});
