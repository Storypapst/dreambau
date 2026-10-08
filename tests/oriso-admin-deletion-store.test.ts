import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import Sqlite from "better-sqlite3";
import { createDatabase } from "../src/server/db.js";
it("retains deletion status across restarts and clears it only when recreation succeeds", () => {
  const dbPath = path.join(mkdtempSync(path.join(tmpdir(), "oriso-deletion-store-")), "registry.sqlite");
  const db = createDatabase(dbPath);
  db.markOrisoAdminDeleted("oriso/dev/lisa", "dev", "lisa.simpson@oriso.org", "actor", "2026-10-07");
  db.close();
  const reopened = createDatabase(dbPath);
  expect(reopened.isOrisoAdminDeleted("oriso/dev/lisa")).toBe(true);
  expect(reopened.isOrisoAdminDeleted("oriso/pre-dev/lisa")).toBe(false);
  reopened.clearOrisoAdminDeletion("oriso/dev/lisa");
  expect(reopened.isOrisoAdminDeleted("oriso/dev/lisa")).toBe(false);
  reopened.close();
});

it("persists pending uncertainty separately from verified deletion across restarts", () => {
  const dbPath = path.join(mkdtempSync(path.join(tmpdir(), "oriso-pending-store-")), "registry.sqlite");
  const id = "oriso/pre-dev/synthetic";
  const db = createDatabase(dbPath);
  db.markOrisoAdminDeletionPending(id, "pre-dev", "synthetic@example.invalid", "actor", "2026-10-08");
  db.close();
  const reopened = createDatabase(dbPath);
  expect(reopened.isOrisoAdminDeletionPending(id)).toBe(true);
  expect(reopened.isOrisoAdminDeleted(id)).toBe(false);
  expect(reopened.isOrisoAdminDeletionPending("oriso/dev/synthetic")).toBe(false);
  reopened.markOrisoAdminDeleted(id, "pre-dev", "synthetic@example.invalid", "actor", "2026-10-08");
  expect(reopened.isOrisoAdminDeletionPending(id)).toBe(false);
  expect(reopened.isOrisoAdminDeleted(id)).toBe(true);
  reopened.close();
  const verified = createDatabase(dbPath);
  expect(verified.isOrisoAdminDeleted(id)).toBe(true);
  verified.markOrisoAdminDeletionPending("oriso/dev/other", "dev", "other@example.invalid", "actor", "2026-10-08");
  verified.clearOrisoAdminDeletion("oriso/dev/other");
  expect(verified.isOrisoAdminDeletionPending("oriso/dev/other")).toBe(false);
  expect(verified.isOrisoAdminDeleted("oriso/dev/other")).toBe(false);
  verified.close();
});

it("migrates prior deletion rows as verified deleted without losing identity or provenance", () => {
  const dbPath = path.join(mkdtempSync(path.join(tmpdir(), "oriso-legacy-store-")), "registry.sqlite");
  const legacy = new Sqlite(dbPath);
  legacy.exec(`CREATE TABLE oriso_admin_deletions (
    account_id TEXT PRIMARY KEY, environment TEXT NOT NULL, email TEXT NOT NULL,
    actor_id TEXT NOT NULL, deleted_at TEXT NOT NULL
  )`);
  legacy.prepare("INSERT INTO oriso_admin_deletions VALUES(?,?,?,?,?)")
    .run("oriso/dev/synthetic", "dev", "synthetic@example.invalid", "historical-actor", "2026-10-07");
  legacy.close();
  const migrated = createDatabase(dbPath);
  expect(migrated.isOrisoAdminDeleted("oriso/dev/synthetic")).toBe(true);
  expect(migrated.isOrisoAdminDeletionPending("oriso/dev/synthetic")).toBe(false);
  migrated.close();
  const inspected = new Sqlite(dbPath, { readonly: true });
  expect(inspected.prepare("SELECT * FROM oriso_admin_deletions").all()).toEqual([{
    account_id: "oriso/dev/synthetic", environment: "dev", email: "synthetic@example.invalid",
    actor_id: "historical-actor", deleted_at: "2026-10-07", state: "deleted"
  }]);
  inspected.close();
  const reopened = createDatabase(dbPath);
  expect(reopened.isOrisoAdminDeleted("oriso/dev/synthetic")).toBe(true);
  reopened.close();
});
