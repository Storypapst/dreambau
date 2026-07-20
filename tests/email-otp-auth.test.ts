import path from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server/app.js";
import { createPasskeyStore } from "../src/server/passkey-store.js";
import type { AccountRecord } from "../src/server/accounts.js";

function account(email: string): AccountRecord {
  const domain = email.split("@")[1];
  return {
    displayName: email,
    email,
    password: `password-${email}`,
    domain,
    imap: "mail.dreambau.com:993",
    smtp: "mail.dreambau.com:465",
    jmap: "https://box.dreambau.com/.well-known/jmap",
    caldav: `https://box.dreambau.com/dav/cal/${encodeURIComponent(email)}/`,
    carddav: `https://box.dreambau.com/dav/card/${encodeURIComponent(email)}/`,
    encryption: domain === "oriso.org"
      ? { state: "disabled" }
      : { state: "encrypted", format: "S/MIME", symmetricMode: "AES-256", encryptOnAppend: true, allowSpamTraining: false }
  };
}

function setup() {
  let now = new Date("2026-07-20T12:00:00.000Z");
  const passkeyStore = createPasskeyStore(path.join(mkdtempSync(path.join(tmpdir(), "email-otp-")), "auth.sqlite"));
  const member = passkeyStore.createUser({
    email: "bjoern.ludwig@caritas.de",
    name: "Björn Ludwig",
    projects: ["oriso"],
    role: "member"
  });
  const sent: Array<{ to: string; code: string; expiresAt: string }> = [];
  const sender = { send: vi.fn(async (message: { to: string; code: string; expiresAt: string }) => { sent.push(message); }) };
  const app = createApp({
    secureCookies: false,
    loadAccounts: () => [account("abe.simpson@oriso.org"), account("abe.simpson@dreambau.de")],
    passkeyStore,
    now: () => now,
    humanAccessProvider: {
      projectsFor: vi.fn(async (email: string) => email === member.email ? ["oriso"] : [])
    },
    emailOtpSender: sender,
    emailOtpHmacKey: "test-email-otp-hmac-key-with-enough-entropy"
  });
  return { app, passkeyStore, member, sent, sender, setNow(value: string) { now = new Date(value); } };
}

describe("email OTP authentication", () => {
  it("logs an eligible member in without mandatory passkey enrollment", async () => {
    const { app, passkeyStore, member, sent } = setup();
    const requested = await request(app)
      .post("/testmails/api/auth/email-otp/request")
      .send({ email: member.email });

    expect(requested.status).toBe(202);
    expect(requested.body).toEqual({ accepted: true });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: member.email });
    expect(sent[0].code).toMatch(/^\d{6}$/);
    expect(JSON.stringify(passkeyStore.debugEmailOtpChallenges(member.id))).not.toContain(sent[0].code);

    const agent = request.agent(app);
    expect((await agent.post("/testmails/api/auth/email-otp/verify").send({ email: member.email, code: "000000" })).status).toBe(401);
    const verified = await agent
      .post("/testmails/api/auth/email-otp/verify")
      .send({ email: member.email, code: sent[0].code });
    expect(verified.status).toBe(200);
    expect(verified.body).toEqual({ authenticated: true, method: "email-otp", userId: member.id });
    expect((await agent.get("/testmails/api/auth/session")).body.method).toBe("email-otp");

    const accounts = await agent.get("/testmails/api/accounts");
    expect(accounts.status).toBe(200);
    expect(accounts.body.map((entry: AccountRecord) => entry.email)).toEqual(["abe.simpson@oriso.org"]);
    expect((await agent.get("/testmails/api/auth/users")).status).toBe(403);
    expect((await request(app).post("/testmails/api/auth/email-otp/verify").send({ email: member.email, code: sent[0].code })).status).toBe(401);
    passkeyStore.close();
  });

  it("keeps request responses generic, rate limits resends and expires challenges", async () => {
    const { app, passkeyStore, member, sent, setNow } = setup();
    const unknown = await request(app)
      .post("/testmails/api/auth/email-otp/request")
      .send({ email: "unknown@example.com" });
    expect(unknown.status).toBe(202);
    expect(unknown.body).toEqual({ accepted: true });
    expect(sent).toHaveLength(0);

    await request(app).post("/testmails/api/auth/email-otp/request").send({ email: member.email });
    await request(app).post("/testmails/api/auth/email-otp/request").send({ email: member.email });
    expect(sent).toHaveLength(1);

    setNow("2026-07-20T12:11:00.000Z");
    expect((await request(app).post("/testmails/api/auth/email-otp/verify").send({ email: member.email, code: sent[0].code })).status).toBe(401);
    passkeyStore.close();
  });

  it("does not persist a usable challenge when delivery fails", async () => {
    const { app, passkeyStore, member, sender } = setup();
    sender.send.mockRejectedValueOnce(new Error("smtp unavailable"));
    const response = await request(app).post("/testmails/api/auth/email-otp/request").send({ email: member.email });
    expect(response.status).toBe(202);
    expect(response.body).toEqual({ accepted: true });
    expect(passkeyStore.debugEmailOtpChallenges(member.id)).toEqual([]);
    passkeyStore.close();
  });
});
