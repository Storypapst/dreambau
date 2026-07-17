import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createDatabase } from "../src/server/db.js";
import { compareVersions, emptyMetadata, metadataPatchSchema } from "../src/server/metadata.js";

function database() { return createDatabase(path.join(mkdtempSync(path.join(tmpdir(), "testmails-db-")), "test.sqlite")); }

describe("metadata database", () => {
  it("migrates metadata and taxonomy tables", () => {
    const db = database();
    expect(db.tableNames()).toEqual(expect.arrayContaining(["account_metadata", "taxonomy_values"]));
    db.close();
  });
  it("seeds roles, conversation types, and the canonical ORISO topics", () => {
    const db = database();
    const taxonomies = db.getTaxonomies();
    expect(taxonomies.roles).toEqual(["Admin", "Berater", "Ratsuchender", "Träger"]);
    expect(taxonomies.conversationTypes).toEqual(["Chat", "Dateiaustausch", "E-Mail", "Langzeitdialog", "Termin", "Video"]);
    expect(taxonomies.topics).toHaveLength(16);
    expect(taxonomies.topics).toEqual(expect.arrayContaining(["debt", "pregnancy", "living-in-old-age", "u25-suicide-prevention"]));
    db.close();
  });
  it("defaults untouched accounts to unused and accepts the unused lifecycle", () => {
    expect(emptyMetadata("lisa.simpson@dreambau.com")).toMatchObject({ lifecycleStatus: "unused", project: "NONE" });
    expect(metadataPatchSchema.parse({ lifecycleStatus: "unused" })).toEqual({ lifecycleStatus: "unused" });
    expect(metadataPatchSchema.parse({ project: "ORISO" })).toEqual({ project: "ORISO" });
    expect(() => metadataPatchSchema.parse({ project: "UNKNOWN" })).toThrow();
  });
  it("persists validated metadata without passwords", () => {
    const db = database();
    const value = db.upsertMetadata("homer.simpson@dreambau.com", { shippedVersion: "3.1", lifecycleStatus: "needs_review", roles: ["Berater"], fixtureQuality: "realistic", sampleFileCount: 2, notes: "Langzeit-Test" });
    expect(value.shippedVersion).toBe("3.1");
    expect(JSON.stringify(value)).not.toContain("password");
    expect(() => db.upsertMetadata("homer.simpson@dreambau.com", { lifecycleStatus: "gone" as never })).toThrow();
    db.close();
  });
  it("records machine identity usage without storing token values", () => {
    const db = database();
    db.recordMachineIdentityUse("codex-m4-oriso", "2026-07-12T06:30:00.000Z");
    expect(db.getMachineIdentityUsage()).toEqual([
      { identityId: "codex-m4-oriso", lastUsedAt: "2026-07-12T06:30:00.000Z" }
    ]);
    expect(JSON.stringify(db.getMachineIdentityUsage())).not.toContain("token");
    db.close();
  });
});

describe("numeric version comparison", () => {
  it.each([["3", "2.9", 1], ["3.0", "3", 0], ["3.1.0", "3.0.9", 1], ["1.2", "1.10", -1]])("compares %s and %s", (left, right, expected) => expect(Math.sign(compareVersions(left, right))).toBe(expected));
});
