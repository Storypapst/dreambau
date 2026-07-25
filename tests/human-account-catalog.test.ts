import { describe, expect, it } from "vitest";
import {
  EXPECTED_ACCOUNT_TOTAL,
  CatalogIntegrityError,
  buildHumanAccountCatalog,
  catalogIntegrity
} from "../src/server/human-account-catalog.js";

const checkedAt = new Date("2026-07-25T12:00:00.000Z");

function emails(count: number, prefix = "person") {
  return Array.from({ length: count }, (_, i) => `${prefix}${i + 1}@oriso.org`);
}

const scope = { projects: ["oriso" as const], environments: ["pre-dev" as const], sources: ["local" as const] };

describe("catalog integrity", () => {
  it("accepts exactly 180 unique identities", () => {
    expect(catalogIntegrity(emails(EXPECTED_ACCOUNT_TOTAL))).toEqual({ actualTotal: 180, uniqueTotal: 180 });
  });

  it("rejects a short catalog with counts only", () => {
    try {
      catalogIntegrity(emails(179));
      throw new Error("expected a rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(CatalogIntegrityError);
      const integrity = error as CatalogIntegrityError;
      expect(integrity.code).toBe("account_catalog_incomplete");
      expect(integrity.actualTotal).toBe(179);
      // Integrity failures report counts, never addresses or credentials.
      expect(JSON.stringify(integrity.details())).not.toContain("@");
    }
  });

  it("rejects duplicates even when the raw count is right", () => {
    const duplicated = [...emails(179), "person1@oriso.org"];

    expect(() => catalogIntegrity(duplicated)).toThrow(CatalogIntegrityError);
  });

  it("treats addresses case-insensitively when detecting duplicates", () => {
    const duplicated = [...emails(179), "PERSON1@ORISO.ORG"];

    expect(() => catalogIntegrity(duplicated)).toThrow(CatalogIntegrityError);
  });
});

describe("human account catalog envelope", () => {
  it("reports a complete catalog alongside the caller's visible subset", () => {
    const all = emails(EXPECTED_ACCOUNT_TOTAL);

    const response = buildHumanAccountCatalog({
      allEmails: all,
      accounts: [{ email: all[0] }, { email: all[1] }],
      scope,
      checkedAt
    });

    expect(response.catalog).toEqual({
      status: "complete",
      expectedTotal: 180,
      actualTotal: 180,
      checkedAt: "2026-07-25T12:00:00.000Z"
    });
    expect(response.visibleTotal).toBe(2);
    expect(response.accounts).toHaveLength(2);
    expect(response.scope).toEqual(scope);
  });

  it("describes a legitimately empty scope as a healthy catalog", () => {
    const response = buildHumanAccountCatalog({
      allEmails: emails(EXPECTED_ACCOUNT_TOTAL),
      accounts: [],
      scope,
      checkedAt
    });

    // A scope that matches nothing is not an integrity failure. This is the
    // state that used to render "0 of 0 accounts" beside "Expected 180".
    expect(response.catalog.status).toBe("complete");
    expect(response.visibleTotal).toBe(0);
    expect(response.accounts).toEqual([]);
  });

  it("marks a source as degraded without hiding the accounts still visible", () => {
    const all = emails(EXPECTED_ACCOUNT_TOTAL);

    const response = buildHumanAccountCatalog({
      allEmails: all,
      accounts: [{ email: all[0] }],
      scope,
      checkedAt,
      degradedSources: ["infisical"]
    });

    expect(response.degradedSources).toEqual(["infisical"]);
    expect(response.visibleTotal).toBe(1);
  });

  it("refuses to build an envelope from a broken catalog", () => {
    expect(() => buildHumanAccountCatalog({
      allEmails: emails(12),
      accounts: [],
      scope,
      checkedAt
    })).toThrow(CatalogIntegrityError);
  });
});
