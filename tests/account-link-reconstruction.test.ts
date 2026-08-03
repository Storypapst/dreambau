import { describe, expect, it } from "vitest";
import { canonicalLoginUrl, dashboardRoles, linkedApplicationRecordsForEmail } from "../src/server/account-link.js";
import type { TestAccessRecord } from "../src/server/infisical-provider.js";

/**
 * Reconstruction of behaviour recovered from the running image, which was built
 * from source that exists in no commit (Package A, issue #25, run-state §5.3).
 * These tests pin what production already does so it stops being unreviewed.
 */
function record(overrides: Partial<TestAccessRecord> & { id: string }): TestAccessRecord {
  return {
    project: "oriso",
    environment: "pre-dev",
    kind: "app-user",
    displayName: "Bart Simpson",
    username: "bart.simpson@oriso.org",
    email: "bart.simpson@oriso.org",
    roles: [],
    permissionsDescription: "",
    loginUrl: "https://pre-dev.oriso.example.test",
    secret: "application-password",
    responsiblePerson: "qa",
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
    expiresAt: null,
    shared: true,
    rotationStatus: "current",
    documentationUrl: "https://dreambau.com/testmails/",
    ...overrides
  } as TestAccessRecord;
}

describe("linked application records", () => {
  it("keeps only records a person can sign in to", () => {
    const records = [
      record({ id: "a", kind: "app-user" }),
      record({ id: "b", kind: "admin" }),
      record({ id: "c", kind: "mailbox" })
    ];

    const linked = linkedApplicationRecordsForEmail("bart.simpson@oriso.org", records);

    // A mailbox record is a credential store, not an application login, so it
    // must not contribute application roles to the dashboard.
    expect(linked.map((entry) => entry.id).sort()).toEqual(["a", "b"]);
  });

  it("matches the address case-insensitively", () => {
    const records = [record({ id: "a", email: "Bart.Simpson@ORISO.org" })];

    expect(linkedApplicationRecordsForEmail("bart.simpson@oriso.org", records)).toHaveLength(1);
  });

  it("returns nothing for an address with no linked application", () => {
    expect(linkedApplicationRecordsForEmail("lisa.simpson@oriso.org", [record({ id: "a" })])).toEqual([]);
  });
});

describe("canonical ORISO login routing", () => {
  it("maps existing PreDev application and admin records onto the same-origin gateway", () => {
    expect(canonicalLoginUrl(record({
      id: "oriso/pre-dev/krusty.clown",
      kind: "admin",
      loginUrl: "https://admin.oriso-dev.site"
    }))).toBe("https://predev.oriso.org/admin");
    expect(canonicalLoginUrl(record({
      id: "oriso/pre-dev/ape.simpson",
      kind: "app-user",
      loginUrl: "https://app.oriso-dev.site"
    }))).toBe("https://predev.oriso.org");
  });

  it("maps existing Dev application and admin records onto the Dev same-origin gateway", () => {
    expect(canonicalLoginUrl(record({
      id: "oriso/dev/krusty.clown",
      environment: "dev",
      kind: "admin",
      loginUrl: "https://admin.oriso.org"
    }))).toBe("https://dev.oriso.org/admin");
    expect(canonicalLoginUrl(record({
      id: "oriso/dev/ape.simpson",
      environment: "dev",
      kind: "app-user",
      loginUrl: "https://app.oriso.org"
    }))).toBe("https://dev.oriso.org");
  });

  it("does not rewrite non-ORISO or non-application records", () => {
    expect(canonicalLoginUrl(record({
      id: "dreambau/pre-dev/mailbox",
      project: "dreambau",
      kind: "mailbox",
      loginUrl: "https://mail.dreambau.com"
    }))).toBe("https://mail.dreambau.com");
  });
});

describe("dashboard role mapping", () => {
  it("maps application roles onto the dashboard vocabulary in a stable order", () => {
    expect(dashboardRoles(["client", "platform-admin"])).toEqual(["Admin", "Ratsuchender"]);
    expect(dashboardRoles(["counselor"])).toEqual(["Berater"]);
    expect(dashboardRoles(["carrier"])).toEqual(["Träger"]);
    expect(dashboardRoles(["tenant-admin"])).toEqual(["Admin"]);
  });

  it("ignores roles outside the dashboard vocabulary", () => {
    expect(dashboardRoles(["something-else"])).toEqual([]);
  });

  it("does not repeat a role reached through several application roles", () => {
    expect(dashboardRoles(["admin", "platform-admin", "tenant-admin"])).toEqual(["Admin"]);
  });
});
