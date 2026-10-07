// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api";
import { useFavorites } from "../src/client/favorites.js";
import { FavoriteButton } from "../src/client/components/favorite-button.js";

vi.mock("@/api", () => ({ api: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("useFavorites", () => {
  let container: HTMLDivElement;
  let root: Root;
  let state: ReturnType<typeof useFavorites>;
  let load: ReturnType<typeof deferred<{ value: unknown }>>;
  let saves: Array<ReturnType<typeof deferred<{ value: unknown }>>>;
  let employee: string;
  let writeOwners: string[];

  function Probe() {
    state = useFavorites();
    return <FavoriteButton favorite={state.favorites.includes("new@example.test")} disabled={!state.ready} onToggle={() => void state.toggle("new@example.test")} locale="en" name="New account" />;
  }

  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    load = deferred();
    saves = [];
    employee = "employee-a";
    writeOwners = [];
    vi.mocked(api).mockReset();
    vi.mocked(api).mockImplementation((_path, init) => {
      if (init?.method !== "PUT") return load.promise;
      writeOwners.push(employee);
      const save = deferred<{ value: unknown }>();
      saves.push(save);
      return save.promise;
    });
    await act(async () => root.render(<Probe />));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    for (const save of saves) await act(async () => save.resolve({ value: [] }));
    container.remove();
    vi.unstubAllGlobals();
  });

  const savedValues = () => vi.mocked(api).mock.calls.filter(([, init]) => init?.method === "PUT").map(([, init]) => JSON.parse(String(init?.body)).value);
  async function finishLoad() {
    await act(async () => load.resolve({ value: ["existing@example.test"] }));
  }

  it("blocks a click and direct toggle until the existing favorites have loaded", async () => {
    expect(state.ready).toBe(false);
    expect(container.querySelector("button")?.disabled).toBe(true);
    await act(async () => {
      container.querySelector("button")?.click();
      await state.toggle("early@example.test");
    });
    expect(savedValues()).toEqual([]);
    await finishLoad();
    expect(state.favorites).toEqual(["existing@example.test"]);
    expect(container.querySelector("button")?.disabled).toBe(false);
    await act(async () => container.querySelector("button")?.click());
    expect(savedValues()).toEqual([["existing@example.test", "new@example.test"]]);
  });

  it("keeps mutations disabled if the initial read fails", async () => {
    await act(async () => load.reject(new Error("HTTP 500")));
    expect(state.ready).toBe(false);
    expect(state.error).toBe(true);
    expect(container.querySelector("button")?.disabled).toBe(true);
    await act(async () => { await state.toggle("new@example.test"); });
    expect(savedValues()).toEqual([]);
  });

  it("queues rapid toggles and does not let an older success replace newer stars", async () => {
    await finishLoad();
    await act(async () => {
      void state.toggle("first@example.test");
      void state.toggle("second@example.test");
    });
    expect(state.favorites).toEqual(["existing@example.test", "first@example.test", "second@example.test"]);
    expect(savedValues()).toEqual([["existing@example.test", "first@example.test"]]);
    await act(async () => saves[0].resolve({ value: ["existing@example.test", "first@example.test"] }));
    expect(state.favorites).toEqual(["existing@example.test", "first@example.test", "second@example.test"]);
    expect(savedValues()[1]).toEqual(state.favorites);
    await act(async () => saves[1].resolve({ value: savedValues()[1] }));
    expect(state.favorites).toEqual(savedValues()[1]);
    expect(state.error).toBe(false);
  });

  it("preserves two same-turn toggles of one star as an add followed by removal", async () => {
    await finishLoad();
    await act(async () => {
      void state.toggle("first@example.test");
      void state.toggle("first@example.test");
    });
    expect(state.favorites).toEqual(["existing@example.test"]);
    await act(async () => saves[0].resolve({ value: savedValues()[0] }));
    expect(savedValues()[1]).toEqual(["existing@example.test"]);
    await act(async () => saves[1].resolve({ value: savedValues()[1] }));
    expect(state.favorites).toEqual(["existing@example.test"]);
  });

  it("keeps newer intent when an earlier save fails and persists every requested star", async () => {
    await finishLoad();
    await act(async () => {
      void state.toggle("first@example.test");
      void state.toggle("second@example.test");
    });
    await act(async () => saves[0].reject(new Error("HTTP 500")));
    expect(state.favorites).toEqual(["existing@example.test", "first@example.test", "second@example.test"]);
    expect(savedValues()[1]).toEqual(state.favorites);
    await act(async () => saves[1].resolve({ value: savedValues()[1] }));
    expect(state.error).toBe(false);
    expect(state.favorites).toEqual(savedValues()[1]);
  });

  it("cancels queued old-employee writes after logout and a new employee mounts", async () => {
    await finishLoad();
    await act(async () => {
      void state.toggle("first@example.test");
      void state.toggle("second@example.test");
    });
    await act(async () => root.unmount());
    employee = "employee-b";
    load = deferred();
    root = createRoot(container);
    await act(async () => root.render(<Probe />));
    await act(async () => saves[0].resolve({ value: savedValues()[0] }));
    await act(async () => load.resolve({ value: ["employee-b@example.test"] }));
    expect(writeOwners).toEqual(["employee-a"]);
    expect(state.favorites).toEqual(["employee-b@example.test"]);
    expect(state.ready).toBe(true);
  });

  it("waits for an active save before loading a same-employee remount", async () => {
    await finishLoad();
    await act(async () => {
      void state.toggle("first@example.test");
      void state.toggle("cancelled@example.test");
    });
    await act(async () => root.unmount());
    load = deferred();
    root = createRoot(container);
    await act(async () => root.render(<Probe />));
    const reads = () => vi.mocked(api).mock.calls.filter(([, init]) => init?.method !== "PUT");
    expect(reads()).toHaveLength(1);
    expect(state.ready).toBe(false);
    expect(container.querySelector("button")?.disabled).toBe(true);
    await act(async () => saves[0].resolve({ value: savedValues()[0] }));
    expect(reads()).toHaveLength(2);
    expect(savedValues()).toHaveLength(1);
    await act(async () => load.resolve({ value: ["existing@example.test", "first@example.test"] }));
    expect(state.favorites).toEqual(["existing@example.test", "first@example.test"]);
    expect(state.ready).toBe(true);
  });

  it("rolls a failed final save back to the last confirmed value", async () => {
    await finishLoad();
    await act(async () => {
      void state.toggle("first@example.test");
      void state.toggle("second@example.test");
    });
    await act(async () => saves[0].resolve({ value: savedValues()[0] }));
    await act(async () => saves[1].reject(new Error("HTTP 500")));
    expect(state.error).toBe(true);
    expect(state.favorites).toEqual(["existing@example.test", "first@example.test"]);
    await act(async () => { void state.toggle("retry@example.test"); });
    expect(savedValues()[2]).toEqual(["existing@example.test", "first@example.test", "retry@example.test"]);
  });
});
