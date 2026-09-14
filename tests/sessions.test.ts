import path from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { createPasskeyStore } from "../src/server/passkey-store.js";
import {
  REMEMBERED_SESSION_MAX_AGE_MS,
  SESSION_MAX_AGE_MS,
  SessionStore,
  cookieOptions
} from "../src/server/sessions.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

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

describe("session lifetime", () => {
  function clock(start = Date.parse("2026-09-14T10:00:00Z")) {
    let now = start;
    return { now: () => now, advance: (ms: number) => { now += ms; } };
  }

  it("keeps the 12 hour default when stay-signed-in is not requested", () => {
    const time = clock();
    const sessions = new SessionStore("test-secret", undefined, time.now);
    const cookie = sessions.create({ authenticated: true, method: "passkey", userId: "user-1" });
    expect(sessions.maxAgeOf(cookie)).toBe(SESSION_MAX_AGE_MS);
    time.advance(11 * HOUR);
    expect(sessions.get(cookie)).not.toBeNull();
    time.advance(2 * HOUR);
    expect(sessions.get(cookie)).toBeNull();
  });

  it("keeps a remembered passkey session for 30 days and no longer", () => {
    const time = clock();
    const sessions = new SessionStore("test-secret", undefined, time.now);
    const cookie = sessions.create({ authenticated: true, method: "passkey", userId: "user-1" }, { remember: true });
    expect(sessions.maxAgeOf(cookie)).toBe(REMEMBERED_SESSION_MAX_AGE_MS);
    time.advance(29 * DAY);
    expect(sessions.get(cookie)).toEqual({ authenticated: true, method: "passkey", userId: "user-1" });
    expect(sessions.maxAgeOf(cookie)).toBe(REMEMBERED_SESSION_MAX_AGE_MS);
    time.advance(2 * DAY);
    expect(sessions.get(cookie)).toBeNull();
  });

  it("refuses to remember sessions created by weaker factors", () => {
    const time = clock();
    const sessions = new SessionStore("test-secret", undefined, time.now);
    for (const method of ["recovery", "email-otp", "password-bootstrap"] as const) {
      const cookie = sessions.create({ authenticated: true, method, userId: method === "password-bootstrap" ? null : "user-1" }, { remember: true });
      expect(sessions.maxAgeOf(cookie)).toBe(SESSION_MAX_AGE_MS);
    }
  });

  it("uses the session lifetime for the cookie", () => {
    expect(cookieOptions(true).maxAge).toBe(SESSION_MAX_AGE_MS);
    expect(cookieOptions(true, REMEMBERED_SESSION_MAX_AGE_MS)).toMatchObject({ httpOnly: true, secure: true, sameSite: "strict", path: "/testmails", maxAge: REMEMBERED_SESSION_MAX_AGE_MS });
  });
});

describe("sqlite session backend", () => {
  it("survives a store restart and prunes expired rows", () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "sessions-")), "auth.sqlite");
    const time = { value: Date.parse("2026-09-14T10:00:00Z") };
    const now = () => time.value;

    const first = createPasskeyStore(file);
    const user = first.createUser({ email: "frank@dreambau.com", name: "Frank", projects: ["oriso"], role: "admin" });
    const sessionsA = new SessionStore("test-secret", first.sessions, now);
    const remembered = sessionsA.create({ authenticated: true, method: "passkey", userId: user.id }, { remember: true });
    const shortLived = sessionsA.create({ authenticated: true, method: "passkey", userId: user.id });
    first.close();

    // A new process with the same database and secret still recognises both cookies.
    const second = createPasskeyStore(file);
    const sessionsB = new SessionStore("test-secret", second.sessions, now);
    expect(sessionsB.get(remembered)).toEqual({ authenticated: true, method: "passkey", userId: user.id });
    expect(sessionsB.get(shortLived)).toEqual({ authenticated: true, method: "passkey", userId: user.id });
    // A different secret must not accept the cookie even though the row exists.
    expect(new SessionStore("other-secret", second.sessions, now).get(remembered)).toBeNull();

    time.value += 13 * HOUR;
    expect(sessionsB.prune()).toBe(1);
    expect(sessionsB.get(shortLived)).toBeNull();
    expect(sessionsB.get(remembered)).not.toBeNull();

    sessionsB.destroy(remembered);
    expect(sessionsB.get(remembered)).toBeNull();
    second.close();
  });

  it("drops sessions of a deleted user through the foreign key", () => {
    const store = createPasskeyStore(":memory:");
    const user = store.createUser({ email: "frank@dreambau.com", name: "Frank", projects: ["oriso"], role: "admin" });
    const sessions = new SessionStore("test-secret", store.sessions);
    const cookie = sessions.create({ authenticated: true, method: "passkey", userId: user.id });
    expect(sessions.get(cookie)).not.toBeNull();
    // Bootstrap sessions carry no user and must not be blocked by the foreign key.
    const bootstrap = sessions.create();
    expect(sessions.get(bootstrap)).toEqual({ authenticated: true, method: "password-bootstrap", userId: null });
    store.close();
  });
});
