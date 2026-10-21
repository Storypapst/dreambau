import { GitHubReader, githubIntegrationSchema } from "./github.js";
import { syncRepository, type SyncReport } from "./sync.js";
import type { WorkStateStore } from "./store.js";
/** Explicit lifecycle only; constructing this object never calls GitHub. */
export function createWorkStateWorker(options: {
  store: WorkStateStore;
  token: (signal?: AbortSignal) => Promise<string>;
  apiUrl?: string;
  transport?: typeof fetch;
  now?: () => number;
  intervalMs?: number;
}) {
  // Validate configured origins/registry before any durable job is claimed. No network call.
  new GitHubReader({
    repositories: options.store.collectorRepositories(),
    token: options.token,
    apiUrl: options.apiUrl,
  });
  const now = options.now ?? Date.now;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<SyncReport | null> | undefined;
  let stopped = true;
  let controller: AbortController | undefined;
  let lastError: string | null = null;
  async function tick(): Promise<SyncReport | null> {
    if (running) return running;
    running = (async () => {
      options.store.scheduleSyncs(now());
      const job = options.store.claimSync(now());
      if (!job) return null;
      const deadline = now() + 60_000;
      controller = new AbortController();
      const reader = new GitHubReader({
        signal: controller.signal,
        repositories: options.store.collectorRepositories(),
        token: options.token,
        apiUrl: options.apiUrl,
        transport: options.transport,
        now,
        deadline: () => deadline,
        cache: {
          get: (k) => options.store.cacheGet(k),
          put: (k, v) => options.store.cachePut(k, v),
        },
        tracked: (id) => options.store.collectorPulls(id),
        links: (id, initial) => options.store.collectorLinks(id, initial),
        saveCheckpoint: (checkpoint) => {
          if (!options.store.saveSyncCheckpoint(job.token, checkpoint, now()))
            throw new Error("lease_lost");
        },
      });
      return syncRepository(job.repositoryId, {
        store: options.store,
        reader,
        token: job.token,
        checkpoint: {
          ...(job.checkpoint ?? {
            initial: !options.store.collectorInitialized(job.repositoryId),
          }),
          extraNumbers: job.targets,
        },
        now,
      });
    })();
    try {
      return await running;
    } finally {
      running = undefined;
    }
  }
  async function loop() {
    try {
      await tick();
      lastError = null;
    } catch {
      lastError = "worker_tick_failed";
    } finally {
      if (!stopped)
        timer = setTimeout(() => {
          void loop();
        }, options.intervalMs ?? 1000);
    }
  }
  return {
    tick,
    get lastError() {
      return lastError;
    },
    start() {
      if (!stopped) return;
      stopped = false;
      void loop();
    },
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      controller?.abort();
      try {
        await running;
      } catch {
        lastError = "worker_tick_failed";
      }
    },
  };
}

/** Production entry point: callers supply an App installation token provider, never a personal token. */
export function createConfiguredWorkStateWorker(
  configuration: unknown,
  options: Omit<
    Parameters<typeof createWorkStateWorker>[0],
    "token" | "apiUrl"
  > & {
    installationToken: (
      appId: string,
      installationId: string,
      signal?: AbortSignal,
    ) => Promise<string>;
  },
) {
  const config = githubIntegrationSchema.parse(configuration);
  return createWorkStateWorker({
    ...options,
    apiUrl: config.apiUrl,
    token: (signal) =>
      options.installationToken(config.appId, config.installationId, signal),
  });
}
