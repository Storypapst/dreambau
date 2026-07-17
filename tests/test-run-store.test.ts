import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createDatabase } from "../src/server/db.js";

function database() {
  return createDatabase(path.join(
    mkdtempSync(path.join(tmpdir(), "test-run-store-")),
    "test.sqlite"
  ));
}

const input = {
  project: "oriso" as const,
  targetEnvironment: "pre-dev" as const,
  poolEnvironment: "production-test" as const,
  applicationVersion: "4.9",
  commitSha: "abcdef1",
  scenario: "three-way-chat",
  roles: [
    { role: "consultant", count: 2 },
    { role: "user", count: 1 }
  ]
};

const candidates = [
  { accountId: "mailbox:a@oriso.org", email: "a@oriso.org", roles: ["consultant"] },
  { accountId: "mailbox:b@oriso.org", email: "b@oriso.org", roles: ["consultant"] },
  { accountId: "mailbox:c@oriso.org", email: "c@oriso.org", roles: ["user"] }
];

describe("test run store", () => {
  it("atomically reserves a complete cohort and rejects a competing run", () => {
    const db = database();
    const now = "2026-07-17T08:00:00.000Z";

    const first = db.testRuns.create(
      input,
      candidates,
      { type: "machine", id: "kio" },
      now,
      "run-1"
    );

    expect(first).toMatchObject({
      id: "run-1",
      status: "reserved",
      requestedAccounts: 3,
      applicationVersion: "4.9",
      commitSha: "abcdef1"
    });
    expect(first.accounts).toHaveLength(3);
    expect(() => db.testRuns.create(
      input,
      candidates,
      { type: "machine", id: "m4" },
      now,
      "run-2"
    )).toThrow(/insufficient accounts/);
    expect(db.testRuns.list({
      project: "oriso",
      targetEnvironment: "pre-dev"
    })).toHaveLength(1);
    db.close();
  });

  it("transitions and releases a run with ordered audit events", () => {
    const db = database();
    const actor = { type: "machine" as const, id: "kio" };
    db.testRuns.create(input, candidates, actor, "2026-07-17T08:00:00.000Z", "run-1");

    db.testRuns.transition(
      "run-1",
      "reserved",
      "running",
      actor,
      "2026-07-17T08:01:00.000Z"
    );
    db.testRuns.transition(
      "run-1",
      "running",
      "passed",
      actor,
      "2026-07-17T08:02:00.000Z",
      { checks: 12 }
    );

    expect(() => db.testRuns.transition(
      "run-1",
      "running",
      "failed",
      actor,
      "2026-07-17T08:03:00.000Z"
    )).toThrow(/run status changed/);
    expect(db.testRuns.get("run-1")?.status).toBe("passed");
    expect(db.testRuns.events("run-1")).toHaveLength(3);

    expect(db.testRuns.release(
      "run-1",
      actor,
      "2026-07-17T08:04:00.000Z"
    )).toBe(3);
    expect(db.testRuns.get("run-1")?.status).toBe("released");
    expect(db.testRuns.leasedAccountIds()).toEqual(new Set());
    expect(db.testRuns.events("run-1").map((event) => event.type)).toEqual([
      "run_reserved",
      "run_running",
      "run_passed",
      "run_released"
    ]);
    db.close();
  });
});
