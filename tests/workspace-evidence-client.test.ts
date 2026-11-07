import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkspaceEvidenceClient, WorkspaceEvidenceUnavailable } from "../src/server/workspace-evidence-client.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
function fixture(fetcher: typeof fetch) {
  const root = mkdtempSync(path.join(tmpdir(), "workspace-reader-")); roots.push(root);
  const tokenFile = path.join(root, "token"); writeFileSync(tokenFile, "fixture-service-read-token");
  return createWorkspaceEvidenceClient({ baseUrl: "https://evidence.example.test/api/v1", tokenFile }, fetcher);
}
describe("server-only evidence read bridge", () => {
  it("uses only its configured origin and secret-file credential, retaining scoped pagination", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.origin).toBe("https://evidence.example.test"); expect(url.pathname).toBe("/api/v1/runs");
      expect(url.searchParams.get("environments")).toBe("dev,pre-dev");
      expect(init?.headers).toEqual({ authorization: "Bearer fixture-service-read-token" });
      expect(init?.redirect).toBe("error");
      return Response.json({ items: [], nextCursor: "next", token: "should-not-leak" });
    });
    const result = await fixture(fetcher).list({ project: "oriso", environments: ["dev", "pre-dev"], limit: 20 });
    expect(result).toEqual({ items: [], nextCursor: "next" });
  });
  it("forwards content ranges without buffering bytes and distinguishes missing from unavailable metadata", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith("/missing")) return new Response(null, { status: 404 });
      if (String(input).endsWith("/failed")) return new Response("credential-bearing upstream error", { status: 503 });
      expect(new Headers(init?.headers).get("range")).toBe("bytes=0-2");
      return new Response(new Uint8Array([1, 2, 3]), { status: 206, headers: { "content-range": "bytes 0-2/10" } });
    });
    const client = fixture(fetcher);
    expect(await client.get("missing")).toBeNull();
    await expect(client.get("failed")).rejects.toThrow(WorkspaceEvidenceUnavailable);
    const response = await client.content("run", "file", "bytes=0-2");
    expect(response.status).toBe(206); expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([1, 2, 3]);
    expect(() => createWorkspaceEvidenceClient({ baseUrl: "https://user:password@example.test/api/v1", tokenFile: "/not-read" })).toThrow("invalid evidence bridge URL");
  });
});
