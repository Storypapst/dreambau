import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
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
