// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { AccountAgencies } from "../src/client/components/account-agencies.js";

describe("documented account agencies", () => {
  it.each(["de", "en"] as const)("shows multiple agencies and explicitly unknown legacy metadata in %s", async (locale) => {
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      await act(async () => root.render(<AccountAgencies locale={locale} agencies={["Debt advice Berlin", "Family advice Hamburg"]} />));
      expect(container.textContent).toContain("Debt advice Berlin");
      expect(container.textContent).toContain("Family advice Hamburg");
      await act(async () => root.render(<AccountAgencies locale={locale} />));
      expect(container.textContent).toContain(locale === "de" ? "Nicht hinterlegt" : "Not documented");
      expect(container.textContent).not.toContain(locale === "de" ? "Keine Beratungsstelle" : "No agency");
    } finally { await act(async () => root.unmount()); }
  });
});
