import { describe, expect, it } from "vitest";
import { coordinationForProjects, coordinationItemIds } from "../src/server/coordination.js";

describe("coordination catalog", () => {
  it("contains stable unique ids and the complete AI delivery pipeline", () => {
    expect(new Set(coordinationItemIds).size).toBe(coordinationItemIds.length);
    const catalog = coordinationForProjects(["oriso", "dreambau"]);
    const delivery = catalog.items.find((item) => item.id === "oriso-delivery");
    expect(delivery?.diagram).toContain("Feature Request");
    expect(delivery?.diagram).toContain("Wayfinder");
    expect(delivery?.diagram).toContain("Grill with Docs");
    expect(delivery?.diagram).toContain("Pre-Dev E2E");
    expect(delivery?.diagram).toContain("Human Dev Gate");
    expect(delivery?.details.map((detail) => detail.title)).toEqual(
      expect.arrayContaining(["ADR", "Parent Issue + Sub-Issues", "Draft PR", "Dev Smoke + E2E"])
    );
  });

  it("never leaks another project's coordination items", () => {
    const oriso = coordinationForProjects(["oriso"]);
    expect(oriso.projects.map((project) => project.id)).toEqual(["oriso"]);
    expect(oriso.items.every((item) => item.projects.includes("oriso"))).toBe(true);
    expect(JSON.stringify(oriso)).not.toContain("ORIMO Delivery");
  });

  it("routes prompts, rules, ADRs, observability and tools as first-class resources", () => {
    const catalog = coordinationForProjects(["oriso", "dreambau"]);
    expect(catalog.resourceKinds).toEqual(
      expect.arrayContaining(["prompt", "rule", "adr", "observability", "tool"])
    );
    expect(catalog.items.flatMap((item) => item.resources).map((resource) => resource.title)).toEqual(
      expect.arrayContaining(["AGENTS.md Router", "ADR Timeline", "SigNoz", "Understand Anything"])
    );
    expect(catalog.items.flatMap((item) => item.resources)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "SigNoz", url: "https://signoz.oriso-dev.site" }),
        expect.objectContaining({ title: "Kio Bugfix", url: "https://sunflowercare.slack.com/archives/C0BHAEENLE7" })
      ])
    );
  });
});
