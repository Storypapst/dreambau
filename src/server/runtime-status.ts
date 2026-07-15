import type { CoordinationProject } from "./coordination.js";

export type RuntimeState = "healthy" | "degraded" | "offline" | "unavailable";

interface RuntimeTarget {
  id: string;
  name: string;
  project: CoordinationProject;
  environment: "pre-dev" | "dev" | "platform";
  url: string;
  healthUrl?: string;
  healthShape?: "status-ok" | "message-ok";
}

export interface RuntimeStatus {
  id: string;
  name: string;
  project: CoordinationProject;
  environment: RuntimeTarget["environment"];
  state: RuntimeState;
  checkedAt: string;
  latencyMs: number | null;
  url: string;
}

export const runtimeTargets: readonly RuntimeTarget[] = [
  {
    id: "signoz-predev",
    name: "SigNoz Pre-Dev",
    project: "oriso",
    environment: "pre-dev",
    url: "https://signoz.oriso-dev.site",
    healthUrl: "https://signoz.oriso-dev.site/api/v1/health",
    healthShape: "status-ok"
  },
  {
    id: "signoz-dev",
    name: "SigNoz Dev",
    project: "oriso",
    environment: "dev",
    url: "https://signoz.oriso.org",
    healthUrl: "https://signoz.oriso.org/api/v1/health",
    healthShape: "status-ok"
  },
  {
    id: "infisical",
    name: "Infisical",
    project: "dreambau",
    environment: "platform",
    url: "https://secrets.dreambau.com",
    healthUrl: "https://secrets.dreambau.com/api/status",
    healthShape: "message-ok"
  },
  {
    id: "kio",
    name: "Kio Bugfix",
    project: "dreambau",
    environment: "platform",
    url: "https://kio.dreambau.com",
    healthUrl: "https://kio.dreambau.com/health/live",
    healthShape: "status-ok"
  },
  {
    id: "understand-anything",
    name: "Understand Anything",
    project: "dreambau",
    environment: "platform",
    url: "https://dreambau.com/testmails/"
  }
] as const;

export async function loadRuntimeStatuses(
  projects: CoordinationProject[],
  dependencies: {
    fetcher?: typeof fetch;
    timeoutMs?: number;
    now?: () => Date;
    clock?: () => number;
  } = {}
): Promise<RuntimeStatus[]> {
  const allowed = new Set(projects);
  const targets = runtimeTargets.filter((target) => allowed.has(target.project));
  const fetcher = dependencies.fetcher ?? fetch;
  const timeoutMs = dependencies.timeoutMs ?? 2_500;
  const now = dependencies.now ?? (() => new Date());
  const clock = dependencies.clock ?? Date.now;

  return Promise.all(targets.map(async (target): Promise<RuntimeStatus> => {
    const checkedAt = now().toISOString();
    if (!target.healthUrl) return { ...publicTarget(target), state: "unavailable", checkedAt, latencyMs: null };
    const startedAt = clock();
    try {
      const response = await fetcher(target.healthUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs)
      });
      const latencyMs = Math.max(0, clock() - startedAt);
      if (!response.ok) return { ...publicTarget(target), state: "degraded", checkedAt, latencyMs };
      const body = await response.json().catch(() => null) as Record<string, unknown> | null;
      const recognized = target.healthShape === "message-ok"
        ? body?.message === "Ok"
        : body?.status === "ok";
      return { ...publicTarget(target), state: recognized ? "healthy" : "degraded", checkedAt, latencyMs };
    } catch {
      return { ...publicTarget(target), state: "offline", checkedAt, latencyMs: null };
    }
  }));
}

function publicTarget(target: RuntimeTarget) {
  return {
    id: target.id,
    name: target.name,
    project: target.project,
    environment: target.environment,
    url: target.url
  };
}
