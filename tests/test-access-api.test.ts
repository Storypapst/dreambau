import { createHash } from "node:crypto";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/server/app.js";
import type { AccountRecord } from "../src/server/accounts.js";
import { createDatabase } from "../src/server/db.js";
import type { MachineIdentity } from "../src/server/machine-access.js";
import type { TestMailReader } from "../src/server/test-mail.js";

const orisoSecret = "fake-oriso-password-for-tests";
const orimoSecret = "fake-orimo-password-for-tests";
const orisoToken = "fake-oriso-machine-token";
const orimoToken = "fake-orimo-machine-token";

function account(email: string, password: string): AccountRecord {
  const domain = email.split("@")[1];
  return {
    displayName: email.split("@")[0],
    email,
    password,
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

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function identity(id: string, token: string, project: "oriso" | "orimo"): MachineIdentity {
  return {
    id,
    tokenHash: hash(token),
    projects: [project],
    environments: ["production-test"],
    expiresAt: "2099-01-01T00:00:00.000Z",
    revokedAt: null
  };
}

function app(mailReader?: TestMailReader) {
  const database = createDatabase(path.join(mkdtempSync(path.join(tmpdir(), "test-access-")), "test.sqlite"));
  return createApp({
    passwordHash: "unused",
    secureCookies: false,
    database,
    loadAccounts: () => [
      account("spider.pig@oriso.org", orisoSecret),
      account("lisa.simpson@trail.ist", orimoSecret)
    ],
    machineIdentities: [
      identity("codex-m4-oriso", orisoToken, "oriso"),
      identity("codex-m4-orimo", orimoToken, "orimo")
    ],
    mailReader
  });
}

describe("test access API v1", () => {
  it("returns no metadata or secrets without a bearer token", async () => {
    const response = await request(app()).get("/testmails/api/v1/accounts");
    expect(response.status).toBe(401);
    expect(JSON.stringify(response.body)).not.toContain("spider.pig");
    expect(JSON.stringify(response.body)).not.toContain(orisoSecret);
  });

  it("lists only in-scope metadata and never list-loads passwords", async () => {
    const response = await request(app())
      .get("/testmails/api/v1/accounts?project=oriso&environment=production-test")
      .set("Authorization", `Bearer ${orisoToken}`);
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      id: "mailbox:spider.pig@oriso.org",
      project: "oriso",
      environment: "production-test",
      kind: "mailbox"
    });
    expect(JSON.stringify(response.body)).not.toContain(orisoSecret);
    expect(JSON.stringify(response.body)).not.toContain("password");
  });

  it("hides cross-project accounts and allows one targeted secret", async () => {
    const crossProject = await request(app())
      .get(`/testmails/api/v1/accounts/${encodeURIComponent("mailbox:spider.pig@oriso.org")}/secret`)
      .set("Authorization", `Bearer ${orimoToken}`);
    expect(crossProject.status).toBe(404);

    const allowed = await request(app())
      .get(`/testmails/api/v1/accounts/${encodeURIComponent("mailbox:spider.pig@oriso.org")}/secret`)
      .set("Authorization", `Bearer ${orisoToken}`);
    expect(allowed.status).toBe(200);
    expect(allowed.body).toEqual({ id: "mailbox:spider.pig@oriso.org", secret: orisoSecret });
  });

  it("rejects production as a query environment", async () => {
    const response = await request(app())
      .get("/testmails/api/v1/accounts?project=oriso&environment=production")
      .set("Authorization", `Bearer ${orisoToken}`);
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "invalid_environment" });
  });

  it("returns latest mail and OTP only for an in-scope account", async () => {
    const calls: string[] = [];
    const mailReader: TestMailReader = {
      async latest(account, query) {
        calls.push(`mail:${account.email}:${query}`);
        return { id: "message-1", receivedAt: "2026-07-12T06:00:00Z", from: "sender@example.test", subject: "Verification", preview: "Code sent", text: "Your code is 123456" };
      },
      async otp(account, query) {
        calls.push(`otp:${account.email}:${query}`);
        return { code: "123456", messageId: "message-1", receivedAt: "2026-07-12T06:00:00Z" };
      }
    };
    const id = encodeURIComponent("mailbox:spider.pig@oriso.org");
    const mail = await request(app(mailReader))
      .get(`/testmails/api/v1/accounts/${id}/mail/latest?query=verification`)
      .set("Authorization", `Bearer ${orisoToken}`);
    expect(mail.status).toBe(200);
    expect(mail.headers["cache-control"]).toBe("no-store");
    expect(mail.body.subject).toBe("Verification");

    const otp = await request(app(mailReader))
      .get(`/testmails/api/v1/accounts/${id}/otp?query=verification`)
      .set("Authorization", `Bearer ${orisoToken}`);
    expect(otp.status).toBe(200);
    expect(otp.headers["cache-control"]).toBe("no-store");
    expect(otp.body).toEqual({ code: "123456", messageId: "message-1", receivedAt: "2026-07-12T06:00:00Z" });
    expect(calls).toEqual([
      "mail:spider.pig@oriso.org:verification",
      "otp:spider.pig@oriso.org:verification"
    ]);
  });

  it("does not call JMAP for a cross-project mail request", async () => {
    let called = false;
    const mailReader: TestMailReader = {
      async latest() { called = true; return null; },
      async otp() { called = true; return null; }
    };
    const id = encodeURIComponent("mailbox:spider.pig@oriso.org");
    const response = await request(app(mailReader))
      .get(`/testmails/api/v1/accounts/${id}/otp`)
      .set("Authorization", `Bearer ${orimoToken}`);
    expect(response.status).toBe(404);
    expect(called).toBe(false);
  });

  it("records only the authenticated identity id as last-use metadata", async () => {
    const database = createDatabase(path.join(mkdtempSync(path.join(tmpdir(), "test-access-usage-")), "test.sqlite"));
    const target = createApp({
      passwordHash: "unused",
      secureCookies: false,
      database,
      loadAccounts: () => [account("spider.pig@oriso.org", orisoSecret)],
      machineIdentities: [identity("codex-m4-oriso", orisoToken, "oriso")]
    });
    const response = await request(target)
      .get("/testmails/api/v1/accounts")
      .set("Authorization", `Bearer ${orisoToken}`);
    expect(response.status).toBe(200);
    expect(database.getMachineIdentityUsage()[0]).toMatchObject({ identityId: "codex-m4-oriso" });
    expect(JSON.stringify(database.getMachineIdentityUsage())).not.toContain(orisoToken);
    database.close();
  });
});
