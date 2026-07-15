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

  it("accepts only bounded aggregate Kio operating metrics", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("secrets")) return new Response(JSON.stringify({ message: "Ok" }), { status: 200 });
      return new Response(JSON.stringify({
        state: "degraded",
        intakes: { total: 4, blocked: 1, issues_created: 3, private: "do not forward" },
        repairs: { queued: 2, claimed: 1, completed: 5, failed: 1 },
        artifacts: { count: 6, retention_days: 60 },
        text: "private Slack message"
      }), { status: 200 });
    });

    const statuses = await loadRuntimeStatuses(["dreambau"], { fetcher, timeoutMs: 50 });
    const kio = statuses.find((status) => status.id === "kio");

    expect(kio?.state).toBe("degraded");
    expect(kio?.metrics).toEqual({
      intakesTotal: 4,
      intakesBlocked: 1,
      issuesCreated: 3,
      repairsQueued: 2,
      repairsClaimed: 1,
      repairsCompleted: 5,
      repairsFailed: 1,
      artifactsCount: 6,
      retentionDays: 60
    });
    expect(JSON.stringify(kio)).not.toContain("private Slack message");
    expect(JSON.stringify(kio)).not.toContain("do not forward");
  });
});
