// @vitest-environment jsdom

import { act, useState } from "react";
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
    email: "lisa.simpson@dreambau.de",
    password: "mailbox-password",
    domain: "dreambau.de",
    imap: "mail.dreambau.com:993",
    smtp: "mail.dreambau.com:465",
    jmap: "https://box.dreambau.com/.well-known/jmap",
    caldav: "https://box.dreambau.com/dav/cal/",
    carddav: "https://box.dreambau.com/dav/card/",
    encryption: { state: "encrypted", format: "S/MIME", symmetricMode: "AES-256", encryptOnAppend: true, allowSpamTraining: false },
    metadata: {
      email: "lisa.simpson@dreambau.de", shippedVersion: "", lifecycleStatus: "unused", project: "ORISO",
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

function readyStateFixture(): OrisoProvisioningStateView {
  return {
    state: "ready",
    role: "tenant-admin",
    targetRole: "TENANT_ADMIN",
    inviteId: 0,
    inviteStatus: "DIRECT_CREATED",
    emailVerificationStatus: "VERIFIED",
    twoFactorStatus: "ACTIVE",
    accessGateStatus: "READY",
    createdAt: "2026-07-29T14:00:00",
    expiresAt: null,
    acceptedAt: "2026-07-29T14:00:00",
    nextStep: "none"
  };
}

const linkedFixture: LinkedTestAccount = {
  id: "oriso/pre-dev/lisa.simpson-dreambau.de", project: "oriso", environment: "pre-dev", kind: "admin",
  displayName: "Lisa Simpson — ORISO PreDev tenant-admin", username: "lisa.simpson@dreambau.de",
  email: "lisa.simpson@dreambau.de", roles: ["tenant-admin"], loginUrl: "https://admin.oriso-dev.site", hasTotp: false
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

  it("provisions with the selected role and reports the ready state", async () => {
    vi.mocked(api).mockResolvedValueOnce({
      configured: true, supportedRoles: ["tenant-admin", "agency-admin", "counsellor"],
      environment: "pre-dev", state: null, linked: null
    });
    vi.mocked(api).mockResolvedValueOnce({
      created: true,
      recordCreated: true,
      state: readyStateFixture(),
      linked: { ...linkedFixture, hasTotp: true }
    });
    vi.mocked(api).mockResolvedValueOnce({
      accountId: linkedFixture.id,
      source: "totp",
      code: "287082",
      generatedAt: "2026-07-29T16:00:00.000Z",
      expiresAt: "2026-07-29T16:00:30.000Z"
    });
    const onProvisioned = await openDialog();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Noch kein ORISO-Konto"));

    const submit = Array.from(document.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Konto anlegen & prüfen"));
    await act(async () => submit?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    await vi.waitFor(() => expect(onProvisioned).toHaveBeenCalledWith(
      "lisa.simpson@dreambau.de",
      { ...linkedFixture, hasTotp: true }
    ));
    expect(api).toHaveBeenCalledWith(
      `/accounts/${encodeURIComponent("lisa.simpson@dreambau.de")}/oriso-provisioning`,
      { method: "POST", body: JSON.stringify({ environment: "pre-dev", role: "tenant-admin" }) }
    );
    expect(document.body.textContent).toContain("Bereit");
    expect(document.body.textContent).toContain("Antwortcode erzeugen");

    const otpButton = Array.from(document.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Antwortcode erzeugen"));
    await act(async () => otpButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await vi.waitFor(() => expect(document.querySelector("[data-testid=oriso-dialog-otp]")?.textContent).toBe("287082"));
    expect(api).toHaveBeenLastCalledWith(
      `/accounts/${encodeURIComponent("lisa.simpson@dreambau.de")}/otp?accountId=${encodeURIComponent(linkedFixture.id)}`
    );
  });

  it("lets an operator verify or restore a ready linked account with its fixed role", async () => {
    const platformState = {
      ...readyStateFixture(),
      role: "platform-admin" as const,
      targetRole: "PLATFORM_ADMIN",
      inviteStatus: "DIRECT_RECONCILED"
    };
    const platformLinked = {
      ...linkedFixture,
      displayName: "Lisa Simpson — ORISO PreDev platform-admin",
      roles: ["platform-admin"],
      hasTotp: true
    };
    vi.mocked(api).mockResolvedValueOnce({
      configured: true,
      supportedRoles: ["platform-admin", "tenant-admin"],
      environment: "pre-dev",
      state: platformState,
      linked: platformLinked
    });
    vi.mocked(api).mockResolvedValueOnce({
      created: true,
      recordCreated: false,
      state: { ...platformState, inviteStatus: "DIRECT_CREATED" },
      linked: platformLinked
    });

    await act(async () => root.render(
      <OrisoProvisioningDialog account={account()} locale="de" hasLinkedAccess onProvisioned={vi.fn()} />
    ));
    const trigger = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("ORISO-Status"));
    await act(async () => trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    await vi.waitFor(() => expect(document.body.textContent).toContain("Gespeicherter Status"));
    const restore = Array.from(document.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Konto live prüfen & ggf. wiederherstellen"));
    await act(async () => restore?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    await vi.waitFor(() => expect(api).toHaveBeenCalledWith(
      `/accounts/${encodeURIComponent("lisa.simpson@dreambau.de")}/oriso-provisioning`,
      { method: "POST", body: JSON.stringify({ environment: "pre-dev", role: "platform-admin" }) }
    ));
    await vi.waitFor(() => expect(document.body.textContent).toContain("Live geprüft"));
  });

  it("shows the two-factor-pending state with the enrollment next step", async () => {
    vi.mocked(api).mockResolvedValueOnce({
      configured: true, supportedRoles: ["tenant-admin", "agency-admin", "counsellor"],
      environment: "pre-dev",
      state: stateFixture({ state: "two-factor-pending", nextStep: "store-totp", accessGateStatus: "BLOCKED_TWO_FACTOR" }),
      linked: linkedFixture,
      requiresApplicationPassword: false
    });
    await openDialog();
    await vi.waitFor(() => expect(document.body.textContent).toContain("2FA ausstehend"));
    expect(document.body.textContent).toContain("2FA direkt hier abschließen");
    expect(Array.from(document.querySelectorAll("button")).some((button) => button.textContent?.includes("Einladung senden"))).toBe(false);
    expect(document.querySelector("input[name=existingOrisoPassword]")).toBeNull();
    const totp = document.querySelector<HTMLInputElement>("input[name=dialogTotpSecret]")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      setter?.call(totp, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
      totp.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const submit = Array.from(document.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Hinterlegen & Code erzeugen"));
    expect(submit?.disabled).toBe(false);
  });

  it("requires password repair only for an incomplete failed linked record", async () => {
    vi.mocked(api).mockResolvedValueOnce({
      configured: true, supportedRoles: ["tenant-admin"], environment: "pre-dev",
      state: stateFixture({ state: "two-factor-pending", nextStep: "store-totp", accessGateStatus: "BLOCKED_TWO_FACTOR" }),
      linked: linkedFixture,
      requiresApplicationPassword: true
    });
    await openDialog();
    await vi.waitFor(() => expect(document.body.textContent).toContain("2FA direkt hier abschließen"));
    expect(document.querySelector("input[name=existingOrisoPassword]")).not.toBeNull();
    const submit = Array.from(document.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Hinterlegen & Code erzeugen"));
    expect(submit?.disabled).toBe(true);
  });

  it("shows a password persistence error separately from TOTP enrollment", async () => {
    vi.mocked(api).mockImplementation(async (path: string, init?: { method?: string }) => {
      if (path.endsWith("/oriso-provisioning") && !init?.method) {
        return {
          configured: true, supportedRoles: ["tenant-admin"], environment: "pre-dev",
          state: stateFixture({ state: "two-factor-pending", nextStep: "store-totp", accessGateStatus: "BLOCKED_TWO_FACTOR" }),
          linked: linkedFixture,
          requiresApplicationPassword: true
        };
      }
      if (path.endsWith("/oriso-provisioning")) throw new Error("record_password_update_failed");
      throw new Error(`unexpected ${path}`);
    });
    await openDialog();
    await vi.waitFor(() => expect(document.body.textContent).toContain("ORISO-App-Passwort verknüpfen"));

    const password = document.querySelector<HTMLInputElement>("input[name=existingOrisoPassword]")!;
    const totp = document.querySelector<HTMLInputElement>("input[name=dialogTotpSecret]")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      setter?.call(password, "Password-Actually-Used-In-ORISO");
      password.dispatchEvent(new Event("input", { bubbles: true }));
      setter?.call(totp, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
      totp.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const submit = Array.from(document.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Hinterlegen & Code erzeugen"));
    await act(async () => submit?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    await vi.waitFor(() => expect(document.body.textContent).toContain("App-Passwort wurde nicht dauerhaft"));
    expect(document.body.textContent).not.toContain("TOTP-Schlüssel wurde nicht gespeichert");
    expect(api).toHaveBeenCalledTimes(2);
  });

  it("links a Test Access record for an invitation that predates provisioning", async () => {
    vi.mocked(api).mockResolvedValueOnce({
      configured: true, supportedRoles: ["tenant-admin", "agency-admin", "counsellor"],
      environment: "pre-dev",
      state: stateFixture({ state: "two-factor-pending", nextStep: "store-totp", accessGateStatus: "BLOCKED_TWO_FACTOR" }),
      linked: null
    });
    vi.mocked(api).mockResolvedValueOnce({
      created: false, recordCreated: true,
      state: stateFixture({ state: "two-factor-pending", nextStep: "store-totp", accessGateStatus: "BLOCKED_TWO_FACTOR" }),
      linked: linkedFixture
    });
    const onProvisioned = await openDialog();
    await vi.waitFor(() => expect(document.body.textContent).toContain("noch kein Test-Access-Record"));

    const link = Array.from(document.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Test-Access-Record verknüpfen"));
    expect(link?.disabled).toBe(true);
    const password = document.querySelector<HTMLInputElement>("input[name=existingOrisoPassword]")!;
    expect(password.type).toBe("password");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      setter?.call(password, "Password-Actually-Used-In-ORISO");
      password.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(link?.disabled).toBe(false);
    await act(async () => link?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    await vi.waitFor(() => expect(onProvisioned).toHaveBeenCalledWith("lisa.simpson@dreambau.de", linkedFixture));
    expect(api).toHaveBeenCalledWith(
      `/accounts/${encodeURIComponent("lisa.simpson@dreambau.de")}/oriso-provisioning`,
      {
        method: "POST",
        body: JSON.stringify({
          environment: "pre-dev",
          role: "tenant-admin",
          applicationPassword: "Password-Actually-Used-In-ORISO"
        })
      }
    );
    await vi.waitFor(() => expect(document.body.textContent).not.toContain("noch kein Test-Access-Record"));
  });

  it("stores the TOTP key inline and immediately shows the response code for ORISO", async () => {
    vi.mocked(api).mockImplementation(async (path: string, init?: { method?: string }) => {
      if (path.endsWith("/oriso-provisioning") && !init?.method) {
        return {
          configured: true, supportedRoles: ["tenant-admin", "agency-admin", "counsellor"],
          environment: "pre-dev",
          state: stateFixture({ state: "two-factor-pending", nextStep: "store-totp", accessGateStatus: "BLOCKED_TWO_FACTOR" }),
          linked: linkedFixture,
          requiresApplicationPassword: true
        };
      }
      if (path.endsWith("/oriso-provisioning") && init?.method === "POST") {
        return {
          created: false,
          recordCreated: false,
          state: stateFixture({ state: "two-factor-pending", nextStep: "store-totp", accessGateStatus: "BLOCKED_TWO_FACTOR" }),
          linked: linkedFixture,
          requiresApplicationPassword: false
        };
      }
      if (path.endsWith("/totp")) return { accountId: linkedFixture.id, enrolled: true, updatedAt: "2026-07-29T18:00:00.000Z" };
      if (path.includes("/otp?")) return { accountId: linkedFixture.id, source: "totp", code: "287082", generatedAt: "", expiresAt: "" };
      throw new Error(`unexpected ${path}`);
    });
    const onProvisioned = await openDialog();
    await vi.waitFor(() => expect(document.body.textContent).toContain("2FA direkt hier abschließen"));

    const password = document.querySelector<HTMLInputElement>("input[name=existingOrisoPassword]")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      setter?.call(password, "Password-Actually-Used-In-ORISO");
      password.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const input = document.querySelector<HTMLInputElement>("input[name=dialogTotpSecret]")!;
    expect(input.type).toBe("password");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const submit = Array.from(document.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Hinterlegen & Code erzeugen"));
    await act(async () => submit?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    await vi.waitFor(() => expect(document.querySelector("[data-testid=oriso-dialog-otp]")?.textContent).toBe("287082"));
    expect(api).toHaveBeenCalledWith(
      `/accounts/${encodeURIComponent("lisa.simpson@dreambau.de")}/oriso-provisioning`,
      {
        method: "POST",
        body: JSON.stringify({
          environment: "pre-dev",
          role: "tenant-admin",
          applicationPassword: "Password-Actually-Used-In-ORISO"
        })
      }
    );
    expect(api).toHaveBeenCalledWith(
      `/accounts/${encodeURIComponent("lisa.simpson@dreambau.de")}/totp`,
      { method: "POST", body: JSON.stringify({ accountId: linkedFixture.id, totpSecret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ" }) }
    );
    expect(onProvisioned).toHaveBeenCalledWith("lisa.simpson@dreambau.de", { ...linkedFixture, hasTotp: true });
    expect(document.body.textContent).not.toContain("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  });

  it("explains when provisioning is not configured on the server", async () => {
    vi.mocked(api).mockResolvedValueOnce({
      configured: false, supportedRoles: ["tenant-admin", "agency-admin", "counsellor"],
      environment: "pre-dev", state: null, linked: null
    });
    await openDialog();
    await vi.waitFor(() => expect(document.body.textContent).toContain("nicht konfiguriert"));
  });

  it("shows Dev explicitly and submits Dev for an oriso.org identity", async () => {
    const devAccount = account({
      email: "bart.simpson@oriso.org",
      domain: "oriso.org",
      metadata: { ...account().metadata, email: "bart.simpson@oriso.org", project: "ORISO" }
    });
    vi.mocked(api).mockResolvedValueOnce({
      configured: true,
      supportedRoles: ["platform-admin", "tenant-admin"],
      environment: "dev",
      state: null,
      linked: null
    });
    vi.mocked(api).mockResolvedValueOnce({
      created: true,
      recordCreated: true,
      state: readyStateFixture(),
      linked: {
        ...linkedFixture,
        id: "oriso/dev/bart.simpson",
        environment: "dev",
        email: devAccount.email,
        username: devAccount.email,
        loginUrl: "https://dev.oriso.org/admin",
        hasTotp: true
      }
    });

    await act(async () => root.render(
      <OrisoProvisioningDialog account={devAccount} locale="de" hasLinkedAccess={false} onProvisioned={vi.fn()} />
    ));
    const trigger = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("ORISO-Konto anlegen"));
    await act(async () => trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await vi.waitFor(() => expect(document.body.textContent).toContain("ORISO Dev Konto"));

    const submit = Array.from(document.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Konto anlegen & prüfen"));
    await act(async () => submit?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    await vi.waitFor(() => expect(api).toHaveBeenCalledWith(
      `/accounts/${encodeURIComponent(devAccount.email)}/oriso-provisioning`,
      { method: "POST", body: JSON.stringify({ environment: "dev", role: "tenant-admin" }) }
    ));
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

  it("offers provisioning only when the server entitlement covers the mailbox environment", async () => {
    await act(async () => root.render(
      <OtpAccess account={account()} locale="de" orisoProvisioningEnvironments={["pre-dev"]} onProvisioned={vi.fn()} />
    ));
    expect(container.textContent).toContain("ORISO-Konto anlegen");

    await act(async () => root.render(
      <OtpAccess account={account()} locale="de" orisoProvisioningEnvironments={[]} onProvisioned={vi.fn()} />
    ));
    expect(container.textContent).not.toContain("ORISO-Konto anlegen");

    await act(async () => root.render(
      <OtpAccess
        account={account({ domain: "dreambau.de", email: "moe.szyslak@dreambau.de", metadata: { ...account().metadata, project: "DREAMBAU" } })}
        locale="de"
        orisoProvisioningEnvironments={["pre-dev"]}
        onProvisioned={vi.fn()}
      />
    ));
    expect(container.textContent).not.toContain("ORISO-Konto anlegen");
  });

  it("keeps the existing 2FA enrollment next to the status control for linked pre-dev accounts", async () => {
    await act(async () => root.render(
      <OtpAccess account={account({ linkedAccess: [linkedFixture] })} locale="de" orisoProvisioningEnvironments={["pre-dev"]} onProvisioned={vi.fn()} />
    ));
    expect(container.textContent).toContain("2FA hinterlegen");
    expect(container.textContent).toContain("ORISO-Status");
  });

  it("keeps the status control for a ready linked PreDev account", async () => {
    await act(async () => root.render(
      <OtpAccess
        account={account({ linkedAccess: [{ ...linkedFixture, hasTotp: true }] })}
        locale="de"
        orisoProvisioningEnvironments={["pre-dev"]}
        onProvisioned={vi.fn()}
      />
    ));
    expect(container.textContent).toContain("ORISO-Status");
  });

  it("keeps the status control for an incomplete linked Dev account", async () => {
    const devAccount = account({
      email: "bart.simpson@oriso.org",
      domain: "oriso.org",
      metadata: { ...account().metadata, email: "bart.simpson@oriso.org", project: "ORISO" },
      linkedAccess: [{
        ...linkedFixture,
        id: "oriso/dev/bart.simpson",
        environment: "dev",
        email: "bart.simpson@oriso.org",
        username: "bart.simpson@oriso.org",
        hasTotp: false
      }]
    });
    await act(async () => root.render(
      <OtpAccess account={devAccount} locale="de" orisoProvisioningEnvironments={["dev"]} onProvisioned={vi.fn()} />
    ));
    expect(container.textContent).toContain("ORISO-Status");
  });

  it("shows app-password and TOTP controls in the row immediately after linking an existing invitation", async () => {
    vi.mocked(api).mockResolvedValueOnce({
      configured: true,
      supportedRoles: ["tenant-admin"],
      environment: "pre-dev",
      state: stateFixture({ state: "two-factor-pending", nextStep: "store-totp", accessGateStatus: "BLOCKED_TWO_FACTOR" }),
      linked: null
    });
    vi.mocked(api).mockResolvedValueOnce({
      created: false,
      recordCreated: true,
      state: stateFixture({ state: "two-factor-pending", nextStep: "store-totp", accessGateStatus: "BLOCKED_TWO_FACTOR" }),
      linked: linkedFixture
    });

    function Harness() {
      const [current, setCurrent] = useState(account());
      return <OtpAccess
        account={current}
        locale="de"
        orisoProvisioningEnvironments={["pre-dev"]}
        onProvisioned={(_email, linked) => setCurrent((value) => ({ ...value, linkedAccess: [linked] }))}
      />;
    }

    await act(async () => root.render(<Harness />));
    const trigger = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("ORISO-Konto anlegen"));
    await act(async () => trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await vi.waitFor(() => expect(document.body.textContent).toContain("noch kein Test-Access-Record"));

    const link = Array.from(document.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Test-Access-Record verknüpfen"));
    const password = document.querySelector<HTMLInputElement>("input[name=existingOrisoPassword]")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      setter?.call(password, "Password-Actually-Used-In-ORISO");
      password.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => link?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    await vi.waitFor(() => expect(container.textContent).toContain("ORISO-App-Passwort"));
    expect(container.textContent).toContain("2FA hinterlegen");
    expect(container.textContent).toContain("ORISO-Status");
    expect(api).toHaveBeenCalledTimes(2);
  });
});
