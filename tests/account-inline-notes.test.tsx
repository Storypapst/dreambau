// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setActiveViewer } from "../src/client/api.js";
import { AccountInlineNotes } from "../src/client/components/account-inline-notes.js";
import type { AccountMetadata, AccountView } from "../src/client/types.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const email = "ned.flanders@dreambau.de";
const account: AccountView = {
  displayName: "Ned Flanders",
  email,
  password: "mailbox-password",
  domain: "dreambau.de",
  imap: "mail.dreambau.com:993",
  smtp: "mail.dreambau.com:465",
  jmap: "https://box.dreambau.com/.well-known/jmap",
  caldav: "https://box.dreambau.com/dav/cal/",
  carddav: "https://box.dreambau.com/dav/card/",
  encryption: { state: "encrypted", format: "S/MIME", symmetricMode: "AES-256", encryptOnAppend: true, allowSpamTraining: false },
  metadata: {
    email,
    shippedVersion: "2.03",
    lifecycleStatus: "active",
    project: "ORISO",
    roles: ["Träger"],
    topics: [],
    conversationTypes: [],
    fixtureQuality: "empty",
    sampleFileCount: 0,
    notes: "Existing note",
    updatedAt: "2026-08-13T00:00:00.000Z"
  }
};

function saved(notes: string) {
  return new Response(JSON.stringify({ ...account.metadata, notes, updatedAt: "2026-08-14T00:00:00.000Z" }));
}

function setNotes(input: HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("inline account notes", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const fetchMock = vi.fn<typeof fetch>();
  let onSaved: ReturnType<typeof vi.fn<(metadata: AccountMetadata) => void>>;
  const input = () => container.querySelector("textarea")!;
  const renderNotes = (current = account) => root.render(<AccountInlineNotes account={current} locale="en" onSaved={onSaved} />);

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    onSaved = vi.fn();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    setActiveViewer(null);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("shows the same draft on desktop and mobile and saves only the final notes after a pause", async () => {
    fetchMock.mockResolvedValueOnce(saved("First line\nSecond line"));
    await act(async () => root.render(<>
      <AccountInlineNotes account={account} locale="en" onSaved={onSaved} />
      <AccountInlineNotes account={account} locale="de" onSaved={onSaved} />
    </>));
    const [desktop, mobile] = container.querySelectorAll("textarea");
    expect(desktop.value).toBe("Existing note");
    expect(mobile.labels?.[0].textContent).toBe("Notizen");
    await act(async () => setNotes(desktop, "First line"));
    await act(async () => setNotes(desktop, "First line\nSecond line"));
    expect(mobile.value).toBe("First line\nSecond line");
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => vi.runAllTimersAsync());

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/testmails/api/accounts/ned.flanders%40dreambau.de", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ notes: "First line\nSecond line" })
    }));
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ notes: "First line\nSecond line" }));
    expect(desktop.value).toBe("First line\nSecond line");
  });

  it("shows a short Saved acknowledgement only after persistence", async () => {
    fetchMock.mockResolvedValueOnce(saved("New note"));
    await act(async () => renderNotes());
    const status = () => container.querySelector('[role="status"]')?.textContent;
    expect(status()).toBe("");
    await act(async () => setNotes(input(), "New note"));
    expect(status()).toBe("");
    await act(async () => vi.advanceTimersByTimeAsync(600));
    expect(status()).toBe("Saved");
    await act(async () => renderNotes({
      ...account,
      metadata: { ...account.metadata, ...onSaved.mock.lastCall![0] }
    }));
    await act(async () => vi.advanceTimersByTimeAsync(2_199));
    expect(status()).toBe("Saved");
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(status()).toBe("");
  });

  it("flushes a cleared note when the field loses focus", async () => {
    fetchMock.mockResolvedValueOnce(saved(""));
    await act(async () => renderNotes());
    await act(async () => {
      input().focus();
      setNotes(input(), "");
    });
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => input().blur());
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(expect.any(String), expect.objectContaining({ body: JSON.stringify({ notes: "" }) }));
  });

  it("serializes saves when an earlier request is still in flight", async () => {
    let finishFirstSave!: (response: Response) => void;
    const firstSave = new Promise<Response>((resolve) => { finishFirstSave = resolve; });
    fetchMock.mockReturnValueOnce(firstSave).mockResolvedValueOnce(saved("Latest"));
    await act(async () => renderNotes());
    await act(async () => setNotes(input(), "Earlier"));
    await act(async () => vi.runAllTimersAsync());
    await act(async () => setNotes(input(), "Latest"));
    await act(async () => vi.runAllTimersAsync());
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(input().value).toBe("Latest");

    await act(async () => finishFirstSave(saved("Earlier")));

    expect(fetchMock).toHaveBeenNthCalledWith(2, expect.any(String), expect.objectContaining({ body: JSON.stringify({ notes: "Latest" }) }));
    expect(onSaved).toHaveBeenLastCalledWith(expect.objectContaining({ notes: "Latest" }));
    expect(input().value).toBe("Latest");
  });

  it("flushes on removal and preserves a failed draft for retry when the account is shown again", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce(saved("Keep this note"));
    await act(async () => renderNotes());
    await act(async () => setNotes(input(), "Keep this note"));
    await act(async () => root.render(null));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(onSaved).not.toHaveBeenCalled();

    await act(async () => renderNotes());
    expect(input().value).toBe("Keep this note");
    expect(container.querySelector("[role=alert]")?.textContent).toContain("Could not save");

    const retry = container.querySelector("button")!;
    await act(async () => retry.click());

    expect(onSaved).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ notes: "Keep this note" }));
    expect(container.querySelector("[role=alert]")).toBeNull();
  });

  it("never flushes a draft under a different signed-in viewer", async () => {
    setActiveViewer("first-viewer");
    await act(async () => renderNotes());
    await act(async () => setNotes(input(), "A private draft"));
    setActiveViewer("second-viewer");
    await act(async () => root.render(null));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("adopts a later saved note from the full metadata editor", async () => {
    fetchMock.mockResolvedValueOnce(saved("Inline edit"));
    await act(async () => renderNotes());
    await act(async () => setNotes(input(), "Inline edit"));
    await act(async () => vi.runAllTimersAsync());
    await act(async () => renderNotes({
      ...account,
      metadata: { ...account.metadata, notes: "Edit from the sheet", updatedAt: "2026-08-15T00:00:00.000Z" }
    }));
    expect(input().value).toBe("Edit from the sheet");
  });
});
