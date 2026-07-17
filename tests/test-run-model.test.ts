import { describe, expect, it } from "vitest";
import {
  assertRunTransition,
  createRunInputSchema,
  selectRunAccounts
} from "../src/server/test-run-model.js";

describe("test run account selection", () => {
  it("selects a complete deterministic role mix or reports the shortage", () => {
    const candidates = [
      { accountId: "mailbox:a@oriso.org", email: "a@oriso.org", roles: ["consultant"] },
      { accountId: "mailbox:b@oriso.org", email: "b@oriso.org", roles: ["consultant"] },
      { accountId: "mailbox:c@oriso.org", email: "c@oriso.org", roles: ["user"] }
    ];

    expect(selectRunAccounts(
      [{ role: "consultant", count: 2 }, { role: "user", count: 1 }],
      candidates,
      new Set()
    )).toEqual({
      ok: true,
      accounts: [
        { ...candidates[0], requestedRole: "consultant" },
        { ...candidates[1], requestedRole: "consultant" },
        { ...candidates[2], requestedRole: "user" }
      ]
    });

    expect(selectRunAccounts(
      [{ role: "consultant", count: 3 }],
      candidates,
      new Set()
    )).toEqual({
      ok: false,
      missing: [{ role: "consultant", requested: 3, available: 2 }]
    });
  });

  it("excludes accounts already leased by another run", () => {
    const candidates = [
      { accountId: "mailbox:a@oriso.org", email: "a@oriso.org", roles: ["consultant"] },
      { accountId: "mailbox:b@oriso.org", email: "b@oriso.org", roles: ["consultant"] }
    ];

    expect(selectRunAccounts(
      [{ role: "consultant", count: 2 }],
      candidates,
      new Set(["mailbox:a@oriso.org"])
    )).toEqual({
      ok: false,
      missing: [{ role: "consultant", requested: 2, available: 1 }]
    });
  });

  it("rejects duplicate role demands before reserving accounts", () => {
    expect(() => createRunInputSchema.parse({
      project: "oriso",
      targetEnvironment: "pre-dev",
      poolEnvironment: "production-test",
      applicationVersion: "4.9",
      commitSha: "abcdef1",
      scenario: "three-way-chat",
      roles: [
        { role: "consultant", count: 1 },
        { role: "consultant", count: 2 }
      ]
    })).toThrow(/duplicate role demand/);
  });

  it("allows only explicit run lifecycle transitions", () => {
    expect(() => assertRunTransition("reserved", "running")).not.toThrow();
    expect(() => assertRunTransition("running", "passed")).not.toThrow();
    expect(() => assertRunTransition("passed", "released")).not.toThrow();
    expect(() => assertRunTransition("reserved", "passed"))
      .toThrow(/invalid run transition: reserved -> passed/);
  });
});
