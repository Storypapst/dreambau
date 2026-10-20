import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabase, type RegistryDatabase } from "../src/server/db.js";

const actor = { type: "machine" as const, id: "factory" };
const at = "2026-10-20T10:00:00.000Z";
const later = "2026-10-20T10:01:00.000Z";
const hash = "a".repeat(64);
const input = { project: "oriso" as const, targetEnvironment: "dev" as const,
  poolEnvironment: "production-test" as const, applicationVersion: "4.9", commitSha: "abcdef1",
  scenario: "owned-fixtures", roles: [{ role: "user", count: 1 }] };
const opened: RegistryDatabase[] = [];
const directories: string[] = [];
function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "test-resources-"));
  directories.push(dir);
  const file = path.join(dir, "test.sqlite");
  const db = createDatabase(file);
  opened.push(db);
  run(db, "run-1", "account-1");
  return { db, file };
}
function run(db: RegistryDatabase, id: string, accountId: string, override = {}) {
  return db.testRuns.create({ ...input, ...override }, [{ accountId, email: null, roles: ["user"] }], actor, at, id);
}
function plan(db: RegistryDatabase, id = "tenant-1", override = {}) {
  return db.testResources.planIntent({ runId: "run-1", operationKey: id, kind: "tenant", parentIds: [], ...override }, id, actor, at);
}
function present(db: RegistryDatabase, id = "tenant-1", externalId = "42", override = {}) {
  plan(db, id, override);
  db.testResources.transition(id, "planned", "creating", actor, at);
  return db.testResources.bindProduct(id, "creating", externalId, hash, actor, at);
}
function proof(id = "tenant-1", externalId = "42", override = {}) {
  return { resourceId: id, externalId, targetOrigin: "https://dev.oriso.org" as const, verifiedAt: later, evidenceHash: hash, ...override };
}
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("owned test resource ledger", () => {
  it("persists an uncertain creation across reopen without freeing its original lease", () => {
    const { db, file } = fixture();
    plan(db);
    db.testResources.transition("tenant-1", "planned", "creating", actor, at);
    db.testResources.transition("tenant-1", "creating", "create-uncertain", actor, later);
    db.close(); opened.splice(opened.indexOf(db), 1);
    const reopened = createDatabase(file); opened.push(reopened);
    expect(reopened.testResources.get("tenant-1")).toMatchObject({ runId: "run-1", state: "create-uncertain", externalId: null,
      project: "oriso", targetEnvironment: "dev", targetOrigin: "https://dev.oriso.org", applicationVersion: "4.9", commitSha: "abcdef1" });
    const before = reopened.testRuns.events("run-1");
    expect(() => reopened.testRuns.release("run-1", actor, later)).toThrow(/resources not cleaned/);
    expect(reopened.testRuns.leasedAccountIds()).toEqual(new Set(["account-1"]));
    expect(reopened.testRuns.get("run-1")?.status).toBe("reserved");
    expect(reopened.testRuns.events("run-1")).toEqual(before);
    expect(() => reopened.testResources.transition("tenant-1", "create-uncertain", "cancelled", actor, later)).toThrow();
  });

  it("reuses a canonical intent key without events and rejects a different intent atomically", () => {
    const { db } = fixture();
    present(db, "a", "1"); present(db, "b", "2");
    const original = plan(db, "child", { kind: "agency", parentIds: ["b", "a", "a"] });
    const before = db.testRuns.events("run-1");
    expect(db.testResources.planIntent({ runId: "run-1", operationKey: "child", kind: "agency", parentIds: ["a", "b"] }, "ignored-retry-id", actor, later)).toEqual(original);
    expect(original.parentIds).toEqual(["a", "b"]);
    expect(() => plan(db, "other", { operationKey: "child", kind: "tenant" })).toThrow(/intent/);
    expect(db.testResources.get("other")).toBeNull();
    expect(db.testRuns.events("run-1")).toEqual(before);
  });

  it("rejects unsupported targets, non-owned accounts, caller target overrides and arbitrary payloads before writes", () => {
    const { db } = fixture();
    run(db, "other", "account-2"); run(db, "legacy", "account-3", { targetEnvironment: "pre-dev" });
    for (const invalid of [
      { kind: "mailbox" }, { kind: "infisical-record" }, { runId: "legacy" }, { runId: "missing" },
      { accountId: "account-2" }, { kind: "user" }, { targetOrigin: "https://evil.invalid" },
      { project: "orimo" }, { payload: { password: "secret" } }
    ]) expect(() => plan(db, "bad", invalid)).toThrow();
    expect(db.testResources.listByRun("run-1")).toEqual([]);
    expect(db.testRuns.events("run-1")).toHaveLength(1);
    expect(plan(db, "user-1", { kind: "user", accountId: "account-1" })).toMatchObject({ accountId: "account-1" });
  });

  it("freezes parents to the same run and dispatches children only when every parent is present", () => {
    const { db } = fixture(); run(db, "other", "account-2");
    plan(db, "foreign", { runId: "other" }); plan(db);
    expect(() => plan(db, "bad", { parentIds: ["foreign"] })).toThrow();
    expect(() => plan(db, "bad", { parentIds: ["missing"] })).toThrow();
    plan(db, "child", { kind: "agency", parentIds: ["tenant-1"] });
    expect(() => db.testResources.transition("child", "planned", "creating", actor, at)).toThrow(/parent/);
    db.testResources.transition("tenant-1", "planned", "creating", actor, at);
    db.testResources.bindProduct("tenant-1", "creating", "42", hash, actor, at);
    expect(db.testResources.transition("child", "planned", "creating", actor, at).state).toBe("creating");
    expect(() => db.testResources.transition("tenant-1", "present", "deleting", actor, later)).toThrow(/child/);
    expect(db.testResources.get("tenant-1")?.state).toBe("present");
  });

  it("prevents attaching children to deleting or terminal parents", () => {
    const { db } = fixture(); present(db);
    db.testResources.transition("tenant-1", "present", "deleting", actor, at);
    expect(() => plan(db, "late-child", { parentIds: ["tenant-1"] })).toThrow(/parent/);
    db.testResources.confirmPhysicalAbsence("tenant-1", "deleting", proof(), actor, later);
    expect(() => plan(db, "late-child", { parentIds: ["tenant-1"] })).toThrow(/parent/);
    expect(db.testResources.get("late-child")).toBeNull();
  });

  it("rejects tenant zero and numeric aliases but preserves opaque exact provider IDs", () => {
    const { db } = fixture(); plan(db);
    db.testResources.transition("tenant-1", "planned", "creating", actor, at);
    for (const id of ["0", "00", "042", "+42", "42.0", " 42", "42\n"]) {
      expect(() => db.testResources.bindProduct("tenant-1", "creating", id, hash, actor, at)).toThrow();
    }
    expect(db.testResources.get("tenant-1")?.externalId).toBeNull();
    expect(db.testResources.bindProduct("tenant-1", "creating", "42", hash, actor, at).externalId).toBe("42");
    expect(present(db, "room", "!a:dev.oriso.org", { kind: "matrix-room" }).externalId).toBe("!a:dev.oriso.org");
  });

  it.each([" ", "!room\u0085:dev.oriso.org", "!room\u0000:dev.oriso.org"])("rejects blank or control-character provider identity %# without recording a binding", (id) => {
    const { db } = fixture(); plan(db, "room", { kind: "matrix-room" });
    db.testResources.transition("room", "planned", "creating", actor, at);
    const before = db.testRuns.events("run-1");
    expect(() => db.testResources.bindProduct("room", "creating", id, hash, actor, at)).toThrow();
    expect(db.testResources.get("room")).toMatchObject({ state: "creating", externalId: null });
    expect(db.testRuns.events("run-1")).toEqual(before);
  });

  it("never adopts another run's stable identity, even after verified historical deletion", () => {
    const { db } = fixture(); run(db, "other", "account-2"); present(db);
    db.testResources.transition("tenant-1", "present", "deleting", actor, at);
    db.testResources.confirmPhysicalAbsence("tenant-1", "deleting", proof(), actor, later);
    plan(db, "competitor", { runId: "other" });
    db.testResources.transition("competitor", "planned", "creating", actor, at);
    const before = db.testRuns.events("other");
    expect(() => db.testResources.bindProduct("competitor", "creating", "42", hash, actor, at)).toThrow();
    expect(db.testResources.get("competitor")).toMatchObject({ state: "creating", externalId: null });
    expect(db.testRuns.events("other")).toEqual(before);
  });

  it("loses stale CAS observations without partial audit or mutable product binding", () => {
    const { db, file } = fixture(); plan(db);
    const second = createDatabase(file); opened.push(second);
    db.testResources.transition("tenant-1", "planned", "creating", actor, at);
    const before = db.testRuns.events("run-1");
    expect(() => second.testResources.transition("tenant-1", "planned", "cancelled", actor, later)).toThrow(/state changed/);
    expect(db.testRuns.events("run-1")).toEqual(before);
    db.testResources.bindProduct("tenant-1", "creating", "42", hash, actor, at);
    expect(() => second.testResources.bindProduct("tenant-1", "creating", "43", hash, actor, later)).toThrow();
    expect(db.testResources.get("tenant-1")?.externalId).toBe("42");
    expect(db.testRuns.events("run-1").map(e => e.type)).toEqual(["run_reserved", "resource_planned", "resource_creating", "resource_present"]);
  });

  it("rolls back state and product identity when audit insertion fails", () => {
    const { db, file } = fixture(); plan(db);
    const raw = new Database(file);
    raw.exec("CREATE TRIGGER fail_resource_audit BEFORE INSERT ON test_run_events WHEN NEW.event_type LIKE 'resource_%' BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END");
    expect(() => db.testResources.transition("tenant-1", "planned", "creating", actor, at)).toThrow(/audit unavailable/);
    expect(db.testResources.get("tenant-1")?.state).toBe("planned");
    raw.exec("DROP TRIGGER fail_resource_audit");
    db.testResources.transition("tenant-1", "planned", "creating", actor, at);
    raw.exec("CREATE TRIGGER fail_resource_audit BEFORE INSERT ON test_run_events WHEN NEW.event_type LIKE 'resource_%' BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END");
    expect(() => db.testResources.bindProduct("tenant-1", "creating", "42", hash, actor, at)).toThrow();
    expect(db.testResources.get("tenant-1")).toMatchObject({ state: "creating", externalId: null, fingerprint: null });
    raw.close();
  });

  it("retains leases through soft deletion and validates exact authoritative proof and time bounds", () => {
    const { db } = fixture(); present(db);
    db.testResources.transition("tenant-1", "present", "deleting", actor, at);
    db.testResources.transition("tenant-1", "deleting", "pending-purge", actor, at);
    expect(() => db.testRuns.release("run-1", actor, later)).toThrow(/resources not cleaned/);
    const before = db.testRuns.events("run-1");
    for (const invalid of [
      { resourceId: "other" }, { externalId: "43" }, { targetOrigin: "https://pre-dev.oriso.org" },
      { verifiedAt: "2026-10-20T09:59:59.999Z" }, { verifiedAt: "2026-10-20T10:01:00.001Z" },
      { verifiedAt: "yesterday" }, { evidenceHash: "404" }, { httpStatus: 404 }, { body: "hidden" }
    ]) expect(() => db.testResources.confirmPhysicalAbsence("tenant-1", "pending-purge", proof("tenant-1", "42", invalid), actor, later)).toThrow();
    expect(db.testResources.get("tenant-1")?.state).toBe("pending-purge");
    expect(db.testRuns.events("run-1")).toEqual(before);
    expect(db.testRuns.leasedAccountIds()).toEqual(new Set(["account-1"]));
    db.testResources.confirmPhysicalAbsence("tenant-1", "pending-purge", proof(), actor, later);
    expect(db.testRuns.events("run-1").at(-1)).toMatchObject({ type: "resource_deleted", actor,
      payload: { resourceId: "tenant-1", from: "pending-purge", to: "deleted", externalId: "42",
        targetOrigin: "https://dev.oriso.org", verifiedAt: later, evidenceHash: hash } });
    expect(db.testRuns.release("run-1", actor, later)).toBe(1);
  });

  it("requires child cleanup before parent deletion and releases only terminal resources", () => {
    const { db, file } = fixture(); present(db);
    present(db, "child", "77", { kind: "agency", parentIds: ["tenant-1"] });
    expect(() => db.testResources.transition("tenant-1", "present", "deleting", actor, at)).toThrow(/child/);
    // Recovery must independently enforce children at confirmation, even if an
    // older coordinator left a deleting parent with an unfinished child.
    const raw = new Database(file);
    raw.prepare("UPDATE test_resources SET state='deleting',deletion_started_at=? WHERE id='tenant-1'").run(at);
    const before = db.testRuns.events("run-1");
    expect(() => db.testResources.confirmPhysicalAbsence("tenant-1", "deleting", proof(), actor, later)).toThrow(/child/);
    expect(db.testResources.get("tenant-1")?.state).toBe("deleting");
    expect(db.testRuns.events("run-1")).toEqual(before);
    raw.exec("UPDATE test_resources SET state='present',deletion_started_at=NULL WHERE id='tenant-1'");
    raw.close();
    db.testResources.transition("child", "present", "deleting", actor, at);
    db.testResources.confirmPhysicalAbsence("child", "deleting", proof("child", "77"), actor, later);
    db.testResources.transition("tenant-1", "present", "deleting", actor, at);
    db.testResources.confirmPhysicalAbsence("tenant-1", "deleting", proof(), actor, later);
    plan(db, "cancelled"); db.testResources.transition("cancelled", "planned", "cancelled", actor, at);
    expect(db.testRuns.release("run-1", actor, later)).toBe(1);
    expect(() => plan(db, "after-release")).toThrow(/released/);
    run(db, "next-run", "account-1");
    expect(db.testRuns.get("next-run")?.accounts[0].accountId).toBe("account-1");
  });

  it("cannot use a generic transition or absence assertion to bypass creation or deletion", () => {
    const { db } = fixture(); plan(db);
    expect(() => db.testResources.transition("tenant-1", "planned", "present", actor, at)).toThrow();
    expect(() => db.testResources.confirmPhysicalAbsence("tenant-1", "planned", proof(), actor, later)).toThrow();
    db.testResources.transition("tenant-1", "planned", "creating", actor, at);
    expect(() => db.testResources.transition("tenant-1", "creating", "cancelled", actor, at)).toThrow();
    expect(() => db.testResources.bindProduct("tenant-1", "creating", "42", "BAD", actor, at)).toThrow();
    db.testResources.transition("tenant-1", "creating", "create-uncertain", actor, at);
    expect(db.testResources.bindProduct("tenant-1", "create-uncertain", "42", hash, actor, at).state).toBe("present");
    db.testResources.transition("tenant-1", "present", "deleting", actor, at);
    expect(() => db.testResources.transition("tenant-1", "deleting", "deleted", actor, at)).toThrow();
  });

  it("preserves a legacy zero-resource run and cleaned_at when migrating repeatedly", () => {
    const { db, file } = fixture();
    db.testRuns.release("run-1", actor, later);
    db.close(); opened.splice(opened.indexOf(db), 1);
    const raw = new Database(file);
    raw.exec("DROP TABLE IF EXISTS test_resource_parents; DROP TABLE IF EXISTS test_resources"); raw.close();
    const migrated = createDatabase(file); opened.push(migrated);
    expect(migrated.testRuns.get("run-1")?.status).toBe("released");
    expect(migrated.testResources.listByRun("run-1")).toEqual([]);
    expect(migrated.testRuns.events("run-1").map(e => e.type)).toEqual(["run_reserved", "run_released"]);
    run(migrated, "legacy", "account-1", { project: "orimo", targetEnvironment: "local" });
    expect(migrated.testRuns.release("legacy", actor, later)).toBe(1);
  });
});
