// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api";
import { OtpAccess } from "../src/client/components/otp-access.js";
import type { AccountView } from "@/types";

vi.mock("@/api", () => ({ api: vi.fn() }));

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
  });
});
