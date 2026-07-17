import { describe, expect, it } from "vitest";
import { SessionStore } from "../src/server/sessions.js";

describe("session principals", () => {
  it("distinguishes bootstrap and user-bound passkey sessions", () => {
    const sessions = new SessionStore("test-secret");
    const bootstrap = sessions.create();
    expect(sessions.get(bootstrap)).toEqual({ authenticated: true, method: "password-bootstrap", userId: null });
    const passkey = sessions.create({ authenticated: true, method: "passkey", userId: "user-1" });
    expect(sessions.get(passkey)).toEqual({ authenticated: true, method: "passkey", userId: "user-1" });
    expect(sessions.get(`${passkey}tampered`)).toBeNull();
  });
});
