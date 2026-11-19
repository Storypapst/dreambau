import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { describe, expect, it, vi } from "vitest";
import { playwrightLogin, runPlaywrightLoginBroker } from "../src/server/playwright-login-broker.js";

const hub = "https://dreambau.com/testmails/api/v1";
const accountId = "oriso/pre-dev/admin-app-totp-fixture";
const username = "admin@example.invalid";
const password = "synthetic-admin-password";
const code = "651294";
const subject = "synthetic-admin";
const refreshToken = "synthetic-admin-refresh";
const grantPath = "/auth/realms/online-beratung/protocol/openid-connect/token";
const accessPath = "/service/tenant/access";
const rolePath = "/service/users/data";
const cookieAttributes = "; Path=/admin; Secure; HttpOnly; SameSite=Strict";
const now = new Date("2026-11-19T10:00:00Z");
const loginPage = `<form>
  <input name="username"><input type="password"><button type="submit">Log in</button>
</form><script>
const form = document.querySelector('form');
form.onsubmit = async event => {
  event.preventDefault();
  const payload = new URLSearchParams({
    grant_type: 'password', client_id: 'app',
    username: form.elements.username.value, password: form.querySelector('[type=password]').value,
  });
  if (form.elements.otp) payload.set('otp', form.elements.otp.value);
  const grant = await fetch('${grantPath}', { method: 'POST', body: payload });
  const tokens = await grant.json();
  if (tokens.otpType) {
    form.querySelector('button').insertAdjacentHTML('beforebegin', '<input name="otp" autocomplete="one-time-code">');
    return;
  }
  if (!grant.ok) return;
  const access = await fetch('${accessPath}', { headers: { authorization: 'Bearer ' + tokens.access_token } });
  if (!access.ok) return;
  await fetch('/admin/auth/set-token', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(tokens) });
  localStorage.setItem('oriso-admin.auth.access_token_valid_until', '1795082500000');
  localStorage.setItem('matrix_session', 'synthetic-foreign-state');
  location.assign('/admin');
};
</script>`;

interface Options {
  role?: "platform-admin" | "tenant-admin";
  failure?: "scope" | "refresh" | "catalog" | "email" | "role-read";
}

async function exercise({ role = "tenant-admin", failure }: Options = {}) {
  const roles = role === "platform-admin" ? ["tenant-admin", "agency-admin"] : ["tenant-admin"];
  const tenantId = role === "platform-admin" || failure === "scope" ? "0" : "42";
  const accessToken = "fixture." + Buffer.from(JSON.stringify({ sub: subject, tenantId,
    realm_access: { roles } })).toString("base64url") + ".signature";
  let accessReads = 0;
  let roleReads = 0;
  const server = createServer(async (req, res) => {
    if (req.url === grantPath && req.method === "POST") {
      let body = "";
      for await (const chunk of req) body += chunk;
      res.setHeader("Content-Type", "application/json");
      const form = new URLSearchParams(body);
      if (form.get("username") !== username || form.get("password") !== password) {
        res.writeHead(401).end("{}");
      } else if (!form.has("otp")) {
        res.writeHead(400).end(JSON.stringify({ error: "invalid_grant", otpType: failure === "email" ? "EMAIL" : "APP" }));
      } else if (form.get("otp") === code) {
        res.end(JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }));
      } else {
        res.writeHead(400).end("{}");
      }
    } else if (req.url === accessPath) {
      accessReads++;
      res.writeHead(req.headers.authorization === "Bearer " + accessToken ? 204 : 403).end();
    } else if (req.url === rolePath) {
      roleReads++;
      const accepted = req.headers.authorization === "Bearer " + accessToken;
      res.writeHead(accepted ? 200 : 403, { "Content-Type": "application/json" }).end(JSON.stringify({
        userId: subject, userName: username, userRoles: failure === "role-read" ? ["consultant"] : roles
      }));
    } else if (req.url === "/admin/auth/set-token" && req.method === "POST") {
      req.resume();
      res.writeHead(204, { "Set-Cookie": [
        "oriso_admin_access_token=" + accessToken + cookieAttributes,
        "oriso_admin_refresh_token=" + (failure === "refresh" ? "unrelated-refresh" : refreshToken) + cookieAttributes,
        "keycloak=synthetic-foreign-state; Path=/"
      ] }).end();
    } else if (req.url === "/admin/auth/session" && req.method === "GET") {
      const cookies = new Map((req.headers.cookie ?? "").split("; ").map(cookie => cookie.split("=")));
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({
        access_token: cookies.get("oriso_admin_access_token"),
        refresh_token: cookies.get("oriso_admin_refresh_token")
      }));
    } else if (req.url === "/admin" || req.url === "/admin/login") {
      res.writeHead(200, { "Content-Type": "text/html" }).end(req.url === "/admin/login" ? loginPage : "<h1>Admin</h1>");
    } else {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture address missing");
  const origin = `http://localhost:${address.port}`;
  const root = await mkdtemp(join(tmpdir(), "admin-app-totp-fixture-"));
  try {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      expect(init?.redirect).toBe("error");
      const path = String(input);
      if (path === hub + "/accounts?project=oriso&environment=pre-dev") return Response.json([{
        id: accountId, project: "oriso", environment: "pre-dev", username,
        loginUrl: "https://predev.oriso.org/admin", kind: failure === "catalog" ? "app-user" : "admin",
        provisioningStatus: "ready", roles: [role]
      }]);
      if (path.endsWith("/secret")) return Response.json({ id: accountId, secret: password });
      expect(path).toBe(hub + "/accounts/" + encodeURIComponent(accountId) + "/otp?source=totp");
      return Response.json({ accountId, source: "totp", code, expiresAt: "2026-11-19T10:00:30Z" });
    });
    const write = vi.fn<(value: string) => void>();
    const writeError = vi.fn<(value: string) => void>();
    const status = await runPlaywrightLoginBroker(accountId, {
      requireAppTotp: "pre-dev-admin", baseUrl: hub, identity: "synthetic",
      readKeychainToken: () => "synthetic-machine-token", fetch, now: () => now,
      write, writeError, stateRoot: root, scheduleCleanup: vi.fn(),
      login: request => {
        expect(request.loginUrl).toBe("https://predev.oriso.org/admin/login");
        return playwrightLogin({ ...request, loginUrl: origin + "/admin/login" });
      }
    });
    const output = write.mock.lastCall?.[0] ?? "";
    const error = writeError.mock.lastCall?.[0] ?? "";
    for (const secret of [username, password, code, accessToken, refreshToken]) expect(output + error).not.toContain(secret);
    const receipt = status === 0 ? JSON.parse(output) : undefined;
    if (receipt) {
      const browser = await chromium.launch({ headless: true });
      try {
        const context = await browser.newContext({ storageState: receipt.storageState });
        const restored = await context.request.get(origin + "/admin/auth/session", { maxRedirects: 0 });
        expect(restored.status()).toBe(200);
        expect(await restored.json()).toEqual({ access_token: accessToken, refresh_token: refreshToken });
      } finally {
        await browser.close();
      }
    }
    return { status, error, receipt, accessReads, roleReads, fetchCount: fetch.mock.calls.length,
      remaining: await readdir(root), accessToken, origin,
      state: receipt ? JSON.parse(await readFile(receipt.storageState, "utf8")) : undefined,
      mode: receipt ? (await stat(receipt.storageState)).mode & 0o777 : undefined };
  } finally {
    server.closeAllConnections();
    await Promise.all([new Promise<void>((resolve) => server.close(() => resolve())), rm(root, { recursive: true, force: true })]);
  }
}

describe("verified Pre-Dev Admin App-TOTP", () => {
  it.each(["platform-admin", "tenant-admin"] as const)("restores only the verified %s session", async (role) => {
    const result = await exercise({ role });
    expect(result.status, result.error).toBe(0);
    expect(result.receipt).toMatchObject({ accountId, secondFactor: "app-totp", sessionKind: "admin" });
    expect(result.mode).toBe(0o600);
    expect(result.accessReads).toBe(1);
    expect(result.roleReads).toBe(1);
    expect(result.state.origins).toEqual([{ origin: result.origin, localStorage: [
      { name: "oriso-admin.auth.access_token_valid_until", value: "1795082500000" }
    ] }]);
    expect(result.state.cookies).toHaveLength(2);
    expect(result.state.cookies).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "oriso_admin_access_token", value: result.accessToken, path: "/admin",
        secure: true, httpOnly: true, sameSite: "Strict" }),
      expect.objectContaining({ name: "oriso_admin_refresh_token", value: refreshToken, path: "/admin",
        secure: true, httpOnly: true, sameSite: "Strict" })
    ]));
  }, 20_000);

  it.each(["scope", "refresh", "catalog", "email", "role-read"] as const)(
    "rejects the %s mismatch without a state file", async (failure) => {
      const result = await exercise({ failure });
      expect(result.status).toBe(1);
      expect(result.remaining).toEqual([]);
      if (failure === "catalog") expect(result.fetchCount).toBe(1);
      if (failure === "email") expect(result.fetchCount).toBe(2);
      if (failure === "scope" || failure === "role-read") expect(result.roleReads).toBe(1);
      if (failure === "refresh") expect(result.error).toMatch(/session could not be restored/);
    }, 20_000
  );
});
