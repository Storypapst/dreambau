// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { AccountRowSummary } from "@/components/account-row-summary";
import type { AccountView } from "@/types";

const account = {
  email: "abe@example.test", displayName: "Abe", password: "mailbox-fixture",
  metadata: { agencies: [] },
  linkedAccess: [{ id: "oriso/dev/abe", hasTotp: true }]
} as AccountView;

it("copies the current OTP after waiting without rendering it", async () => {
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  const now = Date.now();
  const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
  const savedClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard });
  const response = (code: string, remaining: number) => new Response(JSON.stringify({
    accountId: "oriso/dev/abe", source: "totp", code, expiresAt: new Date(now + remaining).toISOString()
  }));
  const fetch = vi.fn().mockResolvedValueOnce(response("123456", 3000)).mockResolvedValueOnce(response("654321", 30000));
  vi.stubGlobal("fetch", fetch);
  vi.useFakeTimers({ now });
  try {
    await act(async () => root.render(<AccountRowSummary account={account} locale="en" expanded={false} onToggle={() => undefined} />));
    const button = container.querySelector<HTMLButtonElement>('button[aria-label="Copy 2FA code"]')!;
    expect(button).not.toBeNull();
    await act(async () => button.click());
    expect(clipboard.writeText).not.toHaveBeenCalled();
    expect(button.getAttribute("aria-busy")).toBe("true");
    await act(async () => vi.advanceTimersByTimeAsync(3150));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(clipboard.writeText).toHaveBeenCalledExactlyOnceWith("654321");
    expect(button.dataset.copied).toBe("true");
    expect(container.textContent).not.toMatch(/123456|654321/);

    fetch.mockResolvedValueOnce(response("111111", 6150));
    await act(async () => button.click());
    const mailbox = container.querySelector<HTMLButtonElement>('button[aria-label="Copy mailbox password"]')!;
    await act(async () => mailbox.click());
    await act(async () => vi.advanceTimersByTimeAsync(3150));
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(clipboard.writeText.mock.calls).toEqual([["654321"], ["mailbox-fixture"]]);
    expect(mailbox.dataset.copied).toBeUndefined(); // The confirmation disappears after its timeout.
    expect(button.dataset.copied).toBeUndefined();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    if (savedClipboard) Object.defineProperty(navigator, "clipboard", savedClipboard);
    else Reflect.deleteProperty(navigator, "clipboard");
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});


it("copies an underscore-separated username with today's Berlin date from the compact row", async () => {
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
  const savedClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard });
  vi.useFakeTimers({ now: new Date("2026-09-22T22:30:00Z") });
  try {
    await act(async () => root.render(<AccountRowSummary account={{ ...account, email: "Abe.Test+QA@ORISO.org" }} locale="de" expanded={false} onToggle={() => undefined} />));
    const button = container.querySelector<HTMLButtonElement>('button[aria-label="Benutzernamen erzeugen und kopieren"]');
    expect(button).not.toBeNull();
    await act(async () => button!.click());
    expect(clipboard.writeText).toHaveBeenCalledExactlyOnceWith("abe_test_qa_oriso_org-sep23");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    if (savedClipboard) Object.defineProperty(navigator, "clipboard", savedClipboard);
    else Reflect.deleteProperty(navigator, "clipboard");
    vi.useRealTimers();
  }
});

it("summarizes the role, postcode and multiple documented topics without losing their labels", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  const row = {
    ...account,
    linkedAccess: [{ ...account.linkedAccess![0], roles: ["consultant"] }],
    metadata: { ...account.metadata, roles: ["consultant"], postalCode: "10965",
      agencies: ["Springfield QA Dev Beratungsstelle", "Zweite Beratungsstelle"],
      topics: ["debt", "hiv-and-aids", "hospice-and-palliative-care"] }
  };
  try {
    await act(async () => root.render(<AccountRowSummary account={row} locale="de" expanded={false} onToggle={() => undefined} />));
    expect(container.textContent).toContain("10965");
    expect(container.textContent).toContain("Counselor");
    const terms = [...container.querySelectorAll("[data-account-expander] [data-testmails-search-text]")].map((node) => node.textContent);
    expect(terms).toEqual(["Abe", "Counselor", "Springfield QA Dev Beratungsstelle +1", "· PLZ 10965", "· ORISO-Thema Schulden +2"]);
    expect(container.querySelector("[data-account-expander]")?.getAttribute("aria-description")).toContain("Zweite Beratungsstelle");
    expect(container.querySelector("[data-account-expander]")?.getAttribute("aria-description")).toContain("HIV & Aids");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});

it("puts verified role and counselling context before domain in the collapsed row", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  const row = {
    ...account,
    domain: "oriso.org",
    linkedAccess: [{ ...account.linkedAccess![0], roles: ["counsellor"] }],
    metadata: { ...account.metadata, roles: ["tenant-admin"], agencies: ["Kinder- und Jugendberatung"],
      carrier: "Springfield QA Dev", postalCode: "10551", topics: ["debt"] }
  };
  try {
    await act(async () => root.render(<AccountRowSummary account={row} locale="de" expanded={false} onToggle={() => undefined} />));
    const summary = container.querySelector("[data-account-expander]")!;
    expect(summary.textContent).toContain("Counselor");
    expect(summary.textContent).not.toContain("Träger Admin");
    const text = container.textContent!;
    for (const value of ["Counselor", "Kinder- und Jugendberatung", "Springfield QA Dev", "10551", "Schulden", "oriso.org"])
      expect(text).toContain(value);
    expect(text.indexOf("Counselor")).toBeLessThan(text.indexOf("oriso.org"));
    expect(text.indexOf("Kinder- und Jugendberatung")).toBeLessThan(text.indexOf("oriso.org"));
    expect(text.indexOf("Springfield QA Dev")).toBeLessThan(text.indexOf("oriso.org"));
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
