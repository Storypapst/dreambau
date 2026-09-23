import path from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server/app.js";
import { createDatabase } from "../src/server/db.js";
import { createPasskeyStore } from "../src/server/passkey-store.js";
import type { WebAuthnAdapter } from "../src/server/passkey-auth.js";
import Database from "better-sqlite3";
import { ReleaseListStore, type ReleaseSeed } from "../src/server/release-list-store.js";

const seed: ReleaseSeed = {
  title: "OBP 2.1 feature reference list",
  intro: "Reference list.",
  options: {
    areas: [{ id: "OptA", en: "Counselling & chat", color: "blue" }, { id: "OptB", en: "Data protection", color: "amber" }],
    devStatus: [{ id: "OptBuilt", en: "Built", tone: "success" }, { id: "OptUnclear", en: "Unclear", tone: "warning" }],
    functional: [{ id: "OptYes", en: "Yes", tone: "success" }, { id: "OptAdjust", en: "Needs adjustment", tone: "warning" }]
  },
  features: [
    { sourceId: "Rec1", parentSourceId: null, name: "Live chat queue", areas: ["OptA", "OptB"], description: "Advice seekers wait.", crossReferences: "", crossReferenceIds: ["Rec2"], devStatus: "OptBuilt", functional: ["OptYes"], statusComment: "", notes: "Kept as before.", notes2: "", completed: false },
    { sourceId: "Rec2", parentSourceId: null, name: "Two-factor authentication (2FA)", areas: ["OptA"], description: "", crossReferences: "", crossReferenceIds: [], devStatus: "OptUnclear", functional: ["OptYes", "OptAdjust"], statusComment: "App works.", notes: "", notes2: "Second note.", completed: false },
    { sourceId: "Rec3", parentSourceId: "Rec2", name: "Change order", areas: [], description: "", crossReferences: "", crossReferenceIds: [], devStatus: null, functional: [], statusComment: "", notes: "", notes2: "", completed: false }
  ]
};

function setup(projects: Array<"oriso" | "orimo" | "dreambau"> = ["oriso"]) {
  const passkeyStore = createPasskeyStore(path.join(mkdtempSync(path.join(tmpdir(), "release-auth-")), "auth.sqlite"));
  const database = createDatabase(":memory:");
  database.releaseLists.importSeed("obp-2-1", "oriso", seed);
  const user = passkeyStore.createUser({ email: "member@dreambau.com", name: "Team Member", projects, role: "member" });
  passkeyStore.addCredential({ id: "release-credential", userId: user.id, publicKey: new Uint8Array([1]), counter: 0, transports: ["internal"], deviceType: "multiDevice", backedUp: true });
  const webauthn: WebAuthnAdapter = {
    generateRegistrationOptions: vi.fn(),
    verifyRegistrationResponse: vi.fn(),
    generateAuthenticationOptions: vi.fn(async () => ({ challenge: "release-challenge" })),
    verifyAuthenticationResponse: vi.fn(async () => ({ verified: true, authenticationInfo: { newCounter: 1 } }))
  };
  const app = createApp({ passwordHash: "unused", sessionSecret: "release-session-secret-32-bytes!!", secureCookies: false, loadAccounts: () => [], database, passkeyStore, webauthn });
  return { app, database, user };
}

async function signIn(app: ReturnType<typeof createApp>, email: string) {
  const agent = request.agent(app);
  const options = await agent.post("/testmails/api/auth/passkeys/authentication/options").send({ email });
  await agent.post("/testmails/api/auth/passkeys/authentication/verify").send({ flowId: options.body.flowId, response: { id: "release-credential" } });
  return agent;
}

describe("release list import", () => {
  it("keeps order, links sub-items and cross-references, and merges both note columns", () => {
    const { database } = setup();
    const items = database.releaseLists.items("obp-2-1");
    expect(items.map((item) => item.name)).toEqual(["Live chat queue", "Two-factor authentication (2FA)", "Change order"]);
    expect(items[2].parentId).toBe(items[1].id);
    expect(items[0].crossReferenceIds).toEqual([items[1].id]);
    expect(items[1].notes).toBe("Second note.");
    expect(database.releaseLists.options("obp-2-1").devStatus.map((option) => option.color)).toEqual(["green", "amber"]);
  });

  it("refuses a seed whose parent or cross-reference points at a missing record", () => {
    const { database } = setup();
    const broken = (overrides: Partial<ReleaseSeed["features"][number]>) => ({ ...seed, features: [{ ...seed.features[0], ...overrides }] });
    expect(() => database.releaseLists.importSeed("other", "oriso", broken({ parentSourceId: "RecMissing" }))).toThrow("invalid_reference");
    expect(() => database.releaseLists.importSeed("other", "oriso", broken({ crossReferenceIds: ["RecMissing"] }))).toThrow("invalid_reference");
    expect(database.releaseLists.getList("other")).toBeNull();
  });

  it("adds the release-notes column to a table created before it existed", () => {
    const sqlite = new Database(":memory:");
    sqlite.exec("CREATE TABLE release_items (id TEXT PRIMARY KEY, list_id TEXT NOT NULL, parent_id TEXT, position INTEGER NOT NULL, source_id TEXT, name TEXT NOT NULL, areas TEXT NOT NULL DEFAULT '[]', description TEXT NOT NULL DEFAULT '', cross_references TEXT NOT NULL DEFAULT '', cross_reference_ids TEXT NOT NULL DEFAULT '[]', dev_status TEXT, functional TEXT NOT NULL DEFAULT '[]', status_comment TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', completed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, created_by TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL, archived_at TEXT, archived_by TEXT)");
    const store = new ReleaseListStore(sqlite);
    store.importSeed("obp-2-1", "oriso", seed);
    expect(store.items("obp-2-1")[0].releaseNotes).toBe("");
    new ReleaseListStore(sqlite);
  });

  it("refuses a second import that would silently overwrite team edits", () => {
    const { database } = setup();
    expect(() => database.releaseLists.importSeed("obp-2-1", "oriso", seed)).toThrow("list_exists");
  });
});

describe("release list API", () => {
  it("requires a strong session and the list's project", async () => {
    const { app } = setup(["orimo"]);
    expect((await request(app).get("/testmails/api/release-lists/obp-2-1")).status).toBe(401);
    const agent = await signIn(app, "member@dreambau.com");
    expect((await agent.get("/testmails/api/release-lists")).body).toEqual([]);
    expect((await agent.get("/testmails/api/release-lists/obp-2-1")).status).toBe(403);
  });

  it("edits select fields, rejects unknown options and records who changed what", async () => {
    const { app } = setup();
    const agent = await signIn(app, "member@dreambau.com");
    const list = await agent.get("/testmails/api/release-lists/obp-2-1");
    expect(list.status).toBe(200);
    const [first] = list.body.items;

    const updated = await agent.patch(`/testmails/api/release-lists/obp-2-1/items/${first.id}`).send({ devStatus: "OptUnclear", functional: ["OptAdjust"] });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ devStatus: "OptUnclear", functional: ["OptAdjust"], updatedBy: "Team Member" });

    const rejected = await agent.patch(`/testmails/api/release-lists/obp-2-1/items/${first.id}`).send({ areas: ["OptMissing"] });
    expect(rejected.status).toBe(400);
    expect(rejected.body.error).toBe("unknown_option");

    const notes = await agent.patch(`/testmails/api/release-lists/obp-2-1/items/${first.id}`).send({ releaseNotes: "# 2.1\n\n- Queue fixed" });
    expect(notes.body.releaseNotes).toBe("# 2.1\n\n- Queue fixed");

    const selfLink = await agent.patch(`/testmails/api/release-lists/obp-2-1/items/${first.id}`).send({ crossReferenceIds: [first.id] });
    expect(selfLink.body.error).toBe("invalid_reference");
    const unknownLink = await agent.patch(`/testmails/api/release-lists/obp-2-1/items/${first.id}`).send({ crossReferenceIds: ["not-an-item"] });
    expect(unknownLink.status).toBe(400);

    const activity = await agent.get(`/testmails/api/release-lists/obp-2-1/items/${first.id}/activity`);
    expect(activity.body.changes.map((change: { field: string }) => change.field).sort()).toEqual(["devStatus", "functional", "releaseNotes"]);
  });

  it("adds items, options and comments, and archives an item with its sub-items", async () => {
    const { app } = setup();
    const agent = await signIn(app, "member@dreambau.com");
    const created = await agent.post("/testmails/api/release-lists/obp-2-1/items").send({ name: "Unique persistent links" });
    expect(created.status).toBe(201);
    const option = await agent.post("/testmails/api/release-lists/obp-2-1/options/areas").send({ label: "Search", color: "teal" });
    expect(option.status).toBe(201);
    expect((await agent.patch(`/testmails/api/release-lists/obp-2-1/items/${created.body.id}`).send({ areas: [option.body.id] })).body.areas).toEqual([option.body.id]);
    const comment = await agent.post(`/testmails/api/release-lists/obp-2-1/items/${created.body.id}/comments`).send({ body: "Please confirm with Christine." });
    expect(comment.body).toMatchObject({ authorName: "Team Member", body: "Please confirm with Christine." });

    const before = (await agent.get("/testmails/api/release-lists/obp-2-1")).body.items;
    const parent = before.find((item: { name: string }) => item.name === "Two-factor authentication (2FA)");
    expect((await agent.delete(`/testmails/api/release-lists/obp-2-1/items/${parent.id}`)).status).toBe(204);
    const after = (await agent.get("/testmails/api/release-lists/obp-2-1")).body.items.map((item: { name: string }) => item.name);
    expect(after).toEqual(["Live chat queue", "Unique persistent links"]);
  });

  it("exports CSV with labels instead of option ids and defuses spreadsheet formulas", async () => {
    const { app, database } = setup();
    const [first] = database.releaseLists.items("obp-2-1");
    database.releaseLists.updateItem("obp-2-1", first.id, { statusComment: "=HYPERLINK(\"x\")", notes: "  +1 more", description: "\t-2" }, { id: "u", name: "U" });
    const agent = await signIn(app, "member@dreambau.com");
    const csv = await agent.get("/testmails/api/release-lists/obp-2-1/export.csv");
    expect(csv.status).toBe(200);
    expect(csv.text).toContain("Counselling & chat; Data protection");
    expect(csv.text).toContain("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csv.text).toContain("'  +1 more");
    expect(csv.text).toContain("'\t-2");
    expect(csv.text).not.toContain("OptBuilt");
  });
});
