import { createWorkStateStore } from "../src/server/work-state/store.js";
import request from "supertest";
import { afterEach, expect, it } from "vitest";
import {
  workStateFixture,
  fixturePull,
  seedPulls,
} from "./helpers/work-state-fixture.js";
import { createContextService } from "../src/server/work-state/context.js";
import { hashMachineToken } from "../src/server/machine-access.js";
const close: Array<() => void> = [];
afterEach(() => close.splice(0).forEach((fn) => fn()));
const bytes = (v: unknown) => Buffer.byteLength(JSON.stringify(v));
function setup() {
  const f = workStateFixture();
  close.push(f.close);
  return { ...f, service: createContextService(f.store) };
}
function item(f: ReturnType<typeof setup>) {
  return f.store.createWorkItem(f.scope, {
    goal: "Continue ORISO",
    links: [{ repositoryId: "A", kind: "pull", number: 1 }],
  });
}
const checkpoint = {
  expectedVersion: 1,
  goal: "Continue ORISO",
  branch: "feature",
  commit: "abc123",
  lastVerifiedAction: "Verified failing job",
  blockers: ["Review pending"],
  nextAction: "Inspect current check",
  evidenceLinks: ["https://example.test/evidence"],
};
async function login(f: ReturnType<typeof setup>) {
  const a = request.agent(f.app);
  const o = await a
    .post("/testmails/api/auth/passkeys/authentication/options")
    .send({ email: f.user.email });
  await a.post("/testmails/api/auth/passkeys/authentication/verify").send({
    flowId: o.body.flowId,
    response: { id: `${f.user.id}-credential` },
  });
  return a;
}
it("bounds stored summary pages including JSON escaping and exposes the next cursor", () => {
  const f = setup();
  seedPulls(
    f.store,
    Array.from({ length: 40 }, (_, i) => ({
      ...fixturePull(i + 1),
      title: '🧭"\\\n'.repeat(500),
    })),
  );
  let cursor = 0,
    seen: number[] = [];
  do {
    const page = f.service.summary(f.scope, { limit: 25, cursor });
    expect(bytes(page)).toBeLessThanOrEqual(12288);
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.length).toBeLessThanOrEqual(25);
    expect(page.truncatedFields.length).toBeGreaterThan(0);
    seen.push(...page.items.map((x: any) => x.number));
    cursor = page.nextCursor;
  } while (cursor !== null);
  expect(new Set(seen).size).toBe(40);
  expect(seen.length).toBe(40);
});
it("keeps a resume packet within6KiB and makes every clipped own field reloadable", () => {
  const f = setup();
  seedPulls(f.store, [fixturePull()]);
  const i = item(f);
  f.store.writeCheckpoint(f.scope, i.id, {
    ...checkpoint,
    goal: '"🧭\\'.repeat(2500),
    lastVerifiedAction: "✔".repeat(16000),
    nextAction: "次".repeat(16000),
    blockers: Array(20).fill("堵".repeat(4000)),
  });
  const c = f.service.resume(f.scope, i.id);
  expect(bytes(c)).toBeLessThanOrEqual(6144);
  expect(c.branch).toBe("feature");
  expect(c.commit).toBe("abc123");
  expect(c.version).toBe(2);
  expect(c.truncatedFields).toContain("nextAction");
  expect(c.details.nextAction).toContain("/sections/nextAction");
  expect(c.pulls[0].number).toBe(1);
  expect(c.localVerificationRequired).toBe(true);
});
it("reconstructs an own Unicode text section in <=4KiB chunks and rejects mixed versions", () => {
  const f = setup(),
    i = item(f),
    text = '🌍"\\\n界'.repeat(2000);
  f.store.writeCheckpoint(f.scope, i.id, { ...checkpoint, nextAction: text });
  let cursor = 0,
    parts: string[] = [];
  do {
    const p = f.service.itemSection(f.scope, i.id, "nextAction", {
      cursor,
      version: 2,
    });
    expect(Buffer.byteLength(p.text)).toBeLessThanOrEqual(4096);
    expect(bytes(p)).toBeLessThanOrEqual(12288);
    expect(p.text).not.toContain("\ufffd");
    parts.push(p.text);
    cursor = p.nextCursor;
  } while (cursor !== null);
  expect(parts.join("")).toBe(text);
  f.store.writeCheckpoint(f.scope, i.id, {
    ...checkpoint,
    expectedVersion: 2,
    nextAction: "changed",
  });
  expect(() =>
    f.service.itemSection(f.scope, i.id, "nextAction", { version: 2 }),
  ).toThrow("version_conflict");
});
it("rechecks cumulative grants on resume and every text read", () => {
  const f = setup(),
    i = item(f);
  f.store.writeCheckpoint(f.scope, i.id, checkpoint);
  f.store.setRepositoryGrant({ ...f.scope, repositoryId: "B", allowed: true });
  f.store.updateWorkItemLinks(f.scope, i.id, {
    expectedVersion: 2,
    links: [
      { repositoryId: "A", kind: "pull", number: 1 },
      { repositoryId: "B", kind: "issue", number: 2 },
    ],
  });
  f.store.updateWorkItemLinks(f.scope, i.id, {
    expectedVersion: 3,
    links: [{ repositoryId: "A", kind: "pull", number: 1 }],
  });
  f.store.setRepositoryGrant({ ...f.scope, repositoryId: "B", allowed: false });
  expect(() => f.service.resume(f.scope, i.id)).toThrow("scope_denied");
  expect(() => f.service.itemSection(f.scope, i.id, "nextAction", {})).toThrow(
    "scope_denied",
  );
});
it("paginates whitelisted PR evidence with a revision fence and no discussion bodies", () => {
  const f = setup(),
    pr = fixturePull();
  pr.facets.checks!.value = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    name: "🌍".repeat(2000),
    status: "completed",
    conclusion: "failure",
    body: "do not copy discussion",
  }));
  seedPulls(f.store, [pr]);
  let cursor = 0,
    revision: string | undefined,
    pages = 0;
  do {
    const p = f.service.pullSection(f.scope, "A", 1, "checks", {
      cursor,
      revision,
    });
    expect(bytes(p)).toBeLessThanOrEqual(12288);
    expect(JSON.stringify(p)).not.toContain("do not copy discussion");
    expect(p.entries.length).toBeGreaterThan(0);
    revision = p.revision;
    cursor = p.nextCursor;
    pages++;
  } while (cursor !== null);
  expect(pages).toBeGreaterThan(1);
  seedPulls(f.store, [{ ...pr, headSha: "new" }]);
  expect(() =>
    f.service.pullSection(f.scope, "A", 1, "checks", { revision }),
  ).toThrow("version_conflict");
  expect(() => f.service.pullSection(f.scope, "B", 1, "checks", {})).toThrow(
    "scope_denied",
  );
});
it("serves ten real HTTP summaries without any outbound fetch or raw detail expansion", async () => {
  const f = setup();
  seedPulls(f.store, [fixturePull()]);
  const a = await login(f);
  const prior = globalThis.fetch;
  let outbound = 0;
  globalThis.fetch = async () => {
    outbound++;
    throw Error("unexpected network");
  };
  try {
    for (let n = 0; n < 10; n++) {
      const r = await a.get("/testmails/api/work-state/context/attention");
      expect(r.status).toBe(200);
      expect(Buffer.byteLength(r.text)).toBeLessThanOrEqual(12288);
      expect(r.body.items[0].number).toBe(1);
    }
    expect(outbound).toBe(0);
  } finally {
    globalThis.fetch = prior;
  }
});
it("writes exactly once on retry, confirms receipt, preserves conflict and rejects oversized input", async () => {
  const f = setup(),
    i = item(f),
    a = await login(f),
    url = `/testmails/api/work-state/items/${i.id}/checkpoint`;
  const first = await a
    .put(url)
    .set("Idempotency-Key", "retry-once")
    .send(checkpoint);
  expect(first.status).toBe(200);
  expect(first.body.version).toBe(2);
  const again = await a
    .put(url)
    .set("Idempotency-Key", "retry-once")
    .send(checkpoint);
  expect(again.status).toBe(200);
  expect(again.body.version).toBe(2);
  expect(f.store.getWorkItem(f.scope, i.id).history).toHaveLength(2);
  expect(
    (
      await a.get(
        `/testmails/api/work-state/items/${i.id}/checkpoint-receipts/retry-once`,
      )
    ).body.version,
  ).toBe(2);
  expect(
    (
      await a
        .put(url)
        .set("Idempotency-Key", "retry-once")
        .send({ ...checkpoint, nextAction: "different" })
    ).status,
  ).toBe(409);
  expect(
    (await a.put(url).set("Idempotency-Key", "other").send(checkpoint)).status,
  ).toBe(409);
  expect(
    (
      await a
        .put(url)
        .set("Idempotency-Key", "large")
        .send({ ...checkpoint, blockers: Array(50).fill("x".repeat(2000)) })
    ).status,
  ).toBe(413);
});
it("requires opt-in machine actions and separate durable repository grants", async () => {
  const token = "work-state-local-synthetic-token";
  const f = workStateFixture({
    machineIdentities: [
      {
        id: "work-bot",
        tokenHash: hashMachineToken(token),
        projects: ["oriso"],
        environments: ["local"],
        actions: ["work-state:read"],
        expiresAt: "2099-01-01T00:00:00Z",
        revokedAt: null,
      },
    ],
  });
  close.push(f.close);
  seedPulls(f.store, [fixturePull()]);
  const get = () =>
    request(f.app)
      .get("/work-state/api/v1/attention")
      .auth(token, { type: "bearer" });
  expect((await get()).status).toBe(200);
  expect((await get()).body.items).toEqual([]);
  f.store.setRepositoryGrant({
    project: "oriso",
    actorId: "work-bot",
    repositoryId: "A",
    allowed: true,
  });
  expect((await get()).body.items[0].number).toBe(1);
  expect(
    (await request(f.app).get("/work-state/api/v1/attention")).status,
  ).toBe(401);
  expect(
    (
      await request(f.app)
        .put("/work-state/api/v1/items/unknown/checkpoint")
        .auth(token, { type: "bearer" })
        .set("Idempotency-Key", "x")
        .send(checkpoint)
    ).status,
  ).toBe(403);
});

it("still returns a resumable packet when three linked PRs have maximum-length revision metadata", () => {
  const f = setup();
  const prs = [1, 2, 3].map((n) => {
    const p = fixturePull(n);
    p.headSha = "h".repeat(255);
    p.baseSha = "b".repeat(255);
    for (const facet of Object.values(p.facets))
      facet!.sourceRevision = "r".repeat(255);
    return p;
  });
  seedPulls(f.store, prs);
  const i = f.store.createWorkItem(f.scope, {
    goal: "x".repeat(16000),
    links: prs.map((p) => ({
      repositoryId: "A",
      kind: "pull" as const,
      number: p.number,
    })),
  });
  f.store.writeCheckpoint(f.scope, i.id, {
    ...checkpoint,
    branch: "b".repeat(255),
    commit: "c".repeat(255),
    lastVerifiedAction: '"'.repeat(16000),
    nextAction: "界".repeat(16000),
  });
  const context = f.service.resume(f.scope, i.id);
  expect(bytes(context)).toBeLessThanOrEqual(6144);
  expect(context.truncatedFields.length).toBeGreaterThan(0);
  expect(context.details.links).toContain("/sections/links");
});

it("retains receipts after reopening and refuses replay after repository revocation", () => {
  const f = setup(),
    i = item(f);
  expect(
    f.store.writeCheckpointOnce(f.scope, i.id, checkpoint, "persisted"),
  ).toEqual({ id: i.id, version: 2 });
  f.store.close();
  const reopened = createWorkStateStore(f.storePath);
  try {
    expect(
      reopened.writeCheckpointOnce(f.scope, i.id, checkpoint, "persisted")
        .version,
    ).toBe(2);
    reopened.writeCheckpointOnce(
      f.scope,
      i.id,
      { ...checkpoint, expectedVersion: 2, nextAction: "newer" },
      "newer",
    );
    expect(
      reopened.writeCheckpointOnce(f.scope, i.id, checkpoint, "persisted")
        .version,
    ).toBe(2);
    expect(reopened.getWorkItem(f.scope, i.id).checkpoint?.nextAction).toBe(
      "newer",
    );
    expect(reopened.getWorkItem(f.scope, i.id).history).toHaveLength(3);
    reopened.setRepositoryGrant({
      ...f.scope,
      repositoryId: "A",
      allowed: false,
    });
    expect(() =>
      reopened.getCheckpointReceipt(f.scope, i.id, "persisted"),
    ).toThrow("scope_denied");
    expect(() =>
      reopened.writeCheckpointOnce(f.scope, i.id, checkpoint, "persisted"),
    ).toThrow("scope_denied");
  } finally {
    reopened.close();
  }
});

it("counts the final entries envelope at the exact12KiB boundary", () => {
  const f = setup();
  for (let n = 3500; n <= 4100; n++) {
    const p = fixturePull();
    p.facets.checks!.value = [0, 1, 2].map((id) => ({
      id,
      name: "x".repeat(n),
    }));
    seedPulls(f.store, [p]);
    const page = f.service.pullSection(f.scope, "A", 1, "checks", {});
    expect(bytes(page), `name length ${n}`).toBeLessThanOrEqual(12288);
  }
});

it("discovers resume IDs and reconstructs every authorized assignment from the returned PR detail", () => {
  const f = setup();
  seedPulls(f.store, [fixturePull()]);
  const created = Array.from({ length: 4 }, (_, i) =>
    f.store.createWorkItem(f.scope, {
      goal: `Work ${i}`,
      owner: i === 0 ? "界".repeat(190) : `owner${i}`,
      links: [{ repositoryId: "A", kind: "pull", number: 1 }],
    }),
  );
  const summary = f.service.summary(f.scope, {});
  expect(summary.items[0].assignments).toBeDefined();
  const first = summary.items[0].assignments[0];
  expect(created.some((item) => item.id === first.id)).toBe(true);
  expect(first.context).toContain(`/items/${first.id}/context`);
  const fields: Record<string, string> = {};
  let cursor: number | null = 0,
    revision: string | undefined;
  do {
    const page = f.service.pullSection(f.scope, "A", 1, "overview", {
      cursor,
      revision,
    });
    revision = page.revision as string;
    for (const e of page.entries)
      fields[e.field] = (fields[e.field] ?? "") + e.text;
    cursor = page.nextCursor;
  } while (cursor !== null);
  expect(
    Object.keys(fields).filter((key) => /^workItems\.\d+\.id$/.test(key)),
  ).toHaveLength(4);
  for (const item of created) {
    const key = Object.keys(fields).find(
      (key) => /^workItems\.\d+\.id$/.test(key) && fields[key] === item.id,
    );
    expect(key).toBeDefined();
    expect(fields[key!.replace(/\.id$/, ".context")]).toContain(
      `/items/${item.id}/context`,
    );
    expect(fields[key!.replace(/\.id$/, ".owner")]).toBe(item.owner);
  }
  f.store.createWorkItem(f.scope, {
    goal: "Later assignment",
    links: [{ repositoryId: "A", kind: "pull", number: 1 }],
  });
  expect(() =>
    f.service.pullSection(f.scope, "A", 1, "overview", { revision }),
  ).toThrow("version_conflict");
  f.store.setRepositoryGrant({ ...f.scope, repositoryId: "B", allowed: true });
  const hidden = f.store.createWorkItem(f.scope, {
    goal: "Hidden assignment",
    owner: "private",
    links: [
      { repositoryId: "A", kind: "pull", number: 1 },
      { repositoryId: "B", kind: "issue", number: 1 },
    ],
  });
  f.store.setRepositoryGrant({ ...f.scope, repositoryId: "B", allowed: false });
  expect(JSON.stringify(f.service.summary(f.scope, {}))).not.toContain(
    hidden.id,
  );
  expect(
    JSON.stringify(f.service.pullSection(f.scope, "A", 1, "overview", {})),
  ).not.toContain(hidden.id);
});
it("advertises bounded reloadable source provenance and fences changed board data",()=>{
 const f=setup();seedPulls(f.store,[fixturePull()]);
 f.store.createWorkItem(f.scope,{goal:"Linked",links:[{repositoryId:"A",kind:"pull",number:1},{repositoryId:"A",kind:"issue",number:9}]});
 const board={status:"In review",priority:"P0",url:"https://github.com/OpenResilienceInitiative/repoA/issues/9",observedAt:new Date().toISOString(),coverage:"complete"};f.store.recordBoard("A",9,board);
 const overview=f.service.pullSection(f.scope,"A",1,"overview");expect(overview.availableSections).toContain("sources");
 let cursor=0,text="",revision="";do{const page=f.service.pullSection(f.scope,"A",1,"sources",{cursor});expect(bytes(page)).toBeLessThanOrEqual(12288);text+=JSON.stringify(page.entries);revision=page.revision;cursor=page.nextCursor;}while(cursor!==null);
 expect(text).toContain("P0");expect(text).toContain(board.url);
 f.store.recordBoard("A",9,{...board,priority:"P1",observedAt:new Date(Date.now()+1).toISOString()});expect(()=>f.service.pullSection(f.scope,"A",1,"sources",{revision})).toThrow("version_conflict");
});
