// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api";
import { TotpEnrollmentDialog } from "../src/client/components/totp-enrollment-dialog.js";
import type { LinkedTestAccount } from "@/types";

vi.mock("@/api", () => ({ api: vi.fn() }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const linked: LinkedTestAccount = {
  id: "oriso/pre-dev/e2e-platform-admin-predev",
  project: "oriso",
  environment: "pre-dev",
  kind: "admin",
  displayName: "Abe Simpson",
  username: "abe.simpson@dreambau.de",
  email: "abe.simpson@dreambau.de",
  roles: ["platform-admin"],
  loginUrl: "https://admin.oriso-dev.site",
  hasTotp: false
};

describe("TotpEnrollmentDialog", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    vi.mocked(api).mockReset();
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    document.querySelectorAll("[data-slot=dialog-portal]").forEach((node) => node.remove());
    container.remove();
  });

  async function openDialog(onEnrolled = vi.fn()) {
    await act(async () => root.render(
      <TotpEnrollmentDialog
        email="abe.simpson@dreambau.de"
        linked={linked}
        locale="de"
        onEnrolled={onEnrolled}
      />
    ));
    const trigger = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("2FA hinterlegen"));
    await act(async () => trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    return onEnrolled;
  }

  it("uses an accessible password field and never renders the entered seed", async () => {
    await openDialog();
    const input = document.querySelector<HTMLInputElement>("input[name=totpSecret]");
    expect(document.querySelector("[data-slot=dialog-title]")?.textContent).toContain("2FA hinterlegen");
    expect(document.querySelector("[data-slot=dialog-description]")?.textContent).toContain("Infisical");
    expect(input?.type).toBe("password");
    expect(input?.autocomplete).toBe("off");
    expect(input?.getAttribute("data-1p-ignore")).toBe("true");
    expect(input?.getAttribute("data-lpignore")).toBe("true");
    expect(input?.getAttribute("data-bwignore")).toBe("true");

    await act(async () => {
      if (!input) return;
      input.value = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(document.body.textContent).not.toContain("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  });

  it("submits once, closes on success and reports only the linked record", async () => {
    vi.mocked(api).mockResolvedValue({
      accountId: linked.id,
      enrolled: true,
      updatedAt: "2026-07-29T10:00:00.000Z"
    });
    const onEnrolled = await openDialog();
    const input = document.querySelector<HTMLInputElement>("input[name=totpSecret]")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const submit = Array.from(document.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Sicher hinterlegen"));
    await act(async () => submit?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await vi.waitFor(() => expect(onEnrolled).toHaveBeenCalledWith(linked.id));
    expect(api).toHaveBeenCalledWith(
      `/accounts/${encodeURIComponent("abe.simpson@dreambau.de")}/totp`,
      {
        method: "POST",
        body: JSON.stringify({
          accountId: linked.id,
          totpSecret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
        })
      }
    );
    expect(document.querySelector("[data-slot=dialog-content]")).toBeNull();
    expect(document.body.textContent).not.toContain("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  });

  it("keeps the dialog open with an accessible error after a rejected write", async () => {
    vi.mocked(api).mockRejectedValue(new Error("totp_enrollment_failed"));
    await openDialog();
    const input = document.querySelector<HTMLInputElement>("input[name=totpSecret]")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const submit = Array.from(document.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Sicher hinterlegen"));
    await act(async () => submit?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await vi.waitFor(() => expect(document.querySelector("[role=alert]")?.textContent).toContain("nicht gespeichert"));
    expect(document.querySelector("[data-slot=dialog-content]")).not.toBeNull();
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });
});
