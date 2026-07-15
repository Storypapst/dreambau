import { describe, expect, it, vi } from "vitest";

import { runOrisoConsultantLoginCheck } from "../src/server/oriso-consultant-login-check.js";

describe("ORISO consultant login check", () => {
  it("delegates credential handling to the canonical Playwright login broker", () => {
    const output: string[] = [];
    const execute = vi.fn(() => JSON.stringify({
      accountId: "oriso/pre-dev/test-consultant-001",
      storageState: "/private/session/storage-state.json",
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    }));

    const result = runOrisoConsultantLoginCheck({
      execute,
      write: (value) => output.push(value)
    });

    expect(result).toBe(0);
    expect(execute).toHaveBeenCalledWith("test-access", [
      "--identity",
      "codex-m4-oriso",
      "playwright-login",
      "oriso/pre-dev/test-consultant-001"
    ]);
    expect(output.join("")).toBe("LOGIN_CHECK: SUCCESS\n");
    expect(output.join("")).not.toContain("storage-state.json");
  });

  it("fails closed for invalid or expired broker state", () => {
    for (const expiresAt of ["not-a-date", new Date(Date.now() - 1_000).toISOString()]) {
      const errors: string[] = [];
      expect(runOrisoConsultantLoginCheck({
        execute: () => JSON.stringify({
          accountId: "oriso/pre-dev/test-consultant-001",
          storageState: "/private/session/storage-state.json",
          expiresAt
        }),
        writeError: (value) => errors.push(value)
      })).toBe(1);
      expect(errors.join("")).toBe("LOGIN_CHECK: FAILED\n");
    }
  });

  it("fails closed when the broker does not return a private state handle", () => {
    const errors: string[] = [];
    const result = runOrisoConsultantLoginCheck({
      execute: () => "{}",
      write: () => {},
      writeError: (value) => errors.push(value)
    });

    expect(result).toBe(1);
    expect(errors.join("")).toBe("LOGIN_CHECK: FAILED\n");
  });
});
