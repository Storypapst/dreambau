import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDatabase } from "../src/server/db.js";
import { createApp } from "../src/server/app.js";
import { hashMachineToken, machineCan } from "../src/server/machine-access.js";
import type { TestAccessRecord } from "../src/server/infisical-provider.js";
import { createOrisoIdentityObserver, type OrisoIdentityObservationResult, type OrisoIdentityObserver } from "../src/server/oriso-identity-observation.js";
import { createFixturePlanner } from "../src/server/test-fixture-planner.js";

const time = Date.parse("2026-10-20T12:00:00.000Z");
const names = ["abe.simpson", "bart.simpson", "blinky.fish", "clancy.bouvier", "cyrus.simpson", "herb.powell", "homer.simpson", "hugo.simpson", "jacqueline.bouvier", "krusty.clown", "laddie.dog", "ling.bouvier", "lisa.simpson", "maggie.simpson", "marge.simpson", "mojo.helper.monkey", "mona.simpson", "monty.burns", "mr.teeny", "ned.flanders"];
const roles = ["platform-admin", "tenant-admin", "agency-admin", "consultant", "asker"];
const canary = "SECRET_CANARY_NEVER_PERSIST";
const folders: string[] = [];
const closes: Array<() => void> = [];
afterEach(() => { closes.splice(0).forEach(close => close()); folders.splice(0).forEach(folder => rmSync(folder, { recursive: true, force: true })); vi.useRealTimers(); });
function mailbox(index: number): TestAccessRecord {
  const email = `${names[index]}@oriso.org`;
  return { id: `mailbox:${email}`, project: "oriso", environment: "production-test", kind: "mailbox", email, username: email,
    displayName: canary, roles: [roles[index % 5]], permissionsDescription: canary, loginUrl: "https://mail.dreambau.com", secret: canary,
    totpSecret: canary, responsiblePerson: canary, createdAt: new Date(time).toISOString(), updatedAt: new Date(time).toISOString(), expiresAt: null,
    shared: true, rotationStatus: "current", documentationUrl: "https://example.test/" };
}
function free(at = time): OrisoIdentityObservationResult { return { kind: "free-candidate", observation: {
  scope: "identity-occupancy-v1", observedAt: new Date(at).toISOString(), identityScanComplete: true, occupancy: "FREE",
  normalizedSelectors: { usernames: [] }, layers: ["KEYCLOAK", "ADMIN", "CONSULTANT", "ASKER"].map(source => ({ source: source as "KEYCLOAK", status: "COMPLETE" })), facts: []
} }; }
function setup(count = 5, custom?: OrisoIdentityObserver) {
  const folder = mkdtempSync(path.join(tmpdir(), "fixture-plan-")); folders.push(folder);
  const file = path.join(folder, "db.sqlite"); let db = createDatabase(file); closes.push(() => db.close());
  const records = Array.from({ length: count }, (_, index) => mailbox(index));
  let now = time;
  const observe = vi.fn(async () => free(now));
  const provider = { list: vi.fn(async () => records), get: vi.fn(async (id: string) => records.find(record => record.id === id) ?? null) };
  const input = { project: "oriso" as const, targetEnvironment: "dev" as const, poolEnvironment: "production-test" as const, applicationVersion: "test-1", commitSha: "abcdef1", scenario: "factory-plan", roles: roles.slice(0, Math.min(5, count)).map(role => ({ role, count: Math.floor(count / 5) || 1 })) };
  const actor = { type: "machine" as const, id: "planner" };
  db.testRuns.create(input, records.map(record => ({ accountId: record.id, email: record.email!, roles: record.roles })), actor, new Date(time).toISOString(), "run-1");
  const planner = () => createFixturePlanner({ database: db, registryProvider: provider, observer: custom ?? { observe }, now: () => new Date(now) });
  const sql = () => { const connection = new Database(file); closes.push(() => connection.close()); return connection; };
  return { get db() { return db; }, file, records, provider, observe, planner, actor, sql, setNow: (value: number) => { now = value; }, reopen() { db.close(); db = createDatabase(file); } };
}

describe("persisted scoped fixture preflight", () => {
  it("plans five roles, persists only safe projections and survives reopen with equivalent retry", async () => {
    const t = setup(); const first = await t.planner().create("run-1", "synthetic-dev-v1", t.actor);
    expect(first.actors.map(actor => actor.role).sort()).toEqual(["advice-seeker", "agency-admin", "counsellor", "platform-admin", "tenant-admin"]);
    expect(first.actors.every(actor => actor.decision === "fresh-candidate")).toBe(true);
    expect(first.blockers).toContain("native-creation-receipts-required");
    expect(first.hierarchy.tenant.name.length).toBeLessThanOrEqual(40);
    expect(first.hierarchy.agency.status).toBe("unresolved");
    expect(first.expiresAt).toBe(new Date(time + 900_000).toISOString());
    expect(first.usability).toBe("current"); expect(first.applyReady).toBe(false);
    t.reopen(); const retry = await t.planner().create("run-1", "synthetic-dev-v1", t.actor);
    expect(retry).toEqual(first); expect(t.observe).toHaveBeenCalledTimes(5);
    const sql = t.sql();
    expect(sql.prepare("SELECT count(*) n FROM test_resources").get()).toEqual({ n: 0 });
    expect(JSON.stringify(sql.prepare("SELECT * FROM test_fixture_plans").all())).not.toContain(canary);
    expect(JSON.stringify(t.db.testRuns.events("run-1"))).not.toContain(canary);
    expect(readFileSync(t.file).includes(Buffer.from(canary))).toBe(false);
  });
  it("accepts a subset and preserves exact existing username and stable identity binding", async () => {
    const t = setup(1); const m = t.records[0];
    t.records.push({ ...m, id: "oriso/dev/existing", environment: "dev", kind: "admin", username: "stored-exact-name", roles: ["platform-admin"], accountSetup: { inviteId: 7, provisionedUserId: "stable-user-id", submittedAt: null } });
    const result = await t.planner().create("run-1", "synthetic-dev-v1", t.actor);
    expect(t.observe).toHaveBeenCalledWith({ email: m.email, username: "stored-exact-name", identityId: "stable-user-id" });
    expect(result.actors[0].accessRecordId).toBe("oriso/dev/existing");
  });
  it.each(["ambiguous", "wrong-role", "wrong-email", "unknown-member", "id-collision", "expired-record"])("blocks %s mapping before observation", async mode => {
    const t = setup(1); const m = t.records[0];
    if (mode === "ambiguous") { for (const id of ["one", "two"]) t.records.push({ ...m, id, environment: "dev", kind: "admin" }); }
    if (mode === "wrong-role") m.roles = ["consultant"];
    if (mode === "wrong-email") m.email = "bart.simpson@oriso.org";
    if (mode === "unknown-member") { const sql = t.sql(); const email = "stranger@oriso.org"; m.email = email; sql.prepare("UPDATE test_run_accounts SET email=?").run(email); }
    if (mode === "id-collision") t.records.push({ ...m, id: "oriso/dev/abe.simpson", email: "bart.simpson@oriso.org", environment: "dev", kind: "admin" });
    if (mode === "expired-record") m.expiresAt = new Date(time - 1).toISOString();
    const result = await t.planner().create("run-1", "synthetic-dev-v1", t.actor);
    expect(result.actors[0].decision).toBe("blocked"); expect(t.observe).not.toHaveBeenCalled();
  });
  it.each(["occupied", "conflict", "deleted", "disabled", "unknown", "unavailable", "stale", "future"])("keeps %s observation safe and never ready", async mode => {
    const t = setup(1); const response = free(mode === "stale" ? time - 900_001 : mode === "future" ? time + 30_001 : time);
    if (mode === "unknown") t.observe.mockResolvedValue({ kind: "unknown", reason: "incomplete-observation" });
    else if (mode === "unavailable") t.observe.mockResolvedValue({ kind: "unavailable", reason: "upstream-unavailable" });
    else if (["occupied", "conflict", "deleted", "disabled"].includes(mode) && "observation" in response) {
      response.kind = mode === "conflict" ? "conflict" : "occupied";
      response.observation.facts = [{ source: "KEYCLOAK", identityId: "foreign-canary-id", username: canary, email: "foreign@private.test", deleted: mode === "deleted", enabled: mode !== "disabled" }];
      t.observe.mockResolvedValue(response);
    } else t.observe.mockResolvedValue(response);
    const plan = await t.planner().create("run-1", "synthetic-dev-v1", t.actor);
    expect(plan.applyReady).toBe(false);
    expect(plan.actors[0].decision).toBe(["occupied", "deleted", "disabled"].includes(mode) ? "reference-pending-reconciliation" : mode === "conflict" ? "blocked" : "unknown");
    expect(JSON.stringify(plan)).not.toMatch(/foreign-canary|foreign@private/);
  });
  it("caps expiry by observation age, expires history, and revisions public changes only", async () => {
    const t = setup(1); t.observe.mockResolvedValue(free(time - 60_000));
    const first = await t.planner().create("run-1", "synthetic-dev-v1", t.actor);
    expect(first.expiresAt).toBe(new Date(time + 840_000).toISOString());
    t.records[0].secret = "rotated-secret";
    expect((await t.planner().create("run-1", "synthetic-dev-v1", t.actor)).id).toBe(first.id);
    t.sql().prepare("UPDATE test_runs SET commit_sha='abcdef2'").run();
    const second = await t.planner().create("run-1", "synthetic-dev-v1", t.actor); expect(second.revision).toBe(2);
    expect((await t.planner().get("run-1", first.id))?.usability).toBe("run-changed");
    t.setNow(time + 900_001); expect((await t.planner().get("run-1", second.id))?.usability).toBe("expired");
  });
  it("rechecks leases atomically after observation and leaves no plan or event after release", async () => {
    const t = setup(1); t.observe.mockImplementation(async () => { t.db.testRuns.release("run-1", t.actor, new Date(time).toISOString()); return free(); });
    await expect(t.planner().create("run-1", "synthetic-dev-v1", t.actor)).rejects.toThrow("run_changed");
    expect(t.sql().prepare("SELECT count(*) n FROM test_fixture_plans").get()).toEqual({ n: 0 });
    expect(t.db.testRuns.events("run-1").map(event => event.type)).not.toContain("fixture_plan_created");
  });
  it.each(["missing", "expired", "changed-run"])("rejects %s authority before observation", async mode => {
    const t = setup(1); const sql = t.sql();
    if (mode === "missing") sql.prepare("DELETE FROM account_leases").run();
    if (mode === "expired") sql.prepare("UPDATE account_leases SET expires_at=?").run(new Date(time - 1).toISOString());
    if (mode === "changed-run") sql.prepare("UPDATE test_runs SET target_environment='pre-dev'").run();
    await expect(t.planner().create("run-1", "synthetic-dev-v1", t.actor)).rejects.toThrow(); expect(t.observe).not.toHaveBeenCalled();
  });
  it("rolls back the immutable row when the audit insert fails", async () => {
    const t = setup(1); t.sql().exec("CREATE TRIGGER fail_plan_event BEFORE INSERT ON test_run_events WHEN NEW.event_type='fixture_plan_created' BEGIN SELECT RAISE(ABORT, 'injected rollback'); END");
    await expect(t.planner().create("run-1", "synthetic-dev-v1", t.actor)).rejects.toThrow();
    expect(t.sql().prepare("SELECT count(*) n FROM test_fixture_plans").get()).toEqual({ n: 0 });
  });
  it("uses real CAS across concurrent creators and marks released history unusable", async () => {
    const t = setup(1); const [one, two] = await Promise.all([t.planner().create("run-1", "synthetic-dev-v1", t.actor), t.planner().create("run-1", "synthetic-dev-v1", t.actor)]);
    expect(one.id).toBe(two.id); expect(t.sql().prepare("SELECT count(*) n FROM test_fixture_plans").get()).toEqual({ n: 1 });
    t.db.testRuns.release("run-1", t.actor, new Date(time).toISOString());
    expect((await t.planner().get("run-1", one.id))?.usability).toBe("run-changed");
  });
  it("bounds 20 actor reads to four at a time and stops dispatch at 30 seconds", async () => {
    const t = setup(20); let active = 0; let maximum = 0; let calls = 0;
    t.observe.mockImplementation(async () => { active++; maximum = Math.max(maximum, active); calls++; await Promise.resolve(); t.setNow(time + 30_001); active--; return free(); });
    const plan = await t.planner().create("run-1", "synthetic-dev-v1", t.actor);
    expect(maximum).toBe(4); expect(calls).toBe(4); expect(plan.actors).toHaveLength(20);
    expect(plan.counts.observed).toBe(4); expect(plan.counts.unknown).toBe(16); expect(plan.inspectionComplete).toBe(false);
  });
  it("creates a new revision when public input reverts after a different revision", async () => {
    const t = setup(1); const sql = t.sql();
    const one = await t.planner().create("run-1", "synthetic-dev-v1", t.actor);
    sql.prepare("UPDATE test_runs SET commit_sha='abcdef2'").run();
    const two = await t.planner().create("run-1", "synthetic-dev-v1", t.actor);
    sql.prepare("UPDATE test_runs SET commit_sha='abcdef1'").run();
    const three = await t.planner().create("run-1", "synthetic-dev-v1", t.actor);
    expect([one.revision, two.revision, three.revision]).toEqual([1, 2, 3]);
    expect(three.usability).toBe("current");
  });
  it.each(["lease-replaced", "lease-expired", "run-edited"])("rejects %s during the async gap without any plan", async mode => {
    const t = setup(1); const sql = t.sql();
    t.observe.mockImplementation(async () => {
      if (mode === "lease-replaced") sql.prepare("UPDATE account_leases SET leased_at=?").run(new Date(time + 1).toISOString());
      if (mode === "lease-expired") sql.prepare("UPDATE account_leases SET expires_at=?").run(new Date(time - 1).toISOString());
      if (mode === "run-edited") sql.prepare("UPDATE test_runs SET commit_sha='abcdef2'").run();
      return free();
    });
    await expect(t.planner().create("run-1", "synthetic-dev-v1", t.actor)).rejects.toThrow("run_changed");
    expect(sql.prepare("SELECT count(*) n FROM test_fixture_plans").get()).toEqual({ n: 0 });
  });
  it.each(["user", "technical-admin", "asker,consultant"])("rejects unsupported or ambiguous role %s", async role => {
    const t = setup(1); t.records[0].roles = role.split(",");
    t.sql().prepare("UPDATE test_run_accounts SET roles=?,requested_role=?").run(JSON.stringify(t.records[0].roles), role.split(",")[0]);
    const plan = await t.planner().create("run-1", "synthetic-dev-v1", t.actor);
    expect(plan.actors[0].decision).toBe("blocked"); expect(t.observe).not.toHaveBeenCalled();
  });
  it("keeps transport rejection unknown without persisting its exception text", async () => {
    const t = setup(1); t.observe.mockRejectedValue(new Error(canary));
    const plan = await t.planner().create("run-1", "synthetic-dev-v1", t.actor);
    expect(plan.actors[0]).toMatchObject({ decision: "unknown", reason: "observation-unavailable" });
    expect(plan.inspectionComplete).toBe(false); expect(JSON.stringify(plan)).not.toContain(canary);
  });
  it("invalidates historical reads when the current public access mapping changes", async () => {
    const t = setup(1); const first = await t.planner().create("run-1", "synthetic-dev-v1", t.actor);
    const m = t.records[0]; t.records.push({ ...m, id: "oriso/dev/existing", environment: "dev", kind: "admin", username: "exact-stored", roles: ["platform-admin"] });
    expect((await t.planner().get("run-1", first.id))?.usability).toBe("mapping-changed");
    const second = await t.planner().create("run-1", "synthetic-dev-v1", t.actor); expect(second.revision).toBe(2);
    expect((await t.planner().get("run-1", first.id))?.usability).toBe("superseded");
  });
  it("does not confuse one actor's stable identity ID with its username", async () => {
    const t = setup(1); const m = t.records[0];
    t.records.push({ ...m, id: "oriso/dev/existing", environment: "dev", kind: "admin", username: "same-public-value", roles: ["platform-admin"], accountSetup: { inviteId: 7, provisionedUserId: "same-public-value", submittedAt: null } });
    const plan = await t.planner().create("run-1", "synthetic-dev-v1", t.actor);
    expect(plan.actors[0].decision).toBe("fresh-candidate");
    expect(t.observe).toHaveBeenCalledWith({ email: m.email, username: "same-public-value", identityId: "same-public-value" });
  });
  it("rejects duplicate cohort target usernames before transport", async () => {
    const t = setup(2);
    t.records.push(...t.records.slice(0, 2).map((m, index) => ({ ...m, id: `oriso/dev/binding-${index}`, environment: "dev" as const, kind: "admin" as const, username: "same-existing-username" })));
    const plan = await t.planner().create("run-1", "synthetic-dev-v1", t.actor);
    expect(plan.actors.every(actor => actor.decision === "blocked")).toBe(true); expect(t.observe).not.toHaveBeenCalled();
  });
  it("uses the real canonical observer and one managed-admin authentication without any product write", async () => {
    const t = setup(1);
    const m = t.records[0];
    t.records.push({ ...m, id: "oriso/dev/existing", environment: "dev", kind: "admin", username: "lisa", roles: ["platform-admin"] });
    const admin = { ...m, id: "oriso/dev/managed-admin", environment: "dev" as const, kind: "admin" as const, email: "managed@example.test", totpSecret: undefined };
    t.records.push(admin);
    const calls: string[] = [];
    const observer = createOrisoIdentityObserver({ environment: "dev", apiBaseUrl: "https://dev.oriso.org/service", tokenUrl: "https://dev.oriso.org/auth/realms/online-beratung/protocol/openid-connect/token", clientId: "app", adminRecordId: admin.id, registryProvider: t.provider, now: () => new Date(time),
      fetch: async (url, init) => {
        calls.push(String(url));
        expect(init?.method).toBe("POST");
        if (String(url).endsWith("/token")) return { ok: true, status: 200, json: async () => ({ access_token: canary, expires_in: 300 }) };
        expect(String(url)).toBe("https://dev.oriso.org/service/useradmin/identity-observations");
        return { ok: true, status: 200, json: async () => ({ ...("observation" in free() ? (free() as Extract<OrisoIdentityObservationResult, { observation: unknown }>).observation : {}), normalizedSelectors: { email: m.email, usernames: ["lisa", "enc.NRUXGYI."] } }) };
      }
    });
    const planner = createFixturePlanner({ database: t.db, registryProvider: t.provider, observer, now: () => new Date(time) });
    const plan = await planner.create("run-1", "synthetic-dev-v1", t.actor);
    expect(plan.actors[0].decision).toBe("fresh-candidate"); expect(calls).toHaveLength(2);
    expect(JSON.stringify(plan)).not.toContain(canary);
    expect(t.sql().prepare("SELECT count(*) n FROM test_resources").get()).toEqual({ n: 0 });
  });
  it("does not fall back to a product writer when observation is unavailable", async () => {
    const t = setup(1);
    const planner = createFixturePlanner({ database: t.db, registryProvider: t.provider, now: () => new Date(time) });
    const plan = await planner.create("run-1", "synthetic-dev-v1", t.actor);
    expect(plan.actors[0]).toMatchObject({ decision: "unknown", reason: "observation-unavailable" });
    expect(plan.inspectionComplete).toBe(false); expect(t.provider.get).not.toHaveBeenCalled();
  });
  it("enforces the total cohort bound independently of role-demand limits", async () => {
    const t = setup(1); const sql = t.sql();
    sql.prepare("UPDATE test_runs SET requested_accounts=181").run();
    const add = sql.prepare("INSERT INTO test_run_accounts(run_id,account_id,email,roles,requested_role) VALUES('run-1',?,?,?,?)");
    for (let index = 0; index < 180; index++) add.run(`extra-${index}`, "abe.simpson@oriso.org", '["platform-admin"]', "platform-admin");
    await expect(t.planner().create("run-1", "synthetic-dev-v1", t.actor)).rejects.toThrow("run_changed"); expect(t.observe).not.toHaveBeenCalled();
  });
  it("fails closed on provider failure and never saves exception text", async () => {
    const t = setup(1); t.provider.list.mockRejectedValue(new Error(canary));
    await expect(t.planner().create("run-1", "synthetic-dev-v1", t.actor)).rejects.toThrow("registry_unavailable");
    expect(t.sql().prepare("SELECT count(*) n FROM test_fixture_plans").get()).toEqual({ n: 0 });
  });
  it("caps tolerated future skew and creates a fresh revision after TTL expiry", async () => {
    const t = setup(1); t.observe.mockResolvedValue(free(time + 30_000));
    const first = await t.planner().create("run-1", "synthetic-dev-v1", t.actor);
    expect(first.actors[0].decision).toBe("fresh-candidate"); expect(first.expiresAt).toBe(new Date(time + 900_000).toISOString());
    t.setNow(time + 900_001); t.observe.mockResolvedValue(free(time + 900_001));
    const second = await t.planner().create("run-1", "synthetic-dev-v1", t.actor);
    expect(second.revision).toBe(2); expect(second.id).not.toBe(first.id);
  });
  it("completes a 20 actor plan with no duplicate actors", async () => {
    const t = setup(20); const plan = await t.planner().create("run-1", "synthetic-dev-v1", t.actor);
    expect(plan.counts.observed).toBe(20); expect(plan.inspectionComplete).toBe(true); expect(new Set(plan.actors.map(actor => actor.accountId)).size).toBe(20);
  });
});

function apiTarget(t: ReturnType<typeof setup>, actions = ["fixtures:plan", "runs:read"], environments = ["dev", "production-test"]) {
  return createApp({ passwordHash: "unused", secureCookies: false, loadAccounts: () => [], database: t.db, registryProvider: t.provider,
    fixtureObserver: { observe: t.observe }, now: () => new Date(time), machineIdentities: [{ id: "planner", tokenHash: hashMachineToken("fixture-token"), projects: ["oriso"], environments: environments as ["dev"], actions: actions as ["runs:read"], expiresAt: "2099-01-01T00:00:00.000Z", revokedAt: null }] });
}
describe("fixture plan API authority", () => {
  const url = "/testmails/api/v1/runs/run-1/fixture-plans";
  it("requires explicit action and both target and pool scope; legacy grants stay unchanged", async () => {
    const t = setup(1);
    expect(machineCan({ id: "legacy", tokenHash: "a".repeat(64), projects: ["oriso"], environments: ["dev"], expiresAt: "2099-01-01T00:00:00Z", revokedAt: null }, "fixtures:plan")).toBe(false);
    for (const [actions, env] of [[["runs:read"], ["dev", "production-test"]], [["fixtures:plan"], ["dev"]]]) {
      const response = await request(apiTarget(t, actions, env)).post(url).auth("fixture-token", { type: "bearer" }).send({ templateVersion: "synthetic-dev-v1" });
      expect([403, 404]).toContain(response.status);
    }
    expect(t.observe).not.toHaveBeenCalled();
  });
  it.each([{ templateVersion: "synthetic-dev-v1", url: "https://evil.test" }, { templateVersion: "new" }, { templateVersion: "synthetic-dev-v1", roles: [] }])("rejects client override %j", async body => {
    const t = setup(1); const response = await request(apiTarget(t)).post(url).auth("fixture-token", { type: "bearer" }).send(body);
    expect(response.status).toBe(400); expect(t.observe).not.toHaveBeenCalled();
  });
  it("returns persisted scoped plans and hides all foreign run/plan combinations", async () => {
    const t = setup(1); const app = apiTarget(t);
    const response = await request(app).post(url).auth("fixture-token", { type: "bearer" }).send({ templateVersion: "synthetic-dev-v1" });
    expect(response.status).toBe(201); expect(response.text).not.toContain(canary);
    const get = await request(app).get(`${url}/${response.body.id}`).auth("fixture-token", { type: "bearer" }); expect(get.status).toBe(200); expect(get.body).toEqual(response.body);
    expect((await request(apiTarget(t, ["fixtures:plan"])).get(`${url}/${response.body.id}`).auth("fixture-token", { type: "bearer" })).status).toBe(403);
    expect((await request(app).get(`${url}/missing`).auth("fixture-token", { type: "bearer" })).status).toBe(404);
    expect((await request(apiTarget(t, ["runs:read"], ["production-test"])).get(`${url}/${response.body.id}`).auth("fixture-token", { type: "bearer" })).status).toBe(404);
  });
});
