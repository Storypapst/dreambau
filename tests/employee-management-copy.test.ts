import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("team access source messaging", () => {
  it("states that effective project access is synchronized from Infisical groups", () => {
    const source = readFileSync("src/client/components/employee-management.tsx", "utf8");
    expect(source).toContain("Effektive Projektzugriffe werden aus Infisical-Gruppen synchronisiert.");
    expect(source).toContain("Effective project access is synchronized from Infisical groups.");
  });
});
