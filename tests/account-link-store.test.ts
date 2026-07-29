import { describe, expect, it } from "vitest";
import { createDatabase } from "../src/server/db.js";
import type { TestAccessRecord } from "../src/server/infisical-provider.js";
import { secretNameForRecord } from "../src/server/infisical-import.js";

function record(patch: Partial<TestAccessRecord> = {}): TestAccessRecord {
  return {
    id: "oriso/pre-dev/e2e-platform-admin-predev",
    project: "oriso",
    environment: "pre-dev",
    kind: "admin",
    displayName: "Abe Simpson",
    username: "abe.simpson@dreambau.de",
    email: "abe.simpson@dreambau.de",
    roles: ["platform-admin"],
    permissionsDescription: "Dedicated PreDev test administrator",
    loginUrl: "https://admin.oriso-dev.site",
    secret: "application-password-never-persisted",
    totpSecret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
    responsiblePerson: "qa",
    createdAt: "2026-07-29T08:00:00.000Z",
    updatedAt: "2026-07-29T08:00:00.000Z",
    expiresAt: null,
    shared: true,
    rotationStatus: "current",
    documentationUrl: "https://dreambau.com/testmails/",
    ...patch
  };
}

describe("persistent Test Access record links", () => {
  it("reconciles exact known emails idempotently without persisting secrets", () => {
    const database = createDatabase(":memory:");
    const seenAt = "2026-07-29T10:00:00.000Z";
    const records = [
      record({ email: "ABE.SIMPSON@dreambau.de" }),
      record({
        id: "oriso/pre-dev/unmapped",
        email: "unknown.person@dreambau.de",
        username: "unknown.person@dreambau.de"
      }),
      record({
        id: "mailbox:abe.simpson@dreambau.de",
        environment: "production-test",
        kind: "mailbox"
      })
    ];

    expect(database.reconcileTestAccessLinks(["abe.simpson@dreambau.de"], records, seenAt)).toEqual({
      linked: 1,
      unmappedRecords: ["oriso/pre-dev/unmapped"],
      unmappedAccounts: []
    });
    expect(database.reconcileTestAccessLinks(["abe.simpson@dreambau.de"], records, seenAt)).toEqual({
      linked: 1,
      unmappedRecords: ["oriso/pre-dev/unmapped"],
      unmappedAccounts: []
    });

    const links = database.getTestAccessLinks("ABE.SIMPSON@dreambau.de");
    expect(links).toEqual([{
      email: "abe.simpson@dreambau.de",
      recordId: "oriso/pre-dev/e2e-platform-admin-predev",
      secretName: secretNameForRecord("oriso/pre-dev/e2e-platform-admin-predev"),
      project: "oriso",
      environment: "pre-dev",
      kind: "admin",
      lastSeenAt: seenAt
    }]);
    expect(JSON.stringify(links)).not.toContain("application-password");
    expect(JSON.stringify(links)).not.toContain("GEZDGNBV");
    database.close();
  });

  it("reports known accounts that have no application record", () => {
    const database = createDatabase(":memory:");
    expect(database.reconcileTestAccessLinks(
      ["abe.simpson@dreambau.de", "lisa.simpson@dreambau.de"],
      [record()],
      "2026-07-29T10:00:00.000Z"
    ).unmappedAccounts).toEqual(["lisa.simpson@dreambau.de"]);
    database.close();
  });

  it("fails closed when an existing record id changes ownership", () => {
    const database = createDatabase(":memory:");
    database.reconcileTestAccessLinks(
      ["abe.simpson@dreambau.de"],
      [record()],
      "2026-07-29T10:00:00.000Z"
    );

    expect(() => database.reconcileTestAccessLinks(
      ["homer.simpson@dreambau.de"],
      [record({
        email: "homer.simpson@dreambau.de",
        username: "homer.simpson@dreambau.de"
      })],
      "2026-07-29T10:05:00.000Z"
    )).toThrow("Test Access record link conflict");
    database.close();
  });
});
