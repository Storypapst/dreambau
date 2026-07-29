// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, onUnauthorized } from "../src/client/api.js";

describe("api unauthorized signal", () => {
  const originalFetch = globalThis.fetch;
  let unsubscribe: (() => void) | null = null;

  beforeEach(() => { unsubscribe = null; });
  afterEach(() => {
    unsubscribe?.();
    globalThis.fetch = originalFetch;
  });

  function respondWith(status: number, body: unknown = {}) {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" }
    })) as typeof globalThis.fetch;
  }

  it("announces a lost session so the app can return to the login screen", async () => {
    respondWith(401, { error: "unauthorized" });
    const handler = vi.fn();
    unsubscribe = onUnauthorized(handler);

    await expect(api("/accounts")).rejects.toThrow("unauthorized");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("stays silent for a successful call and for other failures", async () => {
    const handler = vi.fn();
    unsubscribe = onUnauthorized(handler);

    respondWith(200, { ok: true });
    await expect(api("/accounts")).resolves.toEqual({ ok: true });

    respondWith(404, { error: "linked_account_not_found" });
    await expect(api("/accounts/x/otp")).rejects.toThrow("linked_account_not_found");

    respondWith(503, { error: "human_access_unavailable" });
    await expect(api("/accounts")).rejects.toThrow("human_access_unavailable");

    expect(handler).not.toHaveBeenCalled();
  });

  it("stops announcing once the subscriber is removed", async () => {
    respondWith(401, { error: "unauthorized" });
    const handler = vi.fn();
    onUnauthorized(handler)();

    await expect(api("/accounts")).rejects.toThrow("unauthorized");
    expect(handler).not.toHaveBeenCalled();
  });
});
