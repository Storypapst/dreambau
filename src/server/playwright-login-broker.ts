import { chmod, mkdir, mkdtemp } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import type { Locator, Page } from "@playwright/test";

const STATE_TTL_MS = 15 * 60 * 1000;
const FIELD_TIMEOUT_MS = 20_000;
/**
 * How long a revealed OTP field may wait for the password-only navigation to
 * finish before it counts as a real challenge. Only bounds the stalled case:
 * the check races the navigation, so a normal login is not delayed.
 */
const OTP_CHALLENGE_GRACE_MS = 6_000;

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

/**
 * A visible OTP field is a real challenge when the identity provider took over
 * (different origin), or when the login screen itself revealed a second factor
 * inline and we have therefore not navigated away yet. Passing `preSubmitUrl`
 * keeps the original guard intact: an application element merely *named* otp on
 * a post-login page is still not treated as a challenge.
 */
export function isOtpChallenge(
  currentUrl: string,
  loginUrl: string,
  otpVisible: boolean,
  preSubmitUrl?: string
) {
  if (!otpVisible) return false;
  if (new URL(currentUrl).origin !== new URL(loginUrl).origin) return true;
  return preSubmitUrl !== undefined && currentUrl === preSubmitUrl;
}

async function jsonRequest(fetchImpl: typeof fetch, url: string, token: string) {
  const response = await fetchImpl(url, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Test Access API failed with HTTP ${response.status}`);
  return response.json() as Promise<any>;
}

// The ORISO admin login renders through React and no longer emits the legacy
// element ids. Resolve each field semantically first and keep the historical
// ids as fallbacks so older login screens keep working.
export function usernameCandidates(page: Page): Locator[] {
  return [
    page.locator("input[autocomplete='username']"),
    page.getByRole("textbox", { name: /username|e-?mail/i }),
    page.getByPlaceholder(/username\s*\/?\s*e-?mail/i),
    page.locator("#username"),
    page.locator("input[name='username']"),
    // Last resort: the only visible free-text field that is not a search box.
    page.locator(
      "input[type='text']:not([name*='search' i]):not([placeholder*='search' i]):not([aria-label*='search' i]), " +
      "input:not([type]):not([name*='search' i]):not([placeholder*='search' i]):not([aria-label*='search' i])"
    )
  ];
}

export function passwordCandidates(page: Page): Locator[] {
  return [
    page.locator("input[autocomplete='current-password']"),
    page.getByPlaceholder(/^password$|passwort/i),
    page.locator("#passwordInput"),
    page.locator("#password"),
    page.locator("input[type='password']")
  ];
}

export function submitCandidates(page: Page): Locator[] {
  return [
    page.getByRole("button", { name: /sign in|log ?in|anmelden|einloggen/i }),
    page.locator("button[type='submit']"),
    page.locator("input[type='submit']")
  ];
}

export function otpCandidates(page: Page): Locator[] {
  return [
    page.locator("input[autocomplete='one-time-code']"),
    page.getByRole("textbox", { name: /one[- ]?time|otp|verification code|einmal|bestätigungscode/i }),
    page.locator("#otp"),
    page.locator("input[name='otp']")
  ];
}

/**
 * Return the first candidate that is actually visible on the page, polling
 * until the deadline so a client-rendered form has time to mount.
 */
export async function resolveVisible(
  candidates: Locator[],
  field: string,
  timeoutMs = FIELD_TIMEOUT_MS,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
): Promise<Locator> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    for (const candidate of candidates) {
      const first = candidate.first();
      if (await first.isVisible().catch(() => false)) return first;
    }
    if (Date.now() >= deadline) {
      throw new Error(`login form field "${field}" was not found with any known selector`);
    }
    await sleep(250);
  }
}

/**
 * Describe where a login stalled: the current URL plus any visible alert text.
 * Never includes field values, so it is safe to log.
 */
export async function describeLoginFailure(page: Page): Promise<string> {
  try {
    const url = page.url();
    const alerts = await page
      .locator("[role='alert'], .ant-message-error, .ant-form-item-explain-error, [class*='error' i]")
      .allInnerTexts()
      .catch(() => [] as string[]);
    const message = alerts.map((text) => text.trim()).filter(Boolean).slice(0, 3).join(" / ");
    const body = await page.locator("body").innerText().catch(() => "");
    const visible = body.replace(/\s+/g, " ").trim().slice(0, 300);
    return `stalled at ${url}${message ? ` | page said: ${message.slice(0, 300)}` : " | no visible error message"}`
      + `${visible ? ` | body: ${visible}` : ""}`;
  } catch {
    return "stalled before the page could be inspected";
  }
}

export async function playwrightLogin(request: BrowserLoginRequest) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: request.ignoreHTTPSErrors });
  try {
    const page = await context.newPage();
    const failedResponses: string[] = [];
    page.on("response", (response) => {
      if (response.status() >= 400) failedResponses.push(`${response.status()} ${new URL(response.url()).pathname}`);
    });
    await page.goto(request.loginUrl, { waitUntil: "domcontentloaded" });

    const usernameField = await resolveVisible(usernameCandidates(page), "username");
    await usernameField.fill(request.username);
    const passwordField = await resolveVisible(passwordCandidates(page), "password");
    await passwordField.fill(request.password);

    const preSubmitUrl = page.url();
    const applicationOrigin = new URL(request.loginUrl).origin;
    const postLoginNavigation = page.waitForURL(
      (url) => url.href !== preSubmitUrl && url.origin === applicationOrigin,
      { waitUntil: "domcontentloaded", timeout: 15_000 }
    );
    // The ORISO admin reveals its second factor inline on the login screen
    // after the first submit, so the challenge is same-origin.
    const otpChallenge = resolveVisible(otpCandidates(page), "otp", 15_000).then(async (otp) => {
      // A revealed OTP field is not yet proof of a challenge: ORISO renders its
      // inline #otp input with a real bounding box on logins that need no second
      // factor. Let the password-only navigation settle first — racing it keeps
      // the common case fast, and the grace timer only bounds a genuine stall.
      await Promise.race([postLoginNavigation.catch(() => {}), delay(OTP_CHALLENGE_GRACE_MS)]);
      if (isOtpChallenge(page.url(), request.loginUrl, true, preSubmitUrl)) {
        let code: string;
        try {
          code = await request.getOtp();
        } catch {
          // This account has no OTP source (the hub answers 404 for records
          // without a TOTP secret or mailbox). Do not fail here: if the login
          // genuinely needs a second factor, the navigation below times out and
          // reports the visible stall, which is truthful. Failing on the lookup
          // would break every password-only login behind a phantom field.
          await postLoginNavigation;
          return;
        }
        await otp.fill(code);
        const otpSubmit = await resolveVisible(submitCandidates(page), "submit", 2_000).catch(() => null);
        if (otpSubmit) await otpSubmit.click();
        else await otp.press("Enter");
      }
      await postLoginNavigation;
    });
    otpChallenge.catch(() => {});

    const submit = await resolveVisible(submitCandidates(page), "submit", 2_000).catch(() => null);
    if (submit) await submit.click();
    else await passwordField.press("Enter");

    try {
      await Promise.race([
        postLoginNavigation,
        otpChallenge
      ]);
    } catch (error) {
      // Secrets are stripped by the caller's redact(); surface where the login
      // actually stalled instead of a bare navigation timeout.
      const http = failedResponses.length ? ` | failed requests: ${failedResponses.slice(-5).join(", ")}` : "";
      throw new Error(`${error instanceof Error ? error.message : "login failed"} | ${await describeLoginFailure(page)}${http}`);
    }
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
