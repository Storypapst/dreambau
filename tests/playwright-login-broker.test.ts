import { mkdtemp, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";
import { isOtpChallenge, playwrightLogin, runPlaywrightLoginBroker } from "../src/server/playwright-login-broker.js";

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

  it("waits for a real post-submit transition before writing browser state", async () => {
    let appRequests = 0;
    const server = createServer((req, res) => {
      if (req.url === "/app") {
        appRequests += 1;
        res.setHeader("Set-Cookie", "logged_in=1; Path=/; HttpOnly");
        res.end("signed in");
        return;
      }
      res.setHeader("Content-Type", "text/html");
      res.end(`<!doctype html><form id="login"><input id="username"><input id="passwordInput"><button>Login</button></form>
        <script>document.querySelector('#login').addEventListener('submit', (event) => {
          event.preventDefault(); setTimeout(() => { location.href = '/app'; }, 150);
        });</script>`);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not bind");
    const root = await mkdtemp(join(tmpdir(), "playwright-real-login-"));
    const statePath = join(root, "state.json");
    try {
      await playwrightLogin({
        username: "test-user", password: "test-password",
        loginUrl: `http://127.0.0.1:${address.port}/`, statePath,
        getOtp: async () => { throw new Error("OTP should not be requested"); }
      });
      const state = JSON.parse(await readFile(statePath, "utf8"));
      expect(appRequests).toBe(1);
      expect(state.cookies).toEqual(expect.arrayContaining([expect.objectContaining({ name: "logged_in", value: "1" })]));
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  }, 20_000);

  it("fails closed and redacts output for missing identity, token, account, secret and OTP", async () => {
    const cases = [
      { identity: "", token: "token", records: [], secret: "password", otp: "123456", login: undefined },
      { identity: "codex-m4-oriso", token: "", records: [], secret: "password", otp: "123456", login: undefined },
      { identity: "codex-m4-oriso", token: "token", records: [], secret: "password", otp: "123456", login: undefined },
      { identity: "codex-m4-oriso", token: "token", records: [{ id: "oriso/pre-dev/test-consultant-001", project: "oriso", environment: "pre-dev", username: "user", loginUrl: "https://app.example.test" }], secret: "", otp: "123456", login: undefined },
      { identity: "codex-m4-oriso", token: "token", records: [{ id: "oriso/pre-dev/test-consultant-001", project: "oriso", environment: "pre-dev", username: "user", loginUrl: "https://app.example.test" }], secret: "password", otp: "", login: async (request: any) => { await request.getOtp(); } }
    ];
    for (const entry of cases) {
      const output: string[] = [];
      const errors: string[] = [];
      const result = await runPlaywrightLoginBroker("oriso/pre-dev/test-consultant-001", {
        baseUrl: "https://dreambau.com/testmails/api/v1",
        identity: entry.identity,
        readKeychainToken: () => entry.token,
        fetch: vi.fn(async (url: string) => url.includes("/accounts?")
          ? Response.json(entry.records)
          : url.endsWith("/secret") ? Response.json({ secret: entry.secret }) : Response.json({ code: entry.otp })) as unknown as typeof fetch,
        login: entry.login,
        stateRoot: await mkdtemp(join(tmpdir(), "broker-failure-")),
        write: (value) => output.push(value),
        writeError: (value) => errors.push(value)
      });
      expect(result).toBe(1);
      expect(output).toEqual([]);
      expect(errors.join("")).not.toContain(entry.token || "never-match");
      expect(errors.join("")).not.toContain(entry.secret || "never-match");
      expect(errors.join("")).not.toContain(entry.otp || "never-match");
    }
  });
});
