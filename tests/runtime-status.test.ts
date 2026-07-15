import { describe, expect, it, vi } from "vitest";
import { loadRuntimeStatuses, runtimeTargets } from "../src/server/runtime-status.js";

describe("runtime status probes", () => {
  it("probes only compile-time allowlisted targets in the caller project scope", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("signoz")) return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
      return new Response(JSON.stringify({ message: "Ok" }), { status: 200 });
    });

    const statuses = await loadRuntimeStatuses(["oriso"], { fetcher, timeoutMs: 50 });

    expect(statuses.map((status) => status.id)).toEqual(["signoz-predev", "signoz-dev"]);
    expect(statuses.every((status) => status.state === "healthy")).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual(
      runtimeTargets.filter((target) => target.project === "oriso" && target.healthUrl).map((target) => target.healthUrl)
    );
  });

  it("isolates degraded, offline and unavailable dependencies without returning bodies", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("secrets")) return new Response("private upstream detail", { status: 503 });
      throw new Error("getaddrinfo ENOTFOUND internal detail");
    });

    const statuses = await loadRuntimeStatuses(["dreambau"], { fetcher, timeoutMs: 50 });

    expect(statuses.find((status) => status.id === "infisical")?.state).toBe("degraded");
    expect(statuses.find((status) => status.id === "kio")?.state).toBe("offline");
    expect(statuses.find((status) => status.id === "understand-anything")?.state).toBe("unavailable");
    expect(JSON.stringify(statuses)).not.toContain("private upstream detail");
    expect(JSON.stringify(statuses)).not.toContain("ENOTFOUND");
  });
});
