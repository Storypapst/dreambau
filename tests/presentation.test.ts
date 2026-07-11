import { describe, expect, it } from "vitest";
import { labelTopic, t } from "../src/client/i18n.js";
import { domainClass, sortAccountsForWork } from "../src/client/presentation.js";
import type { AccountView } from "../src/client/types.js";

function account(displayName: string, lifecycleStatus: AccountView["metadata"]["lifecycleStatus"]): AccountView {
  return {
    displayName, email: `${displayName.toLowerCase()}@dreambau.com`, password: "secret", domain: "dreambau.com",
    imap: "imap", smtp: "smtp", jmap: "jmap", caldav: "caldav", carddav: "carddav",
    encryption: { state: "disabled" },
    metadata: { email: `${displayName.toLowerCase()}@dreambau.com`, shippedVersion: "", lifecycleStatus, project: "NONE", roles: [], topics: [], conversationTypes: [], fixtureQuality: "empty", sampleFileCount: 0, notes: "", updatedAt: new Date(0).toISOString() }
  };
}

describe("bilingual presentation", () => {
  it("translates interface and canonical ORISO topic labels", () => {
    expect(t("de", "page.title")).toBe("Springfield Testkonten");
    expect(t("en", "page.title")).toBe("Springfield test accounts");
    expect(labelTopic("de", "debt")).toBe("Schulden");
    expect(labelTopic("en", "debt")).toBe("Debt");
    expect(labelTopic("en", "custom-topic")).toBe("custom-topic");
  });

  it("maps every mail domain to a distinct semantic class", () => {
    const domains = ["dreambau.com", "dreambau.de", "getme.global", "openresilience.cc", "oriso.org", "trail.ist"];
    expect(new Set(domains.map(domainClass))).toHaveLength(6);
    expect(domainClass("unknown.example")).toBe("domain-neutral");
  });

  it("sorts accounts in use first and unused accounts last", () => {
    const sorted = sortAccountsForWork([
      account("Bart", "unused"), account("Abe", "needs_review"), account("Homer", "active"), account("Lisa", "delete_candidate"), account("Marge", "archived")
    ]);
    expect(sorted.map((item) => item.displayName)).toEqual(["Homer", "Abe", "Lisa", "Marge", "Bart"]);
  });
});
