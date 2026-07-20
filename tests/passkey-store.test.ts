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
    const user = target.createUser({ email: "Frank@Dreambau.com", name: "Frank", projects: ["oriso", "dreambau"], role: "admin" });
    expect(user).toMatchObject({ email: "frank@dreambau.com", name: "Frank", projects: ["oriso", "dreambau"], role: "admin", status: "active" });
    expect(() => target.createUser({ email: "frank@dreambau.com", name: "Other", projects: ["orimo"] })).toThrow(/email/i);
    target.close();
  });

  it("lists individual users and disables access without deleting identity history", () => {
    const target = store();
    const admin = target.createUser({ email: "admin@dreambau.com", name: "Admin", projects: ["dreambau"], role: "admin" });
    const member = target.createUser({ email: "member@dreambau.com", name: "Member", projects: ["oriso"], role: "member" });
    expect(target.listUsers().map((user) => user.email)).toEqual(["admin@dreambau.com", "member@dreambau.com"]);
    expect(target.setUserStatus(member.id, "disabled")).toMatchObject({ id: member.id, status: "disabled" });
    expect(target.getUser(member.id)?.status).toBe("disabled");
    expect(target.getUser(admin.id)?.status).toBe("active");
    target.close();
  });

  it("updates effective project scopes and permits an empty synchronized scope", () => {
    const target = store();
    const member = target.createUser({ email: "member@dreambau.com", name: "Member", projects: ["oriso"], role: "member" });
    expect(target.updateUserProjects(member.id, ["dreambau", "dreambau"])).toMatchObject({ projects: ["dreambau"] });
    expect(target.updateUserProjects(member.id, [])).toMatchObject({ projects: [] });
    expect(target.getUser(member.id)?.projects).toEqual([]);
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
    target.addCredential({ id: "zero-counter", userId: user.id, publicKey: new Uint8Array([4, 5, 6]), counter: 0, transports: ["internal"], deviceType: "multiDevice", backedUp: true });
    expect(() => target.updateCredentialCounter("zero-counter", 0)).not.toThrow();
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
