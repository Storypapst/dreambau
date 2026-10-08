// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, onUnauthorized } from "@/api";
import { App } from "../src/client/app.js";
vi.mock("@/api", () => ({ api: vi.fn(), onUnauthorized: vi.fn(() => () => undefined) }));
vi.mock("@/components/login-form", () => ({ LoginForm: ({ onAuthenticated }: { onAuthenticated: () => void }) => <button onClick={onAuthenticated}>Sign in</button> }));
vi.mock("@/components/passkey-enrollment", () => ({ PasskeyEnrollment: () => <div>Enrollment</div> }));
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => null }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
const guide = { id: "example", title: "Example programme", summary: "Example introduction.", useCases: ["Coordinate a project."], learnMore: [{ label: "Video ansehen", url: "https://example.org/video" }], platforms: [{ id: "phone", label: "Telefon", downloads: [{ label: "Phone app", url: "https://example.org/phone" }], steps: [{ title: "Phone setup", text: "Use your own identity." }] }, { id: "computer", label: "Computer", downloads: [{ label: "Desktop app", url: "https://example.org/desktop" }], steps: [{ title: "Desktop setup", text: "Use your own device." }] }] };
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
describe("programme guide navigation", () => {
  let root: Root; let container: HTMLDivElement; let lost: (() => void) | undefined;
  beforeEach(() => {
    history.replaceState(null, "", "/testmails/teamwork/guide/example?returnTo=https://example.org/other"); localStorage.clear();
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    vi.mocked(api).mockReset(); vi.mocked(onUnauthorized).mockImplementation((handler) => { lost = handler; return () => undefined; });
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); history.replaceState(null, "", "/"); });
  function responses(method = "email-otp") {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === "/auth/session") return { authenticated: true, method, userId: "example-user" };
      if (path === "/teamwork/guides/example") return guide;
      if (path === "/auth/logout") return { authenticated: false };
      throw new Error("Mailbox unavailable");
    });
  }
  it("loads the guide independently of mailbox APIs and offers plain links without embeds", async () => {
    responses(); await act(async () => root.render(<App />));
    await vi.waitFor(() => expect(container.textContent).toContain(guide.title));
    expect(vi.mocked(api).mock.calls.map(([p]) => p)).toEqual(["/auth/session", "/teamwork/guides/example"]);
    const link = container.querySelector('a[href="https://example.org/video"]'); expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(container.querySelector("iframe,img,video,script,link")).toBeNull();
    await act(async () => Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Computer")?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 })));
    expect(container.textContent).toContain("Desktop setup"); expect(container.textContent).not.toContain("Phone setup");
  });
  it("keeps the destination through sign-in and ignores arbitrary return URLs", async () => {
    vi.mocked(api).mockResolvedValue({ authenticated: false }); await act(async () => root.render(<App />));
    expect(container.textContent).toContain("Sign in"); responses("passkey");
    await act(async () => container.querySelector("button")?.click());
    await vi.waitFor(() => expect(container.textContent).toContain(guide.title));
    expect(location.pathname).toBe("/testmails/teamwork/guide/example");
  });
  it.each(["password-bootstrap", "recovery"])("keeps %s sessions on enrollment", async (method) => {
    responses(method); await act(async () => root.render(<App />)); expect(container.textContent).toContain("Enrollment");
    expect(api).not.toHaveBeenCalledWith("/teamwork/guides/example");
  });
  it("clears private content when the session expires or the user signs out", async () => {
    responses(); await act(async () => root.render(<App />)); await vi.waitFor(() => expect(container.textContent).toContain(guide.title));
    await act(async () => lost?.()); expect(container.textContent).not.toContain(guide.title);
    expect(container.textContent).toContain("Sign in");
  });
  it("removes guide data on logout even when the network fails", async () => {
    responses(); await act(async () => root.render(<App />)); await vi.waitFor(() => expect(container.textContent).toContain(guide.title));
    vi.mocked(api).mockRejectedValue(new Error("Network unavailable"));
    await act(async () => Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Abmelden")?.click());
    expect(container.textContent).not.toContain(guide.title);
  });
});
