import { describe, expect, it } from "vitest";
import { coordinationForProjects, coordinationItemIds } from "../src/server/coordination.js";

describe("coordination catalog", () => {
  it("contains stable unique ids and the current ORISO delivery workflow", () => {
    expect(new Set(coordinationItemIds).size).toBe(coordinationItemIds.length);
    const catalog = coordinationForProjects(["oriso", "dreambau"]);
    const delivery = catalog.items.find((item) => item.id === "oriso-delivery");
    expect(delivery?.diagram).toContain("PR against dev");
    expect(delivery?.diagram).toContain("Human review and merge");
    expect(delivery?.diagram).toContain("Verify on Dev");
    expect(delivery?.diagram).not.toContain("Pre-Dev E2E");
    expect(delivery?.summary).toContain("Ablaufhilfe");
    expect(delivery?.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "ORISO Roadmap", url: "https://github.com/orgs/OpenResilienceInitiative/projects/1" })
    ]));
  });

  it("never leaks another project's coordination items", () => {
    const oriso = coordinationForProjects(["oriso"]);
    expect(oriso.projects.map((project) => project.id)).toEqual(["oriso"]);
    expect(oriso.items.every((item) => item.projects.includes("oriso"))).toBe(true);
    expect(JSON.stringify(oriso)).not.toContain("ORIMO Delivery");
  });

  it("routes prompts, rules, ADRs, observability and tools as first-class resources", () => {
    const catalog = coordinationForProjects(["oriso", "dreambau"]);
    expect(JSON.stringify(catalog)).not.toContain("signoz.oriso-dev.site");
    expect(catalog.resourceKinds).toEqual(
      expect.arrayContaining(["prompt", "rule", "adr", "observability", "tool"])
    );
    expect(catalog.items.flatMap((item) => item.resources).map((resource) => resource.title)).toEqual(
      expect.arrayContaining(["AGENTS.md Router", "ADR Timeline", "SigNoz Dev", "Understand Anything"])
    );
    expect(catalog.items.flatMap((item) => item.resources)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "SigNoz Dev", url: "https://signoz.oriso.org" }),
        expect.objectContaining({ title: "Understand Anything", url: "https://understand.oriso.org/" }),
        expect.objectContaining({ title: "Kio Bugfix", url: "https://sunflowercare.slack.com/archives/C0BHAEENLE7" })
      ])
    );
  });
});
