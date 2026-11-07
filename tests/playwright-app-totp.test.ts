import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { createServer, type RequestListener } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { describe, expect, it, vi } from "vitest";
import { playwrightLogin, runPlaywrightLoginBroker } from "../src/server/playwright-login-broker.js";

const ACCOUNT_ID = "oriso/dev/app-totp-fixture";
const USERNAME = "test.user@dreambau.com";
const LEGACY_USERNAME = "enc.ORSXG5BOOVZWK4SAMRZGKYLNMJQXKLTDN5WQ....";
const PASSWORD = "synthetic-password&%+";
const CODE = "651294";
const TOKEN = "synthetic-access-token";
const MACHINE_TOKEN = "synthetic-machine-token";
const DOM_CANARY = "synthetic-visible-diagnostic";
const TOKEN_PATH = "/auth/realms/online-beratung/protocol/openid-connect/token";
const USER_DATA_PATH = "/service/users/data";
const APP_PATH = "/sessions/consultant/sessionView";
const HUB = "https://dreambau.com/testmails/api/v1";
const CATALOG = { id: ACCOUNT_ID, username: USERNAME, project: "oriso", environment: "dev", loginUrl: "https://dev.oriso.org" };

type Scenario = "cookie" | "legacy-storage" | "password-only" | "email" | "rejected" | "wrong-code"
  | "unbound-state" | "legacy-hub" | "foreign-login" | "foreign-challenge";

async function serve(listener: RequestListener) {
  const server = createServer(listener);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture server did not bind");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

function fixtureLogin(scenario: Scenario, foreignUrl: string) {
  return `<!doctype html>
    <div role="alert">${DOM_CANARY}</div>
    <form>
      <input name="username" autocomplete="username">
      <input name="password" autocomplete="current-password" type="password">
      <input name="otp" autocomplete="one-time-code" disabled hidden>
      <button>Sign in</button>
    </form>
    <script>
      const form = document.querySelector('form');
      const otp = form.elements.otp;
      const send = (fields) => fetch(${JSON.stringify(TOKEN_PATH)}, {
        method: 'POST', body: fields
      });
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const fields = new URLSearchParams(new FormData(form));
        fields.set('client_id', 'app');
        fields.set('grant_type', 'password');
        if (${scenario === "wrong-code"} && fields.has('otp')) fields.set('otp', '000000');
        let response = await send(fields);
        if (response.status === 401) {
          fields.set('username', ${JSON.stringify(LEGACY_USERNAME)});
          response = await send(fields);
        }
        if (response.status === 400 && (await response.json()).otpType) {
          otp.disabled = false;
          otp.hidden = false;
          if (${scenario === "foreign-challenge"}) setTimeout(() => { location.href = ${JSON.stringify(foreignUrl)}; }, 70);
        } else if (response.ok) {
          const { access_token } = await response.json();
          const token = ${scenario === "unbound-state"} ? 'other-token' : access_token;
          if (${scenario === "legacy-storage"}) localStorage.setItem('auth.keycloak', token);
          else document.cookie = 'keycloak=' + token + '; Path=/; SameSite=Strict';
          await fetch(${JSON.stringify(USER_DATA_PATH)}, { headers: { authorization: 'Bearer ' + access_token } });
          location.href = ${JSON.stringify(APP_PATH)};
        }
      });
    </script>`;
}

async function exercise(scenario: Scenario, assert: (result: {
  status: number;
  output: string;
  error: string;
  remaining: string[];
  grants: Array<{ username: string | null; otp: string | null }>;
  otpFetches: number;
  foreignSubmissions: number;
  appOrigin: string;
}) => Promise<void> | void) {
  const root = await mkdtemp(join(tmpdir(), "app-totp-contract-"));
  let foreignSubmissions = 0;
  const foreign = await serve((req, res) => {
    if (req.method === "POST") foreignSubmissions++;
    res.setHeader("content-type", "text/html");
    res.end(`<form method="POST"><input autocomplete="username"><input autocomplete="current-password" type="password">
      <input autocomplete="one-time-code"><button>Sign in</button></form>
      <script>document.addEventListener('input', () => fetch('/observed', { method: 'POST' }));</script>`);
  });
  const foreignLogin = `${foreign.origin}/login`;
  const grants: Array<{ username: string | null; otp: string | null }> = [];
  const app = await serve(async (req, res) => {
    if (req.url === TOKEN_PATH && req.method === "POST") {
      const buffers: Buffer[] = [];
      for await (const bytes of req) buffers.push(bytes);
      const fields = new URLSearchParams(Buffer.concat(buffers).toString());
      const username = fields.get("username");
      const otp = fields.get("otp");
      grants.push({ username, otp });
      res.setHeader("content-type", "application/json");
      if (fields.get("password") !== PASSWORD) {
        res.writeHead(403).end("{}");
      } else if (scenario === "legacy-storage" && username === USERNAME) {
        res.writeHead(401).end("{}");
      } else if (!otp && scenario !== "password-only") {
        res.writeHead(400).end(JSON.stringify({ error: "invalid_grant", otpType: scenario === "email" ? "EMAIL" : "APP" }));
      } else if (scenario === "rejected") {
        res.writeHead(400).end(JSON.stringify({ error: "invalid_grant" }));
      } else {
        res.end(JSON.stringify({ access_token: TOKEN }));
      }
      return;
    }
    if (scenario === "foreign-login") {
      res.writeHead(302, { Location: foreignLogin }).end();
      return;
    }
    if (req.url === USER_DATA_PATH && req.method === "GET") {
      res.writeHead(req.headers.authorization === `Bearer ${TOKEN}` ? 200 : 401,
        { "content-type": "application/json" }).end("{}");
      return;
    }
    res.setHeader("content-type", "text/html");
    if (req.url === APP_PATH) {
      res.end(`<h1></h1><script>
        const token = ${JSON.stringify(TOKEN)};
        const signedIn = document.cookie.includes('keycloak=' + token) || localStorage.getItem('auth.keycloak') === token;
        document.querySelector('h1').textContent = signedIn ? 'Counsellor' : 'Signed out';
      </script>`);
      return;
    }
    res.end(fixtureLogin(scenario, foreignLogin));
  });
  try {
    const write = vi.fn<(value: string) => void>();
    const writeError = vi.fn<(value: string) => void>();
    const scheduleCleanup = vi.fn();
    const now = new Date("2026-11-07T19:00:00.000Z");
    const otpUrl = `${HUB}/accounts/${encodeURIComponent(ACCOUNT_ID)}/otp?source=totp`;
    let otpFetches = 0;
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      expect(init?.redirect).toBe("error");
      if (String(input) === `${HUB}/accounts?project=oriso&environment=dev`) return Response.json([CATALOG]);
      if (String(input) === `${HUB}/accounts/${encodeURIComponent(ACCOUNT_ID)}/secret`) {
        return Response.json({ id: ACCOUNT_ID, secret: PASSWORD });
      }
      expect(String(input)).toBe(otpUrl);
      otpFetches++;
      if (scenario === "foreign-challenge") await new Promise((resolve) => setTimeout(resolve, 300));
      const code = { code: CODE, expiresAt: "2026-11-07T19:00:30.000Z" };
      return Response.json(scenario === "legacy-hub" ? code : { ...code, accountId: ACCOUNT_ID, source: "totp" });
    });
    const status = await runPlaywrightLoginBroker(ACCOUNT_ID, {
      requireAppTotp: true,
      baseUrl: HUB,
      identity: "synthetic-broker",
      readKeychainToken: () => MACHINE_TOKEN,
      stateRoot: root,
      now: () => now,
      login: (request) => playwrightLogin({ ...request, loginUrl: `${app.origin}/login`, awaitChatUnlock: undefined }),
      fetch,
      write,
      writeError,
      scheduleCleanup
    });
    const output = write.mock.lastCall?.[0] ?? "";
    const error = writeError.mock.lastCall?.[0] ?? "";
    for (const secret of [CODE, TOKEN, MACHINE_TOKEN, PASSWORD, USERNAME, DOM_CANARY]) {
      expect(output + error).not.toContain(secret);
    }
    expect(scheduleCleanup).toHaveBeenCalledTimes(status === 0 ? 1 : 0);
    await assert({ status, output, error, remaining: await readdir(root), grants, otpFetches, foreignSubmissions, appOrigin: app.origin });
  } finally {
    await Promise.all([app.close(), foreign.close(), rm(root, { recursive: true, force: true })]);
  }
}

describe("verified ORISO Dev App-TOTP session", () => {
  it.each(["cookie", "legacy-storage"] as const)("restores the session issued for the accepted code (%s)", async (scenario) => {
    await exercise(scenario, async ({ status, output, error, grants, otpFetches, appOrigin }) => {
      expect(status, error).toBe(0);
      const session = JSON.parse(output);
      expect(session).toEqual({ accountId: ACCOUNT_ID, secondFactor: "app-totp",
        storageState: expect.any(String), expiresAt: "2026-11-07T19:15:00.000Z" });
      expect((await stat(session.storageState)).mode & 0o777).toBe(0o600);
      expect(otpFetches).toBe(1);
      expect(grants).toEqual(scenario === "legacy-storage" ? [
        { username: USERNAME, otp: null },
        { username: LEGACY_USERNAME, otp: null },
        { username: USERNAME, otp: CODE },
        { username: LEGACY_USERNAME, otp: CODE }
      ] : [{ username: USERNAME, otp: null }, { username: USERNAME, otp: CODE }]);
      const browser = await chromium.launch();
      try {
        const context = await browser.newContext({ storageState: session.storageState });
        const page = await context.newPage();
        await page.goto(appOrigin + APP_PATH);
        expect(await page.locator("h1").innerText()).toBe("Counsellor");
      } finally {
        await browser.close();
      }
    });
  }, 30_000);

  it.each([
    ["password-only", 1, 0],
    ["email", 1, 0],
    ["legacy-hub", 1, 1],
    ["rejected", 2, 1],
    ["wrong-code", 2, 1],
    ["unbound-state", 2, 1],
    ["foreign-login", 0, 0],
    ["foreign-challenge", 1, 1]
  ] as const)("keeps proof and state private when %s", async (scenario, grantCount, expectedOtpFetches) => {
    await exercise(scenario, ({ status, output, error, remaining, grants, otpFetches, foreignSubmissions }) => {
      expect(status).toBe(1);
      expect(output).toBe("");
      expect(error).toMatch(/^The |^Test Access /);
      expect(remaining).toEqual([]);
      expect(grants).toHaveLength(grantCount);
      expect(otpFetches).toBe(expectedOtpFetches);
      expect(foreignSubmissions).toBe(0);
    });
  }, 30_000);

  it.each(["https://other.oriso.org", "https://dev.oriso.org/admin/login", "https://dev.oriso.org/?next=/"])(
    "rejects catalog URL %s before retrieving credentials",
    async (loginUrl) => {
      const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json([{ ...CATALOG, loginUrl }]));
      const login = vi.fn();
      const write = vi.fn();
      const status = await runPlaywrightLoginBroker(ACCOUNT_ID, {
        requireAppTotp: true, baseUrl: HUB, identity: "synthetic-broker",
        readKeychainToken: () => MACHINE_TOKEN, login, fetch, write, writeError: vi.fn()
      });
      expect(status).toBe(1);
      expect(fetch).toHaveBeenCalledExactlyOnceWith(`${HUB}/accounts?project=oriso&environment=dev`,
        expect.objectContaining({ redirect: "error" }));
      expect(login).not.toHaveBeenCalled();
      expect(write).not.toHaveBeenCalled();
    }
  );
});
