import argon2 from "argon2";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/server/app.js";

let passwordHash = "";
beforeAll(async () => { passwordHash = await argon2.hash("correct horse battery staple", { type: argon2.argon2id }); });

function app() { return createApp({ passwordHash, secureCookies: true, loadAccounts: () => [] }); }

describe("password-only authentication", () => {
  it("protects account data", async () => {
    const response = await request(app()).get("/testmails/api/accounts");
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "unauthorized" });
  });

  it("rejects a wrong password", async () => {
    const response = await request(app()).post("/testmails/api/auth/login").send({ password: "wrong" });
    expect(response.status).toBe(401);
  });

  it("rate limits after five failures", async () => {
    const target = createApp({ passwordHash, secureCookies: false, loadAccounts: () => [] });
    for (let i = 0; i < 5; i += 1) {
      expect((await request(target).post("/testmails/api/auth/login").send({ password: "wrong" })).status).toBe(401);
    }
    expect((await request(target).post("/testmails/api/auth/login").send({ password: "wrong" })).status).toBe(429);
  });

  it("sets a hardened session cookie for the right password", async () => {
    const response = await request(app()).post("/testmails/api/auth/login").send({ password: "correct horse battery staple" });
    expect(response.status).toBe(200);
    const cookie = response.headers["set-cookie"][0];
    expect(cookie).toContain("dreambau_testmails_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/testmails");
  });

  it("invalidates a session on logout", async () => {
    const target = createApp({ passwordHash, secureCookies: false, loadAccounts: () => [] });
    const agent = request.agent(target);
    await agent.post("/testmails/api/auth/login").send({ password: "correct horse battery staple" });
    expect((await agent.get("/testmails/api/auth/session")).body.authenticated).toBe(true);
    await agent.post("/testmails/api/auth/logout");
    expect((await agent.get("/testmails/api/auth/session")).body.authenticated).toBe(false);
  });
});
