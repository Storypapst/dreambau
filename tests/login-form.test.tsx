// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api";
import { LoginForm } from "../src/client/components/login-form.js";

vi.mock("@/api", () => ({ api: vi.fn() }));
vi.mock("@/passkey-client", () => ({ authenticateWithPasskey: vi.fn() }));

describe("LoginForm passkey onboarding", () => {
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

  async function renderWithBootstrapStatus(value: { enabled: boolean } | Error) {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path !== "/auth/bootstrap-status") throw new Error("unexpected API call");
      if (value instanceof Error) throw value;
      return value;
    });
    await act(async () => {
      root.render(<LoginForm locale="de" onLocaleChange={() => undefined} onAuthenticated={() => undefined} />);
    });
    await vi.waitFor(() => expect(container.textContent).not.toContain("Zugangsmodus wird geprüft"));
  }

  it("shows only the first-device setup while no passkey exists", async () => {
    await renderWithBootstrapStatus({ enabled: true });

    expect(container.textContent).toContain("Ersteinrichtung auf diesem System");
    expect(container.textContent).toContain("Ersteinrichtung starten");
    expect(container.textContent).not.toContain("Mit Passkey anmelden");
    expect(container.querySelector('input[type="email"]')).toBeNull();
    expect(container.querySelector('input[type="password"]')).not.toBeNull();
  });

  it("shows passkey and recovery login only after bootstrap has retired", async () => {
    await renderWithBootstrapStatus({ enabled: false });

    expect(container.textContent).toContain("Mit Passkey anmelden");
    expect(container.textContent).toContain("Recovery-Code verwenden");
    expect(container.textContent).not.toContain("Ersteinrichtung starten");
    expect(container.querySelector('input[type="email"]')).not.toBeNull();
  });

  it("fails closed when bootstrap status cannot be loaded", async () => {
    await renderWithBootstrapStatus(new Error("offline"));

    expect(container.textContent).toContain("Zugangsstatus konnte nicht geladen werden");
    expect(container.textContent).not.toContain("Mit Passkey anmelden");
    expect(container.textContent).not.toContain("Ersteinrichtung starten");
    expect(container.querySelector("button:not([aria-label])")).toBeNull();
  });
});
