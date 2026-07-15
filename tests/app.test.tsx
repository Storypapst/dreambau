// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api";
import { App } from "../src/client/app.js";

vi.mock("@/api", () => ({ api: vi.fn() }));
vi.mock("@/components/account-directory", () => ({
  AccountDirectory: ({ initialAccounts, onLogout }: { initialAccounts: unknown[]; onLogout: () => void }) => <div data-testid="directory">accounts:{initialAccounts.length}<button onClick={onLogout}>logout</button></div>
}));
vi.mock("@/components/login-form", () => ({ LoginForm: () => <div>login</div> }));
vi.mock("@/components/passkey-enrollment", () => ({ PasskeyEnrollment: () => <div>enrollment</div> }));
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => null }));

describe("App authenticated loading", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    vi.mocked(api).mockReset();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("renders the account directory after a successful empty account response", async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === "/auth/session") return { authenticated: true, method: "passkey", userId: "admin" };
      if (path === "/accounts") return [];
      if (path === "/taxonomies") return { roles: [], topics: [], conversationTypes: [] };
      if (path === "/auth/me") return { id: "admin", email: "admin@dreambau.com", name: "Admin", projects: ["dreambau"], status: "active", role: "admin", createdAt: "2026-07-15T00:00:00.000Z" };
      throw new Error(`unexpected ${path}`);
    });

    await act(async () => root.render(<App />));
    await vi.waitFor(() => expect(container.querySelector('[data-testid="directory"]')?.textContent).toContain("accounts:0"));
  });

  it("clears the remembered login email when the user logs out", async () => {
    sessionStorage.setItem("testmails-login-email", "frank@dreambau.com");
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === "/auth/session") return { authenticated: true, method: "passkey", userId: "admin" };
      if (path === "/accounts") return [];
      if (path === "/taxonomies") return { roles: [], topics: [], conversationTypes: [] };
      if (path === "/auth/me") return { id: "admin", email: "admin@dreambau.com", name: "Admin", projects: ["dreambau"], status: "active", role: "admin", createdAt: "2026-07-15T00:00:00.000Z" };
      throw new Error(`unexpected ${path}`);
    });

    await act(async () => root.render(<App />));
    await vi.waitFor(() => expect(container.querySelector("button")?.textContent).toBe("logout"));
    await act(async () => container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(sessionStorage.getItem("testmails-login-email")).toBeNull();
  });
});
