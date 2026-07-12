import { describe, expect, it, vi } from "vitest";
import type { AccountRecord } from "../src/server/accounts.js";
import { createJmapTestMailReader } from "../src/server/test-mail.js";

const account: AccountRecord = {
  displayName: "Spider Pig",
  email: "spider.pig@oriso.org",
  password: "fake-jmap-password",
  domain: "oriso.org",
  imap: "mail.dreambau.com:993",
  smtp: "mail.dreambau.com:465",
  jmap: "https://box.dreambau.com/.well-known/jmap",
  caldav: "https://box.dreambau.com/dav/cal/spider.pig%40oriso.org/",
  carddav: "https://box.dreambau.com/dav/card/spider.pig%40oriso.org/",
  encryption: { state: "disabled" }
};

function responses() {
  return [
    new Response(JSON.stringify({
      apiUrl: "https://box.dreambau.com/jmap/",
      primaryAccounts: { "urn:ietf:params:jmap:mail": "account-1" },
      accounts: {}
    }), { status: 200 }),
    new Response(JSON.stringify({
      methodResponses: [
        ["Email/query", { ids: ["message-1"] }, "q"],
        ["Email/get", { list: [{
          id: "message-1",
          receivedAt: "2026-07-12T06:00:00Z",
          from: [{ name: "Verifier", email: "verify@example.test" }],
          subject: "Your code 123456",
          preview: "Verification code",
          textBody: [{ partId: "body" }],
          bodyValues: { body: { value: "Use 123456 to continue." } }
        }] }, "g"]
      ]
    }), { status: 200 })
  ];
}

describe("JMAP test mail reader", () => {
  it("uses the discovered API and returns one bounded latest message", async () => {
    const queue = responses();
    const fetchMock = vi.fn(async () => queue.shift()!);
    const message = await createJmapTestMailReader(fetchMock as typeof fetch).latest(account, "verification");
    expect(message).toMatchObject({ id: "message-1", subject: "Your code 123456", text: "Use 123456 to continue." });
    expect(fetchMock.mock.calls[0][0]).toBe(account.jmap);
    expect(fetchMock.mock.calls[1][0]).toBe("https://box.dreambau.com/jmap/");
    const request = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body));
    expect(request.methodCalls[0][1]).toMatchObject({ filter: { text: "verification" }, limit: 1 });
  });

  it("extracts only a six-digit OTP with message provenance", async () => {
    const queue = responses();
    const fetchMock = vi.fn(async () => queue.shift()!);
    const otp = await createJmapTestMailReader(fetchMock as typeof fetch).otp(account, "verification");
    expect(otp).toEqual({ code: "123456", messageId: "message-1", receivedAt: "2026-07-12T06:00:00Z" });
  });

  it("never includes the mailbox password in protocol errors", async () => {
    const fetchMock = vi.fn(async () => new Response("denied", { status: 401 }));
    let message = "";
    try {
      await createJmapTestMailReader(fetchMock as typeof fetch).latest(account, "");
    } catch (error) {
      message = String(error);
    }
    expect(message).toContain("HTTP 401");
    expect(message).not.toContain(account.password);
  });
});
