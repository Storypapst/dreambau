import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CoordinationDashboard } from "../src/client/components/coordination-dashboard.js";
import type { CoordinationCatalog } from "../src/client/coordination-client.js";

const catalog: CoordinationCatalog = {
  projects: [
    { id: "oriso", name: "ORISO", description: "Pre-Dev und Dev" },
    { id: "dreambau", name: "Dreambau", description: "Betriebsplattform" }
  ],
  resourceKinds: ["prompt", "observability"],
  items: [
    {
      id: "oriso-delivery",
      title: "ORISO Delivery",
      summary: "Vom Feature Request zum Dev-Stand.",
      problem: "Erhält Entscheidungsgrund und Testbeweis.",
      projects: ["oriso"],
      diagram: "flowchart LR\nA[Feature Request] --> B[Human Dev Gate]",
      details: [{ title: "Feature Request", description: "Beschreibt den Nutzerwert." }],
      resources: [
        { kind: "prompt", title: "Issue Prompt", description: "Kanonische Vorlage." },
        { kind: "observability", title: "SigNoz", description: "Live-Systemzustand." }
      ],
      tags: ["quality-gate"],
      discussions: []
    }
  ]
};

describe("CoordinationDashboard", () => {
  it("renders a project-scoped overview with discoverable details", () => {
    const html = renderToStaticMarkup(
      <CoordinationDashboard locale="de" onBack={vi.fn()} initialCatalog={catalog} />
    );

    expect(html).toContain("Koordinationszentrum");
    expect(html).toContain("ORISO Delivery");
    expect(html).toContain("Welches Problem löst das?");
    expect(html).toContain("quality-gate");
    expect(html).toContain("Details öffnen");
  });
});
