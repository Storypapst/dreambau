import path from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { createPasskeyStore } from "../src/server/passkey-store.js";

function store() {
  return createPasskeyStore(path.join(mkdtempSync(path.join(tmpdir(), "passkey-store-")), "auth.sqlite"));
}

describe("passkey store", () => {
  it("creates individual users with normalized unique emails and project scopes", () => {
    const target = store();
    const user = target.createUser({ email: "Frank@Dreambau.com", name: "Frank", projects: ["oriso", "dreambau"] });
    expect(user).toMatchObject({ email: "frank@dreambau.com", name: "Frank", projects: ["oriso", "dreambau"], status: "active" });
    expect(() => target.createUser({ email: "frank@dreambau.com", name: "Other", projects: ["orimo"] })).toThrow(/email/i);
    target.close();
  });

  it("stores WebAuthn credentials and only permits monotonic counters", () => {
    const target = store();
    const user = target.createUser({ email: "frank@dreambau.com", name: "Frank", projects: ["oriso"] });
    target.addCredential({
      id: "credential-id", userId: user.id, publicKey: new Uint8Array([1, 2, 3]), counter: 4,
      transports: ["internal", "hybrid"], deviceType: "multiDevice", backedUp: true
    });
    expect(target.getCredential("credential-id")).toMatchObject({ id: "credential-id", userId: user.id, counter: 4, transports: ["internal", "hybrid"] });
    target.updateCredentialCounter("credential-id", 5, "2026-07-12T07:00:00.000Z");
    expect(target.getCredential("credential-id")?.counter).toBe(5);
    expect(() => target.updateCredentialCounter("credential-id", 5)).toThrow(/counter/i);
    target.close();
  });

  it("consumes challenges exactly once and rejects expired challenges", () => {
    const target = store();
    target.putChallenge({ sessionId: "session-one", kind: "authentication", challenge: "challenge-one", userId: null, expiresAt: "2099-01-01T00:00:00.000Z" });
    expect(target.consumeChallenge("session-one", "authentication", new Date("2026-07-12T00:00:00.000Z"))?.challenge).toBe("challenge-one");
    expect(target.consumeChallenge("session-one", "authentication", new Date("2026-07-12T00:00:00.000Z"))).toBeNull();
    target.putChallenge({ sessionId: "session-two", kind: "registration", challenge: "expired", userId: "user", expiresAt: "2020-01-01T00:00:00.000Z" });
    expect(target.consumeChallenge("session-two", "registration", new Date("2026-07-12T00:00:00.000Z"))).toBeNull();
    target.close();
  });

  it("stores only hashed one-time recovery codes", () => {
    const target = store();
    const user = target.createUser({ email: "frank@dreambau.com", name: "Frank", projects: ["dreambau"] });
    target.replaceRecoveryCodeHashes(user.id, ["a".repeat(64), "b".repeat(64)]);
    expect(target.consumeRecoveryCodeHash(user.id, "a".repeat(64))).toBe(true);
    expect(target.consumeRecoveryCodeHash(user.id, "a".repeat(64))).toBe(false);
    expect(JSON.stringify(target.debugRecoveryCodes(user.id))).not.toContain("recovery-code-plaintext");
    target.close();
  });
});
