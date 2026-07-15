import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RuntimeStatusCards } from "../src/client/components/runtime-status-cards.js";

describe("RuntimeStatusCards", () => {
  it("renders clear environment and health states", () => {
    const html = renderToStaticMarkup(<RuntimeStatusCards locale="de" initialStatuses={[
      { id: "signoz-dev", name: "SigNoz", project: "oriso", environment: "dev", state: "healthy", checkedAt: "2026-07-15T12:00:00.000Z", latencyMs: 14, url: "https://signoz.oriso.org" },
      { id: "kio", name: "Kio Bugfix", project: "dreambau", environment: "platform", state: "offline", checkedAt: "2026-07-15T12:00:00.000Z", latencyMs: null, url: "https://kio.dreambau.com" }
    ]} />);

    expect(html).toContain("Live-Systeme");
    expect(html).toContain("SigNoz");
    expect(html).toContain("Gesund");
    expect(html).toContain("Offline");
    expect(html).toContain("dev");
  });
});
