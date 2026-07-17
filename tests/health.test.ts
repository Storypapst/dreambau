import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/server/app.js";
import type { RegistryProvider } from "../src/server/infisical-provider.js";

describe("health checks", () => {
  it("keeps liveness independent but fails readiness when the registry is unavailable", async () => {
    const registryProvider: RegistryProvider = {
      async list() { return []; },
      async get() { return null; },
      async health() { throw new Error("upstream-secret-detail"); }
    };
    const app = createApp({ passwordHash: "unused", secureCookies: false, loadAccounts: () => [], registryProvider });
    await expect(request(app).get("/testmails/health/live")).resolves.toMatchObject({ status: 200, body: { status: "ok" } });
    const ready = await request(app).get("/testmails/health/ready");
    expect(ready.status).toBe(503);
    expect(ready.body).toEqual({ status: "unavailable" });
    expect(JSON.stringify(ready.body)).not.toContain("upstream-secret-detail");
  });
});
