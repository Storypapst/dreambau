import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server/app.js";
import { createPasskeyStore } from "../src/server/passkey-store.js";
import { SessionStore, cookieName, type SessionPrincipal } from "../src/server/sessions.js";
import { loadProgrammeGuide } from "../src/server/teamwork-guides.js";

const guide = { id: "example", title: "Example programme", summary: "An example introduction.", useCases: ["Coordinate a project."], learnMore: [{ label: "Introduction", url: "https://example.org/about" }], platforms: [{ id: "phone", label: "Telefon", downloads: [{ label: "App", url: "https://example.org/download" }], steps: [{ title: "Install", text: "Follow the official instructions." }] }] };
const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).forEach((cleanup) => cleanup()); });
function setup() {
  const dir = mkdtempSync(path.join(tmpdir(), "programme-guides-"));
  const file = path.join(dir, "guides.json");
  writeFileSync(file, JSON.stringify({ format: 1, guides: [guide] }));
  const store = createPasskeyStore(":memory:");
  const user = store.createUser({ email: "member@example.test", name: "Member", projects: ["dreambau"], role: "member" });
  let now = new Date("2026-10-08T12:00:00Z");
  const sessions = new SessionStore("synthetic-session-key", store.sessions, () => now.getTime());
  const app = createApp({ loadAccounts: () => [], secureCookies: false, sessionSecret: "synthetic-session-key", passkeyStore: store, now: () => now, teamworkGuidesPath: file });
  cleanups.push(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  return { app, file, store, user, cookie(method: SessionPrincipal["method"], userId: string | null = user.id) { return `${cookieName}=${sessions.create({ authenticated: true, method, userId })}`; }, expire() { now = new Date("2026-10-09T12:00:00Z"); } };
}
const endpoint = "/testmails/api/teamwork/guides/example";
describe("protected programme guides", () => {
  it.each(["passkey", "email-otp"] as const)("permits an active %s human without mailbox access", async (method) => {
    const target = setup();
    const response = await request(target.app).get(endpoint).set("Cookie", target.cookie(method));
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toEqual(guide);
  });
  it("rejects anonymous, missing and expired sessions without leaking guide content", async () => {
    const target = setup();
    for (const cookie of [null, target.cookie("passkey", null)]) {
      const req = request(target.app).get(endpoint); if (cookie) req.set("Cookie", cookie);
      const response = await req;
      expect(response.status).toBe(cookie ? 403 : 401);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(JSON.stringify(response.body)).not.toContain(guide.title);
    }
    const cookie = target.cookie("passkey"); target.expire();
    expect((await request(target.app).get(endpoint).set("Cookie", cookie)).status).toBe(401);
  });
  it.each(["password-bootstrap", "recovery"] as const)("does not treat %s as guide access", async (method) => {
    const target = setup();
    expect((await request(target.app).get(endpoint).set("Cookie", target.cookie(method))).status).toBe(403);
  });
  it("rejects disabled users and revoked sessions", async () => {
    const target = setup(); const cookie = target.cookie("email-otp");
    await request(target.app).post("/testmails/api/auth/logout").set("Cookie", cookie);
    expect((await request(target.app).get(endpoint).set("Cookie", cookie)).status).toBe(401);
    const active = target.cookie("passkey"); target.store.setUserStatus(target.user.id, "disabled");
    expect((await request(target.app).get(endpoint).set("Cookie", active)).status).toBe(403);
  });
  it("fails closed when grant verification is unavailable", async () => {
    const target = setup();
    const app = createApp({ loadAccounts: () => [], sessionSecret: "synthetic-session-key", passkeyStore: target.store, now: () => new Date("2026-10-08T12:00:00Z"), teamworkGuidesPath: target.file, humanAccessProvider: { projectsFor: vi.fn(async () => { throw new Error("private upstream details"); }) } });
    const response = await request(app).get(endpoint).set("Cookie", target.cookie("passkey"));
    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain("private upstream");
  });
  it("returns honest missing/configuration errors and never redirects a query destination", async () => {
    const target = setup(); const cookie = target.cookie("passkey");
    const missing = await request(target.app).get("/testmails/api/teamwork/guides/absent?returnTo=https://example.org").set("Cookie", cookie);
    expect(missing.status).toBe(404); expect(missing.headers.location).toBeUndefined();
    writeFileSync(target.file, "invalid private contents");
    const malformed = await request(target.app).get(endpoint).set("Cookie", cookie);
    expect(malformed.status).toBe(503); expect(JSON.stringify(malformed.body)).not.toContain("private contents");
    expect(await loadProgrammeGuide(null, "example")).toBeNull();
  });
  it.each(["javascript:alert(1)", "http://example.org", "https://user:password@example.org", "https://example.org/\nsecret"])("rejects unsafe links: %s", async (url) => {
    const target = setup(); writeFileSync(target.file, JSON.stringify({ format: 1, guides: [{ ...guide, learnMore: [{ label: "Read", url }] }] }));
    await expect(loadProgrammeGuide(target.file, "example")).rejects.toThrow();
  });
  it("rejects markup, credentials, duplicate IDs and oversized configuration", async () => {
    const target = setup();
    for (const value of [{ format: 1, guides: [{ ...guide, summary: "<iframe>" }] }, { format: 1, guides: [{ ...guide, privateKey: "secret" }] }, { format: 1, guides: [guide, guide] }]) {
      writeFileSync(target.file, JSON.stringify(value)); await expect(loadProgrammeGuide(target.file, "example")).rejects.toThrow();
    }
    writeFileSync(target.file, " ".repeat(262145)); await expect(loadProgrammeGuide(target.file, "example")).rejects.toThrow();
  });
});
