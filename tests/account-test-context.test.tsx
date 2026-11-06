// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { AccountTestContext } from "@/components/account-test-context";
import type { AccountView } from "@/types";

it("generates dated provider and counselling centre drafts without saving or replacing existing centres", async () => {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  const account = {
    displayName: "Abe Simpson", domain: "oriso.org", email: "abe.simpson@oriso.org",
    metadata: { project: "ORISO", carrier: "Existing provider", agencies: ["Existing centre"], conversationTypes: [] }
  } as AccountView;
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  vi.setSystemTime(new Date("2026-09-23T10:00:00Z"));
  try {
    await act(async () => root.render(<AccountTestContext account={account} locale="en" onSaved={() => undefined} />));
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Edit test context"]')!.click());
    const dialog = document.querySelector('[role="dialog"]')!;
    const provider = dialog.querySelector<HTMLButtonElement>('[aria-label="Generate provider name"]');
    const agency = dialog.querySelector<HTMLButtonElement>('[aria-label="Generate counselling centre name"]');
    expect(provider).not.toBeNull();
    expect(agency).not.toBeNull();
    await act(async () => provider!.click());
    await act(async () => agency!.click());
    await act(async () => agency!.click());
    expect(dialog.querySelector("input")?.value).toBe("QA Abe Simpson Träger-sep23");
    expect(dialog.querySelector("textarea")?.value).toBe("Existing centre\nQA Abe Simpson Beratung-sep23");
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
