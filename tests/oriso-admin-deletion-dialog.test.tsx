// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api";
import { OrisoAdminDeletionDialog } from "../src/client/components/oriso-admin-deletion-dialog.js";
import { OtpAccess } from "../src/client/components/otp-access.js";
import type { AccountView, LinkedTestAccount } from "../src/client/types.js";
vi.mock("@/api", () => ({ api: vi.fn() }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const linked: LinkedTestAccount = { id: "oriso/dev/lisa", project: "oriso", environment: "dev", kind: "admin", email: "lisa.simpson@oriso.org",
  username: "lisa.simpson@oriso.org", displayName: "Lisa Simpson", roles: ["tenant-admin"], hasTotp: false, loginUrl: "https://dev.oriso.org/admin" };
const account = { email: linked.email, domain: "oriso.org", linkedAccess: [linked], metadata: { project: "ORISO" } } as AccountView;
const preview = { accountId: linked.id, environment: "dev", role: "tenant-admin", email: linked.email, username: linked.username, productId: "product-id", state: "present" };

describe("ORISO admin deletion dialog", () => {
  let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
  beforeEach(() => { host = document.createElement("div"); document.body.append(host); root = createRoot(host); vi.mocked(api).mockReset(); });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
  const button = (text: string) => Array.from(document.querySelectorAll("button")).find((item) => item.textContent === text) as HTMLButtonElement;
  async function open(locale: "de" | "en" = "de", selected = linked, onDeleted = vi.fn()) {
    vi.mocked(api).mockResolvedValueOnce({ ...preview, accountId: selected.id, environment: selected.environment });
    await act(async () => root.render(<OrisoAdminDeletionDialog account={account} linked={selected} locale={locale} onDeleted={onDeleted} />));
    await act(async () => host.querySelector("button")!.click());
    return onDeleted;
  }
  async function confirm() {
    const input = document.querySelector("input")!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, linked.email); input.dispatchEvent(new Event("input", { bubbles: true })); });
  }
  it.each(["dev", "pre-dev"] as const)("requires account confirmation for %s before sending a deletion", async (environment) => {
    const selected = { ...linked, id: `oriso/${environment}/lisa`, environment };
    const onDeleted = await open("de", selected);
    const remove = button("Admin-Konto endgültig löschen");
    expect(remove.disabled).toBe(true);
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(environment);
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Mailpostfach");
    await confirm();
    expect(remove.disabled).toBe(false);
    vi.mocked(api).mockResolvedValueOnce({ deleted: true, mailboxPreserved: true, linked: { ...selected, deleted: true, hasTotp: false } });
    await act(async () => remove.click());
    const [, request] = vi.mocked(api).mock.calls[1];
    expect(JSON.parse(request!.body as string)).toMatchObject({ accountId: selected.id, environment, productId: "product-id", confirmEmail: linked.email, confirmed: true });
    expect(onDeleted).toHaveBeenCalledWith(linked.email, expect.objectContaining({ id: selected.id, deleted: true }));
  });
  it("cancels without a deletion request", async () => {
    await open();
    await act(async () => button("Abbrechen").click());
    expect(api).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it("reports failure without calling the completion callback and requires another preview", async () => {
    const onDeleted = await open(); await confirm();
    vi.mocked(api).mockRejectedValueOnce(new Error("admin_delete_not_verified"));
    await act(async () => button("Admin-Konto endgültig löschen").click());
    expect(onDeleted).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("noch nicht bestätigt");
    expect(button("Erneut prüfen")).toBeTruthy();
  });
  it("shows a status reconciliation action for an already absent account", async () => {
    vi.mocked(api).mockResolvedValueOnce({ ...preview, productId: null, state: "absent" });
    await act(async () => root.render(<OrisoAdminDeletionDialog account={account} linked={linked} locale="en" onDeleted={vi.fn()} />));
    await act(async () => host.querySelector("button")!.click());
    expect(button("Reconcile status").disabled).toBe(true);
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("already absent");
  });
  it("shows both linked environments only for an authorized human admin", async () => {
    const both = { ...account, linkedAccess: [linked, { ...linked, id: "oriso/pre-dev/lisa", environment: "pre-dev" as const }] };
    await act(async () => root.render(<OtpAccess account={both} locale="de" orisoProvisioningEnvironments={["dev", "pre-dev"]} onProvisioned={vi.fn()} />));
    expect(host.textContent).not.toContain("ORISO-Admin löschen");
    await act(async () => root.render(<OtpAccess account={both} locale="de" canDeleteOrisoAdmin orisoProvisioningEnvironments={["dev", "pre-dev"]} onProvisioned={vi.fn()} />));
    expect(host.textContent).toContain("ORISO-Admin löschen (dev)");
    expect(host.textContent).toContain("ORISO-Admin löschen (pre-dev)");
  });
});
