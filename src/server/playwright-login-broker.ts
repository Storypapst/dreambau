import { chmod, lstat, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { resolveBrowserProxy, type BrowserProxy } from "./browser-proxy.js";
import { createMachineHttp, type MachineAuthOptions } from "./machine-http.js";
import { encodeOrisoUsername } from "./oriso-identity-observation.js";
import {
  loadApprovedPreDevMatrixDevice, PREDEV_ORISO_APP_ORIGIN, PreDevMatrixDeviceError
} from "./predev-matrix-device.js";

import type { BrowserContext, Locator, Page, Request as BrowserRequest, Response as BrowserResponse, Route } from "@playwright/test";

const STATE_TTL_MS = 15 * 60 * 1000;
const FIELD_TIMEOUT_MS = 20_000;
/**
 * How long a revealed OTP field may wait for the password-only navigation to
 * finish before it counts as a real challenge. Only bounds the stalled case:
 * the check races the navigation, so a normal login is not delayed.
 */
const OTP_CHALLENGE_GRACE_MS = 6_000;
const AUTH_STATE_TIMEOUT_MS = 10_000;
const TOTP_SAFETY_MARGIN_MS = 8_000;
const TEST_ACCESS_GATEWAY = "https://dreambau.com/testmails/api/v1";
const ORISO_APP_ORIGINS = { dev: "https://dev.oriso.org", "pre-dev": PREDEV_ORISO_APP_ORIGIN };
const ORISO_LOGIN_PATHS = ["/", "/login", "/login/"];
const ORISO_TOKEN_PATH = "/auth/realms/online-beratung/protocol/openid-connect/token";
const APP_TOTP = "app-totp";

class AppTotpVerificationError extends Error {}

type PreDevRole = "user" | "consultant";

interface AccountMetadata {
  id: string;
  project: string;
  environment: string;
  username: string;
  loginUrl: string;
  kind?: string;
  provisioningStatus?: string;
  roles?: string[];
}

export interface BrowserLoginRequest {
  proxy?: BrowserProxy;
  username: string;
  password: string;
  loginUrl: string;
  statePath: string;
  ignoreHTTPSErrors: boolean;
  requireAppTotp?: boolean;
  preDevRole?: PreDevRole;
  isolatePreDevMatrix?: boolean;
  getOtp: () => Promise<string>;
  requiredAuthState?: {
    cookieNames: string[];
    localStorageKeys: string[];
  };
  // ORISO unlocks encrypted chat history right after login, with the password
  // it only holds for that moment. Saving before that leaves a session whose
  // browser never unlocked and asks for a recovery key (ORISO-Frontend#1741).
  awaitChatUnlock?: ChatUnlockWait;
}

export interface ChatUnlockWait {
  appPath: RegExp;
  quietMs: number;
  maxMs: number;
}

export const ORISO_CHAT_UNLOCK_WAIT: ChatUnlockWait = {
  appPath: /^\/(app|sessions)(\/|$)/,
  quietMs: 4_000,
  maxMs: 45_000
};

// The counselling app keeps its session in `keycloak`. The Admin shares that
// host (/app next to /admin) and keeps its own httpOnly session in
// `oriso_admin_access_token` on /admin; Admins deployed before that rename
// still use `keycloak` there.
export const ORISO_REQUIRED_AUTH_STATE: NonNullable<BrowserLoginRequest["requiredAuthState"]> = {
  cookieNames: ["keycloak", "oriso_admin_access_token"],
  localStorageKeys: ["auth.keycloak"]
};

export interface BrokerDependencies extends MachineAuthOptions {
  browserProxyMode?: string;
  baseUrl: string;
  identity: string;
  readKeychainToken: (identity: string) => string;
  fetch: typeof fetch;
  requireAppTotp?: boolean | "pre-dev";
  preDevMatrixDevice?: string;
  preDevMatrixStateRoot?: string;
  login?: (request: BrowserLoginRequest) => Promise<void | typeof APP_TOTP>;
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
  const current = new URL(currentUrl);
  const login = new URL(loginUrl);
  const normalizePath = (value: string) => value.replace(/\/+$/, "") || "/";
  if (current.origin !== login.origin) return true;
  if (preSubmitUrl !== undefined && currentUrl === preSubmitUrl) return true;
  return normalizePath(current.pathname) === normalizePath(login.pathname)
    && /(?:^|\/)login\/?$/i.test(current.pathname);
}

async function jsonRequest(http: ReturnType<typeof createMachineHttp>, url: string, refuseRedirects = false) {
  const response = await http.fetch(url, refuseRedirects ? { redirect: "error" } : undefined);
  if (!response.ok) throw new Error(`Test Access API failed with HTTP ${response.status}`);
  return http.json(response) as Promise<any>;
}

export async function requestSafeOtpCode(
  request: () => Promise<{ accountId?: unknown; code?: unknown; source?: unknown; expiresAt?: unknown }>,
  options: {
    now?: () => number;
    sleep?: (milliseconds: number) => Promise<void>;
    requireTotpFor?: string;
  } = {}
) {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((milliseconds: number) => delay(milliseconds));
  let response = await request();
  const remainingMs = () => typeof response.expiresAt === "string" ? Date.parse(response.expiresAt) - now() : Number.NaN;
  const isBoundTotp = () => response.source === "totp" && response.accountId === options.requireTotpFor;
  if (options.requireTotpFor && !isBoundTotp()) {
    throw new AppTotpVerificationError("Test Access did not verify the TOTP source for this account");
  }
  const remaining = remainingMs();
  if (
    response.source === "totp"
    && remaining > 0
    && remaining < TOTP_SAFETY_MARGIN_MS
  ) {
    await sleep(Math.max(0, remaining) + 150);
    response = await request();
  }
  if (options.requireTotpFor && (!isBoundTotp() || !(remainingMs() >= TOTP_SAFETY_MARGIN_MS)
    || typeof response.code !== "string" || !/^\d{6}$/.test(response.code))) {
    throw new AppTotpVerificationError("Test Access did not return a fresh TOTP for this account");
  }
  const code = String(response.code ?? "");
  if (!code) throw new Error("OTP is empty");
  return code;
}

async function waitForRestorableAuthState(
  context: BrowserContext,
  applicationOrigin: string,
  requirement: NonNullable<BrowserLoginRequest["requiredAuthState"]>,
  timeoutMs = AUTH_STATE_TIMEOUT_MS
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const state = await context.storageState();
    const hasCookie = state.cookies.some(
      (cookie) =>
        requirement.cookieNames.includes(cookie.name) && cookie.value.length > 0
    );
    const applicationState = state.origins.find(
      (origin) => origin.origin === applicationOrigin
    );
    const hasLocalStorage = applicationState?.localStorage.some(
      (item) =>
        requirement.localStorageKeys.includes(item.name) && item.value.length > 0
    );

    if (hasCookie || hasLocalStorage) return;
    if (Date.now() >= deadline) {
      throw new Error(
        "login reached the application but no reusable authentication state was persisted"
      );
    }
    await delay(100);
  }
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
    page.getByPlaceholder(/one[- ]?time|otp|verification code|einmal|bestätigungscode/i),
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
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  shouldStop: () => boolean = () => false
): Promise<Locator> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (shouldStop()) throw new Error(`login form field "${field}" polling was cancelled`);
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
 * Activate a login submit control without holding on to a React-owned element
 * across a render. A failed click may mean the button was replaced after the
 * visibility probe, so resolve once more before falling back to Enter. Before
 * either retry, let the caller confirm that the first click did not already
 * start navigation or reveal the next authentication step.
 */
export async function activateLoginSubmit(
  candidates: () => Locator[],
  fallback: () => Promise<void>,
  transitionStarted: () => Promise<boolean>,
  timeoutMs = 2_000,
  sleep: (ms: number) => Promise<void> = (ms) => delay(ms),
  prepareRetry: () => Promise<void> = async () => {}
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const submit = await resolveVisible(candidates(), "submit", timeoutMs).catch(() => null);
    if (!submit) break;
    try {
      await submit.click({ timeout: timeoutMs });
      return;
    } catch {
      await sleep(100);
      if (await transitionStarted()) return;
      await prepareRetry();
      if (await transitionStarted()) return;
    }
  }
  await fallback();
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

/** Matrix calls other than the /sync long-poll, which is always in flight. */
const isUnlockRequest = (url: string) => {
  const path = new URL(url).pathname;
  return path.startsWith("/_matrix/client/") && !/\/sync$/.test(path);
};

/**
 * Watches the app's Matrix calls from the moment the page exists, so calls the
 * app starts right on entry are seen. Counts them until they finish or fail.
 * The listeners end with the page's context.
 */
function trackMatrixTraffic(page: Page) {
  const traffic = { inFlight: 0, lastActivity: 0 };
  const started = (request: { url: () => string }) => {
    if (!isUnlockRequest(request.url())) return;
    traffic.inFlight++;
    traffic.lastActivity = Date.now();
  };
  const ended = (request: { url: () => string }) => {
    if (!isUnlockRequest(request.url())) return;
    traffic.inFlight = Math.max(0, traffic.inFlight - 1);
    traffic.lastActivity = Date.now();
  };
  page.on("request", started);
  page.on("requestfinished", ended);
  page.on("requestfailed", ended);
  return traffic;
}

/**
 * Best effort and bounded: waits until the app's Matrix calls (key backup
 * restore, room keys) have finished and stayed quiet for a moment, or its
 * recovery notice shows. Never fails the login; a session that did not unlock
 * is still a session.
 */
async function waitForChatUnlock(
  page: Page,
  wait: ChatUnlockWait,
  traffic: { inFlight: number; lastActivity: number }
): Promise<void> {
  if (!wait.appPath.test(new URL(page.url()).pathname)) return;
  const started = Date.now();
  while (Date.now() - started < wait.maxMs) {
    const notice = await page.getByTestId("key-backup-recovery-action").isVisible().catch(() => false);
    if (notice) return;
    if (traffic.lastActivity && traffic.inFlight === 0 && Date.now() - traffic.lastActivity >= wait.quietMs) return;
    await delay(250);
  }
}

function readyPreDevRole(account: AccountMetadata): PreDevRole {
  if (account.kind === "app-user" && account.provisioningStatus === "ready"
    && typeof account.username === "string" && account.username.trim()
    && Array.isArray(account.roles) && account.roles.length === 1) {
    const [role] = account.roles;
    if (role === "consultant") return role;
    if (role === "asker" || role === "user") return "user";
  }
  throw new AppTotpVerificationError("The catalog account must be a ready Pre-Dev asker or consultant");
}

function isOrisoLoginPage(url: URL, origin: string) {
  return url.origin === origin && ORISO_LOGIN_PATHS.includes(url.pathname)
    && !url.username && !url.password && !url.search && !url.hash;
}

async function fillLoginField(field: Locator, value: string, privateOrigin?: string, timeout?: number) {
  if (!privateOrigin) return field.fill(value, { timeout });
  // A locator can resolve again after a redirect. Bind the write to the
  // checked document so navigation cannot move a credential into another page.
  const element = await field.elementHandle({ timeout: timeout ?? FIELD_TIMEOUT_MS });
  if (!element) throw new AppTotpVerificationError("The ORISO counselling app login field is missing");
  try {
    const approved = await element.evaluate((input, { origin, paths }) => {
      const url = new URL(input.ownerDocument.URL);
      return url.origin === origin && paths.includes(url.pathname) && !url.search && !url.hash;
    }, { origin: privateOrigin, paths: ORISO_LOGIN_PATHS });
    if (!approved) throw new AppTotpVerificationError("The ORISO counselling app login page changed before entering a credential");
    await element.fill(value, { timeout: timeout ?? FIELD_TIMEOUT_MS });
  } finally {
    await element.dispose();
  }
}

async function verifyAppTotp(
  page: Page,
  request: BrowserLoginRequest,
  origin: string,
  submitPassword: () => Promise<void>
) {
  const tokenUrl = new URL(ORISO_TOKEN_PATH, origin).href;
  const userDataUrl = new URL("/service/users/data", origin).href;
  const usernames = [request.username, encodeOrisoUsername(request.username)];
  const isMainFrameRequest = (request: BrowserRequest, url: string, method: string) => {
    return request.url() === url && request.method() === method && !request.redirectedFrom()
      && !request.serviceWorker() && request.frame() === page.mainFrame();
  };
  const passwordGrant = (response: BrowserResponse, expectedUsernames: string[]) => {
    const grant = response.request();
    if (!isMainFrameRequest(grant, tokenUrl, "POST")
      || grant.headers()["content-type"]?.split(";")[0].trim() !== "application/x-www-form-urlencoded") return null;
    const form = new URLSearchParams(grant.postData() ?? "");
    const fieldMatches = (name: string, expected: string) => form.getAll(name).length === 1 && form.get(name) === expected;
    if (!expectedUsernames.some((username) => fieldMatches("username", username))
      || !fieldMatches("password", request.password)
      || !fieldMatches("client_id", "app") || !fieldMatches("grant_type", "password")) return null;
    return form;
  };
  const [challenge] = await Promise.all([
    page.waitForResponse((response) => {
      // A 401 can trigger the app's own legacy username fallback.
      const grant = passwordGrant(response, usernames);
      return response.status() !== 401 && grant !== null && !grant.has("otp");
    }, { timeout: FIELD_TIMEOUT_MS }),
    submitPassword()
  ]);
  const challengeBody = challenge.status() === 400 ? await challenge.json().catch(() => null) : null;
  const challengedUsername = passwordGrant(challenge, usernames)?.get("username");
  if (challengeBody?.error !== "invalid_grant" || challengeBody.otpType !== "APP" || !challengedUsername) {
    throw new AppTotpVerificationError("The ORISO counselling app password grant did not require App-TOTP");
  }

  if (!isOrisoLoginPage(new URL(page.url()), origin)) {
    throw new AppTotpVerificationError("The ORISO counselling app login page changed before the App-TOTP challenge");
  }
  const otp = await resolveVisible(otpCandidates(page), "otp");
  const code = await request.getOtp();
  await fillLoginField(otp, code, origin);
  const submit = await resolveVisible(submitCandidates(page), "submit");
  let acceptedOtp = false;
  const verifyAcceptance = page.waitForResponse((response) => {
    const grant = passwordGrant(response, [challengedUsername]);
    return response.status() !== 401 && grant !== null && grant.has("otp");
  }, { timeout: FIELD_TIMEOUT_MS }).then(async (accepted) => {
    const sent = passwordGrant(accepted, [challengedUsername])?.getAll("otp");
    if (accepted.status() !== 200 || sent?.length !== 1 || sent[0] !== code) {
      throw new AppTotpVerificationError("The ORISO counselling app password grant did not accept the verified App-TOTP code");
    }
    acceptedOtp = true;
    // Read the body before navigation can discard it. Keep the readback listener active.
    const grantBody = await accepted.json().catch(() => null);
    return grantBody?.access_token;
  });
  // Observe the app's protected user-data call after the successful grant.
  // Its bearer must be the access token issued for this exact App-TOTP code.
  const readAuthenticatedToken = page.waitForResponse(
    (response) => acceptedOtp && isMainFrameRequest(response.request(), userDataUrl, "GET"),
    { timeout: FIELD_TIMEOUT_MS }
  ).then(async (response) => {
    const authorization = response.status() === 200
      ? (await response.request().allHeaders()).authorization
      : undefined;
    if (!authorization?.startsWith("Bearer ") || authorization.length <= 7) {
      throw new AppTotpVerificationError("The ORISO counselling app user-data read did not confirm the authenticated app session");
    }
    return authorization.slice(7);
  });
  // The app awaits this read before navigating. Hold it until the grant body
  // is available, then release only the original request with the issued token.
  const bindReadback = async (route: Route) => {
    const readback = route.request();
    if (!isMainFrameRequest(readback, userDataUrl, "GET")) {
      await route.fallback();
      return;
    }
    const issuedToken: unknown = await verifyAcceptance.catch(() => undefined);
    const authorization = (await readback.allHeaders()).authorization;
    if (typeof issuedToken !== "string" || !issuedToken || authorization !== `Bearer ${issuedToken}`) {
      await route.fulfill({ status: 403, json: {} });
      return;
    }
    if (request.isolatePreDevMatrix) await route.fallback();
    else await route.continue();
  };
  // The private context closes on every exit. Unrouting here could resume a
  // paused request before its bearer has been checked.
  await page.route(userDataUrl, bindReadback);
  const [issuedToken, token] = await Promise.all([
    verifyAcceptance,
    readAuthenticatedToken,
    submit.click({ timeout: FIELD_TIMEOUT_MS })
  ]);
  if (issuedToken !== token) {
    throw new AppTotpVerificationError("The ORISO counselling app authenticated readback did not use the accepted App-TOTP grant");
  }
  if (request.preDevRole) await verifyPreDevActor(page, userDataUrl, token, request.username, request.preDevRole);
  return token;
}

async function verifyPreDevActor(page: Page, userDataUrl: string, token: string, username: string, role: PreDevRole) {
  // The native user-data read already established that UserService accepts this bearer.
  // The independent role read reuses that same accepted grant.
  const response = await page.request.get(userDataUrl, {
    headers: { authorization: `Bearer ${token}` },
    maxRedirects: 0,
    maxRetries: 0,
    timeout: FIELD_TIMEOUT_MS
  }).catch(() => undefined);
  try {
    const data = response?.status() === 200 ? await response.json() : null;
    const parts = token.split(".");
    const subject = parts.length === 3
      ? JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"))?.sub : undefined;
    const authority = role === "consultant" ? "AUTHORIZATION_CONSULTANT_DEFAULT" : "AUTHORIZATION_USER_DEFAULT";
    if (typeof subject === "string" && subject && data?.userId === subject && typeof data.userName === "string"
      && (data.userName === username || data.userName === encodeOrisoUsername(username)
        || encodeOrisoUsername(data.userName) === username)
      && Array.isArray(data.userRoles) && data.userRoles.includes(role)
      && Array.isArray(data.grantedAuthorities) && data.grantedAuthorities.includes(authority)) return;
  } catch {
    // Only the verification outcome leaves the private broker.
  } finally {
    await response?.dispose();
  }
  throw new AppTotpVerificationError("The ORISO Pre-Dev user-data read did not confirm the catalogued account and role");
}

function isOrisoAppPage(url: URL, origin: string, preDevRole?: PreDevRole) {
  if (url.origin !== origin) return false;
  if (!preDevRole) return ORISO_CHAT_UNLOCK_WAIT.appPath.test(url.pathname);
  const rolePath = `/sessions/${preDevRole}`;
  return url.pathname === rolePath || url.pathname.startsWith(rolePath + "/");
}

async function saveVerifiedAppState(page: Page, request: BrowserLoginRequest, origin: string, token: string) {
  const state = await page.context().storageState({ indexedDB: Boolean(request.awaitChatUnlock) });
  const hostname = new URL(origin).hostname;
  const cookie = state.cookies.some((item) =>
    item.name === "keycloak" && item.domain === hostname && item.path === "/" && item.value === token);
  const fallback = state.origins.find((item) => item.origin === origin)?.localStorage
    .some((item) => item.name === "auth.keycloak" && item.value === token);
  if ((!cookie && !fallback) || !isOrisoAppPage(new URL(page.url()), origin, request.preDevRole)) {
    throw new AppTotpVerificationError("The verified ORISO App-TOTP session could not be restored");
  }
  await writeFile(request.statePath, JSON.stringify(state), { mode: 0o600, flag: "wx" });
}

const preDevLoginReads = new Set([
  "/config.js", "/manifest.json", "/favicon.ico", "/releases/releases.json", "/service/users/data",
  "/service/consultingtypes/basic", "/service/settings", "/service/topic/public", "/service/topic-groups"
]);

async function keepMatrixOfflineDuringLogin(page: Page, origin: string, role: PreDevRole) {
  const context = page.context();
  await context.routeWebSocket("**/*", socket => socket.close());
  await context.route("**/*", async route => {
    const deny = () => route.abort("blockedbyclient");
    try {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin || request.redirectedFrom() || request.frame() !== page.mainFrame()) {
        await deny();
        return;
      }
      const startup = preDevLoginReads.has(url.pathname) || /^\/(?:assets|static|locales)\//.test(url.pathname)
        || /^\/service\/tenant\/public\/(?:id\/[a-zA-Z0-9-]+)?$/.test(url.pathname);
      const document = isOrisoLoginPage(url, origin) || url.pathname === "/app" || url.pathname === "/app/"
        || isOrisoAppPage(url, origin, role);
      const read = request.method() === "GET" && (request.isNavigationRequest() ? document : startup);
      const grant = request.method() === "POST" && url.href === origin + ORISO_TOKEN_PATH
        && request.resourceType() === "fetch";
      if (!read && !grant) {
        await deny();
        return;
      }
      // Playwright only intercepts the first hop of a continued redirect.
      const response = await route.fetch({ maxRedirects: 0, maxRetries: 0, timeout: FIELD_TIMEOUT_MS });
      try {
        if (response.status() >= 300 && response.status() < 400) await deny();
        else await route.fulfill({ response });
      } finally {
        await response.dispose();
      }
    } catch {
      await deny().catch(() => {});
    }
  });
}

export async function playwrightLogin(request: BrowserLoginRequest) {
  if (request.isolatePreDevMatrix && (!request.requireAppTotp || !request.preDevRole)) {
    throw new PreDevMatrixDeviceError("Matrix device handoff requires the Pre-Dev App-TOTP login");
  }
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true, proxy: request.proxy });
  const context = await browser.newContext({
    ignoreHTTPSErrors: !request.requireAppTotp && request.ignoreHTTPSErrors,
    serviceWorkers: request.requireAppTotp ? "block" : undefined
  }).catch(async (error) => {
    await browser.close();
    throw error;
  });
  try {
    const page = await context.newPage();
    const applicationOrigin = new URL(request.loginUrl).origin;
    if (request.isolatePreDevMatrix && request.preDevRole) {
      await keepMatrixOfflineDuringLogin(page, applicationOrigin, request.preDevRole);
    }
    const matrix = request.awaitChatUnlock ? trackMatrixTraffic(page) : undefined;
    const failedResponses: string[] = [];
    let submissionMayHaveStarted = false;
    page.on("request", (request) => {
      // Do not refill after a potentially dispatched authentication request.
      // Admin's initial session teardown is not a credential submission.
      if (request.method() === "POST" && new URL(request.url()).pathname !== "/admin/auth/clear-token") {
        submissionMayHaveStarted = true;
      }
    });
    if (!request.requireAppTotp) {
      page.on("response", (response) => {
        if (response.status() >= 400) failedResponses.push(`${response.status()} ${new URL(response.url()).pathname}`);
      });
    }
    const privateOrigin = request.requireAppTotp ? applicationOrigin : undefined;
    await page.goto(request.loginUrl, { waitUntil: "domcontentloaded" });
    if (privateOrigin && !isOrisoLoginPage(new URL(page.url()), privateOrigin)) {
      throw new AppTotpVerificationError("The ORISO catalog login did not open the approved counselling app page");
    }
    const usernameField = await resolveVisible(usernameCandidates(page), "username");
    await fillLoginField(usernameField, request.username, privateOrigin);
    const passwordField = await resolveVisible(passwordCandidates(page), "password");
    await fillLoginField(passwordField, request.password, privateOrigin);

    const preSubmitUrl = page.url();
    const otpWasVisibleBeforeSubmit = (await Promise.all(
      otpCandidates(page).map((candidate) => candidate.first().isVisible().catch(() => false))
    )).some(Boolean);
    let recoveredFormReset = false;
    const loginTransitionStarted = async () => {
      if (submissionMayHaveStarted || page.url() !== preSubmitUrl) return true;
      if (otpWasVisibleBeforeSubmit) return false;
      for (const candidate of otpCandidates(page)) {
        if (await candidate.first().isVisible().catch(() => false)) return true;
      }
      return false;
    };
    const submitPassword = () => activateLoginSubmit(
      () => submitCandidates(page),
      () => passwordField.press("Enter"),
      loginTransitionStarted,
      2_000,
      undefined,
      async () => {
        if (recoveredFormReset || submissionMayHaveStarted || page.url() !== preSubmitUrl) return;
        const username = await resolveVisible(usernameCandidates(page), "username", 2_000);
        const password = await resolveVisible(passwordCandidates(page), "password", 2_000);
        // A late login-page mount can replace both filled fields while click
        // waits for actionability. Recover that reset once, before dispatch.
        if (await username.inputValue() || await password.inputValue()) return;
        if (await loginTransitionStarted()) return;
        recoveredFormReset = true;
        await fillLoginField(username, request.username, privateOrigin, 2_000);
        if (await loginTransitionStarted()) return;
        await fillLoginField(password, request.password, privateOrigin, 2_000);
      }
    );
    if (privateOrigin) {
      const token = await verifyAppTotp(page, request, privateOrigin, submitPassword);
      await page.waitForURL((url) => isOrisoAppPage(url, privateOrigin, request.preDevRole),
        { waitUntil: "domcontentloaded", timeout: FIELD_TIMEOUT_MS });
      if (request.awaitChatUnlock && matrix) await waitForChatUnlock(page, request.awaitChatUnlock, matrix);
      await saveVerifiedAppState(page, request, privateOrigin, token);
      return APP_TOTP;
    }

    const postLoginNavigation = page.waitForURL(
      (url) => url.href !== preSubmitUrl && url.origin === applicationOrigin,
      { waitUntil: "domcontentloaded", timeout: 15_000 }
    );
    // The ORISO admin reveals its second factor inline on the login screen
    // after the first submit, so the challenge is same-origin.
    let loginSettled = false;
    const otpChallenge = resolveVisible(
      otpCandidates(page),
      "otp",
      15_000,
      undefined,
      () => loginSettled
    ).then(async (otp) => {
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
        await activateLoginSubmit(
          () => submitCandidates(page),
          () => otp.press("Enter"),
          async () => page.url() !== preSubmitUrl
        );
      }
      await postLoginNavigation;
    });
    otpChallenge.catch(() => {});

    await submitPassword();

    try {
      await Promise.race([
        postLoginNavigation,
        otpChallenge
      ]);
    } catch (error) {
      loginSettled = true;
      // Secrets are stripped by the caller's redact(); surface where the login
      // actually stalled instead of a bare navigation timeout.
      const http = failedResponses.length ? ` | failed requests: ${failedResponses.slice(-5).join(", ")}` : "";
      throw new Error(`${error instanceof Error ? error.message : "login failed"} | ${await describeLoginFailure(page)}${http}`);
    }
    loginSettled = true;
    if (request.requiredAuthState) {
      await waitForRestorableAuthState(
        context,
        applicationOrigin,
        request.requiredAuthState
      );
    }
    if (request.awaitChatUnlock && matrix) await waitForChatUnlock(page, request.awaitChatUnlock, matrix);
    // IndexedDB carries the unlocked chat keys into the reused session.
    await context.storageState({ path: request.statePath, indexedDB: Boolean(request.awaitChatUnlock) });
  } finally {
    try {
      await context.close();
    } finally {
      await browser.close();
    }
  }
}

export async function runPlaywrightLoginBroker(accountId: string, dependencies: BrokerDependencies) {
  const writeError = dependencies.writeError ?? ((value: string) => process.stderr.write(value));
  const secrets: string[] = [];
  const preDevAppTotp = dependencies.requireAppTotp === "pre-dev";
  const requireAppTotp = preDevAppTotp || dependencies.requireAppTotp === true;
  const selectedDevice = dependencies.preDevMatrixDevice;
  const totpEnvironment = preDevAppTotp ? "pre-dev" : "dev";
  let stateDirectory: string | undefined;
  try {
    if (!dependencies.identity) throw new Error("TEST_ACCESS_IDENTITY or --identity is required");
    if (!accountId) throw new Error("playwright-login requires an account id");
    if (selectedDevice !== undefined && (!preDevAppTotp || process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0")) {
      throw new PreDevMatrixDeviceError("Matrix device handoff requires the strict Pre-Dev App-TOTP login and TLS");
    }
    const baseUrl = dependencies.baseUrl.replace(/\/$/, "");
    const scope = accountScope(accountId);
    if (requireAppTotp) {
      if (scope.project !== "oriso" || scope.environment !== totpEnvironment
        || !/^oriso\/[^/]+\/[^/]+$/.test(accountId) || baseUrl !== TEST_ACCESS_GATEWAY) {
        throw new AppTotpVerificationError(`App-TOTP verification requires a scoped ORISO ${totpEnvironment} account and the Test Access gateway`);
      }
      if (process.env.DEBUG || process.env.PWDEBUG || process.env.NODE_DEBUG) {
        throw new AppTotpVerificationError("Disable browser and network debugging for App-TOTP verification");
      }
    }
    const http = createMachineHttp({ ...dependencies, service: "test-access" });
    if (http.token) secrets.push(http.token);
    const proxy = resolveBrowserProxy(dependencies.browserProxyMode, dependencies.proxyUrl, http.authMode === "network-proxy");

    const query = new URLSearchParams(scope);
    const records = await jsonRequest(http, `${baseUrl}/accounts?${query}`, requireAppTotp) as AccountMetadata[];
    const account = records.find((candidate) => candidate.id === accountId);
    if (!account) throw new Error("account not found in the identity scope");
    if (requireAppTotp && (account.project !== scope.project || account.environment !== scope.environment
      || !isOrisoLoginPage(new URL(account.loginUrl), ORISO_APP_ORIGINS[totpEnvironment]))) {
      throw new AppTotpVerificationError("The catalog account does not use the canonical ORISO counselling app for this environment");
    }
    if (preDevAppTotp && records.filter((candidate) => candidate.id === accountId).length !== 1) {
      throw new AppTotpVerificationError("The Test Access catalog did not identify a unique Pre-Dev account");
    }
    const preDevRole = preDevAppTotp ? readyPreDevRole(account) : undefined;
    secrets.push(account.username);
    const handoff = selectedDevice === undefined ? undefined : await loadApprovedPreDevMatrixDevice({
      root: dependencies.preDevMatrixStateRoot, accountId, deviceId: selectedDevice,
      now: (dependencies.now?.() ?? new Date()).getTime(), fetch: dependencies.fetch
    });

    const encoded = encodeURIComponent(accountId);
    const secretResponse = await jsonRequest(http, `${baseUrl}/accounts/${encoded}/secret`, requireAppTotp);
    if (requireAppTotp && secretResponse.id !== accountId) {
      throw new AppTotpVerificationError("Test Access did not return the requested account credential");
    }
    const password = String(secretResponse.secret ?? "");
    if (!password) throw new Error("account secret is empty");
    secrets.push(password);

    const stateRoot = dependencies.stateRoot ?? join(tmpdir(), "dreambau-test-access");
    await mkdir(stateRoot, { recursive: true, mode: 0o700 });
    if (requireAppTotp) {
      const root = await lstat(stateRoot);
      if (!root.isDirectory() || root.uid !== process.getuid?.()) {
        throw new AppTotpVerificationError("The private browser session directory is not owned by this runner");
      }
    }
    await chmod(stateRoot, 0o700);
    stateDirectory = await mkdtemp(join(stateRoot, "session-"));
    await chmod(stateDirectory, 0o700);
    const statePath = join(stateDirectory, "storage-state.json");
    const getOtp = async () => {
      const otpUrl = `${baseUrl}/accounts/${encoded}/otp${requireAppTotp ? "?source=totp" : ""}`;
      const code = await requestSafeOtpCode(
        () => jsonRequest(http, otpUrl, requireAppTotp).catch((error) => {
          if (!requireAppTotp) throw error;
          throw new AppTotpVerificationError("Test Access did not supply an App-TOTP code for this account");
        }),
        {
          now: () => (dependencies.now?.() ?? new Date()).getTime(),
          requireTotpFor: requireAppTotp ? accountId : undefined
        }
      );
      secrets.push(code);
      return code;
    };

    const factor = await (dependencies.login ?? playwrightLogin)({
      proxy,
      username: account.username,
      password,
      loginUrl: account.loginUrl,
      statePath,
      ignoreHTTPSErrors: !requireAppTotp && (account.environment === "local" || account.environment === "pre-dev"),
      ...(requireAppTotp ? { requireAppTotp } : {}),
      ...(preDevRole ? { preDevRole } : {}),
      getOtp,
      requiredAuthState: account.project === "oriso" ? ORISO_REQUIRED_AUTH_STATE : undefined,
      awaitChatUnlock: account.project === "oriso" && !handoff ? ORISO_CHAT_UNLOCK_WAIT : undefined,
      ...(handoff ? { isolatePreDevMatrix: true } : {})
    });
    if (requireAppTotp && factor !== APP_TOTP) {
      throw new AppTotpVerificationError("The browser did not verify App-TOTP");
    }
    await handoff?.(statePath, (dependencies.now?.() ?? new Date()).getTime());
    await chmod(statePath, 0o600);
    (dependencies.scheduleCleanup ?? scheduleCleanup)(stateDirectory, STATE_TTL_MS);

    const now = dependencies.now?.() ?? new Date();
    dependencies.write(`${JSON.stringify({
      accountId,
      storageState: statePath,
      expiresAt: new Date(now.getTime() + STATE_TTL_MS).toISOString(),
      ...(requireAppTotp ? { secondFactor: factor } : {})
    })}\n`);
    return 0;
  } catch (error) {
    if (requireAppTotp || selectedDevice !== undefined) {
      if (stateDirectory) await rm(stateDirectory, { recursive: true, force: true }).catch(() => {});
      const message = error instanceof AppTotpVerificationError || error instanceof PreDevMatrixDeviceError
        ? error.message : "The ORISO App-TOTP login could not be verified";
      writeError(`${message}\n`);
    } else {
      writeError(`${redact(error, secrets)}\n`);
    }
    return 1;
  }
}
