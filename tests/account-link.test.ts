import { describe, expect, it } from "vitest";
import {
  derivedCatalogPatch,
  isKnownSyntheticEmail,
  linkedRecordsForEmail
} from "../src/server/account-link.js";
import type { AccountRecord } from "../src/server/accounts.js";
import type { TestAccessRecord } from "../src/server/infisical-provider.js";

function record(patch: Partial<TestAccessRecord> = {}): TestAccessRecord {
  return {
    id: "oriso/pre-dev/e2e-platform-admin-predev",
    project: "oriso",
    environment: "pre-dev",
    kind: "app-user",
    displayName: "Abe Simpson — ORISO PreDev Platform Admin",
    username: "abe.simpson@dreambau.de",
    email: "abe.simpson@dreambau.de",
    roles: ["agency-admin", "tenant-admin", "user-admin", "topic-admin"],
    permissionsDescription: "Synthetic PreDev platform administrator",
    loginUrl: "https://admin.oriso-dev.site",
    secret: "not-written-anywhere",
    totpSecret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
    responsiblePerson: "dreambau",
    createdAt: "2026-07-19T16:25:30.304Z",
    updatedAt: "2026-07-19T16:25:30.304Z",
    expiresAt: null,
    shared: true,
    rotationStatus: "current",
    documentationUrl: "https://dreambau.com/testmails/",
    ...patch
  };
}

function account(email = "abe.simpson@dreambau.de"): AccountRecord {
  const domain = email.split("@")[1];
  return {
    displayName: "Abe Simpson",
    email,
    password: "mailbox-password-never-persisted",
    domain,
    imap: "mail.dreambau.com:993",
    smtp: "mail.dreambau.com:465",
    jmap: "https://box.dreambau.com/.well-known/jmap",
    caldav: `https://box.dreambau.com/dav/cal/${encodeURIComponent(email)}/`,
    carddav: `https://box.dreambau.com/dav/card/${encodeURIComponent(email)}/`,
    encryption: { state: "encrypted", format: "S/MIME", symmetricMode: "AES-256", encryptOnAppend: true, allowSpamTraining: false }
  };
}

describe("Springfield account links", () => {
  it("matches only the exact synthetic email and prefers an App-TOTP record", () => {
    const mailbox = record({
      id: "mailbox:abe.simpson@dreambau.de",
      environment: "production-test",
      kind: "mailbox",
      roles: ["mailbox"],
      totpSecret: undefined
    });
    const appUser = record();
    const other = record({ id: "oriso/pre-dev/homer", email: "homer.simpson@dreambau.de" });

    expect(linkedRecordsForEmail("ABE.SIMPSON@dreambau.de", [mailbox, other, appUser]).map((item) => item.id))
      .toEqual([appUser.id, mailbox.id]);
  });

  it("accepts only a mailbox from the established synthetic directory", () => {
    expect(isKnownSyntheticEmail("abe.simpson@dreambau.de", [account()])).toBe(true);
    expect(isKnownSyntheticEmail("real.person@example.com", [account()])).toBe(false);
  });

  it("derives the human catalog patch while retaining the stable technical id", () => {
    const result = derivedCatalogPatch(record(), {
      applicationVersion: "2.02",
      lifecycleStatus: "active",
      topics: [],
      notes: "Dedicated reusable PreDev platform administrator."
    });

    expect(result.accountId).toBe("oriso/pre-dev/e2e-platform-admin-predev");
    expect(result.metadata).toEqual({
      shippedVersion: "2.02",
      lifecycleStatus: "active",
      project: "ORISO",
      roles: ["Admin"],
      topics: [],
      notes: "Dedicated reusable PreDev platform administrator."
    });
    expect(JSON.stringify(result)).not.toContain("not-written-anywhere");
    expect(JSON.stringify(result)).not.toContain("GEZDGNBV");
  });

  it.each([
    [["consultant"], ["Berater"]],
    [["user"], ["Ratsuchender"]],
    [["asker"], ["Ratsuchender"]],
    [["tenant"], ["Träger"]],
    [["consultant", "user-admin"], ["Admin", "Berater"]]
  ])("maps technical roles %j to dashboard roles", (roles, expected) => {
    expect(derivedCatalogPatch(record({ roles }), {
      applicationVersion: "2.02"
    }).metadata.roles).toEqual(expected);
  });
});
