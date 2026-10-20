// @vitest-environment jsdom
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AccountDirectory } from "../src/client/components/account-directory.js";
vi.mock("@/favorites", () => ({
  useFavorites: () => ({
    favorites: [],
    ready: true,
    error: false,
    toggle: () => undefined,
  }),
}));
vi.mock("../src/client/components/work-state-dashboard.js", () => ({
  WorkStateDashboard: ({ onBack }: { onBack: () => void }) => (
    <div>
      WORKSTATEFIXTURE<button onClick={onBack}>Back to accounts</button>
    </div>
  ),
}));
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function mount() {
  await act(async () =>
    root.render(
      <AccountDirectory
        initialAccounts={[]}
        initialTaxonomies={{ roles: [], topics: [], conversationTypes: [] }}
        locale="en"
        onLocaleChange={() => undefined}
        onLogout={() => undefined}
        isAdmin={false}
        canManagePasskeys={false}
        entitlements={{ orisoProvisioning: { environments: [] } }}
      />,
    ),
  );
}
it("opens a fresh work-state bookmark without account-filter effects erasing it", async () => {
  window.history.replaceState(
    null,
    "",
    "/testmails/?view=work-state&wsView=data",
  );
  await mount();
  expect(container.textContent).toContain("WORKSTATEFIXTURE");
  expect(new URLSearchParams(window.location.search).get("view")).toBe(
    "work-state",
  );
  expect(new URLSearchParams(window.location.search).get("wsView")).toBe(
    "data",
  );
});
it("honors browser navigation and provides a real return to accounts", async () => {
  window.history.replaceState(null, "", "/testmails/");
  await mount();
  await act(async () => {
    window.history.pushState(null, "", "/testmails/?view=work-state");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(container.textContent).toContain("WORKSTATEFIXTURE");
  await act(async () => container.querySelector("button")!.click());
  expect(container.textContent).not.toContain("WORKSTATEFIXTURE");
  expect(new URLSearchParams(window.location.search).has("view")).toBe(false);
});
