// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api";
import { OtpAccess } from "../src/client/components/otp-access.js";
import type { AccountView } from "@/types";

vi.mock("@/api", () => ({ api: vi.fn() }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const account: AccountView = {
  displayName: "Abe Simpson",
  email: "abe.simpson@dreambau.de",
  password: "mailbox-password",
  domain: "dreambau.de",
  imap: "mail.dreambau.com:993",
  smtp: "mail.dreambau.com:465",
  jmap: "https://box.dreambau.com/.well-known/jmap",
  caldav: "https://box.dreambau.com/dav/cal/abe.simpson%40dreambau.de/",
  carddav: "https://box.dreambau.com/dav/card/abe.simpson%40dreambau.de/",
  encryption: { state: "encrypted", format: "S/MIME", symmetricMode: "AES-256", encryptOnAppend: true, allowSpamTraining: false },
  metadata: { email: "abe.simpson@dreambau.de", shippedVersion: "2.02", lifecycleStatus: "active", project: "ORISO", roles: ["Admin"], topics: [], conversationTypes: [], fixtureQuality: "empty", sampleFileCount: 0, notes: "", updatedAt: "2026-07-19T17:00:00.000Z" },
  linkedAccess: [{ id: "oriso/pre-dev/e2e-platform-admin-predev", project: "oriso", environment: "pre-dev", kind: "admin", displayName: "Abe Simpson", username: "abe.simpson@dreambau.de", email: "abe.simpson@dreambau.de", roles: ["platform-admin"], loginUrl: "https://pre-dev.oriso.example.test", hasTotp: true }],
  access: { latest: null, events: [] }
};

describe("OtpAccess", () => {
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
    container.remove();
  });

  it("retrieves a linked OTP on demand and renders only the returned code", async () => {
    vi.mocked(api).mockResolvedValue({ accountId: account.linkedAccess![0].id, source: "totp", code: "287082", generatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 30_000).toISOString() });
    await act(async () => root.render(<OtpAccess account={account} locale="de" />));
    const button = Array.from(container.querySelectorAll("button")).find((candidate) => candidate.textContent?.includes("OTP abrufen"));
    await act(async () => button?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await vi.waitFor(() => expect(container.textContent).toContain("287082"));
    expect(api).toHaveBeenCalledWith(`/accounts/${encodeURIComponent(account.email)}/otp?accountId=${encodeURIComponent(account.linkedAccess![0].id)}`);
    expect(container.textContent).not.toContain("mailbox-password");
    expect(container.textContent).toContain("platform-admin");
  });

  it("labels a mailbox-only identity and does not offer a misleading OTP action", async () => {
    await act(async () => root.render(<OtpAccess account={{ ...account, linkedAccess: [] }} locale="de" compact />));
    expect(container.textContent).toContain("Nur Mailkonto");
    expect(container.textContent).not.toContain("OTP abrufen");
    expect(api).not.toHaveBeenCalled();
  });

  it("loads the application password separately from the mailbox password", async () => {
    vi.mocked(api).mockResolvedValue({ accountId: account.linkedAccess![0].id, secret: "application-password" });
    await act(async () => root.render(<OtpAccess account={account} locale="de" compact />));
    const button = Array.from(container.querySelectorAll("button")).find((candidate) => candidate.textContent?.includes("App-Passwort abrufen"));
    await act(async () => button?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await vi.waitFor(() => expect(container.textContent).toContain("application-password"));
    expect(api).toHaveBeenCalledWith(`/accounts/${encodeURIComponent(account.email)}/application-secret?accountId=${encodeURIComponent(account.linkedAccess![0].id)}`);
    expect(container.textContent).not.toContain("mailbox-password");
  });

  it("offers enrollment only while the linked app login has no TOTP", async () => {
    await act(async () => root.render(
      <OtpAccess
        account={{ ...account, linkedAccess: [{ ...account.linkedAccess![0], hasTotp: false }] }}
        locale="de"
      />
    ));
    expect(container.textContent).toContain("2FA hinterlegen");
    expect(container.textContent).not.toContain("OTP abrufen");
  });

  it("never renders a late password response after switching accounts", async () => {
    let resolveRequest!: (value: { accountId: string; secret: string }) => void;
    vi.mocked(api).mockReturnValue(new Promise((resolve) => { resolveRequest = resolve; }));
    await act(async () => root.render(<OtpAccess account={account} locale="de" compact />));
    const button = Array.from(container.querySelectorAll("button")).find((candidate) => candidate.textContent?.includes("App-Passwort abrufen"));
    await act(async () => button?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    const other = {
      ...account,
      email: "lisa.simpson@dreambau.de",
      displayName: "Lisa Simpson",
      linkedAccess: [{ ...account.linkedAccess![0], id: "oriso/dev/lisa", email: "lisa.simpson@dreambau.de", username: "lisasimpsondev" }]
    };
    await act(async () => root.render(<OtpAccess account={other} locale="de" compact />));
    await act(async () => resolveRequest({ accountId: account.linkedAccess![0].id, secret: "late-secret" }));

    expect(container.textContent).not.toContain("late-secret");
  });
});
