import { describe, it, expect } from "vitest";
import request from "supertest";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkStateStore } from "../src/server/work-state/store.js";
import { createApp } from "../src/server/app.js";
import { createDatabase } from "../src/server/db.js";
const secret = "test-only-signing-secret-32-bytes-long";
const signed = (raw: string) =>
  createHmac("sha256", secret).update(raw).digest("hex");
describe("signed webhook HTTP boundary", () => {
  it("verifies original bytes before parsing, durably queues before 202 and survives reopen", async () => {
    const dir = mkdtempSync(join(tmpdir(), "webhook-")),
      path = join(dir, "state.sqlite"),
      store = createWorkStateStore(path),
      database = createDatabase(":memory:");
    store.configureRepository({
      id: "1",
      project: "oriso",
      fullName: "org/repo",
      integrationBranch: "dev",
    });
    const app = createApp({
      loadAccounts: () => [],
      database,
      workStateStore: store,
      workStateWebhookSecret: secret,
    });
    const raw =
      '{ "repository": {"id":1, "url":"https://attacker.invalid"}, "action": "closed", "number": 400 }';
    const post = (body: string, signature: string, id = "delivery") =>
      request(app)
        .post("/testmails/api/work-state/webhook")
        .set("Content-Type", "application/json")
        .set("x-hub-signature-256", `sha256=${signature}`)
        .set("x-github-delivery", id)
        .set("x-github-event", "pull_request")
        .send(body);
    expect((await post("not json", "0".repeat(64))).status).toBe(401);
    expect(store.claimSync()).toBeNull();
    expect(
      (await post(raw, signed(JSON.stringify(JSON.parse(raw))))).status,
    ).toBe(401);
    expect((await post(raw, signed(raw))).status).toBe(202);
    expect((await post(raw, signed(raw))).status).toBe(202);
    expect(
      (
        await request(app).post(
          "/testmails/api/work-state/repositories/1/refresh",
        )
      ).status,
    ).toBe(401);
    store.close();
    const reopened = createWorkStateStore(path);
    const job = reopened.claimSync()!;
    expect(job.repositoryId).toBe("1");
    expect(job.generation).toBe(1);
    expect(job).toMatchObject({ targets: [400] });
    expect(reopened.collectorPulls("1")).toEqual([]);
    reopened.close();
    database.close();
    rmSync(dir, { recursive: true });
  });
  it("rejects an unconfigured repository without a queue entry", async () => {
    const store = createWorkStateStore(":memory:"),
      database = createDatabase(":memory:");
    const app = createApp({
      loadAccounts: () => [],
      database,
      workStateStore: store,
      workStateWebhookSecret: secret,
    });
    const raw = JSON.stringify({ repository: { id: 2 } });
    const response = await request(app)
      .post("/testmails/api/work-state/webhook")
      .set("Content-Type", "application/json")
      .set("x-hub-signature-256", `sha256=${signed(raw)}`)
      .set("x-github-delivery", "unconfigured")
      .set("x-github-event", "push")
      .send(raw);
    expect(response.status).toBe(400);
    expect(store.claimSync()).toBeNull();
    store.close();
    database.close();
  });
});
it("accepts a signed installation-wide ping without inventing a repository job",async()=>{
 const store=createWorkStateStore(":memory:"),database=createDatabase(":memory:");try{
 const app=createApp({loadAccounts:()=>[],database,workStateStore:store,workStateWebhookSecret:secret}),raw=JSON.stringify({zen:"Test delivery",hook_id:42});
 const response=await request(app).post("/testmails/api/work-state/webhook").set("Content-Type","application/json").set("x-hub-signature-256",`sha256=${signed(raw)}`).set("x-github-delivery","installation-ping").set("x-github-event","ping").send(raw);
 expect(response.status).toBe(202);expect(store.claimSync()).toBeNull();
 }finally{store.close();database.close();}
});
