import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";
import { isOtpChallenge, runPlaywrightLoginBroker } from "../src/server/playwright-login-broker.js";

describe("Playwright login broker", () => {
  it("does not confuse an application element named otp with an identity-provider challenge", () => {
    expect(isOtpChallenge("https://app.oriso-dev.site/app", "https://app.oriso-dev.site", true)).toBe(false);
    expect(isOtpChallenge("https://identity.oriso-dev.site/realms/oriso/login-actions/authenticate", "https://app.oriso-dev.site", true)).toBe(true);
  });

  it("creates a private state handle without printing credentials or tokens", async () => {
    const root = await mkdtemp(join(tmpdir(), "login-broker-test-"));
    const output: string[] = [];
    const errors: string[] = [];
    const scheduleCleanup = vi.fn();
    const password = "target-password-do-not-leak";
    const token = "machine-token-do-not-leak";
    const login = vi.fn(async ({ statePath }: { statePath: string }) => {
      await import("node:fs/promises").then(({ writeFile }) => writeFile(statePath, '{"cookies":[]}'));
    });

    const result = await runPlaywrightLoginBroker("oriso/pre-dev/test-consultant-001", {
      baseUrl: "https://dreambau.com/testmails/api/v1",
      identity: "codex-m4-oriso",
      readKeychainToken: () => token,
      fetch: vi.fn(async (url: string) => {
        if (url.endsWith("/accounts?project=oriso&environment=pre-dev")) {
          return Response.json([{
            id: "oriso/pre-dev/test-consultant-001",
            project: "oriso",
            environment: "pre-dev",
            username: "test-consultant-001",
            loginUrl: "https://app.oriso-dev.site"
          }]);
        }
        return Response.json({ id: "oriso/pre-dev/test-consultant-001", secret: password });
      }) as unknown as typeof fetch,
      login,
      scheduleCleanup,
      stateRoot: root,
      write: (value) => output.push(value),
      writeError: (value) => errors.push(value),
      now: () => new Date("2026-07-15T08:00:00.000Z")
    });

    expect(result).toBe(0);
    expect(login).toHaveBeenCalledWith(expect.objectContaining({
      username: "test-consultant-001",
      password,
      loginUrl: "https://app.oriso-dev.site"
    }));
    const response = JSON.parse(output.join(""));
    expect(response).toMatchObject({
      accountId: "oriso/pre-dev/test-consultant-001",
      expiresAt: "2026-07-15T08:15:00.000Z"
    });
    expect(response.storageState).toContain(root);
    expect((await stat(response.storageState)).mode & 0o777).toBe(0o600);
    expect(scheduleCleanup).toHaveBeenCalledWith(expect.stringContaining(root), 15 * 60 * 1000);
    expect(await readFile(response.storageState, "utf8")).toBe('{"cookies":[]}');
    expect(output.join("") + errors.join("")).not.toContain(password);
    expect(output.join("") + errors.join("")).not.toContain(token);
  });
});
