import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/server/app.js";
import { createDatabase } from "../src/server/db.js";
import type { RegistryProvider, TestAccessRecord } from "../src/server/infisical-provider.js";
import type { MachineAction } from "../src/server/machine-access.js";

const token = "machine-token-for-versioned-runs";
const secret = "must-never-appear-in-run-responses";

function mailbox(id: string, role: string): TestAccessRecord {
  const email = `${id}@oriso.org`;
  return {
    id: `mailbox:${email}`,
    project: "oriso",
    environment: "production-test",
    kind: "mailbox",
    displayName: id,
    username: email,
    email,
    roles: [role],
    permissionsDescription: "Versioned test pool",
    loginUrl: "https://mail.dreambau.com",
    secret,
    responsiblePerson: "dreambau",
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z",
    expiresAt: null,
    shared: true,
    rotationStatus: "current",
    documentationUrl: "https://dreambau.com/testmails/"
  };
}

function target(actions: MachineAction[] = ["runs:read", "runs:create", "runs:execute"]) {
  const records = [
    mailbox("consultant-a", "consultant"),
    mailbox("consultant-b", "consultant"),
    mailbox("user-a", "user")
  ];
  const registryProvider: RegistryProvider = {
    async list() { return records; },
    async get(id) { return records.find((record) => record.id === id) ?? null; }
  };
  return createApp({
    passwordHash: "unused",
    secureCookies: false,
    loadAccounts: () => [],
    database: createDatabase(path.join(mkdtempSync(path.join(tmpdir(), "test-run-api-")), "test.sqlite")),
    registryProvider,
    machineIdentities: [{
      id: "kio-oriso",
      tokenHash: createHash("sha256").update(token).digest("hex"),
      projects: ["oriso"],
      environments: ["pre-dev", "production-test"],
      actions,
      expiresAt: "2099-01-01T00:00:00.000Z",
      revokedAt: null
    }],
    now: () => new Date("2026-07-17T08:00:00.000Z")
  });
}

const body = {
  project: "oriso",
  targetEnvironment: "pre-dev",
  poolEnvironment: "production-test",
  applicationVersion: "4.9",
  commitSha: "abcdef1",
  scenario: "three-way-chat",
  roles: [
    { role: "consultant", count: 2 },
    { role: "user", count: 1 }
  ]
};

describe("versioned test run API", () => {
  it("atomically reserves a secret-free cohort", async () => {
    const app = target();
    const first = await request(app)
      .post("/testmails/api/v1/runs")
      .set("Authorization", `Bearer ${token}`)
      .send(body);

    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({
      project: "oriso",
      targetEnvironment: "pre-dev",
      poolEnvironment: "production-test",
      applicationVersion: "4.9",
      commitSha: "abcdef1",
      status: "reserved"
    });
    expect(first.body.accounts).toHaveLength(3);
    expect(JSON.stringify(first.body)).not.toContain(secret);

    const second = await request(app)
      .post("/testmails/api/v1/runs")
      .set("Authorization", `Bearer ${token}`)
      .send(body);
    expect(second.status).toBe(409);
    expect(second.body).toEqual({
      error: "insufficient_accounts",
      missing: [
        { role: "consultant", requested: 2, available: 0 },
        { role: "user", requested: 1, available: 0 }
      ]
    });
  });

  it("enforces the lifecycle and returns only in-scope audit metadata", async () => {
    const app = target();
    const created = await request(app)
      .post("/testmails/api/v1/runs")
      .set("Authorization", `Bearer ${token}`)
      .send(body);
    const runId = created.body.id as string;

    const listed = await request(app)
      .get("/testmails/api/v1/runs?project=oriso&targetEnvironment=pre-dev")
      .set("Authorization", `Bearer ${token}`);
    expect(listed.status).toBe(200);
    expect(listed.body).toHaveLength(1);

    const invalidFinish = await request(app)
      .post(`/testmails/api/v1/runs/${runId}/finish`)
      .set("Authorization", `Bearer ${token}`)
      .send({ result: "passed" });
    expect(invalidFinish.status).toBe(409);
    expect(invalidFinish.body).toEqual({ error: "invalid_transition" });

    expect((await request(app)
      .post(`/testmails/api/v1/runs/${runId}/start`)
      .set("Authorization", `Bearer ${token}`)).status).toBe(200);
    expect((await request(app)
      .post(`/testmails/api/v1/runs/${runId}/finish`)
      .set("Authorization", `Bearer ${token}`)
      .send({ result: "passed", evidence: { checks: 12 } })).status).toBe(200);
    const released = await request(app)
      .post(`/testmails/api/v1/runs/${runId}/release`)
      .set("Authorization", `Bearer ${token}`);
    expect(released.status).toBe(200);
    expect(released.body).toMatchObject({ status: "released" });
    expect(JSON.stringify(released.body)).not.toContain(secret);
    expect(JSON.stringify(released.body)).not.toContain(token);
  });

  it("denies run mutations unless the machine action and project scope are explicit", async () => {
    const readOnly = await request(target(["runs:read"]))
      .post("/testmails/api/v1/runs")
      .set("Authorization", `Bearer ${token}`)
      .send(body);
    expect(readOnly.status).toBe(403);
    expect(readOnly.body).toEqual({ error: "action_denied" });

    const crossProject = await request(target())
      .post("/testmails/api/v1/runs")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...body, project: "orimo" });
    expect(crossProject.status).toBe(403);
    expect(crossProject.body).toEqual({ error: "scope_denied" });
  });
});
