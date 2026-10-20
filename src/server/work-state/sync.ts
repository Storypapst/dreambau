import type { GitHubReader, CollectionCheckpoint } from "./github.js";
import { GitHubError } from "./github.js";
import type { WorkStateStore } from "./store.js";
export interface SyncReport {
  repositoryId: string;
  complete: boolean;
  errorCode?: string;
  requests: number;
  durationMs: number;
}
export async function syncRepository(
  repositoryId: string,
  dependencies: {
    store: WorkStateStore;
    reader: GitHubReader;
    token: string;
    checkpoint?: CollectionCheckpoint;
    now?: () => number;
  },
): Promise<SyncReport> {
  const { store, reader, token } = dependencies,
    now = dependencies.now ?? Date.now,
    start = now(),
    requests = reader.requests;
  const repository = store
    .collectorRepositories()
    .find((r) => r.id === repositoryId);
  try {
    if (!repository) throw new GitHubError("repository_not_active");
    const snapshot = await reader.collectRepository(
      repository,
      dependencies.checkpoint,
    );
    if (!store.commitSync(token, snapshot, now()))
      throw new GitHubError("lease_lost");
    const unknown = snapshot.pullRequests.filter(
      (p) =>
        (p.facets.mergeability?.value as { mergeable?: boolean | null })
          ?.mergeable === null,
    );
    const retries = dependencies.checkpoint?.mergeRetries ?? {};
    const pending = snapshot.complete
      ? unknown.filter((p) => (retries[p.number] ?? 0) < 2)
      : [];
    store.finishSync(token, {
      now: now(),
      ...(pending.length
        ? {
            dueAt: now() + 30_000,
            checkpoint: {
              stage: "reads",
              numbers: pending.map((p) => p.number),
              open: [],
              index: 0,
              initial: false,
              mergeRetries: Object.fromEntries(
                pending.map((p) => [p.number, (retries[p.number] ?? 0) + 1]),
              ),
            },
          }
        : !snapshot.complete
          ? {
              dueAt: now() + 60_000,
              errorCode: snapshot.errorCode ?? "snapshot_partial",
              checkpoint: reader.checkpoint,
            }
          : {}),
    });
    return {
      repositoryId,
      complete: snapshot.complete,
      errorCode: snapshot.errorCode ?? undefined,
      requests: reader.requests - requests,
      durationMs: now() - start,
    };
  } catch (error) {
    const code = error instanceof GitHubError ? error.code : "sync_failed";
    const checkpoint = (error as { checkpoint?: CollectionCheckpoint })
      .checkpoint;
    store.finishSync(token, {
      now: now(),
      dueAt:
        error instanceof GitHubError && error.retryAt
          ? error.retryAt
          : now() + (code === "slice_deadline" ? 1 : 60_000),
      checkpoint,
      errorCode: code,
    });
    return {
      repositoryId,
      complete: false,
      errorCode: code,
      requests: reader.requests - requests,
      durationMs: now() - start,
    };
  }
}
