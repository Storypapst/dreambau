// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api";
import { authenticateWithPasskey } from "@/passkey-client";
import { LoginForm } from "../src/client/components/login-form.js";

vi.mock("@/api", () => ({ api: vi.fn() }));
vi.mock("@/passkey-client", () => ({ authenticateWithPasskey: vi.fn() }));

describe("LoginForm passkey onboarding", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    vi.mocked(api).mockReset();
    vi.mocked(authenticateWithPasskey).mockReset();
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

  it("prefills the locally remembered passkey email", async () => {
    localStorage.setItem("testmails-login-email", "frank@dreambau.com");
    await renderWithBootstrapStatus({ enabled: false });

    expect((container.querySelector('input[type="email"]') as HTMLInputElement).value).toBe("frank@dreambau.com");
  });

  it("remembers the email after a successful passkey login", async () => {
    vi.mocked(authenticateWithPasskey).mockResolvedValue({ verified: true });
    await renderWithBootstrapStatus({ enabled: false });
    const email = container.querySelector('input[type="email"]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(email, "frank@dreambau.com");
      email.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes("Mit Passkey anmelden"));
    await act(async () => button?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(localStorage.getItem("testmails-login-email")).toBe("frank@dreambau.com");
  });

  it("fails closed when bootstrap status cannot be loaded", async () => {
    await renderWithBootstrapStatus(new Error("offline"));

    expect(container.textContent).toContain("Zugangsstatus konnte nicht geladen werden");
    expect(container.textContent).not.toContain("Mit Passkey anmelden");
    expect(container.textContent).not.toContain("Ersteinrichtung starten");
    expect(container.querySelector("button:not([aria-label])")).toBeNull();
  });
});
