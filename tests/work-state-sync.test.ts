import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkStateStore } from "../src/server/work-state/store.js";
const repo = {
  id: "1",
  project: "oriso" as const,
  fullName: "org/repo",
  integrationBranch: "dev",
};
describe("durable collector work", () => {
  it("coalesces an in-flight event into another generation", () => {
    const s = createWorkStateStore(":memory:");
    s.configureRepository(repo);
    s.enqueueSync("1", 0);
    const first = s.claimSync(0)!;
    s.acceptEvent("event", "1", "pull_request", 1);
    expect(s.claimSync(1)).toBeNull();
    expect(s.finishSync(first.token, { now: 2 })).toBe(true);
    const second = s.claimSync(2)!;
    expect(second.generation).toBe(2);
    expect(s.finishSync(first.token, { now: 3 })).toBe(false);
    s.close();
  });
  it("fences expired/replaced workers across real connections and resumes durable work", () => {
    const dir = mkdtempSync(join(tmpdir(), "work-state-b-")),
      path = join(dir, "state.sqlite");
    const a = createWorkStateStore(path);
    a.configureRepository(repo);
    a.acceptEvent("delivery", "1", "push", 0);
    const first = a.claimSync(0, 10)!;
    const b = createWorkStateStore(path);
    expect(b.claimSync(5)).toBeNull();
    const second = b.claimSync(11)!;
    expect(
      a.commitSync(
        first.token,
        {
          repositoryId: "1",
          fullName: "org/repo",
          collectedAt: new Date().toISOString(),
          pullRequests: [],
          closedCandidates: [],
          coveredPages: 1,
          complete: true,
        },
        12,
      ),
    ).toBe(false);
    expect(a.finishSync(first.token, { now: 12 })).toBe(false);
    expect(
      b.finishSync(second.token, {
        now: 12,
        dueAt: 13,
        checkpoint: { stage: "reads", numbers: [2], index: 0 },
      }),
    ).toBe(true);
    a.close();
    b.close();
    const c = createWorkStateStore(path);
    expect(c.claimSync(13)?.checkpoint.numbers).toEqual([2]);
    c.close();
    rmSync(dir, { recursive: true });
  });
  it("does not starve healthy repositories and deduplicates deliveries", () => {
    const s = createWorkStateStore(":memory:");
    s.configureRepository(repo);
    s.configureRepository({ ...repo, id: "2", fullName: "org/healthy" });
    s.acceptEvent("same", "1", "push", 0);
    s.acceptEvent("same", "1", "push", 1);
    s.enqueueSync("2", 0);
    const bad = s.claimSync(0)!;
    expect(bad.generation).toBe(1);
    s.finishSync(bad.token, {
      now: 1,
      dueAt: 60000,
      errorCode: "github_http_403",
    });
    expect(s.claimSync(1)?.repositoryId).toBe("2");
    s.close();
  });
  it("a new event during a sliced scan discards stale resume progress", () => {
    const s = createWorkStateStore(":memory:");
    s.configureRepository(repo);
    s.enqueueSync("1", 0);
    const job = s.claimSync(0)!;
    s.acceptEvent("late", "1", "push", 1);
    s.finishSync(job.token, {
      now: 2,
      dueAt: 3,
      checkpoint: { stage: "reads", index: 99, numbers: [1] },
    });
    expect(s.claimSync(2)?.checkpoint).toBeUndefined();
    s.close();
  });
  it("a later webhook cannot bypass a persisted rate-limit deadline", () => {
    const s = createWorkStateStore(":memory:");
    s.configureRepository(repo);
    s.enqueueSync("1", 0);
    const job = s.claimSync(0)!;
    s.finishSync(job.token, {
      now: 1,
      dueAt: 60000,
      errorCode: "rate_limited",
    });
    s.acceptEvent("late", "1", "push", 2);
    expect(s.claimSync(2)).toBeNull();
    expect(s.claimSync(60000)?.generation).toBe(2);
    s.close();
  });
});

for (const boundary of [3_600_000, 86_400_000]) {
  it(`periodic scheduling preserves pending progress across ${boundary}ms`, () => {
    const s = createWorkStateStore(":memory:");
    s.configureRepository(repo);
    s.scheduleSyncs(0);
    const job = s.claimSync(0)!;
    const checkpoint = { stage: "reads", numbers: [1, 2], index: 1 };
    s.finishSync(job.token, { now: 1, dueAt: 2, checkpoint });
    s.scheduleSyncs(boundary);
    const resumed = s.claimSync(boundary);
    s.close();
    expect(resumed).toMatchObject({ generation: 1, checkpoint });
  });
}
for (const state of ["active", "expired"] as const) {
  it(`periodic scheduling does not alter a ${state} lease or its checkpoint`, () => {
    const s = createWorkStateStore(":memory:");
    s.configureRepository(repo);
    s.scheduleSyncs(0);
    const until = state === "active" ? 7_200_000 : 10;
    const job = s.claimSync(0, until)!;
    const checkpoint = { stage: "reads", numbers: [1, 2], index: 1 };
    s.saveSyncCheckpoint(job.token, checkpoint, 1);
    s.scheduleSyncs(3_600_000);
    const whileActive = s.claimSync(3_600_000);
    const resumed = state === "active" ? s.claimSync(until + 1) : whileActive;
    s.close();
    if (state === "active") expect(whileActive).toBeNull();
    expect(resumed).toMatchObject({ generation: 1, checkpoint });
  });
}
it("periodic scheduling preserves the checkpoint and deadline of a long rate park", () => {
  const s = createWorkStateStore(":memory:");
  s.configureRepository(repo);
  s.scheduleSyncs(0);
  const job = s.claimSync(0)!;
  const checkpoint = { stage: "reads", numbers: [1, 2], index: 1 };
  s.finishSync(job.token, {
    now: 1,
    dueAt: 7_200_000,
    checkpoint,
    errorCode: "rate_limited",
  });
  s.scheduleSyncs(3_600_000);
  const early = s.claimSync(7_199_999);
  const resumed = s.claimSync(7_200_000);
  s.close();
  expect(early).toBeNull();
  expect(resumed).toMatchObject({ generation: 1, checkpoint });
});
for (const trigger of ["event", "repo-refresh", "pull-refresh"] as const) {
  it(`a real ${trigger} still dirties progress after periodic coalescing`, () => {
    const s = createWorkStateStore(":memory:");
    s.configureRepository(repo);
    s.setRepositoryGrant({
      actorId: "reader",
      project: "oriso",
      repositoryId: "1",
      allowed: true,
    });
    s.scheduleSyncs(0);
    const job = s.claimSync(0)!;
    s.finishSync(job.token, {
      now: 1,
      dueAt: 2,
      checkpoint: { stage: "reads", numbers: [1, 2], index: 1 },
    });
    s.scheduleSyncs(3_600_000);
    if (trigger === "event")
      s.acceptEvent("real-event", "1", "push", 3_600_001, [1]);
    else if (trigger === "repo-refresh")
      s.enqueueScopedSync(
        { actorId: "reader", project: "oriso" },
        "1",
        3_600_001,
      );
    else
      s.enqueueScopedPull(
        { actorId: "reader", project: "oriso" },
        "1",
        1,
        3_600_001,
      );
    const resumed = s.claimSync(3_600_002);
    s.close();
    expect(resumed).toMatchObject({ generation: 2 });
    expect(resumed?.checkpoint).toBeUndefined();
  });
}
