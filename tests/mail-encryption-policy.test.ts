import { describe, expect, it } from "vitest";
import * as policy from "../scripts/mail-encryption-policy.mjs";
import { encryptionFor, unencryptedAccounts, unencryptedDomains } from "../src/server/accounts.js";

const samples = [
  "person1@dreambau.com",
  "person1@dreambau.de",
  "abe.simpson@dreambau.de",
  "homer.simpson@dreambau.de",
  "lisa.simpson@dreambau.de",
  "maggie.simpson@dreambau.de",
  "person1@getme.global",
  "person1@openresilience.cc",
  "spider.pig@oriso.org",
  "person1@trail.ist"
];

describe("mail encryption policy", () => {
  it("keeps the provisioning script in sync with the registry validator", () => {
    expect([...policy.unencryptedDomains].sort()).toEqual([...unencryptedDomains].sort());
    expect([...policy.unencryptedAccounts].sort()).toEqual([...unencryptedAccounts].sort());
    for (const email of samples) expect(policy.encryptionFor(email)).toEqual(encryptionFor(email));
  });
  it("disables encryption for ORISO and for the 2FA email-OTP mailboxes only", () => {
    expect(samples.filter((email) => encryptionFor(email).state === "disabled")).toEqual([
      "abe.simpson@dreambau.de",
      "homer.simpson@dreambau.de",
      "lisa.simpson@dreambau.de",
      "maggie.simpson@dreambau.de",
      "spider.pig@oriso.org"
    ]);
  });
});
