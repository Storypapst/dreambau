// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { api } from "@/api";
import { SearchHistory } from "../src/client/components/search-history.js";

vi.mock("@/api", () => ({ api: vi.fn() }));

it("does not bring a deleted search back when the history reopens during deletion", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let completeDeletion!: () => void;
  let entries = [{ id: 1, phrase: "Marge" }];
  const deletion = new Promise((resolve) => {
    completeDeletion = () => { entries = []; resolve({ deleted: true }); };
  });
  vi.mocked(api).mockImplementation((_path, init) => {
    if (init?.method === "DELETE") return deletion as Promise<never>;
    return Promise.resolve({ entries, nextBefore: null }) as Promise<never>;
  });

  try {
    await act(async () => root.render(<SearchHistory locale="en" onPick={() => {}} />));
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Search history"]')!;
    await act(async () => trigger.click());
    const remove = document.querySelector<HTMLButtonElement>('button[aria-label="Delete search: Marge"]');
    expect(remove).not.toBeNull();
    await act(async () => remove?.click());
    await act(async () => trigger.click());
    await act(async () => trigger.click());
    await act(async () => completeDeletion());
    expect(document.querySelector('button[aria-label="Delete search: Marge"]')).toBeNull();
    expect(document.body.textContent).toContain("No recent searches.");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
