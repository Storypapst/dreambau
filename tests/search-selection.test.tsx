// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { SearchSelection } from "@/components/search-selection";

it("opens the filter on an approved value and preserves the native menu elsewhere", async () => {
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  const search = vi.fn();
  try {
    await act(async () => root.render(<>
      <span data-testmails-search-text>Springfield QA Dev</span>
      <code>private value</code>
      <SearchSelection locale="de" onSearch={search} />
    </>));
    const rightClick = (selector: string) => {
      const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 55, clientY: 75 });
      container.querySelector(selector)!.dispatchEvent(event);
      return event;
    };
    await act(async () => { expect(rightClick("span").defaultPrevented).toBe(true); });
    await act(async () => {
      document.dispatchEvent(new Event("selectionchange"));
      document.dispatchEvent(new Event("scroll"));
    });
    expect(container.querySelector("button")?.textContent).toBe("Danach filtern");
    await act(async () => container.querySelector("button")!.click());
    expect(search).toHaveBeenCalledExactlyOnceWith("Springfield QA Dev");
    await act(async () => { expect(rightClick("code").defaultPrevented).toBe(false); });
    expect(container.querySelector("button")).toBeNull();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
