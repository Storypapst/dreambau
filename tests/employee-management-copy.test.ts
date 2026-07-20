import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("team access source messaging", () => {
  it("states that effective project assignment is synchronized from no-access Infisical memberships", () => {
    const source = readFileSync("src/client/components/employee-management.tsx", "utf8");
    expect(source).toContain("Effektive Projektzuordnungen werden aus Infisical-Mitgliedschaften mit No Access synchronisiert.");
    expect(source).toContain("Effective project assignments are synchronized from Infisical memberships with No Access.");
  });
});
