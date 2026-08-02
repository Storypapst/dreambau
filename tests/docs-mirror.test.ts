import path from "node:path";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server/app.js";
import type { AccountRecord } from "../src/server/accounts.js";
import { createDatabase } from "../src/server/db.js";
import type { RegistryProvider } from "../src/server/infisical-provider.js";
import { createPasskeyStore } from "../src/server/passkey-store.js";
import type { WebAuthnAdapter } from "../src/server/passkey-auth.js";

function mailbox(): AccountRecord {
  return {
    displayName: "Abe Simpson",
    email: "abe.simpson@dreambau.de",
    password: "mailbox-password",
    domain: "dreambau.de",
    imap: "mail.dreambau.com:993",
    smtp: "mail.dreambau.com:465",
    jmap: "https://box.dreambau.com/.well-known/jmap",
    caldav: "https://box.dreambau.com/dav/cal/abe/",
    carddav: "https://box.dreambau.com/dav/card/abe/",
    encryption: { state: "encrypted", format: "S/MIME", symmetricMode: "AES-256", encryptOnAppend: true, allowSpamTraining: false }
  };
}

const webauthn: WebAuthnAdapter = {
  generateRegistrationOptions: vi.fn(async () => ({ challenge: "registration" })),
  verifyRegistrationResponse: vi.fn(async () => ({ verified: false })),
  generateAuthenticationOptions: vi.fn(async () => ({ challenge: "authentication-challenge", allowCredentials: [{ id: "credential-id" }] })),
  verifyAuthenticationResponse: vi.fn(async () => ({ verified: true, authenticationInfo: { newCounter: 1 } }))
};

function docsFixture() {
  const docsDir = mkdtempSync(path.join(tmpdir(), "docs-mirror-"));
  mkdirSync(path.join(docsDir, "03 - ORISO CC", "60 - Operations & Services"), { recursive: true });
  writeFileSync(path.join(docsDir, "03 - ORISO CC", "60 - Operations & Services", "RUNBOOK-example.md"), "# Beispiel Runbook\n\nHallo **Team**.\n");
  writeFileSync(path.join(docsDir, "notes.txt"), "plain notes\n");
  writeFileSync(path.join(docsDir, "diagram.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  return docsDir;
}

function buildApp(docsDir: string) {
  const registryProvider: RegistryProvider = { async list() { return []; }, async get() { return null; } };
  const root = mkdtempSync(path.join(tmpdir(), "docs-mirror-state-"));
  const database = createDatabase(path.join(root, "catalog.sqlite"));
  const passkeyStore = createPasskeyStore(path.join(root, "auth.sqlite"));
  const user = passkeyStore.createUser({ email: "frank@dreambau.com", name: "Frank", projects: ["oriso"], role: "admin" });
  passkeyStore.addCredential({ id: "credential-id", userId: user.id, publicKey: new Uint8Array([1]), counter: 0, transports: ["internal"], deviceType: "multiDevice", backedUp: true });
  const app = createApp({
    passwordHash: "unused",
    secureCookies: false,
    loadAccounts: () => [mailbox()],
    database,
    passkeyStore,
    registryProvider,
    webauthn,
    rpId: "dreambau.com",
    expectedOrigin: "https://dreambau.com",
    bootstrapUser: { email: user.email, name: user.name, projects: ["oriso"], role: "admin" },
    docsMirrorDir: docsDir
  });
  return { app, user };
}

async function authenticatedAgent(docsDir: string) {
  const { app, user } = buildApp(docsDir);
  const agent = request.agent(app);
  const authOptions = await agent.post("/testmails/api/auth/passkeys/authentication/options").send({ email: user.email });
  await agent.post("/testmails/api/auth/passkeys/authentication/verify").send({ flowId: authOptions.body.flowId, response: { id: "credential-id" } });
  return agent;
}

describe("docs mirror", () => {
  it("rejects unauthenticated access", async () => {
    const { app } = buildApp(docsFixture());
    const response = await request(app).get("/testmails/docs/");
    expect(response.status).toBe(401);
  });

  it("lists directories with folders first", async () => {
    const agent = await authenticatedAgent(docsFixture());
    const response = await agent.get("/testmails/docs/");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.text).toContain("03 - ORISO CC");
    expect(response.text).toContain("notes.txt");
    expect(response.text.indexOf("03 - ORISO CC")).toBeLessThan(response.text.indexOf("notes.txt"));
  });

  it("renders markdown files as HTML", async () => {
    const agent = await authenticatedAgent(docsFixture());
    const response = await agent.get(`/testmails/docs/${encodeURIComponent("03 - ORISO CC")}/${encodeURIComponent("60 - Operations & Services")}/RUNBOOK-example.md`);
    expect(response.status).toBe(200);
    expect(response.text).toContain("<h1>Beispiel Runbook</h1>");
    expect(response.text).toContain("<strong>Team</strong>");
    expect(response.headers["content-security-policy"]).toContain("default-src 'none'");
  });

  it("serves plain text files and hides unsupported binaries", async () => {
    const agent = await authenticatedAgent(docsFixture());
    const text = await agent.get("/testmails/docs/notes.txt");
    expect(text.status).toBe(200);
    expect(text.text).toBe("plain notes\n");
    const binary = await agent.get("/testmails/docs/diagram.png");
    expect(binary.status).toBe(404);
  });

  it("blocks path traversal outside the mirror", async () => {
    const agent = await authenticatedAgent(docsFixture());
    const response = await agent.get("/testmails/docs/..%2F..%2F..%2Fetc%2Fpasswd");
    expect(response.status).toBe(404);
  });
});
