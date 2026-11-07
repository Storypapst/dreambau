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
  const writeText = vi.fn().mockResolvedValue(undefined);
  const savedClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
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
    expect(provider?.parentElement?.querySelector("input")?.value).toBe("QA Abe Simpson Träger-sep23");
    expect(dialog.querySelector("textarea")?.value).toBe("Existing centre\nQA Abe Simpson Beratung-sep23");
    expect(writeText).toHaveBeenNthCalledWith(1, "QA Abe Simpson Träger-sep23");
    expect(writeText).toHaveBeenNthCalledWith(2, "QA Abe Simpson Beratung-sep23");
    expect(fetch).not.toHaveBeenCalled();

    await act(async () => dialog.querySelector<HTMLButtonElement>('[data-slot="dialog-close"]')!.click());
    const longNames = ["a", "b", "c", "d"].map((letter) => letter.repeat(249));
    const longAccount = { ...account, displayName: "X".repeat(300), metadata: { ...account.metadata, agencies: longNames } };
    await act(async () => root.render(<AccountTestContext account={longAccount} locale="en" onSaved={() => undefined} />));
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Edit test context"]')!.click());
    const longDialog = document.querySelector('[role="dialog"]')!;
    const longProvider = longDialog.querySelector<HTMLButtonElement>('[aria-label="Generate provider name"]')!;
    await act(async () => longProvider.click());
    const longProviderName = longProvider.parentElement!.querySelector("input")!.value;
    expect(longProviderName.length).toBeLessThanOrEqual(255);
    expect(longProviderName).toMatch(/Träger-sep23$/);
    await act(async () => longDialog.querySelector<HTMLButtonElement>('[aria-label="Generate counselling centre name"]')!.click());
    expect(longDialog.querySelector("textarea")!.value).toBe(longNames.join("\n"));
    expect(longDialog.querySelector('[role="alert"]')?.textContent).toContain("shorten the list");
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    if (savedClipboard) Object.defineProperty(navigator, "clipboard", savedClipboard);
    else Reflect.deleteProperty(navigator, "clipboard");
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
