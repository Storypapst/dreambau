// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api";
import { registerPasskey } from "@/passkey-client";
import { PasskeyManager, isHybridOnly } from "../src/client/components/passkey-manager.js";

vi.mock("@/api", () => ({ api: vi.fn() }));
vi.mock("@/passkey-client", () => ({ registerPasskey: vi.fn() }));

const phone = { id: "phone", name: "Pixel", transports: ["hybrid"], deviceType: "multiDevice", backedUp: true, createdAt: "2026-09-01T10:00:00.000Z", lastUsedAt: "2026-09-14T09:00:00.000Z" };
const mac = { id: "mac", name: null, transports: ["internal"], deviceType: "singleDevice", backedUp: false, createdAt: "2026-09-14T10:00:00.000Z", lastUsedAt: null };

describe("PasskeyManager", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    vi.mocked(api).mockReset();
    vi.mocked(registerPasskey).mockReset();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function open(passkeys: unknown[]) {
    vi.mocked(api).mockImplementation(async (path, init) => {
      if (path === "/auth/passkeys" && !init?.method) return { passkeys };
      throw new Error(`unexpected ${init?.method ?? "GET"} ${path}`);
    });
    await act(async () => root.render(<PasskeyManager locale="de" />));
    const trigger = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes("Passkeys"));
    await act(async () => trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await vi.waitFor(() => expect(document.querySelector('[data-testid="passkey-list"]')).not.toBeNull());
  }

  it("classifies hybrid-only passkeys", () => {
    expect(isHybridOnly(phone)).toBe(true);
    expect(isHybridOnly(mac)).toBe(false);
    expect(isHybridOnly({ transports: [] })).toBe(false);
  });

  it("explains a phone-only passkey set and blocks deleting the last passkey", async () => {
    await open([phone]);
    expect(document.body.textContent).toContain("Nur Telefon-Passkeys vorhanden");
    expect(document.body.textContent).toContain("Pixel");
    expect(document.body.textContent).toContain("Telefon / QR");
    const remove = document.querySelector('button[aria-label="Löschen"]') as HTMLButtonElement;
    expect(remove.disabled).toBe(true);
  });

  it("lists device passkeys without the hint, renames and deletes", async () => {
    await open([phone, mac]);
    expect(document.querySelector('[data-testid="hybrid-only-hint"]')).toBeNull();
    expect(document.body.textContent).toContain("Unbenannter Passkey");

    vi.mocked(api).mockImplementation(async (path, init) => {
      if (path === "/auth/passkeys/mac" && init?.method === "PATCH") {
        expect(JSON.parse(String(init.body))).toEqual({ name: "MacBook" });
        return { passkeys: [phone, { ...mac, name: "MacBook" }] };
      }
      if (path === "/auth/passkeys/phone" && init?.method === "DELETE") return { passkeys: [{ ...mac, name: "MacBook" }] };
      throw new Error(`unexpected ${init?.method ?? "GET"} ${path}`);
    });
    const renameButtons = Array.from(document.querySelectorAll('button[aria-label="Umbenennen"]'));
    await act(async () => renameButtons[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const input = document.querySelector('input[aria-label="Name"]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "MacBook");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const save = Array.from(document.querySelectorAll("button")).find((item) => item.textContent === "Speichern");
    await act(async () => save?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await vi.waitFor(() => expect(document.body.textContent).toContain("MacBook"));

    const remove = document.querySelector('button[aria-label="Löschen"]') as HTMLButtonElement;
    expect(remove.disabled).toBe(false);
    await act(async () => remove.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await vi.waitFor(() => expect(document.body.textContent).not.toContain("Pixel"));
  });

  it("adds a passkey with the typed name and reloads the list", async () => {
    await open([mac]);
    vi.mocked(registerPasskey).mockResolvedValue({ verified: true, passkeyId: "new" });
    vi.mocked(api).mockImplementation(async (path, init) => {
      if (path === "/auth/passkeys" && !init?.method) return { passkeys: [mac, { ...mac, id: "new", name: "iPhone" }] };
      throw new Error(`unexpected ${init?.method ?? "GET"} ${path}`);
    });
    const nameInput = document.querySelector("#new-passkey-name") as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(nameInput, "iPhone");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const add = Array.from(document.querySelectorAll("button")).find((item) => item.textContent?.includes("Passkey hinzufügen"));
    await act(async () => add?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await vi.waitFor(() => expect(document.body.textContent).toContain("iPhone"));
    expect(registerPasskey).toHaveBeenCalledWith(undefined, { name: "iPhone" });
  });
});
