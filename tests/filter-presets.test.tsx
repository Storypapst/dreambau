// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api";
import { DEFAULT_FILTERS, coercePresets, sameFilters, type FilterState } from "../src/client/filter-state.js";
import { FilterPresets } from "../src/client/components/filter-presets.js";

vi.mock("@/api", () => ({ api: vi.fn() }));

const orisoActive: FilterState = { ...DEFAULT_FILTERS, domain: "oriso.org", status: "active" };
const stored = [{ id: "p1", name: "ORISO aktiv", filters: orisoActive }];

describe("filter preset helpers", () => {
  it("coerces server values and compares states by content", () => {
    expect(coercePresets(null)).toEqual([]);
    expect(coercePresets([{ id: "", name: "x", filters: {} }, { id: "ok", name: "  Name ", filters: { query: "q" } }, "junk"])).toEqual([
      { id: "ok", name: "Name", filters: { ...DEFAULT_FILTERS, query: "q" } }
    ]);
    expect(sameFilters(orisoActive, { ...orisoActive })).toBe(true);
    expect(sameFilters(orisoActive, DEFAULT_FILTERS)).toBe(false);
  });
});

describe("FilterPresets", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    vi.mocked(api).mockReset();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function render(current: FilterState, onApply = vi.fn()) {
    await act(async () => root.render(<FilterPresets locale="de" current={current} onApply={onApply} />));
    await vi.waitFor(() => expect(container.textContent).not.toContain("Presets werden geladen"));
    return onApply;
  }
  const chips = () => Array.from(container.querySelectorAll('[data-testid="preset-chip"]'));

  it("shows an empty hint and disables saving without active filters", async () => {
    vi.mocked(api).mockResolvedValue({ key: "filter-presets", value: null });
    await render(DEFAULT_FILTERS);
    expect(container.textContent).toContain("Noch keine Presets");
    const save = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes("Aktuellen Filter speichern")) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });

  it("applies a chip and marks the one matching the current state", async () => {
    vi.mocked(api).mockResolvedValue({ key: "filter-presets", value: stored });
    const onApply = await render(orisoActive);
    expect(chips()).toHaveLength(1);
    expect(chips()[0].getAttribute("data-active")).toBe("true");
    const chipButton = chips()[0].querySelector("button") as HTMLButtonElement;
    await act(async () => chipButton.click());
    expect(onApply).toHaveBeenCalledWith(orisoActive);
  });

  it("saves the current filters under a name and replaces a preset of the same name", async () => {
    let value: unknown = stored;
    vi.mocked(api).mockImplementation(async (_path, init) => {
      if (init?.method === "PUT") value = JSON.parse(String(init.body)).value;
      return { key: "filter-presets", value };
    });
    const current: FilterState = { ...DEFAULT_FILTERS, query: "marge" };
    await render(current);
    const save = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes("Aktuellen Filter speichern")) as HTMLButtonElement;
    await act(async () => save.click());
    const input = container.querySelector('input[aria-label="Name des Presets"]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "oriso aktiv");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const submit = Array.from(container.querySelectorAll("button")).find((item) => item.textContent === "Speichern") as HTMLButtonElement;
    await act(async () => submit.click());
    await vi.waitFor(() => expect(chips()).toHaveLength(1));
    expect((value as Array<{ name: string; filters: FilterState }>)[0]).toMatchObject({ name: "oriso aktiv", filters: current });
    expect(container.querySelector('input[aria-label="Name des Presets"]')).toBeNull();
  });

  it("deletes a chip and reports a failed save", async () => {
    vi.mocked(api).mockImplementation(async (_path, init) => {
      if (init?.method === "PUT") throw new Error("HTTP 500");
      return { key: "filter-presets", value: stored };
    });
    await render(DEFAULT_FILTERS);
    const remove = container.querySelector('button[aria-label="Preset löschen: ORISO aktiv"]') as HTMLButtonElement;
    await act(async () => remove.click());
    await vi.waitFor(() => expect(container.querySelector('[role="alert"]')?.textContent).toContain("Presets konnten nicht gespeichert werden"));
    expect(chips()).toHaveLength(1);
  });
});
