// Mirror of the policy in src/server/accounts.ts; tests/mail-encryption-policy.test.ts fails on drift.
export const unencryptedDomains = new Set(["oriso.org"]);
export const unencryptedAccounts = new Set([
  "abe.simpson@dreambau.de",
  "homer.simpson@dreambau.de",
  "lisa.simpson@dreambau.de",
  "maggie.simpson@dreambau.de"
]);

export function encryptionFor(email) {
  const domain = email.split("@").at(-1) ?? "";
  return unencryptedDomains.has(domain) || unencryptedAccounts.has(email)
    ? { state: "disabled" }
    : { state: "encrypted", format: "S/MIME", symmetricMode: "AES-256", encryptOnAppend: true, allowSpamTraining: false };
}
