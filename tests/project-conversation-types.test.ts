import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server/app.js";
import { createDatabase } from "../src/server/db.js";
import { createPasskeyStore } from "../src/server/passkey-store.js";

const typesPath = "/testmails/api/taxonomies/conversationTypes";
const loginTargetsPath = "/testmails/api/taxonomies/loginTargets";
const defaultTypes = ["Mail/FormChat", "Live/TempChat", "Kreis/EventChat", "Internal/InternalChat"];

let root: string;
let database: ReturnType<typeof createDatabase>;
let passkeyStore: ReturnType<typeof createPasskeyStore>;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "project-conversation-types-"));
  database = createDatabase(path.join(root, "catalog.sqlite"));
  passkeyStore = createPasskeyStore(path.join(root, "auth.sqlite"));
});

afterEach(() => {
  passkeyStore.close();
  database.close();
  rmSync(root, { recursive: true, force: true });
});

async function signIn(projects: Array<"oriso" | "orimo" | "dreambau">) {
  const email = "employee@dreambau.com";
  passkeyStore.createUser({ email, name: "Employee", projects, role: "member" });
  const messages: Array<{ code: string }> = [];
  const app = createApp({
    secureCookies: false,
    loadAccounts: () => [],
    database,
    passkeyStore,
    emailOtpSender: { async send(message) { messages.push(message); } },
    emailOtpHmacKey: "test-email-otp-hmac-key-with-enough-entropy"
  });
  const agent = request.agent(app);
  await agent.post("/testmails/api/auth/email-otp/request").send({ email }).expect(202);
  await vi.waitFor(() => expect(messages).toHaveLength(1));
  await agent.post("/testmails/api/auth/email-otp/verify").send({ email, code: messages[0].code }).expect(200);
  return { app, agent };
}

describe("project conversation types", () => {
  it("uses the four defaults per project and keeps additions separate from the legacy list", async () => {
    const { agent } = await signIn(["oriso", "orimo", "dreambau"]);
    for (const project of ["oriso", "orimo", "dreambau"]) {
      await agent.get(`${typesPath}/${project}`).expect(200, { values: defaultTypes });
    }

    await agent.patch(`${typesPath}/orimo`).send({ value: "  Community room  " }).expect(200, { values: [...defaultTypes, "Community room"] });
    await agent.get(`${typesPath}/oriso`).expect(200, { values: defaultTypes });
    await agent.get(`${typesPath}/dreambau`).expect(200, { values: defaultTypes });
    const legacy = await agent.get("/testmails/api/taxonomies").expect(200);
    expect(legacy.body.conversationTypes).toEqual(["Chat", "Dateiaustausch", "E-Mail", "Langzeitdialog", "Termin", "Video"]);
  });

  it("requires a signed-in human with a grant for the selected project", async () => {
    const { app, agent } = await signIn(["oriso"]);
    await request(app).get(`${typesPath}/oriso`).expect(401);
    await request(app).patch(`${typesPath}/oriso`).send({ value: "Private" }).expect(401);
    await agent.get(`${typesPath}/orimo`).expect(403, { error: "scope_denied" });
    await agent.patch(`${typesPath}/dreambau`).send({ value: "Private" }).expect(403, { error: "scope_denied" });
  });

  it("renames stored legacy selections only within the matching project and persists the renamed default", async () => {
    database.upsertMetadata("legacy@oriso.org", { conversationTypes: ["Custom legacy", "Mail/FormChat"] });
    database.upsertMetadata("explicit@dreambau.com", { project: "ORISO", conversationTypes: ["Custom legacy", "Mail/FormChat"] });
    database.upsertMetadata("other@oriso.org", { project: "ORIMO", conversationTypes: ["Custom legacy", "Mail/FormChat"] });
    const { agent } = await signIn(["oriso", "orimo"]);

    await agent.get(`${typesPath}/oriso`).expect(200, { values: [...defaultTypes, "Custom legacy"] });
    await agent.patch(`${typesPath}/oriso`).send({ previous: "Custom legacy", value: "Updated legacy" }).expect(200);
    await agent.patch(`${typesPath}/oriso`).send({ previous: "Mail/FormChat", value: "Intake" }).expect(200);
    await agent.get(`${typesPath}/oriso`).expect(200, { values: ["Intake", ...defaultTypes.slice(1), "Updated legacy"] });
    await agent.get(`${typesPath}/orimo`).expect(200, { values: [...defaultTypes, "Custom legacy"] });

    const reopened = createDatabase(path.join(root, "catalog.sqlite"));
    try {
      expect(reopened.getMetadata("legacy@oriso.org").conversationTypes).toEqual(["Updated legacy", "Intake"]);
      expect(reopened.getMetadata("explicit@dreambau.com").conversationTypes).toEqual(["Updated legacy", "Intake"]);
      expect(reopened.getMetadata("other@oriso.org").conversationTypes).toEqual(["Custom legacy", "Mail/FormChat"]);
      expect(reopened.getProjectConversationTypes("oriso")).toEqual(["Intake", ...defaultTypes.slice(1), "Updated legacy"]);
    } finally {
      reopened.close();
    }
  });

  it("rejects a rename to another current name without changing saved selections", async () => {
    database.upsertMetadata("legacy@oriso.org", { conversationTypes: ["Mail/FormChat"] });
    const { agent } = await signIn(["oriso"]);

    await agent.patch(`${typesPath}/oriso`).send({ previous: "Mail/FormChat", value: "Live/TempChat" }).expect(409);
    await agent.get(`${typesPath}/oriso`).expect(200, { values: defaultTypes });
    expect(database.getMetadata("legacy@oriso.org").conversationTypes).toEqual(["Mail/FormChat"]);
  });

  it("keeps a stale account save on the latest project name after consecutive renames", async () => {
    database.upsertMetadata("legacy@oriso.org", { conversationTypes: ["Mail/FormChat"] });
    const { agent } = await signIn(["oriso", "orimo"]);

    await agent.patch(`${typesPath}/oriso`).send({ previous: "Mail/FormChat", value: "Intake" }).expect(200);
    await agent.patch(`${typesPath}/oriso`).send({ previous: "Intake", value: "First contact" }).expect(200);
    database.upsertMetadata("legacy@oriso.org", { conversationTypes: ["Mail/FormChat", "Intake", "First contact"] });
    database.upsertMetadata("different@trail.ist", { conversationTypes: ["Mail/FormChat"] });

    expect(database.getMetadata("legacy@oriso.org").conversationTypes).toEqual(["First contact"]);
    expect(database.getMetadata("different@trail.ist").conversationTypes).toEqual(["Mail/FormChat"]);
    await agent.get(`${typesPath}/oriso`).expect(200, { values: ["First contact", ...defaultTypes.slice(1)] });
  });
});

describe("project login destinations", () => {
  it("seeds the ORISO destinations and persists custom destinations in their own project", async () => {
    const { agent } = await signIn(["oriso", "orimo", "dreambau"]);
    const oriso = [
      { label: "Dev", url: "https://dev.oriso.org/admin/login" },
      { label: "PreDev", url: "https://predev.oriso.org/admin/login" },
      { label: "Staging", url: "https://staging.caritas-onlineberatung.de/admin/login" }
    ];
    const custom = { label: "Preview", url: "https://example.com/preview/sign-in" };
    await agent.get(`${loginTargetsPath}/oriso`).expect(200, { values: oriso });
    await agent.get(`${loginTargetsPath}/orimo`).expect(200, { values: [] });
    await agent.post(`${loginTargetsPath}/orimo`).send(custom).expect(200, { values: [custom] });
    await agent.post(`${loginTargetsPath}/orimo`).send(custom).expect(200, { values: [custom] });
    await agent.get(`${loginTargetsPath}/oriso`).expect(200, { values: oriso });
    await agent.get(`${loginTargetsPath}/dreambau`).expect(200, { values: [] });

    const reopened = createDatabase(path.join(root, "catalog.sqlite"));
    try {
      expect(reopened.getProjectLoginTargets("orimo")).toEqual([custom]);
    } finally {
      reopened.close();
    }
  });

  it("requires the project grant and rejects insecure, credential-bearing and conflicting URLs", async () => {
    const { app, agent } = await signIn(["oriso"]);
    await request(app).get(`${loginTargetsPath}/oriso`).expect(401);
    await agent.get(`${loginTargetsPath}/orimo`).expect(403, { error: "scope_denied" });
    await agent.post(`${loginTargetsPath}/orimo`).send({ label: "Preview", url: "https://example.com/preview" }).expect(403, { error: "scope_denied" });
    for (const url of ["http://example.com/preview", "javascript:alert(1)", "https://user:secret@example.com/preview"]) {
      await agent.post(`${loginTargetsPath}/oriso`).send({ label: "Invalid", url }).expect(400);
    }
    await agent.post(`${loginTargetsPath}/oriso`).send({ label: "Duplicate", url: "https://dev.oriso.org/admin/login" }).expect(409, { error: "login_target_exists" });
  });
});
