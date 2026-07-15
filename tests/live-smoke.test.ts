import { describe, expect, it, vi } from "vitest";

import { checkLiveTestAccess } from "../src/server/live-smoke.js";

function response(status: number, contentType: string, body: unknown): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": contentType },
  });
}

describe("live Test Access smoke gate", () => {
  it("accepts real JSON health routes and an authenticated v1 boundary", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/health/live") || url.endsWith("/health/ready")) {
        return response(200, "application/json", { status: "ok" });
      }
      if (url.endsWith("/api/v1/accounts")) {
        return response(401, "application/json", { error: "unauthorized" });
      }
      if (url === "https://box.dreambau.com/.well-known/jmap") {
        return response(401, "application/json", { error: "unauthorized" });
      }
      throw new Error(`unexpected URL: ${url}`);
    });

    await expect(checkLiveTestAccess({ fetchImpl })).resolves.toEqual({
      ok: true,
      checks: ["liveness", "readiness", "v1-auth-boundary", "jmap-boundary"],
    });
  });

  it("rejects a SPA fallback even when it returns HTTP 200", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/api/v1/accounts")) {
        return response(200, "text/html", "<html>Testmails</html>");
      }
      return response(200, "application/json", { status: "ok" });
    });

    await expect(checkLiveTestAccess({ fetchImpl })).rejects.toThrow(
      "v1-auth-boundary returned text/html with status 200",
    );
  });

  it("disables redirects for every boundary probe", async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(init?.redirect).toBe("error");
      return response(200, "application/json", { status: "ok" });
    });

    await expect(checkLiveTestAccess({ fetchImpl })).rejects.toThrow("v1-auth-boundary returned application/json with status 200");
    expect(fetchImpl).toHaveBeenCalled();
  });
});
