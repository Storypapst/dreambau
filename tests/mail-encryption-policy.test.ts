import { describe, expect, it } from "vitest";
import * as policy from "../scripts/mail-encryption-policy.mjs";
import { encryptedAccounts, encryptionFor } from "../src/server/accounts.js";

const samples = [
  "person1@dreambau.com",
  "homer.simpson@dreambau.com",
  "person1@dreambau.de",
  "abe.simpson@dreambau.de",
  "homer.simpson@dreambau.de",
  "person1@getme.global",
  "person1@openresilience.cc",
  "cc_tenant_admin_1@openresilience.cc",
  "spider.pig@oriso.org",
  "person1@trail.ist"
];

describe("mail encryption policy", () => {
  it("keeps the provisioning script in sync with the registry validator", () => {
    expect([...policy.encryptedAccounts].sort()).toEqual([...encryptedAccounts].sort());
    for (const email of samples) expect(policy.encryptionFor(email)).toEqual(encryptionFor(email));
  });

  it("encrypts only the one mailbox Stalwart actually encrypts", () => {
    // Measured 2026-09-21: 217 of 218 Stalwart accounts are Disabled. The
    // catalogue must describe that, not an intention nobody carried out.
    expect(samples.filter((email) => encryptionFor(email).state === "encrypted")).toEqual([
      "homer.simpson@dreambau.com"
    ]);
  });

  it("keeps the 2FA email-OTP mailboxes readable, which is why #82 existed", () => {
    for (const name of ["abe", "homer", "lisa", "maggie"]) {
      expect(encryptionFor(`${name}.simpson@dreambau.de`).state).toBe("disabled");
    }
  });

  it("matches regardless of case, like every other address comparison", () => {
    expect(encryptionFor("Homer.Simpson@Dreambau.com").state).toBe("encrypted");
  });
});
