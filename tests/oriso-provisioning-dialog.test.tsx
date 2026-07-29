// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api";
import { OrisoProvisioningDialog } from "../src/client/components/oriso-provisioning-dialog.js";
import { OtpAccess } from "../src/client/components/otp-access.js";
import type { AccountView, LinkedTestAccount, OrisoProvisioningStateView } from "@/types";

vi.mock("@/api", () => ({ api: vi.fn() }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function account(patch: Partial<AccountView> = {}): AccountView {
  return {
    displayName: "Lisa Simpson",
    email: "lisa.simpson@oriso.org",
    password: "mailbox-password",
    domain: "oriso.org",
    imap: "mail.dreambau.com:993",
    smtp: "mail.dreambau.com:465",
    jmap: "https://box.dreambau.com/.well-known/jmap",
    caldav: "https://box.dreambau.com/dav/cal/",
    carddav: "https://box.dreambau.com/dav/card/",
    encryption: { state: "disabled" },
    metadata: {
      email: "lisa.simpson@oriso.org", shippedVersion: "", lifecycleStatus: "unused", project: "ORISO",
      roles: [], topics: [], conversationTypes: [], fixtureQuality: "empty", sampleFileCount: 0, notes: "", updatedAt: ""
    },
    ...patch
  };
}

function stateFixture(patch: Partial<OrisoProvisioningStateView> = {}): OrisoProvisioningStateView {
  return {
    state: "invited", role: "tenant-admin", targetRole: "TENANT_ADMIN", inviteId: 41,
    inviteStatus: "EMAIL_SENT", emailVerificationStatus: "PENDING", twoFactorStatus: "PENDING_SETUP",
    accessGateStatus: "BLOCKED_INVITE", createdAt: "2026-07-29T14:00:00", expiresAt: "2026-08-28T14:00:00",
    acceptedAt: null, nextStep: "open-invitation-mail", ...patch
  };
}

const linkedFixture: LinkedTestAccount = {
  id: "oriso/pre-dev/lisa.simpson", project: "oriso", environment: "pre-dev", kind: "admin",
  displayName: "Lisa Simpson — ORISO PreDev tenant-admin", username: "lisa.simpson@oriso.org",
  email: "lisa.simpson@oriso.org", roles: ["tenant-admin"], loginUrl: "https://admin.oriso-dev.site", hasTotp: false
};

describe("OrisoProvisioningDialog", () => {
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

  async function openDialog(onProvisioned = vi.fn()) {
    await act(async () => root.render(
      <OrisoProvisioningDialog account={account()} locale="de" hasLinkedAccess={false} onProvisioned={onProvisioned} />
    ));
    const trigger = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("ORISO-Konto anlegen"));
    await act(async () => trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    return onProvisioned;
  }

  it("provisions with the selected role and reports the invited state", async () => {
    vi.mocked(api).mockResolvedValueOnce({
      configured: true, supportedRoles: ["tenant-admin", "agency-admin", "counsellor"],
      environment: "pre-dev", state: null, linked: null
    });
    vi.mocked(api).mockResolvedValueOnce({
      created: true, recordCreated: true, state: stateFixture(), linked: linkedFixture
    });
    const onProvisioned = await openDialog();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Keine aktive Einladung"));

    const submit = Array.from(document.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Einladung senden"));
    await act(async () => submit?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    await vi.waitFor(() => expect(onProvisioned).toHaveBeenCalledWith("lisa.simpson@oriso.org", linkedFixture));
    expect(api).toHaveBeenCalledWith(
      `/accounts/${encodeURIComponent("lisa.simpson@oriso.org")}/oriso-provisioning`,
      { method: "POST", body: JSON.stringify({ environment: "pre-dev", role: "tenant-admin" }) }
    );
    expect(document.body.textContent).toContain("Eingeladen");
    expect(document.body.textContent).toContain("Einladungsmail im Springfield-Postfach");
  });

  it("shows the two-factor-pending state with the enrollment next step", async () => {
    vi.mocked(api).mockResolvedValueOnce({
      configured: true, supportedRoles: ["tenant-admin", "agency-admin", "counsellor"],
      environment: "pre-dev",
      state: stateFixture({ state: "two-factor-pending", nextStep: "store-totp", accessGateStatus: "BLOCKED_TWO_FACTOR" }),
      linked: linkedFixture
    });
    await openDialog();
    await vi.waitFor(() => expect(document.body.textContent).toContain("2FA ausstehend"));
    expect(document.body.textContent).toContain("2FA hinterlegen");
    expect(Array.from(document.querySelectorAll("button")).some((button) => button.textContent?.includes("Einladung senden"))).toBe(false);
  });

  it("explains when provisioning is not configured on the server", async () => {
    vi.mocked(api).mockResolvedValueOnce({
      configured: false, supportedRoles: ["tenant-admin", "agency-admin", "counsellor"],
      environment: "pre-dev", state: null, linked: null
    });
    await openDialog();
    await vi.waitFor(() => expect(document.body.textContent).toContain("nicht konfiguriert"));
  });
});

describe("OtpAccess provisioning entry point", () => {
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

  it("offers provisioning to administrators on free ORISO mailboxes only", async () => {
    await act(async () => root.render(
      <OtpAccess account={account()} locale="de" isAdmin onProvisioned={vi.fn()} />
    ));
    expect(container.textContent).toContain("ORISO-Konto anlegen");

    await act(async () => root.render(
      <OtpAccess account={account()} locale="de" />
    ));
    expect(container.textContent).not.toContain("ORISO-Konto anlegen");

    await act(async () => root.render(
      <OtpAccess
        account={account({ domain: "dreambau.de", email: "moe.szyslak@dreambau.de", metadata: { ...account().metadata, project: "DREAMBAU" } })}
        locale="de"
        isAdmin
        onProvisioned={vi.fn()}
      />
    ));
    expect(container.textContent).not.toContain("ORISO-Konto anlegen");
  });

  it("keeps the existing 2FA enrollment next to the status control for linked pre-dev accounts", async () => {
    await act(async () => root.render(
      <OtpAccess account={account({ linkedAccess: [linkedFixture] })} locale="de" isAdmin onProvisioned={vi.fn()} />
    ));
    expect(container.textContent).toContain("2FA hinterlegen");
    expect(container.textContent).toContain("ORISO-Status");
  });
});
