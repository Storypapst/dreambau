// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { api } from "@/api";
import { renderToStaticMarkup } from "react-dom/server";
import { InlineTaxonomySelect } from "../src/client/components/inline-metadata-controls.js";
import { labelLinkedEnvironment, labelRoleWithEnvironment } from "../src/client/i18n.js";
import type { AccountView, LinkedTestAccount } from "../src/client/types.js";

vi.mock("@/api", () => ({ api: vi.fn() }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function linked(environment: "pre-dev" | "dev"): LinkedTestAccount {
  return {
    id: `oriso/${environment}/abe`,
    project: "oriso",
    environment,
    kind: "admin",
    displayName: "Abe Simpson",
    username: "abe.simpson@example.test",
    email: "abe.simpson@example.test",
    roles: ["platform-admin"],
    loginUrl: "https://example.test",
    hasTotp: true
  };
}

describe("account role environment labels", () => {
  it("distinguishes ORISO PreDev and Dev without changing the stored role", () => {
    expect(labelRoleWithEnvironment("de", "Admin", [linked("pre-dev")]))
      .toBe("Admin · ORISO PreDev");
    expect(labelRoleWithEnvironment("de", "Admin", [linked("dev")]))
      .toBe("Admin · ORISO Dev");
  });

  it("keeps the localized role and labels every linked ORISO environment", () => {
    expect(labelRoleWithEnvironment("en", "Berater", [linked("pre-dev"), linked("dev")]))
      .toBe("Counselor · ORISO PreDev + Dev");
  });

  it("leaves roles without linked ORISO application access unchanged", () => {
    expect(labelRoleWithEnvironment("de", "Admin", [])).toBe("Admin");
    expect(labelLinkedEnvironment("de", [])).toBeNull();
  });

  it("renders the environment inside the visible role area without mutating metadata", () => {
    const account: AccountView = {
      displayName: "Abe Simpson",
      email: "abe.simpson@dreambau.de",
      password: "mailbox-password",
      domain: "dreambau.de",
      imap: "imap",
      smtp: "smtp",
      jmap: "jmap",
      caldav: "caldav",
      carddav: "carddav",
      encryption: { state: "disabled" },
      metadata: {
        email: "abe.simpson@dreambau.de",
        shippedVersion: "2.02",
        lifecycleStatus: "active",
        project: "ORISO",
        roles: ["Admin"],
        topics: [],
        conversationTypes: [],
        fixtureQuality: "empty",
        sampleFileCount: 0,
        notes: "",
        updatedAt: "2026-07-30T00:00:00.000Z"
      },
      linkedAccess: [linked("pre-dev")]
    };

    const markup = renderToStaticMarkup(
      <InlineTaxonomySelect
        account={account}
        locale="de"
        kind="roles"
        options={["Admin"]}
        onSaved={() => undefined}
      />
    );

    expect(markup).toContain("Admin · ORISO PreDev");
    expect(account.metadata.roles).toEqual(["Admin"]);
  });
});


describe("documented and linked role controls", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;
  afterEach(async () => {
    await act(async () => root?.unmount());
    container?.remove();
    vi.mocked(api).mockReset();
  });

  function fixture(): AccountView {
    return {
      displayName: "Abe Simpson", email: "abe.simpson@example.test", password: "", domain: "example.test",
      imap: "", smtp: "", jmap: "", caldav: "", carddav: "", encryption: { state: "disabled" },
      metadata: { email: "abe.simpson@example.test", shippedVersion: "", lifecycleStatus: "active", project: "ORISO",
        roles: ["tenant-admin", "platform-admin"], documentedRoles: ["tenant-admin"], topics: [], conversationTypes: [], fixtureQuality: "empty", sampleFileCount: 0, notes: "", updatedAt: "" },
      linkedAccess: [linked("dev")]
    };
  }

  it.each(["de", "en"] as const)("keeps removed documentation absent after the effective-role response (%s)", async (locale) => {
    const initial = fixture();
    vi.mocked(api).mockResolvedValue({ ...initial.metadata, roles: ["platform-admin"], documentedRoles: [] });
    function Harness() {
      const [account, setAccount] = useState(initial);
      return <InlineTaxonomySelect account={account} locale={locale} kind="roles" options={["tenant-admin", "platform-admin"]}
        onSaved={(metadata) => setAccount({ ...account, metadata })} />;
    }
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    await act(async () => root!.render(<Harness />));
    const linkedRoles = container.querySelector('[aria-label="' + (locale === "de" ? "Aus Verknüpfung" : "From linked account") + '"]');
    expect(linkedRoles).not.toBeNull();
    expect(linkedRoles?.textContent).toContain("Platform Admin");
    expect(linkedRoles?.querySelector("button")).toBeNull();
    expect(linkedRoles?.getAttribute("title")).toContain(locale === "de" ? "ORISO-Berechtigungen" : "ORISO permissions");
    const remove = container.querySelector<HTMLButtonElement>('button[aria-label="' + (locale === "de" ? "Tenant Admin · ORISO Dev entfernen" : "Tenant Admin · ORISO Dev remove") + '"]');
    expect(remove).not.toBeNull();
    await act(async () => remove!.click());
    expect(JSON.parse(vi.mocked(api).mock.calls[0][1]!.body as string)).toEqual({ roles: [] });
    expect(container.querySelector(".tag-remove")).toBeNull();
    expect(container.textContent).not.toContain("Tenant Admin");
    expect(container.textContent).toContain("Platform Admin");
    expect(container.querySelector('[data-testmails-search-text]')?.textContent).toContain("Platform Admin");
  });

  it("keeps legacy roles editable and hides roles from inactive links", async () => {
    const account = fixture();
    delete account.metadata.documentedRoles;
    account.metadata.roles = ["tenant-admin"];
    account.linkedAccess = [{ ...linked("dev"), deletionPending: true }, { ...linked("pre-dev"), deleted: true }];
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    await act(async () => root!.render(<InlineTaxonomySelect account={account} locale="de" kind="roles" options={["tenant-admin"]} onSaved={() => undefined} />));
    expect(container.querySelector(".tag-remove")).not.toBeNull();
    expect(container.querySelector('[aria-label="Aus Verknüpfung"]')).toBeNull();
  });
});
