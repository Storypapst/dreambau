import { describe, expect, it, vi } from "vitest";

import { runOrisoConsultantLoginCheck } from "../src/server/oriso-consultant-login-check.js";

describe("ORISO consultant login check", () => {
  it("delegates credential handling to the canonical Playwright login broker", () => {
    const output: string[] = [];
    const execute = vi.fn(() => JSON.stringify({
      accountId: "oriso/pre-dev/test-consultant-001",
      storageState: "/private/session/storage-state.json",
      expiresAt: "2026-07-15T13:15:00.000Z"
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
