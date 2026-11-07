import { describe, expect, it, vi } from "vitest";
import { loadRuntimeStatuses, runtimeTargets } from "../src/server/runtime-status.js";

describe("runtime status probes", () => {
  it("probes only current ORISO Dev targets and returns the graph publication date", async () => {
    const publishedAt = "2026-09-21T12:52:42.456966+00:00";
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes("signoz")) return Response.json({ status: "ok" });
      return Response.json({
        schemaVersion: "oriso.ua.generation/v1",
        generationId: "test-generation",
        generatedAt: publishedAt,
        graphs: [{ kind: "platform", path: "platform.json" }],
        files: ["private test fixture"]
      });
    });

    const statuses = await loadRuntimeStatuses(["oriso"], { fetcher, timeoutMs: 50 });

    expect(statuses.map((status) => status.id)).toEqual(["signoz-dev", "understand-anything"]);
    expect(statuses.every((status) => status.state === "healthy")).toBe(true);
    expect(statuses[1]).toMatchObject({ project: "oriso", environment: "dev", url: "https://understand.oriso.org/", publishedAt });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.map(([url]) => String(url)).sort()).toEqual(
      runtimeTargets.filter((target) => target.project === "oriso").map((target) => target.healthUrl).sort()
    );
    expect(fetcher.mock.calls.map(([url]) => String(url))).not.toContain("https://signoz.oriso-dev.site/api/v1/health");
    expect(JSON.stringify(statuses)).not.toContain("private test fixture");
  });

  it("requires a published platform graph rather than a generic successful JSON response", async () => {
    const fetcher = vi.fn(async () => Response.json({ status: "ok" }));
    const statuses = await loadRuntimeStatuses(["oriso"], { fetcher, timeoutMs: 50 });

    expect(statuses.find((status) => status.id === "signoz-dev")?.state).toBe("healthy");
    expect(statuses.find((status) => status.id === "understand-anything")).toMatchObject({ state: "degraded" });
    expect(statuses.find((status) => status.id === "understand-anything")).not.toHaveProperty("publishedAt");
  });

  it("isolates degraded and offline dependencies without returning bodies", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("secrets")) return new Response("private upstream detail", { status: 503 });
      throw new Error("getaddrinfo ENOTFOUND internal detail");
    });

    const statuses = await loadRuntimeStatuses(["dreambau"], { fetcher, timeoutMs: 50 });

    expect(statuses.find((status) => status.id === "infisical")?.state).toBe("degraded");
    expect(statuses.find((status) => status.id === "kio")?.state).toBe("offline");
    expect(statuses.some((status) => status.id === "understand-anything")).toBe(false);
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
