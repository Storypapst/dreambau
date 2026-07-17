import { chmod, mkdir, mkdtemp } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const STATE_TTL_MS = 15 * 60 * 1000;

interface AccountMetadata {
  id: string;
  project: string;
  environment: string;
  username: string;
  loginUrl: string;
}

export interface BrowserLoginRequest {
  username: string;
  password: string;
  loginUrl: string;
  statePath: string;
  ignoreHTTPSErrors: boolean;
  getOtp: () => Promise<string>;
}

export interface BrokerDependencies {
  baseUrl: string;
  identity: string;
  readKeychainToken: (identity: string) => string;
  fetch: typeof fetch;
  login?: (request: BrowserLoginRequest) => Promise<void>;
  stateRoot?: string;
  write: (value: string) => void;
  writeError?: (value: string) => void;
  now?: () => Date;
  scheduleCleanup?: (directory: string, delayMs: number) => void;
}

function scheduleCleanup(directory: string, delayMs: number) {
  const child = spawn(
    "sh",
    ["-c", 'sleep "$1"; rm -rf -- "$2"', "test-access-cleanup", String(Math.ceil(delayMs / 1000)), directory],
    { detached: true, stdio: "ignore" }
  );
  child.on("error", () => {});
  child.unref();
}

function accountScope(accountId: string) {
  const [project, environment] = accountId.split("/");
  if (!project || !environment) throw new Error("account id must start with project/environment/");
  return { project, environment };
}

function redact(error: unknown, secrets: string[]) {
  let message = error instanceof Error ? error.message : "Playwright login failed";
  for (const secret of secrets.filter(Boolean)) message = message.replaceAll(secret, "[REDACTED]");
  return message;
}

export function isOtpChallenge(currentUrl: string, loginUrl: string, otpVisible: boolean) {
  return otpVisible && new URL(currentUrl).origin !== new URL(loginUrl).origin;
}

async function jsonRequest(fetchImpl: typeof fetch, url: string, token: string) {
  const response = await fetchImpl(url, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Test Access API failed with HTTP ${response.status}`);
  return response.json() as Promise<any>;
}

export async function playwrightLogin(request: BrowserLoginRequest) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: request.ignoreHTTPSErrors });
  try {
    const page = await context.newPage();
    await page.goto(request.loginUrl, { waitUntil: "domcontentloaded" });
    await page.locator("#username").fill(request.username);
    await page.locator("#passwordInput").fill(request.password);
    const preSubmitUrl = page.url();
    const applicationOrigin = new URL(request.loginUrl).origin;
    const otp = page.locator("#otp");
    const postLoginNavigation = page.waitForURL(
      (url) => url.href !== preSubmitUrl && url.origin === applicationOrigin,
      { waitUntil: "domcontentloaded", timeout: 15_000 }
    );
    const otpChallenge = otp.waitFor({ state: "visible", timeout: 15_000 }).then(async () => {
      if (isOtpChallenge(page.url(), request.loginUrl, true)) {
        await otp.fill(await request.getOtp());
        await otp.press("Enter");
      }
      await postLoginNavigation;
    });
    await page.locator("#passwordInput").press("Enter");
    await Promise.race([
      postLoginNavigation,
      otpChallenge
    ]);
    await context.storageState({ path: request.statePath });
  } finally {
    await context.close();
    await browser.close();
  }
}

export async function runPlaywrightLoginBroker(accountId: string, dependencies: BrokerDependencies) {
  const writeError = dependencies.writeError ?? ((value: string) => process.stderr.write(value));
  const secrets: string[] = [];
  try {
    if (!dependencies.identity) throw new Error("TEST_ACCESS_IDENTITY or --identity is required");
    if (!accountId) throw new Error("playwright-login requires an account id");
    const token = dependencies.readKeychainToken(dependencies.identity);
    if (!token) throw new Error(`Keychain token missing for identity ${dependencies.identity}`);
    secrets.push(token);

    const baseUrl = dependencies.baseUrl.replace(/\/$/, "");
    const scope = accountScope(accountId);
    const query = new URLSearchParams(scope);
    const records = await jsonRequest(dependencies.fetch, `${baseUrl}/accounts?${query}`, token) as AccountMetadata[];
    const account = records.find((candidate) => candidate.id === accountId);
    if (!account) throw new Error("account not found in the identity scope");

    const encoded = encodeURIComponent(accountId);
    const secretResponse = await jsonRequest(dependencies.fetch, `${baseUrl}/accounts/${encoded}/secret`, token);
    const password = String(secretResponse.secret ?? "");
    if (!password) throw new Error("account secret is empty");
    secrets.push(password);

    const stateRoot = dependencies.stateRoot ?? join(tmpdir(), "dreambau-test-access");
    await mkdir(stateRoot, { recursive: true, mode: 0o700 });
    await chmod(stateRoot, 0o700);
    const stateDirectory = await mkdtemp(join(stateRoot, "session-"));
    await chmod(stateDirectory, 0o700);
    const statePath = join(stateDirectory, "storage-state.json");
    const getOtp = async () => {
      const otpResponse = await jsonRequest(dependencies.fetch, `${baseUrl}/accounts/${encoded}/otp`, token);
      const code = String(otpResponse.code ?? "");
      if (!code) throw new Error("OTP is empty");
      secrets.push(code);
      return code;
    };

    await (dependencies.login ?? playwrightLogin)({
      username: account.username,
      password,
      loginUrl: account.loginUrl,
      statePath,
      ignoreHTTPSErrors: account.environment === "local" || account.environment === "pre-dev",
      getOtp
    });
    await chmod(statePath, 0o600);
    (dependencies.scheduleCleanup ?? scheduleCleanup)(stateDirectory, STATE_TTL_MS);

    const now = dependencies.now?.() ?? new Date();
    dependencies.write(`${JSON.stringify({
      accountId,
      storageState: statePath,
      expiresAt: new Date(now.getTime() + STATE_TTL_MS).toISOString()
    })}\n`);
    return 0;
  } catch (error) {
    writeError(`${redact(error, secrets)}\n`);
    return 1;
  }
}
