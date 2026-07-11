import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createDatabase } from "../src/server/db.js";
import { compareVersions } from "../src/server/metadata.js";

function database() { return createDatabase(path.join(mkdtempSync(path.join(tmpdir(), "testmails-db-")), "test.sqlite")); }

describe("metadata database", () => {
  it("migrates metadata and taxonomy tables", () => {
    const db = database();
    expect(db.tableNames()).toEqual(expect.arrayContaining(["account_metadata", "taxonomy_values"]));
    db.close();
  });
  it("seeds roles and conversation types but no topics", () => {
    const db = database();
    expect(db.getTaxonomies()).toEqual({
      roles: ["Admin", "Berater", "Ratsuchender", "Träger"],
      topics: [],
      conversationTypes: ["Chat", "Dateiaustausch", "E-Mail", "Langzeitdialog", "Termin", "Video"]
    });
    db.close();
  });
  it("persists validated metadata without passwords", () => {
    const db = database();
    const value = db.upsertMetadata("homer.simpson@dreambau.com", { shippedVersion: "3.1", lifecycleStatus: "needs_review", roles: ["Berater"], fixtureQuality: "realistic", sampleFileCount: 2, notes: "Langzeit-Test" });
    expect(value.shippedVersion).toBe("3.1");
    expect(JSON.stringify(value)).not.toContain("password");
    expect(() => db.upsertMetadata("homer.simpson@dreambau.com", { lifecycleStatus: "gone" as never })).toThrow();
    db.close();
  });
});

describe("numeric version comparison", () => {
  it.each([["3", "2.9", 1], ["3.0", "3", 0], ["3.1.0", "3.0.9", 1], ["1.2", "1.10", -1]])("compares %s and %s", (left, right, expected) => expect(Math.sign(compareVersions(left, right))).toBe(expected));
});
