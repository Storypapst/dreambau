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

it("offers filtering for unmarked catalogue text and blocks a selection crossing a credential", async () => {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  const search = vi.fn();
  const savedRectangle = Object.getOwnPropertyDescriptor(Range.prototype, "getBoundingClientRect");
  Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: () => new DOMRect(20, 60, 80, 15) });
  try {
    await act(async () => root.render(<>
      <section data-testmails-selection-scope>
        <span id="topic">Housing advice</span>
        <code data-testmails-search-private>fixture-secret</code>
        <span id="role">Consultant</span>
      </section>
      <SearchSelection locale="en" onSearch={search} />
    </>));
    const topic = host.querySelector("#topic")!.firstChild!;
    const role = host.querySelector("#role")!.firstChild!;
    async function select(end: Node, offset: number) {
      await act(async () => {
        const range = document.createRange();
        range.setStart(topic, 0);
        range.setEnd(end, offset);
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
        document.dispatchEvent(new Event("selectionchange"));
      });
    }
    await select(role, 4);
    expect(host.querySelector("button")).toBeNull();
    await select(topic, 7);
    const button = host.querySelector("button")!;
    expect(button?.textContent).toBe("Filter by selection");
    const copy = new KeyboardEvent("keydown", { key: "c", metaKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(copy);
    expect(copy.defaultPrevented).toBe(false);
    expect(window.getSelection()?.toString()).toBe("Housing");
    await act(async () => button.click());
    expect(search).toHaveBeenCalledExactlyOnceWith("Housing");
  } finally {
    if (savedRectangle) Object.defineProperty(Range.prototype, "getBoundingClientRect", savedRectangle);
    else Reflect.deleteProperty(Range.prototype, "getBoundingClientRect");
    window.getSelection()?.removeAllRanges();
    await act(async () => root.unmount());
    host.remove();
  }
});
