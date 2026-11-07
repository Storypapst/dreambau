import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server/app.js";
import { createDatabase } from "../src/server/db.js";
import type { TestAccessRecord } from "../src/server/infisical-provider.js";
import { hashMachineToken, type MachineAction } from "../src/server/machine-access.js";
import type { OrisoIdentityObservationResult } from "../src/server/oriso-identity-observation.js";
import { runTestRunCli } from "../src/server/test-run-cli.js";

const runId = "59c238e5-6115-4aef-bfb4-2f19091017cf";
const at = "2026-11-07T20:00:00.000Z";
const sha = "9e670b92d23ab00bd56782488ca83f86020e0347";
const canary = "private-fixture-credential-canary";
const runs = "/testmails/api/v1/runs";
const route = `${runs}/${runId}/headless-registration`;
const owner = { type: "machine", id: "owner" } as const;
const cleanups: Array<() => void> = [];
afterEach(() => {
  vi.unstubAllEnvs();
  cleanups.splice(0).forEach(cleanup => cleanup());
});

function mailbox(localPart: string, role: string): TestAccessRecord {
  const email = `${localPart}@oriso.org`;
  return {
    id: `mailbox:${email}`, project: "oriso", environment: "production-test", kind: "mailbox",
    email, username: email, roles: [role], secret: canary, responsiblePerson: canary,
    displayName: canary, permissionsDescription: canary, loginUrl: "https://mail.example.test",
    createdAt: at, updatedAt: at, expiresAt: null, shared: true, rotationStatus: "current",
    documentationUrl: "https://example.test/"
  };
}

function setup({ start = true, configured = true } = {}) {
  const folder = mkdtempSync(path.join(tmpdir(), "headless-registration-"));
  const sqlitePath = path.join(folder, "registry.sqlite");
  const approvalPath = path.join(folder, "approvals.json");
  let database = createDatabase(sqlitePath);
  cleanups.push(() => { database.close(); rmSync(folder, { recursive: true, force: true }); });
  vi.stubEnv("TEST_ACCESS_HEADLESS_DEV_APPROVALS_FILE", configured ? approvalPath : "");
  const asker = mailbox("bart.simpson", "asker");
  const counsellorMailbox = mailbox("lisa.simpson", "consultant");
  const counsellor: TestAccessRecord = {
    ...counsellorMailbox, id: "oriso/dev/lisa.simpson", environment: "dev", kind: "app-user",
    username: "prepared-counsellor", provisioningStatus: "ready", totpSecret: canary
  };
  const records = [asker, counsellorMailbox, counsellor];
  const approval = {
    runId, machineId: owner.id, approvedBy: "operator", commitSha: sha, expiresAt: "2026-11-07T20:15:00.000Z",
    askerMailboxId: asker.id, counsellorMailboxId: counsellorMailbox.id, counsellorAccountId: counsellor.id,
    fixture: { agencyId: 7, topicId: 9, consultingType: 13, postcode: "10115" },
    onlySignedDevices: false
  };
  const writeApproval = (current: typeof approval | null) => writeFileSync(approvalPath, JSON.stringify(current ? [current] : []));
  writeApproval(approval);
  database.testRuns.create({
    project: "oriso", targetEnvironment: "dev", poolEnvironment: "production-test",
    applicationVersion: "test-fixture", commitSha: sha, scenario: "headless-counselling",
    roles: [{ role: "asker", count: 1 }, { role: "consultant", count: 1 }]
  }, [asker, counsellorMailbox].map(record => ({ accountId: record.id, roles: record.roles, email: record.email! })), owner, at, runId);
  if (start) database.testRuns.transition(runId, "reserved", "running", owner, at);
  const actions: MachineAction[] = ["runs:read", "runs:execute"];
  const identity = (id: string, authorized: boolean, environments: Array<"dev" | "production-test"> = ["dev", "production-test"]) => ({
    id, tokenHash: hashMachineToken(id + "-fixture-token"), projects: ["oriso"] as const,
    environments, actions: authorized ? [...actions, "fixtures:headless-register" as const] : actions,
    expiresAt: "2099-01-01T00:00:00.000Z", revokedAt: null
  });
  const list = vi.fn(async () => records);
  const observe = vi.fn<() => Promise<OrisoIdentityObservationResult>>(async () => ({
    kind: "free-candidate", observation: {
      scope: "identity-occupancy-v1", observedAt: at, normalizedSelectors: { usernames: [] },
      identityScanComplete: true, occupancy: "FREE", facts: [],
      layers: ["KEYCLOAK", "ADMIN", "CONSULTANT", "ASKER"].map(source => ({ source: source as "KEYCLOAK", status: "COMPLETE" }))
    }
  }));
  const client = () => request(createApp({
    passwordHash: "unused", secureCookies: false, loadAccounts: () => [], database, fixtureObserver: { observe },
    registryProvider: { list, async get(id) { return records.find(record => record.id === id) ?? null; } },
    machineIdentities: [identity("owner", true), identity("peer", true), identity("executor", false), identity("dev-only", true, ["dev"])]
      .map(item => ({ ...item, projects: [...item.projects] })),
    now: () => new Date(at)
  }));
  let app = client();
  return {
    get database() { return database; },
    approval, asker, counsellor, counsellorMailbox, writeApproval, list, observe,
    get(actor = "owner") { return app.get(route).set("Authorization", `Bearer ${actor}-fixture-token`); },
    post(endpoint: string, body: object = {}, actor = "owner") {
      return app.post(endpoint).set("Authorization", `Bearer ${actor}-fixture-token`).send(body);
    },
    async cli(args: string[]) {
      const lines: string[] = [];
      const status = await runTestRunCli(args, {
        baseUrl: "https://dreambau.com/testmails/api/v1", identity: owner.id,
        readKeychainToken: () => "owner-fixture-token",
        async fetch(target, init) {
          const url = new URL(String(target));
          expect(url.origin).toBe("https://dreambau.com");
          const method = init?.method === "POST" ? "post" : "get";
          const call = app[method](url.pathname).set("Authorization", new Headers(init?.headers).get("Authorization") ?? "");
          if (typeof init?.body === "string") call.send(JSON.parse(init.body));
          const reply = await call;
          return Response.json(reply.body, { status: reply.status });
        },
        write: value => lines.push(value),
        writeError: value => lines.push(value)
      });
      expect(status).toBe(0);
      return JSON.parse(lines.join(""));
    },
    sql() {
      const connection = new Database(sqlitePath);
      cleanups.unshift(() => connection.close());
      return connection;
    },
    reopen() { database.close(); database = createDatabase(sqlitePath); app = client(); }
  };
}

describe("approved Dev headless registration journal", () => {
  it("exposes the exact reserved actors and dedicated fixture without credentials or product writes", async () => {
    const t = setup();
    const prepared = await t.get().expect(200);
    expect(prepared.headers["cache-control"]).toBe("no-store");
    expect(prepared.body).toMatchObject({
      runId, commitSha: sha, targetOrigin: "https://dev.oriso.org",
      asker: { accountId: "oriso/dev/bart.simpson", email: "bart.simpson@oriso.org", username: "ai-load-cc7647c95a-asker" },
      counsellor: { accountId: t.counsellor.id, username: t.counsellor.username },
      fixture: t.approval.fixture, onlySignedDevices: false
    });
    expect(prepared.body.bindingHash).toMatch(/^[a-f0-9]{64}$/);
    expect(prepared.text).not.toContain(canary);
    expect(t.observe).not.toHaveBeenCalled();
    expect(t.database.testResources.listByRun(runId)).toEqual([]);
  });

  it("connects the private run CLI to the binding, claim and durable outcome routes", async () => {
    const t = setup();
    const binding = await t.cli(["headless-prepare", runId]);
    const claim = await t.cli(["headless-claim", runId, "--binding-hash", binding.bindingHash]);
    expect(claim).toMatchObject({ bindingHash: binding.bindingHash, state: "creating" });
    const outcome = await t.cli(["headless-report", runId, "--resource-id", claim.resourceId, "--result", "created"]);
    expect(outcome).toEqual({ resourceId: claim.resourceId, result: "created", state: "create-uncertain" });
    expect(t.database.testResources.get(claim.resourceId)?.externalId).toBeNull();
  });

  it("claims once under concurrency, survives reopen and blocks release after a lost response", async () => {
    const t = setup();
    const { body } = await t.get().expect(200);
    const attempts = await Promise.all([t.post(route, { bindingHash: body.bindingHash }), t.post(route, { bindingHash: body.bindingHash })]);
    expect(attempts.map(result => result.status).sort()).toEqual([201, 409]);
    const accepted = attempts.find(result => result.status === 201)!;
    expect(accepted.body).toMatchObject({ state: "creating", bindingHash: body.bindingHash });
    const resourceId = accepted.body.resourceId;
    t.reopen();
    await t.post(route, { bindingHash: body.bindingHash }).expect(409, { error: "registration_already_claimed" });
    const resources = t.database.testResources.listByRun(runId);
    expect(resources).toHaveLength(1);
    expect(resources[0]).toMatchObject({ id: resourceId, state: "creating", externalId: null, accountId: t.approval.askerMailboxId });
    const audit = t.database.testRuns.events(runId).filter(event => event.type === "headless_registration_claimed");
    expect(audit).toHaveLength(1);
    expect(audit[0].payload).toMatchObject({ resourceId, bindingHash: body.bindingHash, approvedBy: "operator" });
    expect(JSON.stringify(audit)).not.toContain(canary);
    await t.post(`${runs}/${runId}/finish`, { result: "failed" }).expect(200);
    await t.post(`${runs}/${runId}/release`).expect(409, { error: "resources_not_cleaned" });
    expect(t.database.testRuns.leasedAccountIds().size).toBe(2);
  });

  it.each(["created", "uncertain"] as const)("records %s once and keeps ownership unverified after revocation", async result => {
    const t = setup();
    const { body } = await t.get().expect(200);
    const { body: claim } = await t.post(route, { bindingHash: body.bindingHash }).expect(201);
    const outcome = `${route}/${claim.resourceId}/outcome`;
    t.writeApproval(null);
    await t.get().expect(404);
    await t.post(outcome, { result, externalId: "invented" }).expect(400);
    await t.post(outcome, { result }, "peer").expect(404);
    await t.post(outcome, { result }).expect(200, { resourceId: claim.resourceId, result, state: "create-uncertain" });
    t.reopen();
    await t.post(outcome, { result }).expect(200);
    await t.post(outcome, { result: result === "created" ? "uncertain" : "created" }).expect(409);
    expect(t.database.testResources.get(claim.resourceId)).toMatchObject({ state: "create-uncertain", externalId: null, fingerprint: null });
    expect(t.database.testRuns.events(runId).filter(event => event.type === "headless_registration_reported")).toHaveLength(1);
    await t.post(`${runs}/${runId}/finish`, { result: "failed" }).expect(200);
    await t.post(`${runs}/${runId}/release`).expect(409, { error: "resources_not_cleaned" });
  });

  it("denies legacy actions, scope peers and missing or inactive approvals before querying ORISO", async () => {
    const t = setup({ start: false });
    await t.get("executor").expect(403);
    await t.get("peer").expect(404);
    await t.get("dev-only").expect(404);
    await t.get().expect(409);
    t.writeApproval({ ...t.approval, expiresAt: at });
    await t.get().expect(404);
    expect(t.list).not.toHaveBeenCalled();
    expect(t.observe).not.toHaveBeenCalled();
  });

  it("keeps the registration route disabled when the operator has not configured approvals", async () => {
    const t = setup({ configured: false });
    await t.get().expect(404);
    await t.post(route, { bindingHash: "1".repeat(64) }).expect(404);
    expect(t.list).not.toHaveBeenCalled();
    expect(t.database.testResources.listByRun(runId)).toHaveLength(0);
  });

  it("lets only the owning machine change a headless run phase", async () => {
    const t = setup({ start: false });
    const base = `${runs}/${runId}`;
    await t.post(`${base}/release`, {}, "peer").expect(404);
    await t.post(`${base}/start`, {}, "peer").expect(404);
    await t.post(`${base}/start`).expect(200);
    await t.post(`${base}/finish`, { result: "passed" }, "peer").expect(404);
    expect(t.database.testRuns.get(runId)?.status).toBe("running");
    await t.post(`${base}/finish`, { result: "failed" }).expect(200);
    await t.post(`${base}/release`, {}, "peer").expect(404);
    await t.post(`${base}/release`).expect(200);
  });

  it("limits the binding lifetime to the first approval, lease or catalogue expiry", async () => {
    const t = setup();
    const sql = t.sql();
    sql.prepare("UPDATE account_leases SET expires_at=? WHERE account_id=?").run("2026-11-07T20:05:00.000Z", t.approval.askerMailboxId);
    t.counsellorMailbox.expiresAt = "2026-11-07T20:04:00.000Z";
    t.counsellor.expiresAt = "2026-11-07T20:03:00.000Z";
    t.asker.expiresAt = "2026-11-07T20:02:00.000Z";
    const { body } = await t.get().expect(200);
    expect(body.expiresAt).toBe(t.asker.expiresAt);
    t.asker.expiresAt = "2026-11-07T20:01:00.000Z";
    await t.post(route, { bindingHash: body.bindingHash }).expect(409, { error: "binding_changed" });
  });

  it.each(["different fixture", "stale catalogue", "finished run", "expired lease", "revoked approval", "unavailable observer"] as const)
    ("rejects %s between preparation and claim", async variant => {
      const t = setup();
      const { body } = await t.get().expect(200);
      if (variant === "different fixture") t.writeApproval({ ...t.approval, fixture: { ...t.approval.fixture, agencyId: 8 } });
      if (variant === "stale catalogue") t.counsellor.provisioningStatus = "two-factor-pending";
      if (variant === "finished run" || variant === "expired lease" || variant === "revoked approval") {
        const free = await t.observe();
        t.observe.mockImplementation(async () => {
          if (variant === "finished run") t.database.testRuns.transition(runId, "running", "failed", owner, at);
          if (variant === "expired lease") t.sql().prepare("UPDATE account_leases SET expires_at=? WHERE run_id=?").run(at, runId);
          if (variant === "revoked approval") t.writeApproval(null);
          return free;
        });
      }
      if (variant === "unavailable observer") t.observe.mockResolvedValue({ kind: "unavailable", reason: "permission-denied" });
      const response = await t.post(route, { bindingHash: body.bindingHash });
      expect(response.status).toBe(variant === "unavailable observer" ? 503 : variant === "revoked approval" ? 404 : 409);
      expect(t.database.testResources.listByRun(runId)).toHaveLength(0);
    });

  it.each(["occupied", "stale"] as const)("denies %s identity evidence without disclosing observation facts", async mode => {
    const t = setup();
    const { body } = await t.get().expect(200);
    const free = await t.observe();
    if (!("observation" in free)) throw new Error("fixture has no observation");
    if (mode === "occupied") t.observe.mockResolvedValue({
      kind: "occupied", observation: {
        ...free.observation, occupancy: "OCCUPIED",
        facts: [{ source: "KEYCLOAK", identityId: canary }]
      }
    });
    else t.observe.mockResolvedValue({ ...free, observation: { ...free.observation, observedAt: "2026-11-07T19:44:59.000Z" } });
    const denied = await t.post(route, { bindingHash: body.bindingHash }).expect(409);
    expect(denied.text).not.toContain(canary);
    expect(t.database.testResources.listByRun(runId)).toHaveLength(0);
  });

  it("rolls back a resource claim or outcome when its audit write fails", async () => {
    const t = setup();
    const sql = t.sql();
    const { body } = await t.get().expect(200);
    sql.exec("CREATE TRIGGER fail_headless_audit BEFORE INSERT ON test_run_events WHEN NEW.event_type='headless_registration_claimed' BEGIN SELECT RAISE(ABORT,'injected journal failure'); END");
    await t.post(route, { bindingHash: body.bindingHash }).expect(500);
    expect(t.database.testResources.listByRun(runId)).toHaveLength(0);
    expect(t.database.testRuns.events(runId).filter(event => event.type.startsWith("resource_"))).toHaveLength(0);
    sql.exec("DROP TRIGGER fail_headless_audit");
    const { body: claim } = await t.post(route, { bindingHash: body.bindingHash }).expect(201);
    sql.exec("CREATE TRIGGER fail_headless_audit BEFORE INSERT ON test_run_events WHEN NEW.event_type='headless_registration_reported' BEGIN SELECT RAISE(ABORT,'injected journal failure'); END");
    await t.post(`${route}/${claim.resourceId}/outcome`, { result: "uncertain" }).expect(500);
    expect(t.database.testResources.get(claim.resourceId)?.state).toBe("creating");
    expect(t.database.testRuns.events(runId).filter(event => event.type === "resource_create-uncertain")).toHaveLength(0);
  });
});
