// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { api, onUnauthorized } from "@/api";
import { App } from "../src/client/app.js";

vi.mock("@/api", () => ({ api: vi.fn(), onUnauthorized: vi.fn(() => () => undefined) }));
vi.mock("@/components/account-directory", () => ({
  AccountDirectory: ({ initialAccounts, onLogout, isAdmin, entitlements }: { initialAccounts: unknown[]; onLogout: () => void; isAdmin: boolean; entitlements: { orisoProvisioning: { environments: string[] } } }) => <div data-testid="directory">accounts:{initialAccounts.length};admin:{String(isAdmin)};oriso:{entitlements.orisoProvisioning.environments.join(",")}<button onClick={onLogout}>logout</button></div>
}));
vi.mock("@/components/login-form", () => ({ LoginForm: () => <div>login</div> }));
vi.mock("@/components/passkey-enrollment", () => ({ PasskeyEnrollment: () => <div>enrollment</div> }));
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => null }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

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
    vi.mocked(onUnauthorized).mockReset();
    vi.mocked(onUnauthorized).mockImplementation(() => () => undefined);
    vi.mocked(toast.error).mockReset();
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
      if (path === "/auth/me") return { id: "admin", email: "admin@dreambau.com", name: "Admin", projects: ["dreambau"], status: "active", role: "admin", createdAt: "2026-07-15T00:00:00.000Z", entitlements: { orisoProvisioning: { environments: [] } } };
      throw new Error(`unexpected ${path}`);
    });

    await act(async () => root.render(<App />));
    await vi.waitFor(() => expect(container.querySelector('[data-testid="directory"]')?.textContent).toContain("accounts:0"));
  });

  it("returns to the login screen when the session is lost mid-session", async () => {
    // A server restart drops the in-memory session while the tab keeps its
    // rendered rows, so the stale directory must not stay on screen.
    let lostSession: (() => void) | null = null;
    vi.mocked(onUnauthorized).mockImplementation((handler) => { lostSession = handler; return () => undefined; });
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === "/auth/session") return { authenticated: true, method: "passkey", userId: "admin" };
      if (path === "/accounts") return [];
      if (path === "/taxonomies") return { roles: [], topics: [], conversationTypes: [] };
      if (path === "/auth/me") return { id: "admin", email: "admin@dreambau.com", name: "Admin", projects: ["dreambau"], status: "active", role: "admin", createdAt: "2026-07-15T00:00:00.000Z", entitlements: { orisoProvisioning: { environments: [] } } };
      throw new Error(`unexpected ${path}`);
    });

    await act(async () => root.render(<App />));
    await vi.waitFor(() => expect(container.querySelector('[data-testid="directory"]')).not.toBeNull());

    await act(async () => { lostSession?.(); });
    expect(container.querySelector('[data-testid="directory"]')).toBeNull();
    expect(container.textContent).toContain("login");
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it("says nothing when a first anonymous load is refused", async () => {
    // Landing on the login screen already explains itself; an expiry notice
    // there would only describe a session that never existed.
    let lostSession: (() => void) | null = null;
    vi.mocked(onUnauthorized).mockImplementation((handler) => { lostSession = handler; return () => undefined; });
    vi.mocked(api).mockRejectedValue(new Error("unauthorized"));

    await act(async () => root.render(<App />));
    await act(async () => { lostSession?.(); });

    expect(container.textContent).toContain("login");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("treats email OTP as a complete member login instead of passkey enrollment", async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === "/auth/session") return { authenticated: true, method: "email-otp", userId: "member" };
      if (path === "/accounts") return [];
      if (path === "/taxonomies") return { roles: [], topics: [], conversationTypes: [] };
      if (path === "/auth/me") return { id: "member", email: "bjoern.ludwig@caritas.de", name: "Björn", projects: ["oriso"], status: "active", role: "member", createdAt: "2026-07-20T00:00:00.000Z", entitlements: { orisoProvisioning: { environments: ["pre-dev", "dev"] } } };
      throw new Error(`unexpected ${path}`);
    });

    await act(async () => root.render(<App />));
    await vi.waitFor(() => expect(container.querySelector('[data-testid="directory"]')?.textContent).toContain("accounts:0"));
    expect(container.textContent).not.toContain("enrollment");
    expect(container.textContent).toContain("admin:false;oriso:pre-dev,dev");
  });

  it("clears the remembered login email when the user logs out", async () => {
    sessionStorage.setItem("testmails-login-email", "frank@dreambau.com");
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === "/auth/session") return { authenticated: true, method: "passkey", userId: "admin" };
      if (path === "/accounts") return [];
      if (path === "/taxonomies") return { roles: [], topics: [], conversationTypes: [] };
      if (path === "/auth/me") return { id: "admin", email: "admin@dreambau.com", name: "Admin", projects: ["dreambau"], status: "active", role: "admin", createdAt: "2026-07-15T00:00:00.000Z", entitlements: { orisoProvisioning: { environments: [] } } };
      throw new Error(`unexpected ${path}`);
    });

    await act(async () => root.render(<App />));
    await vi.waitFor(() => expect(container.querySelector("button")?.textContent).toBe("logout"));
    await act(async () => container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(sessionStorage.getItem("testmails-login-email")).toBeNull();
  });
});
