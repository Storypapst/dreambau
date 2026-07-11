import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { AccountRecord } from "../src/server/accounts.js";
import { createApp } from "../src/server/app.js";
import { createDatabase } from "../src/server/db.js";
import { generateMarkdown, writeMarkdownAtomically } from "../src/server/markdown.js";
import { emptyMetadata } from "../src/server/metadata.js";

const domains = ["dreambau.com", "dreambau.de", "getme.global", "openresilience.cc", "oriso.org", "trail.ist"];
const accounts: AccountRecord[] = domains.flatMap((domain) => Array.from({ length: 30 }, (_, index) => ({
  displayName: index === 0 ? "Homer | Simpson" : `Person ${index + 1}`, email: `person${index + 1}@${domain}`, password: `Secret!${index + 1}`, domain,
  imap: "mail.dreambau.com:993", smtp: "mail.dreambau.com:465", jmap: "https://box.dreambau.com/.well-known/jmap",
  caldav: `https://box.dreambau.com/dav/cal/person${index + 1}%40${domain}/`, carddav: `https://box.dreambau.com/dav/card/person${index + 1}%40${domain}/`,
  encryption: domain === "oriso.org" ? { state: "disabled" as const } : { state: "encrypted" as const, format: "S/MIME" as const, symmetricMode: "AES-256" as const, encryptOnAppend: true, allowSpamTraining: false }
})));
const views = accounts.map((account) => ({ ...account, metadata: emptyMetadata(account.email) }));

describe("Markdown export", () => {
  it("contains every domain and every email exactly once with escaped values", () => {
    const markdown = generateMarkdown(views, { roles: [], topics: [], conversationTypes: [] });
    for (const domain of domains) expect(markdown).toContain(`## ${domain}`);
    for (const account of accounts) expect(markdown.split(account.email)).toHaveLength(2);
    expect(markdown).toContain("Homer \\| Simpson");
    expect(markdown).toContain("S/MIME / AES-256");
    expect(markdown).toContain("absichtlich unverschlüsselt");
  });
  it("writes atomically", async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "testmails-md-")), "export", "testmails.md");
    await writeMarkdownAtomically(file, "hello"); expect(readFileSync(file, "utf8")).toBe("hello");
  });
  it("does not expose Markdown without a session", async () => {
    const database = createDatabase(":memory:");
    const response = await request(createApp({ passwordHash: "unused", secureCookies: false, loadAccounts: () => accounts, database, exportPath: null })).get("/testmails/testmails.md");
    expect(response.status).toBe(401); expect(response.text).not.toContain("Secret!"); database.close();
  });
});
