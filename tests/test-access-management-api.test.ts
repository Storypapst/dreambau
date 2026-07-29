import { createHash } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server/app.js";
import type { AccountRecord } from "../src/server/accounts.js";
import type { MachineIdentity } from "../src/server/machine-access.js";
import type { RegistryProvider, TestAccessRecord } from "../src/server/infisical-provider.js";
import type { RegistryWriter } from "../src/server/infisical-writer.js";

const token = "machine-token-for-tests";
const seed = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

function mailbox(): AccountRecord {
  return {
    displayName: "Abe Simpson",
    email: "abe.simpson@dreambau.de",
    password: "mailbox-password",
    domain: "dreambau.de",
    imap: "mail.dreambau.com:993",
    smtp: "mail.dreambau.com:465",
    jmap: "https://box.dreambau.com/.well-known/jmap",
    caldav: "https://box.dreambau.com/dav/cal/abe.simpson%40dreambau.de/",
    carddav: "https://box.dreambau.com/dav/card/abe.simpson%40dreambau.de/",
    encryption: { state: "encrypted", format: "S/MIME", symmetricMode: "AES-256", encryptOnAppend: true, allowSpamTraining: false }
  };
}

function appRecord(patch: Partial<TestAccessRecord> = {}): TestAccessRecord {
  return {
    id: "oriso/pre-dev/e2e-platform-admin-predev",
    project: "oriso",
    environment: "pre-dev",
    kind: "admin",
    displayName: "Abe Simpson",
    username: "abe.simpson@dreambau.de",
    email: "abe.simpson@dreambau.de",
    roles: ["platform-admin"],
    permissionsDescription: "Dedicated PreDev test administrator",
    loginUrl: "https://admin.oriso-dev.site",
    secret: "application-password",
    responsiblePerson: "qa",
    createdAt: "2026-07-29T08:00:00.000Z",
    updatedAt: "2026-07-29T08:00:00.000Z",
    expiresAt: null,
    shared: true,
    rotationStatus: "current",
    documentationUrl: "https://dreambau.com/testmails/",
    ...patch
  };
}

function identity(actions: MachineIdentity["actions"], project: "oriso" | "orimo" = "oriso"): MachineIdentity {
  return {
    id: `agent-${project}`,
    tokenHash: createHash("sha256").update(token).digest("hex"),
    projects: [project],
    environments: ["pre-dev"],
    actions,
    expiresAt: "2099-01-01T00:00:00.000Z",
    revokedAt: null
  };
}

function target(options: {
  actions: MachineIdentity["actions"];
  identityProject?: "oriso" | "orimo";
  writer?: RegistryWriter;
  records?: TestAccessRecord[];
}) {
  const records = options.records ?? [appRecord()];
  const provider: RegistryProvider = {
    async list() { return records; },
    async get(id) { return records.find((record) => record.id === id) ?? null; }
  };
  return createApp({
    passwordHash: "unused",
    secureCookies: false,
    loadAccounts: () => [mailbox()],
    registryProvider: provider,
    registryWriter: options.writer,
    machineIdentities: [identity(options.actions, options.identityProject)],
    now: () => new Date(59_000)
  });
}

describe("machine Test Access management API", () => {
  it("looks up an existing record and repairs its persistent link without exposing secrets", async () => {
    const app = target({ actions: ["accounts:read", "accounts:sync"] });
    const lookup = await request(app)
      .get("/testmails/api/v1/lookup?email=abe.simpson%40dreambau.de&project=oriso&environment=pre-dev")
      .set("Authorization", `Bearer ${token}`);
    expect(lookup.status).toBe(200);
    expect(lookup.body).toEqual({
      matches: [{
        id: "oriso/pre-dev/e2e-platform-admin-predev",
        project: "oriso",
        environment: "pre-dev",
        kind: "admin",
        displayName: "Abe Simpson",
        username: "abe.simpson@dreambau.de",
        email: "abe.simpson@dreambau.de",
        roles: ["platform-admin"],
        loginUrl: "https://admin.oriso-dev.site",
        hasTotp: false,
        linked: true
      }]
    });
    expect(JSON.stringify(lookup.body)).not.toContain("application-password");

    const doctor = await request(app)
      .get("/testmails/api/v1/doctor?repair=true")
      .set("Authorization", `Bearer ${token}`);
    expect(doctor.status).toBe(200);
    expect(doctor.body).toEqual({
      status: "ok",
      repaired: true,
      records: { total: 1, linked: 1, unmappedRecords: [], unmappedAccounts: [] }
    });
  });

  it("enrolls TOTP only with the dedicated action and returns no seed", async () => {
    const record = appRecord();
    const writer: RegistryWriter = {
      async enrollTotp(expected, totpSecret, updatedAt) {
        expect(totpSecret).toBe(seed);
        Object.assign(record, { totpSecret, updatedAt });
        return { recordId: expected.id, updatedAt };
      }
    };
    const allowed = target({
      actions: ["accounts:read", "accounts:totp:write"],
      writer,
      records: [record]
    });
    const response = await request(allowed)
      .post(`/testmails/api/v1/accounts/${encodeURIComponent(record.id)}/totp`)
      .set("Authorization", `Bearer ${token}`)
      .send({ totpSecret: seed });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      accountId: record.id,
      enrolled: true,
      updatedAt: "1970-01-01T00:00:59.000Z"
    });
    expect(JSON.stringify(response.body)).not.toContain(seed);

    const denied = target({ actions: ["accounts:read"], writer, records: [appRecord()] });
    const forbidden = await request(denied)
      .post(`/testmails/api/v1/accounts/${encodeURIComponent(record.id)}/totp`)
      .set("Authorization", `Bearer ${token}`)
      .send({ totpSecret: seed });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toEqual({ error: "action_denied" });
  });

  it("hides foreign-scope records and requires sync permission for repair", async () => {
    const foreign = target({
      actions: ["accounts:read", "accounts:totp:write"],
      identityProject: "orimo",
      writer: { enrollTotp: vi.fn() }
    });
    const hidden = await request(foreign)
      .post(`/testmails/api/v1/accounts/${encodeURIComponent(appRecord().id)}/totp`)
      .set("Authorization", `Bearer ${token}`)
      .send({ totpSecret: seed });
    expect(hidden.status).toBe(404);
    expect(hidden.body).toEqual({ error: "account_not_found" });

    const readOnly = target({ actions: ["accounts:read"] });
    const repair = await request(readOnly)
      .get("/testmails/api/v1/doctor?repair=true")
      .set("Authorization", `Bearer ${token}`);
    expect(repair.status).toBe(403);
    expect(repair.body).toEqual({ error: "action_denied" });
  });
});
