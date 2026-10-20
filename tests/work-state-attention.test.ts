import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import {
  workStateFixture,
  fixturePull,
  seedPulls,
} from "./helpers/work-state-fixture.js";
import { createAttentionService } from "../src/server/work-state/attention.js";
const cleanup: Array<() => void> = [];
afterEach(() => cleanup.splice(0).forEach((close) => close()));
function setup() {
  const f = workStateFixture();
  cleanup.push(f.close);
  return { ...f, service: createAttentionService(f.store) };
}
async function login(f: ReturnType<typeof setup>, user = f.user) {
  const agent = request.agent(f.app);
  const options = await agent
    .post("/testmails/api/auth/passkeys/authentication/options")
    .send({ email: user.email });
  expect(
    (
      await agent
        .post("/testmails/api/auth/passkeys/authentication/verify")
        .send({
          flowId: options.body.flowId,
          response: { id: `${user.id}-credential` },
        })
    ).status,
  ).toBe(200);
  return agent;
}
describe("scoped attention projection", () => {
  it("classifies stored data and applies assignment filters before pagination", () => {
    const f = setup();
    seedPulls(f.store, [fixturePull(1), fixturePull(2)]);
    f.store.createWorkItem(f.scope, {
      goal: "Assigned change",
      owner: "reviewer",
      priority: "P1",
      links: [{ repositoryId: "A", kind: "pull", number: 2 }],
    });
    const list = f.service.listAttention(f.scope, {
      person: "reviewer",
      limit: 1,
    });
    expect(list.items.map((row) => row.pr.number)).toEqual([2]);
    expect(list.items[0].assignments[0].priority).toBe("P1");
    expect(
      list.items[0].reasons.some((reason) => reason.code === "checks_failed"),
    ).toBe(true);
    expect(list.nextCursor).toBeNull();
  });
  it("never infers owner or priority from author", () => {
    const f = setup();
    seedPulls(f.store, [fixturePull()]);
    const row = f.service.listAttention(f.scope, {}).items[0];
    expect(row.assignments).toEqual([]);
    expect(
      f.service.listAttention(f.scope, { person: "not-the-owner" }).items,
    ).toEqual([]);
  });
  it("does not leak protected cross-repository work metadata", () => {
    const f = setup();
    seedPulls(f.store, [fixturePull()]);
    f.store.setRepositoryGrant({
      ...f.scope,
      repositoryId: "B",
      allowed: true,
    });
    const item = f.store.createWorkItem(f.scope, {
      goal: "Private package",
      owner: "secret-owner",
      priority: "P0",
      links: [
        { repositoryId: "A", kind: "pull", number: 1 },
        { repositoryId: "B", kind: "issue", number: 2 },
      ],
    });
    f.store.writeCheckpoint(f.scope, item.id, {
      expectedVersion: 1,
      goal: "Private package",
      lastVerifiedAction: "private",
      nextAction: "private-next",
      blockers: [],
      evidenceLinks: [],
    });
    f.store.setRepositoryGrant({
      ...f.scope,
      repositoryId: "B",
      allowed: false,
    });
    const list = f.service.listAttention(f.scope, {});
    expect(JSON.stringify(list)).not.toContain("secret-owner");
    expect(JSON.stringify(f.service.detail(f.scope, "A", 1))).not.toContain(
      "private-next",
    );
  });
  it("shows merged separately and leaves deployment and acceptance unrecorded", () => {
    const f = setup();
    seedPulls(f.store, [
      {
        ...fixturePull(),
        lifecycle: "merged",
        mergedAt: new Date().toISOString(),
      },
    ]);
    expect(f.service.listAttention(f.scope, { view: "action" }).items).toEqual(
      [],
    );
    const row = f.service.listAttention(f.scope, { view: "merged" }).items[0];
    expect(row.deployment).toBe("not_recorded");
    expect(row.acceptance).toBe("not_recorded");
  });
  it("keeps retained merged PR observation age separate from a newer repository scan", () => {
    const f = setup();
    const old = fixturePull(1, 31 * 24 * 60);
    seedPulls(f.store, [
      { ...old, lifecycle: "merged", mergedAt: old.facets.checks!.observedAt },
    ]);
    seedPulls(f.store, [fixturePull(2)]);
    const list = f.service.listAttention(f.scope, { view: "merged" });
    expect(list.items[0].observedAt).toBe(old.facets.checks!.observedAt);
    expect(list.items[0].observedAt).not.toBe(
      list.repositories[0].lastSuccessAt,
    );
    seedPulls(f.store, [
      {
        ...fixturePull(3),
        lifecycle: "merged",
        mergedAt: new Date().toISOString(),
        facets: {},
      },
    ]);
    expect(f.service.detail(f.scope, "A", 3).observedAt).toBeNull();
  });
  it("makes no-check-only PRs reachable in data freshness without implying failed checks", () => {
    const f = setup();
    const pr = fixturePull();
    pr.facets.checks!.value = [];
    seedPulls(f.store, [pr]);
    const list = f.service.listAttention(f.scope, {
      view: "data",
      reason: "no_checks",
    });
    expect(list.items.map((row) => row.pr.number)).toEqual([1]);
    expect(list.items[0].reasons.map((reason) => reason.code)).toEqual([
      "no_checks",
    ]);
    expect(f.service.listAttention(f.scope, { view: "action" }).items).toEqual(
      [],
    );
  });
  it("reads scoped details beyond the first100 rows and rechecks grants", () => {
    const f = setup();
    seedPulls(
      f.store,
      Array.from({ length: 105 }, (_, i) => fixturePull(i + 1)),
    );
    expect(f.service.detail(f.scope, "A", 105).pr.number).toBe(105);
    f.store.setRepositoryGrant({
      ...f.scope,
      repositoryId: "A",
      allowed: false,
    });
    expect(() => f.service.detail(f.scope, "A", 105)).toThrow("scope_denied");
  });
  it("offers waiting and data views without treating partial data as an empty success", () => {
    const f = setup();
    const waiting = fixturePull();
    waiting.facets.checks!.value = [];
    waiting.facets.reviewDecision!.value = "REVIEW_REQUIRED";
    seedPulls(f.store, [waiting, fixturePull(2, 76)]);
    expect(
      f.service
        .listAttention(f.scope, { view: "waiting" })
        .items.map((row) => row.pr.number),
    ).toEqual([1]);
    expect(
      f.service
        .listAttention(f.scope, { view: "data" })
        .items.map((row) => row.pr.number),
    ).toEqual([2, 1]);
  });
  it("serves the real authenticated HTTP projection and denies ungranted repo details", async () => {
    const f = setup();
    seedPulls(f.store, [fixturePull()]);
    const agent = await login(f);
    const list = await agent.get(
      "/testmails/api/work-state/attention?view=action",
    );
    expect(list.status).toBe(200);
    expect(list.body.items[0].pr.number).toBe(1);
    expect(
      (await agent.get("/testmails/api/work-state/repositories/B/pulls/1"))
        .status,
    ).toBe(403);
    const guest = await login(f, f.guest);
    expect(
      (await guest.get("/testmails/api/work-state/attention?repositoryId=A"))
        .status,
    ).toBe(403);
  });
});
