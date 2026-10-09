// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api";
import { MetadataEditor } from "../src/client/components/metadata-editor.js";
import type { AccountView } from "../src/client/types.js";

vi.mock("@/api", () => ({ api: vi.fn() }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const account: AccountView = {
  displayName: "Ned Flanders",
  email: "ned.flanders@dreambau.de",
  password: "mailbox-password",
  domain: "dreambau.de",
  imap: "mail.dreambau.com:993",
  smtp: "mail.dreambau.com:465",
  jmap: "https://box.dreambau.com/.well-known/jmap",
  caldav: "https://box.dreambau.com/dav/cal/",
  carddav: "https://box.dreambau.com/dav/card/",
  encryption: { state: "encrypted", format: "S/MIME", symmetricMode: "AES-256", encryptOnAppend: true, allowSpamTraining: false },
  metadata: {
    email: "ned.flanders@dreambau.de",
    shippedVersion: "2.03",
    lifecycleStatus: "active",
    project: "ORISO",
    roles: ["Träger"],
    topics: [],
    conversationTypes: [],
    fixtureQuality: "empty",
    sampleFileCount: 0,
    notes: "",
    updatedAt: "2026-08-13T00:00:00.000Z"
  }
};

describe("MetadataEditor", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    vi.mocked(api).mockReset();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    document.querySelectorAll("[data-slot=sheet-portal]").forEach((node) => node.remove());
    container.remove();
  });

  it.each(["Debt advice Berlin\nFamily advice Hamburg\nDebt advice Berlin", ""])("saves documented agencies from the editor: %s", async (names) => {
    const saved = vi.fn();
    vi.mocked(api).mockResolvedValue({ ...account.metadata, agencies: names ? ["Debt advice Berlin", "Family advice Hamburg"] : [] });
    await act(async () => root.render(<MetadataEditor account={{ ...account, metadata: { ...account.metadata, agencies: ["Previous agency"] } }} taxonomies={{ roles: ["Träger"], topics: [], conversationTypes: [] }} locale="en" open onOpenChange={() => undefined} onSaved={saved} />));
    const input = document.querySelector<HTMLTextAreaElement>("#agencies");
    expect(input).not.toBeNull();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, names);
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    const patch = JSON.parse(vi.mocked(api).mock.calls[0][1]!.body as string);
    expect(patch.agencies).toEqual(names ? ["Debt advice Berlin", "Family advice Hamburg"] : []);
    expect(patch).not.toHaveProperty("roles");
    expect(saved).toHaveBeenCalledOnce();
  });

  it("persists role keys when the user explicitly changes the selection", async () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    const previousScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
    try {
      vi.mocked(api).mockResolvedValue({ ...account.metadata, roles: ["Träger", "counsellor"] });
      await act(async () => root.render(<MetadataEditor account={account} taxonomies={{ roles: ["Träger", "counsellor"], topics: [], conversationTypes: [] }} locale="en" open onOpenChange={() => undefined} onSaved={() => undefined} />));
      const choose = [...document.querySelectorAll("button")].find((button) => button.textContent === "Choose roles")!;
      await act(async () => choose.dispatchEvent(new MouseEvent("click", { bubbles: true })));
      const option = [...document.querySelectorAll('[role="option"]')].find((node) => node.textContent?.includes("Counselor"))!;
      expect(option).toBeTruthy();
      await act(async () => option.dispatchEvent(new MouseEvent("click", { bubbles: true })));
      await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
      expect(JSON.parse(vi.mocked(api).mock.calls[0][1]!.body as string).roles).toEqual(["Träger", "counsellor"]);
    } finally {
      vi.unstubAllGlobals();
      if (previousScroll) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", previousScroll);
      else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    }
  });

  it("places the save action before the first editable field", async () => {
    await act(async () => root.render(
      <MetadataEditor
        account={account}
        taxonomies={{ roles: ["Träger"], topics: [], conversationTypes: [] }}
        locale="de"
        open
        onOpenChange={() => undefined}
        onSaved={() => undefined}
      />
    ));

    const form = document.querySelector("[data-slot=sheet-content] form");
    const saveButton = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
    const firstField = form?.querySelector<HTMLInputElement>("#version");

    expect(form).not.toBeNull();
    expect(saveButton).not.toBeNull();
    expect(firstField).not.toBeNull();
    expect(saveButton?.compareDocumentPosition(firstField!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
