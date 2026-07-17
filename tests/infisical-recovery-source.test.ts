import { describe, expect, it } from "vitest";
import type { RegistryProvider, TestAccessRecord } from "../src/server/infisical-provider.js";
import { buildRegistryRecoveryPayload } from "../src/server/infisical-recovery-source.js";

function record(overrides: Partial<TestAccessRecord> = {}): TestAccessRecord {
  return {
    id: "oriso/pre-dev/test-user",
    project: "oriso",
    environment: "pre-dev",
    kind: "app-user",
    displayName: "Test User",
    username: "test-user",
    email: "test-user@oriso.org",
    roles: ["user"],
    permissionsDescription: "PreDev test login",
    loginUrl: "https://app.predev.oriso.org",
    secret: "test-only-secret",
    responsiblePerson: "dreambau",
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z",
    expiresAt: null,
    shared: true,
    rotationStatus: "current",
    documentationUrl: "https://dreambau.com/testmails/",
    ...overrides
  };
}

describe("Infisical recovery source", () => {
  it("exports the complete validated registry payload", async () => {
    const records = [
      record(),
      record({ id: "oriso/pre-dev/e2e-default", kind: "seed-profile", username: "e2e-default" })
    ];
    const provider: RegistryProvider = {
      list: async () => records,
      get: async (id) => records.find((item) => item.id === id) ?? null
    };

    const payload = await buildRegistryRecoveryPayload(provider, "2026-07-13T09:30:00.000Z");

    expect(payload).toEqual({ schemaVersion: 1, exportedAt: "2026-07-13T09:30:00.000Z", records });
    expect(payload.records).toHaveLength(2);
  });

  it("rejects duplicate stable IDs at the export boundary", async () => {
    const duplicate = record();
    const provider: RegistryProvider = {
      list: async () => [duplicate, { ...duplicate }],
      get: async () => duplicate
    };

    await expect(buildRegistryRecoveryPayload(provider)).rejects.toThrow(/duplicate/i);
  });

  it("rejects production records before any encrypted export is written", async () => {
    const provider: RegistryProvider = {
      list: async () => [record({ environment: "production" as TestAccessRecord["environment"] })],
      get: async () => null
    };

    await expect(buildRegistryRecoveryPayload(provider)).rejects.toThrow();
  });
});
