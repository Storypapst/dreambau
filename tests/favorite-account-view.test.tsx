// @vitest-environment jsdom

import { act, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FavoriteAccountView } from "@/components/favorite-account-view";
import type { AccountView } from "@/types";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const email = "abe.simpson@dreambau.de";
const account: AccountView = {
  displayName: "Abe Simpson",
  email,
  password: "mailbox-password",
  domain: "dreambau.de",
  imap: "",
  smtp: "",
  jmap: "",
  caldav: "",
  carddav: "",
  encryption: { state: "disabled" },
  metadata: {
    email, shippedVersion: "2.02", lifecycleStatus: "active", project: "ORISO",
    roles: ["Admin"], topics: [], conversationTypes: ["Chat"], fixtureQuality: "empty",
    sampleFileCount: 0, notes: "Validates admin access", updatedAt: "",
    agencies: ["Debt advice Berlin", "Family advice Hamburg"], carrier: "Springfield QA", postalCode: "10115", supervisor: "Marge"
  },
  linkedAccess: [{
    id: "oriso/pre-dev/abe", project: "oriso", environment: "pre-dev", kind: "admin",
    displayName: "Abe Simpson", username: "platform-abe", email,
    roles: ["platform-admin"], loginUrl: "https://example.test", hasTotp: true
  }]
};

describe("FavoriteAccountView", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) }
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  function render(overrides: Partial<ComponentProps<typeof FavoriteAccountView>> = {}) {
    return act(async () => root.render(<FavoriteAccountView accounts={[account]} locale="en"
      display={{ testContext: true, notes: true }} onSaved={() => undefined}
      onMove={() => undefined} onToggleFavorite={() => undefined} {...overrides} />));
  }

  function button(label: string) {
    return container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  }

  it("shows identity and test context with masked credentials and an adjacent email copy action", async () => {
    await render();
    expect(container.textContent).toContain("platform-abe");
    expect(container.textContent).toContain("Platform Admin");
    expect(container.textContent).toContain("Debt advice Berlin");
    expect(container.textContent).toContain("Family advice Hamburg");
    expect(container.textContent).toContain("Springfield QA · 10115");
    expect(container.textContent).toContain("Supervisor · Marge");
    expect(container.textContent).toContain("Version 2.02");
    expect(container.textContent).not.toContain("mailbox-password");
    expect(container.querySelector("textarea")?.value).toBe("Validates admin access");
    expect(container.querySelector(".domain-badge")).toBeNull();

    const copy = button("Copy email");
    expect(copy?.previousElementSibling?.textContent).toBe(email);
    await act(async () => copy!.click());
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(email);
  });

  it("hides only the optional display groups", async () => {
    await render({ display: { testContext: false, notes: false } });
    expect(container.textContent).not.toContain("Family advice Hamburg");
    expect(container.querySelector("textarea")).toBeNull();
    expect(container.textContent).toContain("Get OTP");
    expect(container.textContent).toContain("platform-abe");
  });

  it("offers moves only within the visible list", async () => {
    const onMove = vi.fn();
    const onToggleFavorite = vi.fn();
    const other = { ...account, email: "other@example.test", displayName: "Other Simpson" };
    await render({ accounts: [account, other], onMove, onToggleFavorite });
    expect(button("Move Abe Simpson up")?.disabled).toBe(true);
    expect(button("Move Abe Simpson down")?.disabled).toBe(false);
    await act(async () => button("Move Abe Simpson down")!.click());
    expect(onMove).toHaveBeenCalledExactlyOnceWith(email, 1);
    await act(async () => button("Remove favorite: Abe Simpson")!.click());
    expect(onToggleFavorite).toHaveBeenCalledExactlyOnceWith(email);
  });
});
