// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api";
import { registerBootstrapPasskey } from "@/passkey-client";
import { PasskeyEnrollment } from "../src/client/components/passkey-enrollment.js";

vi.mock("@/api", () => ({ api: vi.fn() }));
vi.mock("@/passkey-client", () => ({ registerBootstrapPasskey: vi.fn() }));

describe("PasskeyEnrollment login hint", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    vi.mocked(api).mockReset();
    vi.mocked(registerBootstrapPasskey).mockReset();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("remembers only the registered email for the next passkey login", async () => {
    vi.mocked(registerBootstrapPasskey).mockResolvedValue({ verified: true, email: "frank@dreambau.com" });
    vi.mocked(api).mockResolvedValue({ codes: ["recovery-code"] });
    await act(async () => {
      root.render(<PasskeyEnrollment locale="de" onComplete={() => undefined} />);
    });

    const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes("Passkey jetzt einrichten"));
    await act(async () => button?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(sessionStorage.getItem("testmails-login-email")).toBe("frank@dreambau.com");
    expect(localStorage.getItem("testmails-login-email")).toBeNull();
    expect(JSON.stringify(localStorage)).not.toContain("recovery-code");
  });

  it("retries only recovery-code delivery after passkey registration succeeds", async () => {
    vi.mocked(registerBootstrapPasskey).mockResolvedValue({ verified: true, email: "frank@dreambau.com" });
    vi.mocked(api)
      .mockRejectedValueOnce(new Error("temporary recovery failure"))
      .mockResolvedValueOnce({ codes: ["recovery-code"] });
    await act(async () => {
      root.render(<PasskeyEnrollment locale="de" onComplete={() => undefined} />);
    });

    const register = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes("Passkey jetzt einrichten"));
    await act(async () => register?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.textContent).toContain("Passkey wurde gespeichert");
    expect(container.textContent).toContain("Recovery-Codes erneut laden");

    const retry = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes("Recovery-Codes erneut laden"));
    await act(async () => retry?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(registerBootstrapPasskey).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("recovery-code");
  });
});
