// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AccountAgencies } from "../src/client/components/account-agencies.js";

describe("documented account agencies", () => {
  let previousActEnvironment: typeof globalThis.IS_REACT_ACT_ENVIRONMENT;
  let hadActEnvironment: boolean;
  beforeEach(() => {
    hadActEnvironment = Object.hasOwn(globalThis, "IS_REACT_ACT_ENVIRONMENT");
    previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterEach(() => {
    if (hadActEnvironment) globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    else Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  });
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
