// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountDirectory } from "../src/client/components/account-directory.js";
import type { AccountView, Taxonomies, TeamProject } from "../src/client/types.js";

const favoriteState = { favorites: [] as string[] };
vi.mock("@/favorites", () => ({ useFavorites: () => ({ favorites: favoriteState.favorites, ready: true, error: false, toggle: vi.fn(), move: vi.fn() }), useFavoriteDisplay: () => ({ display: { testContext: true, notes: true }, ready: true, error: null, setDisplay: vi.fn() }) }));
vi.mock("@/api", () => ({ api: vi.fn((path: string) => path.startsWith("/taxonomies/") ? Promise.resolve({ values: [] }) : undefined), onUnauthorized: vi.fn(() => () => undefined) }));
// The table, cards and dialogs are covered elsewhere; here only the filter row matters.
vi.mock("../src/client/components/account-table.js", () => ({ AccountTable: ({ accounts }: { accounts: unknown[] }) => <div data-testid="table">rows:{accounts.length}</div> }));
vi.mock("../src/client/components/favorite-account-view.js", () => ({ FavoriteAccountView: ({ accounts }: { accounts: AccountView[] }) => <div data-testid="favorite-rows">{accounts.map((account) => account.email).join(",")}</div> }));
vi.mock("../src/client/components/account-card.js", () => ({ AccountCard: () => null }));
vi.mock("../src/client/components/account-detail-sheet.js", () => ({ AccountDetailSheet: () => null }));
vi.mock("../src/client/components/metadata-editor.js", () => ({ MetadataEditor: () => null }));
vi.mock("../src/client/components/taxonomy-settings.js", () => ({ TaxonomySettings: () => null }));
vi.mock("../src/client/components/version-bulk-action.js", () => ({ VersionBulkAction: () => null }));
vi.mock("../src/client/components/employee-management.js", () => ({ EmployeeManagement: () => null }));
vi.mock("../src/client/components/passkey-manager.js", () => ({ PasskeyManager: () => null }));
vi.mock("../src/client/components/filter-presets.js", () => ({ FilterPresets: () => null }));
vi.mock("../src/client/components/coordination-dashboard.js", () => ({ CoordinationDashboard: () => null }));

function account(email: string, extra: Partial<AccountView["metadata"]> = {}): AccountView {
  return {
    displayName: email.split("@")[0], email, domain: email.split("@")[1], linkedAccess: [],
    metadata: { email, shippedVersion: "", lifecycleStatus: "unused", project: "NONE", fixtureQuality: "empty", notes: "", roles: [], topics: [], conversationTypes: [], ...extra }
  } as AccountView;
}

const accounts = [
  account("marge.simpson@oriso.org", { lifecycleStatus: "active", roles: ["consultant"] }),
  account("homer.simpson@dreambau.com", { lifecycleStatus: "archived", project: "ORISO" }),
  account("lisa.simpson@oriso.org", { roles: ["admin"] })
];
const taxonomies: Taxonomies = { roles: ["consultant", "admin"], topics: [], conversationTypes: [] };
const entitlements = { orisoProvisioning: { environments: [] } } as never;

describe("AccountDirectory filter state", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    favoriteState.favorites = [];
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

  function render(initialAccounts = accounts, locale: "de" | "en" = "de", projects: TeamProject[] = ["oriso"]) {
    return act(async () => root.render(<AccountDirectory initialAccounts={initialAccounts} initialTaxonomies={taxonomies} locale={locale} onLocaleChange={() => undefined} onLogout={() => undefined} isAdmin canManagePasskeys={false} entitlements={entitlements} projects={projects} />));
  }
  const rows = () => {
    const count = container.querySelectorAll("[data-account-expander]").length;
    return count ? `rows:${count}` : undefined;
  };
  const favoriteRows = () => container.querySelector('[data-testid="favorite-rows"]')?.textContent;
  const reset = () => container.querySelector('[data-testid="reset-filters"]') as HTMLButtonElement | null;

  it("only offers granted projects, including an empty project, and falls back after revocation", async () => {
    window.history.replaceState(null, "", "/testmails/?project=DREAMBAU");
    await render(accounts, "en", ["oriso", "orimo"]);
    expect(rows()).toBe("rows:3");
    await act(async () => container.querySelector<HTMLButtonElement>('[data-testid="project-switch"]')!.click());
    const options = [...document.querySelectorAll<HTMLButtonElement>('[data-testid="project-option"]')];
    expect(options.map((button) => button.textContent)).toEqual(["ORISO", "ORIMO"]);
    await act(async () => options[1].click());
    expect(rows()).toBeUndefined();
    expect(window.location.search).toBe("?project=ORIMO");
    await render(accounts, "en", ["oriso"]);
    expect(rows()).toBe("rows:3");
    expect(container.querySelector('[data-testid="project-switch"]')).toBeNull();
    await render(accounts, "en", []);
    expect(rows()).toBeUndefined();
  });

  it("keeps one account expanded and toggles to another compact row", async () => {
    await render();
    const summaries = () => [...container.querySelectorAll<HTMLButtonElement>("[data-account-expander]")];
    expect(summaries()).toHaveLength(3);
    expect(summaries().filter((button) => button.getAttribute("aria-expanded") === "true")).toHaveLength(1);
    const closed = summaries().find((button) => button.getAttribute("aria-expanded") === "false")!;
    await act(async () => closed.click());
    expect(closed.getAttribute("aria-expanded")).toBe("true");
    expect(summaries().filter((button) => button.getAttribute("aria-expanded") === "true")).toEqual([closed]);
  });

  it("finds an account by documented agency without guessing unknown agencies", async () => {
    await render([account("new@oriso.org", { agencies: ["Debt advice Berlin", "Family advice Hamburg"] }), account("old@oriso.org")]);
    const search = container.querySelector<HTMLInputElement>('input[placeholder]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, "Family advice Hamburg");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(rows()).toBe("rows:1");
  });

  it.each(["de", "en"] as const)("finds translated status and conversation names in %s", async (locale) => {
    await render([account("test@oriso.org", { lifecycleStatus: "active", conversationTypes: ["Termin"] }), account("old@oriso.org")], locale);
    const input = container.querySelector<HTMLInputElement>("input[placeholder]")!;
    for (const phrase of ["Im Einsatz", "In use", "Termin", "Appointment"]) {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, phrase);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(rows()).toBe("rows:1");
    }
  });

  it("searches linked usernames and displayed context fields", async () => {
    const lisa = account("lisa@oriso.org", { carrier: "Springfield QA", supervisor: "Marge Simpson", documentedUsername: "fixture_lisa_nov06" });
    lisa.linkedAccess = [{ id: "oriso/dev/lisa", username: "test-lisa-02", project: "oriso", environment: "dev", kind: "app-user",
      displayName: "Lisa", email: lisa.email, roles: ["consultant"], loginUrl: "https://dev.oriso.org", hasTotp: true }];
    await render([lisa, account("homer@oriso.org")]);
    const search = container.querySelector<HTMLInputElement>('input[placeholder]')!;
    for (const term of ["test-lisa-02", "Marge Simpson", "Springfield QA", "Berater", "fixture_lisa_nov06"]) {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, term);
        search.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(rows()).toBe("rows:1");
    }
  });

  it.each(["de", "en"] as const)("accepts an expanded catalogue and derives encryption counts in %s", async (locale) => {
    const expanded = Array.from({ length: 272 }, (_, index) => ({
      ...account(`test.${index}@oriso.org`),
      encryption: index === 0 ? { state: "encrypted", format: "S/MIME", symmetricMode: "AES-256", encryptOnAppend: true, allowSpamTraining: false } : { state: "disabled" }
    })) as AccountView[];
    await render(expanded, locale);
    expect(container.textContent).toContain("272");
    expect(container.textContent).toContain("1 S/MIME");
    expect(container.textContent).toContain(locale === "de" ? "271 ohne Verschlüsselung" : "271 unencrypted");
    expect(container.textContent).not.toMatch(/180 (von|of) 180/);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("does not mistake a legitimately scoped empty list for catalogue corruption", async () => {
    await render([]);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("warns about duplicate addresses instead of an unexpected catalogue size", async () => {
    await render([accounts[0], { ...accounts[0], email: accounts[0].email.toUpperCase() }]);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Doppelte Mailadressen");
  });

  it("starts clean with no reset button and an empty URL", async () => {
    await render();
    expect(rows()).toBe("rows:3");
    expect(reset()).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("keeps search text private while remembering structured filters and resetting both", async () => {
    await render();
    const search = container.querySelector('input[placeholder]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(search, "marge");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(rows()).toBe("rows:1");
    expect(window.location.search).toBe("");
    expect(localStorage.getItem("testmails-filters")).toBeNull();
    expect(reset()?.textContent).toContain("Zurücksetzen (1)");

    const orisoToggle = Array.from(container.querySelectorAll("button")).find((item) => item.textContent === "oriso.org");
    await act(async () => orisoToggle?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(window.location.search).toBe("?domain=oriso.org");
    expect(localStorage.getItem("testmails-filters")).not.toContain("marge");
    expect(reset()?.textContent).toContain("Zurücksetzen (2)");

    await act(async () => reset()?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(rows()).toBe("rows:3");
    expect(reset()).toBeNull();
    expect(window.location.search).toBe("");
    expect(localStorage.getItem("testmails-filters")).toBeNull();
  });

  it.each([
    ["de", ["Status", "Testdaten"], ["Alle Status", "Alle Testdaten"]],
    ["en", ["Status", "Test data"], ["All statuses", "All test data"]],
  ] as const)("labels the structured selectors in %s", async (locale, labels, values) => {
    await render(accounts, locale);
    const toggle = container.querySelector<HTMLButtonElement>('[data-testid="advanced-toggle"]')!;
    await act(async () => toggle.click());

    const panel = container.querySelector<HTMLDivElement>("#advanced-filters")!;
    expect(panel.hidden).toBe(false);
    const selectors = Array.from(panel.querySelectorAll('[role="combobox"]')).slice(0, 3);
    expect(selectors.map((selector) => document.getElementById(selector.getAttribute("aria-labelledby") ?? "")?.textContent)).toEqual(labels);
    expect(selectors.map((selector) => selector.textContent)).toEqual(values);
  });

  it("restores filters from the URL on load", async () => {
    window.history.replaceState(null, "", "/testmails/?domain=oriso.org&roles=admin");
    await render();
    expect(rows()).toBe("rows:1");
    expect(reset()?.textContent).toContain("Zurücksetzen (2)");
    const toggle = container.querySelector<HTMLButtonElement>('[data-testid="advanced-toggle"]')!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.textContent).toContain("Filter (2)");
    expect(container.querySelector<HTMLDivElement>("#advanced-filters")?.hidden).toBe(true);
    expect((container.querySelector('input[placeholder]') as HTMLInputElement).value).toBe("");
  });

  it("restores the last remembered filters when the URL carries none", async () => {
    localStorage.setItem("testmails-filters", JSON.stringify({ query: "lisa", domain: "oriso.org" }));
    await render();
    expect(rows()).toBe("rows:2");
    expect(window.location.search).toBe("?domain=oriso.org");
  });

  it("follows browser back and forward", async () => {
    window.history.replaceState(null, "", "/testmails/?domain=dreambau.com");
    await render();
    expect(rows()).toBe("rows:1");
    window.history.replaceState(null, "", "/testmails/");
    await act(async () => { window.dispatchEvent(new PopStateEvent("popstate")); });
    expect(rows()).toBe("rows:3");
  });
  it("lets several domains be picked at once and \"Alle\" clears them", async () => {
    await render();
    const chip = (label: string) => Array.from(container.querySelectorAll("button[aria-pressed]")).find((item) => item.textContent === label) as HTMLButtonElement;
    await act(async () => chip("oriso.org").dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(rows()).toBe("rows:2");
    await act(async () => chip("dreambau.com").dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(rows()).toBe("rows:3");
    expect(window.location.search).toBe("?domain=dreambau.com%2Coriso.org");
    await act(async () => chip("oriso.org").dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(rows()).toBe("rows:1");
    expect(window.location.search).toBe("?domain=dreambau.com");
    await act(async () => chip("Alle").dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(rows()).toBe("rows:3");
    expect(window.location.search).toBe("");
  });

  it("restores several domains from the URL", async () => {
    window.history.replaceState(null, "", "/testmails/?domain=dreambau.com,oriso.org");
    await render();
    expect(rows()).toBe("rows:3");
  });

  it("resets favorites together with URL filters and restores every account", async () => {
    favoriteState.favorites = ["lisa.simpson@oriso.org"];
    window.history.replaceState(null, "", "/testmails/?domain=oriso.org");
    await render();
    const chip = container.querySelector('[data-testid="favorites-filter"]') as HTMLButtonElement;
    await act(async () => chip.click());
    expect(favoriteRows()).toBe("lisa.simpson@oriso.org");
    expect(rows()).toBeUndefined();
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    const resetLabel = reset()?.textContent;

    await act(async () => reset()?.click());

    expect(rows()).toBe("rows:3");
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    expect(reset()).toBeNull();
    expect(window.location.search).toBe("");
    expect(localStorage.getItem("testmails-filters")).toBeNull();
    expect(resetLabel).toContain("Zurücksetzen (2)");
  });

  it("offers reset for favorites alone and restores every account", async () => {
    favoriteState.favorites = ["lisa.simpson@oriso.org"];
    await render();
    const chip = container.querySelector('[data-testid="favorites-filter"]') as HTMLButtonElement;
    await act(async () => chip.click());
    expect(favoriteRows()).toBe("lisa.simpson@oriso.org");
    expect(rows()).toBeUndefined();
    expect(reset()?.textContent).toContain("Zurücksetzen (1)");

    await act(async () => reset()?.click());

    expect(rows()).toBe("rows:3");
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    expect(reset()).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("shows only favorites when the favorites chip is on", async () => {
    favoriteState.favorites = ["lisa.simpson@oriso.org"];
    await render();
    const chip = container.querySelector('[data-testid="favorites-filter"]') as HTMLButtonElement;
    expect(chip.textContent).toBe("1");
    await act(async () => chip.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(favoriteRows()).toBe("lisa.simpson@oriso.org");
    expect(rows()).toBeUndefined();
    expect(window.location.search).toBe("");
  });
});
