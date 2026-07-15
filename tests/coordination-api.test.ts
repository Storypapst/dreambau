import path from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server/app.js";
import { createDatabase } from "../src/server/db.js";
import { createPasskeyStore } from "../src/server/passkey-store.js";
import type { WebAuthnAdapter } from "../src/server/passkey-auth.js";

function setup() {
  const passkeyStore = createPasskeyStore(
    path.join(mkdtempSync(path.join(tmpdir(), "coordination-auth-")), "auth.sqlite")
  );
  const database = createDatabase(":memory:");
  const user = passkeyStore.createUser({
    email: "oriso-member@dreambau.com",
    name: "ORISO Member",
    projects: ["oriso", "dreambau"],
    role: "member"
  });
  passkeyStore.addCredential({
    id: "coordination-credential",
    userId: user.id,
    publicKey: new Uint8Array([1]),
    counter: 0,
    transports: ["internal"],
    deviceType: "multiDevice",
    backedUp: true
  });
  const webauthn: WebAuthnAdapter = {
    generateRegistrationOptions: vi.fn(),
    verifyRegistrationResponse: vi.fn(),
    generateAuthenticationOptions: vi.fn(async () => ({ challenge: "coordination-challenge" })),
    verifyAuthenticationResponse: vi.fn(async () => ({
      verified: true,
      authenticationInfo: { newCounter: 1 }
    }))
  };
  return {
    app: createApp({
      passwordHash: "unused",
      sessionSecret: "coordination-session-secret-32-bytes",
      secureCookies: false,
      loadAccounts: () => [],
      database,
      passkeyStore,
      webauthn
    }),
    database,
    passkeyStore,
    user
  };
}

async function authenticatedAgent(app: ReturnType<typeof createApp>, email: string) {
  const agent = request.agent(app);
  const options = await agent
    .post("/testmails/api/auth/passkeys/authentication/options")
    .send({ email });
  await agent
    .post("/testmails/api/auth/passkeys/authentication/verify")
    .send({ flowId: options.body.flowId, response: { id: "coordination-credential" } });
  return agent;
}

describe("coordination API", () => {
  it("requires a strong human session and filters the project catalog", async () => {
    const { app, passkeyStore, database, user } = setup();
    expect((await request(app).get("/testmails/api/coordination")).status).toBe(401);
    const agent = await authenticatedAgent(app, user.email);

    const response = await agent.get("/testmails/api/coordination");

    expect(response.status).toBe(200);
    expect(response.body.projects.map((project: { id: string }) => project.id)).toEqual([
      "oriso",
      "dreambau"
    ]);
    expect(JSON.stringify(response.body)).not.toContain("ORIMO Delivery");
    passkeyStore.close();
    database.close();
  });

  it("adds tags and safe discussion links but denies out-of-scope items", async () => {
    const { app, passkeyStore, database, user } = setup();
    const agent = await authenticatedAgent(app, user.email);

    const tag = await agent
      .post("/testmails/api/coordination/items/oriso-delivery/tags")
      .send({ tag: "quality-gate" });
    expect(tag.status).toBe(201);
    expect(tag.body.tags).toEqual(["quality-gate"]);
    expect(
      (
        await agent
          .post("/testmails/api/coordination/items/oriso-delivery/discussions")
          .send({
            label: "Bugfix Channel",
            url: "https://sunflowercare.slack.com/archives/C0BHAEENLE7"
          })
      ).status
    ).toBe(201);
    const catalog = await agent.get("/testmails/api/coordination");
    const item = catalog.body.items.find((entry: { id: string }) => entry.id === "oriso-delivery");
    expect(item.tags).toEqual(["quality-gate"]);
    expect(item.discussions).toEqual([
      {
        label: "Bugfix Channel",
        url: "https://sunflowercare.slack.com/archives/C0BHAEENLE7"
      }
    ]);
    expect(item.metadata).toBeUndefined();
    expect(
      (
        await agent
          .post("/testmails/api/coordination/items/oriso-delivery/discussions")
          .send({ label: "Unsafe", url: "https://evil.example/phish" })
      ).status
    ).toBe(400);
    expect(
      (
        await agent
          .post("/testmails/api/coordination/items/orimo-delivery/tags")
          .send({ tag: "leak" })
      ).status
    ).toBe(403);
    passkeyStore.close();
    database.close();
  });
});
