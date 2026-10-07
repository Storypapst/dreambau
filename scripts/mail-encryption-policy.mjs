// Mirror of the policy in src/server/accounts.ts; tests/mail-encryption-policy.test.ts fails on drift.
export const encryptedAccounts = new Set(["homer.simpson@dreambau.com"]);

export function encryptionFor(email) {
  return encryptedAccounts.has(email.trim().toLowerCase())
    ? { state: "encrypted", format: "S/MIME", symmetricMode: "AES-256", encryptOnAppend: true, allowSpamTraining: false }
    : { state: "disabled" };
}
