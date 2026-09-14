// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountDirectory } from "../src/client/components/account-directory.js";
import type { AccountView, Taxonomies } from "../src/client/types.js";

vi.mock("@/api", () => ({ api: vi.fn(), onUnauthorized: vi.fn(() => () => undefined) }));
// The table, cards and dialogs are covered elsewhere; here only the filter row matters.
vi.mock("../src/client/components/account-table.js", () => ({ AccountTable: ({ accounts }: { accounts: unknown[] }) => <div data-testid="table">rows:{accounts.length}</div> }));
vi.mock("../src/client/components/account-card.js", () => ({ AccountCard: () => null }));
vi.mock("../src/client/components/account-detail-sheet.js", () => ({ AccountDetailSheet: () => null }));
vi.mock("../src/client/components/metadata-editor.js", () => ({ MetadataEditor: () => null }));
vi.mock("../src/client/components/taxonomy-settings.js", () => ({ TaxonomySettings: () => null }));
vi.mock("../src/client/components/version-bulk-action.js", () => ({ VersionBulkAction: () => null }));
vi.mock("../src/client/components/employee-management.js", () => ({ EmployeeManagement: () => null }));
vi.mock("../src/client/components/passkey-manager.js", () => ({ PasskeyManager: () => null }));
vi.mock("../src/client/components/coordination-dashboard.js", () => ({ CoordinationDashboard: () => null }));

function account(email: string, extra: Partial<AccountView["metadata"]> = {}): AccountView {
  return {
    displayName: email.split("@")[0], email, domain: email.split("@")[1], linkedAccess: [],
    metadata: { email, shippedVersion: "", lifecycleStatus: "unused", project: "NONE", fixtureQuality: "empty", notes: "", roles: [], topics: [], conversationTypes: [], ...extra }
  } as AccountView;
}

const accounts = [
  account("marge.simpson@oriso.org", { lifecycleStatus: "active", roles: ["consultant"] }),
  account("homer.simpson@dreambau.com", { lifecycleStatus: "archived" }),
  account("lisa.simpson@oriso.org", { roles: ["admin"] })
];
const taxonomies: Taxonomies = { roles: ["consultant", "admin"], topics: [], conversationTypes: [] };
const entitlements = { orisoProvisioning: { environments: [] } } as never;

describe("AccountDirectory filter state", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, "", "/testmails/");
    if (!("ResizeObserver" in globalThis)) (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  function render() {
    return act(async () => root.render(<AccountDirectory initialAccounts={accounts} initialTaxonomies={taxonomies} locale="de" onLocaleChange={() => undefined} onLogout={() => undefined} isAdmin entitlements={entitlements} />));
  }
  const rows = () => container.querySelector('[data-testid="table"]')?.textContent;
  const reset = () => container.querySelector('[data-testid="reset-filters"]') as HTMLButtonElement | null;

  it("starts clean with no reset button and an empty URL", async () => {
    await render();
    expect(rows()).toBe("rows:3");
    expect(reset()).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("mirrors the search into the URL and localStorage and resets everything at once", async () => {
    await render();
    const search = container.querySelector('input[placeholder]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(search, "marge");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(rows()).toBe("rows:1");
    expect(window.location.search).toBe("?q=marge");
    expect(JSON.parse(localStorage.getItem("testmails-filters") ?? "{}").query).toBe("marge");
    expect(reset()?.textContent).toContain("Zurücksetzen (1)");

    const orisoToggle = Array.from(container.querySelectorAll("button")).find((item) => item.textContent === "oriso.org");
    await act(async () => orisoToggle?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(window.location.search).toBe("?q=marge&domain=oriso.org");
    expect(reset()?.textContent).toContain("Zurücksetzen (2)");

    await act(async () => reset()?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(rows()).toBe("rows:3");
    expect(reset()).toBeNull();
    expect(window.location.search).toBe("");
    expect(localStorage.getItem("testmails-filters")).toBeNull();
  });

  it("restores filters from the URL on load", async () => {
    window.history.replaceState(null, "", "/testmails/?domain=oriso.org&roles=admin");
    await render();
    expect(rows()).toBe("rows:1");
    expect(reset()?.textContent).toContain("Zurücksetzen (2)");
    expect((container.querySelector('input[placeholder]') as HTMLInputElement).value).toBe("");
  });

  it("restores the last remembered filters when the URL carries none", async () => {
    localStorage.setItem("testmails-filters", JSON.stringify({ query: "lisa" }));
    await render();
    expect(rows()).toBe("rows:1");
    expect(window.location.search).toBe("?q=lisa");
  });

  it("follows browser back and forward", async () => {
    window.history.replaceState(null, "", "/testmails/?q=homer");
    await render();
    expect(rows()).toBe("rows:1");
    window.history.replaceState(null, "", "/testmails/");
    await act(async () => { window.dispatchEvent(new PopStateEvent("popstate")); });
    expect(rows()).toBe("rows:3");
  });
});
