import type { AccountRecord } from "./accounts.js";

const CORE = "urn:ietf:params:jmap:core";
const MAIL = "urn:ietf:params:jmap:mail";

export interface TestMailMessage {
  id: string;
  receivedAt: string;
  from: string;
  subject: string;
  preview: string;
  text: string;
}

export interface TestOtp {
  code: string;
  messageId: string;
  receivedAt: string;
}

export interface TestMailReader {
  latest(account: AccountRecord, query: string): Promise<TestMailMessage | null>;
  otp(account: AccountRecord, query: string): Promise<TestOtp | null>;
}

function addressList(value: Array<{ name?: string; email: string }> | undefined) {
  return (value ?? []).map((entry) => entry.name ? `${entry.name} <${entry.email}>` : entry.email).join(", ");
}

function bodyText(message: any) {
  return (message.textBody ?? [])
    .map((part: { partId: string }) => message.bodyValues?.[part.partId]?.value ?? "")
    .filter(Boolean)
    .join("\n");
}

export function createJmapTestMailReader(fetchImpl: typeof fetch = fetch): TestMailReader {
  async function queryMessages(account: AccountRecord, query: string, limit: number) {
    const authorization = `Basic ${Buffer.from(`${account.email}:${account.password}`).toString("base64")}`;
    const discovery = await fetchImpl(account.jmap, { headers: { authorization } });
    if (!discovery.ok) throw new Error(`JMAP discovery failed with HTTP ${discovery.status}`);
    const session = await discovery.json() as any;
    const accountId = session.primaryAccounts?.[MAIL]
      ?? Object.keys(session.accounts ?? {}).find((id) => session.accounts[id].accountCapabilities?.[MAIL]);
    if (!accountId || !session.apiUrl) throw new Error("JMAP session is missing mail capability");
    const response = await fetchImpl(session.apiUrl, {
      method: "POST",
      headers: { authorization, "content-type": "application/json" },
      body: JSON.stringify({
        using: [CORE, MAIL],
        methodCalls: [
          ["Email/query", { accountId, filter: query ? { text: query } : {}, sort: [{ property: "receivedAt", isAscending: false }], limit }, "q"],
          ["Email/get", { accountId, "#ids": { resultOf: "q", name: "Email/query", path: "/ids" }, properties: ["id", "receivedAt", "from", "subject", "preview", "textBody", "bodyValues"], fetchTextBodyValues: true, maxBodyValueBytes: 100000 }, "g"]
        ]
      })
    });
    if (!response.ok) throw new Error(`JMAP request failed with HTTP ${response.status}`);
    const data = await response.json() as any;
    const methodError = (data.methodResponses ?? []).find((entry: any[]) => entry[0] === "error");
    if (methodError) throw new Error(`JMAP method failed: ${methodError[1]?.type ?? "unknown"}`);
    const messages = (data.methodResponses ?? []).find((entry: any[]) => entry[0] === "Email/get")?.[1]?.list ?? [];
    return messages.map((message: any): TestMailMessage => ({
      id: message.id,
      receivedAt: message.receivedAt,
      from: addressList(message.from),
      subject: message.subject ?? "",
      preview: message.preview ?? "",
      text: bodyText(message)
    }));
  }

  return {
    async latest(account, query) {
      return (await queryMessages(account, query, 1))[0] ?? null;
    },
    async otp(account, query) {
      const messages = await queryMessages(account, query, 10);
      for (const message of messages) {
        const match = `${message.subject}\n${message.preview}\n${message.text}`.match(/(?:^|\D)(\d{6})(?:\D|$)/);
        if (match) return { code: match[1], messageId: message.id, receivedAt: message.receivedAt };
      }
      return null;
    }
  };
}
