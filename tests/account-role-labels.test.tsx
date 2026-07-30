import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { InlineTaxonomySelect } from "../src/client/components/inline-metadata-controls.js";
import { labelLinkedEnvironment, labelRoleWithEnvironment } from "../src/client/i18n.js";
import type { AccountView, LinkedTestAccount } from "../src/client/types.js";

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
