// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/client/api.js";
import { useFavorites } from "../src/client/favorites.js";
import { FavoriteButton } from "../src/client/components/favorite-button.js";

vi.mock("@/api", () => ({ api: vi.fn() }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

const existing = "existing@oriso.org";
const first = "first@oriso.org";
const second = "second@oriso.org";

describe("favorite persistence", () => {
  let container: HTMLDivElement;
  let root: Root;
  let current: ReturnType<typeof useFavorites>;

  function Harness() {
    current = useFavorites();
    return <FavoriteButton favorite={current.favorites.includes(first)} locale="en" name="First"
      disabled={!current.ready || current.saving} onToggle={() => void current.toggle(first)} />;
  }
  const star = () => container.querySelector("button")!;
  const render = () => act(async () => root.render(<Harness />));
  async function loadFavorites() {
    vi.mocked(api).mockResolvedValueOnce({ value: [existing] });
    await render();
  }

  beforeEach(() => {
    vi.mocked(api).mockReset();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("blocks starring until the saved favorites load and preserves them in the first write", async () => {
    const get = deferred<{ value: string[] }>();
    vi.mocked(api).mockReturnValueOnce(get.promise);
    await render();
    expect(current.ready).toBe(false);
    expect(star().disabled).toBe(true);
    await act(async () => { star().click(); await current.toggle(first); });
    expect(api).toHaveBeenCalledTimes(1);

    await act(async () => get.resolve({ value: [existing] }));
    expect(current.ready).toBe(true);
    expect(star().disabled).toBe(false);
    vi.mocked(api).mockResolvedValueOnce({ value: [existing, first] });
    await act(async () => current.toggle(first));
    expect(JSON.parse(vi.mocked(api).mock.calls[1][1]!.body as string)).toEqual({ value: [existing, first] });
    expect(current.favorites).toEqual([existing, first]);
  });

  it("keeps starring blocked when the initial GET fails", async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error("load failed"));
    await render();
    expect(current.ready).toBe(false);
    expect(current.error).toBe(true);
    expect(star().disabled).toBe(true);
    await act(async () => current.toggle(first));
    expect(api).toHaveBeenCalledTimes(1);
  });

  it("allows only one write even for synchronous toggles and accepts the next action after settlement", async () => {
    await loadFavorites();
    const put = deferred<{ value: string[] }>();
    vi.mocked(api).mockReturnValueOnce(put.promise);
    await act(async () => {
      void current.toggle(first);
      void current.toggle(second);
    });
    expect(api).toHaveBeenCalledTimes(2);
    expect(current.saving).toBe(true);
    expect(star().disabled).toBe(true);
    expect(current.favorites).toEqual([existing, first]);
    await act(async () => { star().click(); });
    expect(api).toHaveBeenCalledTimes(2);

    await act(async () => put.resolve({ value: [existing, first] }));
    expect(current.saving).toBe(false);
    expect(star().disabled).toBe(false);
    vi.mocked(api).mockResolvedValueOnce({ value: [existing, first, second] });
    await act(async () => current.toggle(second));
    expect(JSON.parse(vi.mocked(api).mock.calls[2][1]!.body as string)).toEqual({ value: [existing, first, second] });
    expect(current.favorites).toEqual([existing, first, second]);
  });

  it("restores the previous favorites and releases the write guard when PUT fails", async () => {
    await loadFavorites();
    const put = deferred<{ value: string[] }>();
    vi.mocked(api).mockReturnValueOnce(put.promise);
    await act(async () => { void current.toggle(first); });
    expect(current.favorites).toEqual([existing, first]);
    await act(async () => put.reject(new Error("save failed")));
    expect(current.favorites).toEqual([existing]);
    expect(current.saving).toBe(false);
    expect(current.error).toBe(true);
    expect(current.ready).toBe(true);
    expect(star().disabled).toBe(false);

    vi.mocked(api).mockResolvedValueOnce({ value: [existing, second] });
    await act(async () => current.toggle(second));
    expect(current.favorites).toEqual([existing, second]);
    expect(current.error).toBe(false);
  });
});
