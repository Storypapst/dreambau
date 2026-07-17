import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RuntimeStatusCards } from "../src/client/components/runtime-status-cards.js";

describe("RuntimeStatusCards", () => {
  it("renders clear environment and health states", () => {
    const html = renderToStaticMarkup(<RuntimeStatusCards locale="de" initialStatuses={[
      { id: "signoz-dev", name: "SigNoz", project: "oriso", environment: "dev", state: "healthy", checkedAt: "2026-07-15T12:00:00.000Z", latencyMs: 14, url: "https://signoz.oriso.org" },
      { id: "kio", name: "Kio Bugfix", project: "dreambau", environment: "platform", state: "degraded", checkedAt: "2026-07-15T12:00:00.000Z", latencyMs: 20, url: "https://kio.dreambau.com", metrics: { intakesTotal: 4, intakesBlocked: 1, issuesCreated: 3, repairsQueued: 2, repairsClaimed: 1, repairsCompleted: 5, repairsFailed: 1, artifactsCount: 6, retentionDays: 60 } }
    ]} />);

    expect(html).toContain("Live-Systeme");
    expect(html).toContain("SigNoz");
    expect(html).toContain("Gesund");
    expect(html).toContain("<strong>1</strong> blockiert");
    expect(html).toContain("<strong>2</strong> in Warteschlange");
    expect(html).toContain("<strong>60</strong> Tage Aufbewahrung");
    expect(html).toContain("dev");
  });
});
