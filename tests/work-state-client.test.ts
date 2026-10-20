import { afterEach, expect, it, vi } from "vitest";
import {
  loadAttention,
  loadPullDetail,
  refreshWorkState,
} from "../src/client/work-state-client.js";
afterEach(() => vi.unstubAllGlobals());
it("encodes filters and uses the existing authenticated API boundary", async () => {
  let path = "";
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    path = String(input);
    return new Response(JSON.stringify({ items: [], nextCursor: null }), {
      status: 200,
    });
  });
  await loadAttention({
    view: "waiting",
    person: "Lisa & Bart",
    repositoryId: "A",
    cursor: 25,
  });
  const url = new URL(path, "https://local.test");
  expect(url.pathname).toBe("/testmails/api/work-state/attention");
  expect(url.searchParams.get("person")).toBe("Lisa & Bart");
  expect(url.searchParams.get("cursor")).toBe("25");
});
it("loads a scoped PR detail and enqueues a targeted refresh", async () => {
  const paths: Array<[string, string | undefined]> = [];
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      paths.push([String(input), init?.method]);
      return new Response(JSON.stringify({ queued: true }), { status: 200 });
    },
  );
  await loadPullDetail("A/B", 105);
  await refreshWorkState("A/B", 105);
  expect(paths).toEqual([
    ["/testmails/api/work-state/repositories/A%2FB/pulls/105", undefined],
    ["/testmails/api/work-state/repositories/A%2FB/pulls/105/refresh", "POST"],
  ]);
});
it("does not turn a failed or forbidden request into an empty success", async () => {
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(JSON.stringify({ error: "scope_denied" }), { status: 403 }),
  );
  await expect(loadAttention({})).rejects.toThrow("scope_denied");
});
