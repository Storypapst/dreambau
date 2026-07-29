import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("team access source messaging", () => {
  it("states that effective project assignment is synchronized from safe Infisical memberships", () => {
    const source = readFileSync("src/client/components/employee-management.tsx", "utf8");
    expect(source).toContain("Infisical-Mitgliedschaften mit No Access oder Admin");
    expect(source).toContain("Infisical memberships with No Access or Admin");
  });

  it("renders the one-time code in a full-width wrapping surface with an explicit copy action", () => {
    const source = readFileSync("src/client/components/employee-management.tsx", "utf8");
    expect(source).toContain('className="min-w-0"');
    expect(source).toContain("break-all");
    expect(source).toContain('label={locale === "de" ? "Enrollment-Code kopieren" : "Copy enrollment code"}');
  });
});
