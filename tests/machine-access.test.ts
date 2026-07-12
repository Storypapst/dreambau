import { describe, expect, it } from "vitest";
import {
  authenticateMachineToken,
  hashMachineToken,
  machineIdentitySchema,
  type MachineIdentity
} from "../src/server/machine-access.js";

const token = "test-token-value-with-enough-entropy";

function identity(patch: Partial<MachineIdentity> = {}): MachineIdentity {
  return machineIdentitySchema.parse({
    id: "codex-m4-oriso",
    tokenHash: hashMachineToken(token),
    projects: ["oriso"],
    environments: ["pre-dev", "production-test"],
    expiresAt: "2099-01-01T00:00:00.000Z",
    revokedAt: null,
    ...patch
  });
}

describe("machine identity authentication", () => {
  it("authenticates only the matching hashed token", () => {
    expect(authenticateMachineToken(token, [identity()])?.id).toBe("codex-m4-oriso");
    expect(authenticateMachineToken("wrong-token", [identity()])).toBeNull();
  });

  it("rejects revoked and expired identities immediately", () => {
    expect(authenticateMachineToken(token, [identity({ revokedAt: "2026-07-12T00:00:00.000Z" })])).toBeNull();
    expect(authenticateMachineToken(token, [identity({ expiresAt: "2020-01-01T00:00:00.000Z" })])).toBeNull();
  });

  it("rejects production scopes and plaintext token fields", () => {
    expect(() => identity({ environments: ["production" as never] })).toThrow();
    expect(() => machineIdentitySchema.parse({
      ...identity(),
      token
    })).toThrow();
  });
});
