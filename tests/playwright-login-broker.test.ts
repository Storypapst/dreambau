import { mkdtemp, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";
import {
  isOtpChallenge,
  playwrightLogin,
  resolveVisible,
  runPlaywrightLoginBroker
} from "../src/server/playwright-login-broker.js";

// Mirrors the live ORISO admin login: React assigns dynamic ids, the fields are
// only identifiable semantically, and a search combobox sits above them.
const SEMANTIC_LOGIN_FORM = `<!doctype html>
  <form id="login">
    <input type="search" id="rc_select_0" role="combobox" aria-label="Select login language">
    <label for="_r_1_">Tenant code</label>
    <input type="text" id="_r_1_" placeholder="Tenant code">
    <label for="_r_3_">Username</label>
    <input type="text" id="_r_3_" autocomplete="username" placeholder="Username/Email">
    <label for="_r_4_">Password</label>
    <input type="password" id="_r_4_" autocomplete="current-password" placeholder="Password">
    <button type="button" aria-label="toggle password visibility"></button>
    <button type="submit">Sign in</button>
  </form>
  <script>document.querySelector('#login').addEventListener('submit', (event) => {
    event.preventDefault();
    const user = document.querySelector('#_r_3_').value;
    const password = document.querySelector('#_r_4_').value;
    setTimeout(() => { location.href = '/app?u=' + encodeURIComponent(user) + '&p=' + encodeURIComponent(password); }, 150);
  });</script>`;

function fakeLocator(visible: boolean, label: string) {
  const locator = {
    label,
    first: () => locator,
    isVisible: vi.fn(async () => visible)
  };
  return locator;
}

describe("Playwright login broker", () => {
  it("resolves the first visible candidate and skips invisible ones", async () => {
    const hidden = fakeLocator(false, "legacy");
    const visible = fakeLocator(true, "semantic");
    const later = fakeLocator(true, "fallback");

    const resolved = await resolveVisible([hidden, visible, later] as never, "username", 1_000);

    expect((resolved as unknown as { label: string }).label).toBe("semantic");
    expect(later.isVisible).not.toHaveBeenCalled();
  });

  it("fails with a named field error when no candidate ever becomes visible", async () => {
    const sleep = vi.fn(async () => {});
    await expect(
      resolveVisible([fakeLocator(false, "none")] as never, "password", 0, sleep)
    ).rejects.toThrow(/login form field "password" was not found/);
  });

  it("treats a locator that throws while probing as not visible", async () => {
    const broken = { first: () => broken, isVisible: vi.fn(async () => { throw new Error("detached"); }) };
    const good = fakeLocator(true, "semantic");

    const resolved = await resolveVisible([broken, good] as never, "username", 1_000);

    expect((resolved as unknown as { label: string }).label).toBe("semantic");
  });

  it("does not confuse an application element named otp with an identity-provider challenge", () => {
    expect(isOtpChallenge("https://app.oriso-dev.site/app", "https://app.oriso-dev.site", true)).toBe(false);
    expect(isOtpChallenge("https://identity.oriso-dev.site/realms/oriso/login-actions/authenticate", "https://app.oriso-dev.site", true)).toBe(true);
  });

  it("treats a same-origin second factor revealed on the login screen as a challenge", () => {
    const login = "https://admin.oriso-dev.site/admin/login";
    // Still on the login screen: the ORISO admin reveals its OTP field inline.
    expect(isOtpChallenge(login, login, true, login)).toBe(true);
    // Navigated on: an element named otp is part of the application, not a challenge.
    expect(isOtpChallenge("https://admin.oriso-dev.site/admin/dashboard", login, true, login)).toBe(false);
    // An invisible field is never a challenge.
    expect(isOtpChallenge(login, login, false, login)).toBe(false);
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
      loginUrl: "https://app.oriso-dev.site",
      ignoreHTTPSErrors: true
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
        ignoreHTTPSErrors: false,
        getOtp: async () => { throw new Error("OTP should not be requested"); }
      });
      const state = JSON.parse(await readFile(statePath, "utf8"));
      expect(appRequests).toBe(1);
      expect(state.cookies).toEqual(expect.arrayContaining([expect.objectContaining({ name: "logged_in", value: "1" })]));
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  }, 20_000);

  it("logs in against dynamic React ids using semantic selectors and ignores the search field", async () => {
    let received: URL | null = null;
    const server = createServer((req, res) => {
      if (req.url?.startsWith("/app")) {
        received = new URL(req.url, "http://127.0.0.1");
        res.setHeader("Set-Cookie", "logged_in=1; Path=/; HttpOnly");
        res.end("signed in");
        return;
      }
      res.setHeader("Content-Type", "text/html");
      res.end(SEMANTIC_LOGIN_FORM);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not bind");
    const root = await mkdtemp(join(tmpdir(), "playwright-semantic-login-"));
    const statePath = join(root, "state.json");
    try {
      await playwrightLogin({
        username: "abe.simpson@dreambau.de",
        password: "semantic-test-password",
        loginUrl: `http://127.0.0.1:${address.port}/`,
        statePath,
        ignoreHTTPSErrors: false,
        getOtp: async () => { throw new Error("OTP should not be requested"); }
      });

      // Proves the username landed in the semantic field, not the search combobox.
      expect(received!.searchParams.get("u")).toBe("abe.simpson@dreambau.de");
      expect(received!.searchParams.get("p")).toBe("semantic-test-password");
      const state = JSON.parse(await readFile(statePath, "utf8"));
      expect(state.cookies).toEqual(expect.arrayContaining([expect.objectContaining({ name: "logged_in", value: "1" })]));
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  }, 30_000);

  it("completes an inline same-origin two-factor login by fetching the code from the broker", async () => {
    let received: URL | null = null;
    const server = createServer((req, res) => {
      if (req.url?.startsWith("/app")) {
        received = new URL(req.url, "http://127.0.0.1");
        res.setHeader("Set-Cookie", "logged_in=1; Path=/; HttpOnly");
        res.end("signed in");
        return;
      }
      res.setHeader("Content-Type", "text/html");
      // The OTP field only appears after the first submit, on the same origin.
      res.end(`<!doctype html>
        <form id="login">
          <input type="text" id="_r_3_" autocomplete="username" placeholder="Username/Email">
          <input type="password" id="_r_4_" autocomplete="current-password" placeholder="Password">
          <input type="text" id="_r_5_" autocomplete="one-time-code" aria-label="One-time password" style="display:none">
          <button type="submit">Sign in</button>
        </form>
        <script>
          const form = document.querySelector('#login');
          const otp = document.querySelector('#_r_5_');
          form.addEventListener('submit', (event) => {
            event.preventDefault();
            if (otp.style.display === 'none') { otp.style.display = 'block'; return; }
            setTimeout(() => { location.href = '/app?code=' + encodeURIComponent(otp.value); }, 100);
          });
        </script>`);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not bind");
    const root = await mkdtemp(join(tmpdir(), "playwright-inline-otp-"));
    const getOtp = vi.fn(async () => "654321");
    try {
      await playwrightLogin({
        username: "abe.simpson@dreambau.de",
        password: "inline-otp-password",
        loginUrl: `http://127.0.0.1:${address.port}/`,
        statePath: join(root, "state.json"),
        ignoreHTTPSErrors: false,
        getOtp
      });

      expect(getOtp).toHaveBeenCalledTimes(1);
      expect(received!.searchParams.get("code")).toBe("654321");
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  }, 30_000);

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
