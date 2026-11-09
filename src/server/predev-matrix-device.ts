import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import type { BrowserContext } from "@playwright/test";
import { z } from "zod";

export const PREDEV_ORISO_APP_ORIGIN = "https://predev.oriso.org";
const maxStateBytes = 32 * 1024 * 1024;
const tokenReuseMarginMs = 120_000;
const matrixFields = [
  "matrix_access_token", "matrix_user_id", "matrix_device_id",
  "matrix_session_subject", "matrix_token_expires_at"
];
const seedSchema = z.strictObject({
  version: z.literal(1),
  accountId: z.string(),
  storageState: z.strictObject({
    cookies: z.tuple([]),
    origins: z.tuple([z.strictObject({
      origin: z.literal(PREDEV_ORISO_APP_ORIGIN),
      localStorage: z.array(z.strictObject({ name: z.string(), value: z.string() })),
      indexedDB: z.array(z.strictObject({
        name: z.string(),
        version: z.number().int().positive(),
        stores: z.array(z.looseObject({ name: z.string().min(1), records: z.array(z.unknown()) }))
      }))
    })])
  })
});
type MatrixOriginState = z.infer<typeof seedSchema>["storageState"]["origins"][number];
type BrowserState = Awaited<ReturnType<BrowserContext["storageState"]>>;

export class PreDevMatrixDeviceError extends Error {}

export function isPreDevMatrixDeviceId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9._=-]{1,255}$/.test(value);
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function readSeed(root: string, accountId: string, deviceId: string) {
  if (!isAbsolute(root) || await realpath(root) !== root) throw new Error();
  const directory = await lstat(root);
  if (!directory.isDirectory() || directory.uid !== process.getuid?.()
    || (directory.mode & 0o777) !== 0o700) throw new Error();
  const seedPath = join(root, hash(accountId + "\n" + deviceId) + ".json");
  const handle = await open(seedPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const file = await handle.stat();
    if (!file.isFile() || file.uid !== directory.uid || file.nlink !== 1
      || (file.mode & 0o777) !== 0o600 || file.size < 1 || file.size > maxStateBytes) throw new Error();
    const content = await handle.readFile("utf8");
    if (Buffer.byteLength(content) !== file.size) throw new Error();
    const seed = seedSchema.parse(JSON.parse(content));
    if (seed.accountId !== accountId) throw new Error();
    return seed.storageState.origins[0];
  } finally {
    await handle.close();
  }
}

function readDeviceFields(state: MatrixOriginState, deviceId: string, now: number) {
  const values = new Map(state.localStorage.map(({ name, value }) => [name, value]));
  const accessToken = values.get("matrix_access_token");
  const userId = values.get("matrix_user_id");
  const subject = values.get("matrix_session_subject");
  const expiresAt = Number(values.get("matrix_token_expires_at"));
  if (!accessToken || !/^[\x21-\x7e]{16,4096}$/.test(accessToken)
    || !userId || !/^@[^:\s\x00-\x1f]{1,180}:[^\s\x00-\x1f]{1,180}$/.test(userId)
    || !subject || !/^[A-Za-z0-9._-]{1,255}$/.test(subject)
    || values.get("matrix_device_id") !== deviceId
    || !Number.isSafeInteger(expiresAt) || expiresAt - now <= tokenReuseMarginMs
    || values.size !== state.localStorage.length) throw new Error();
  const deviceBinding = "matrix_device_id:" + userId;
  if ([...values].some(([name, value]) =>
    !matrixFields.includes(name) && (name !== deviceBinding || value !== deviceId))) throw new Error();

  // Match the Rust crypto store name used by ORISO Frontend for this exact pair.
  const prefix = "oriso-matrix-" + Buffer.from(userId).toString("hex") + "-" + Buffer.from(deviceId).toString("hex");
  const main = prefix + "::matrix-sdk-crypto";
  const databases = new Set(state.indexedDB.map(({ name }) => name));
  if (databases.size !== state.indexedDB.length
    || [...databases].some(name => name !== main && name !== main + "-meta")
    || !state.indexedDB.some(db => db.name === main && db.stores.some(store => store.records.length > 0))) throw new Error();
  return { accessToken, userId, subject, expiresAt };
}

async function verifyDevice(fetchImpl: typeof fetch, token: string, userId: string, deviceId: string) {
  // This token is scoped to Matrix. The authenticated Test Access transport is only for the Hub.
  const response = await fetchImpl(PREDEV_ORISO_APP_ORIGIN + "/_matrix/client/v3/account/whoami", {
    method: "GET", headers: { authorization: "Bearer " + token, accept: "application/json" },
    redirect: "error", signal: AbortSignal.timeout(8_000)
  });
  if (response.status !== 200 || response.redirected
    || !/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "") || !response.body) {
    await response.body?.cancel().catch(() => {});
    throw new Error();
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 16_384) throw new Error();
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (data?.user_id !== userId || data.device_id !== deviceId
    || (data.is_guest !== undefined && data.is_guest !== false)) throw new Error();
}

export async function loadApprovedPreDevMatrixDevice(options: {
  root: string | undefined; accountId: string; deviceId: string; now: number; fetch: typeof fetch
}) {
  const { root, accountId, deviceId, now, fetch } = options;
  try {
    if (!root || !isPreDevMatrixDeviceId(deviceId)) throw new Error();
    const state = await readSeed(root, accountId, deviceId);
    const { accessToken, userId, subject, expiresAt } = readDeviceFields(state, deviceId, now);
    const claimPath = join(root, hash("predev-matrix-handoff\n" + userId + "\n" + deviceId) + ".issued");
    const issued = () => new PreDevMatrixDeviceError("The approved Pre-Dev Matrix device was already issued");
    try {
      await lstat(claimPath);
      throw issued();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await verifyDevice(fetch, accessToken, userId, deviceId);

    return async (statePath: string, currentTime: number) => {
      const stateWithGrant = await readFreshAppState(statePath, subject);
      if (expiresAt - currentTime <= tokenReuseMarginMs) {
        throw new PreDevMatrixDeviceError("The approved Pre-Dev Matrix device token expired during login");
      }
      // Issuing two copies of mutable Olm/Megolm state can rewind a live device.
      // Reserve the pair before any recipient can open the merged browser state.
      let claim;
      try {
        claim = await open(claimPath, "wx", 0o600);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") throw issued();
        throw error;
      }
      try {
        await claim.writeFile("Pre-Dev Matrix device issued\n");
        await claim.sync();
      } finally {
        await claim.close();
      }
      const directory = await open(root, "r");
      try { await directory.sync(); } finally { await directory.close(); }

      const app = stateWithGrant.origins.find(item => item.origin === PREDEV_ORISO_APP_ORIGIN);
      const localStorage = (app?.localStorage ?? []).filter(item => !item.name.startsWith("matrix_"));
      const merged = {
        cookies: stateWithGrant.cookies.filter(cookie => cookie.domain === "predev.oriso.org"),
        origins: [{ ...state, localStorage: [...localStorage, ...state.localStorage] }]
      };
      const replacement = statePath + ".device";
      await writeFile(replacement, JSON.stringify(merged), { mode: 0o600, flag: "wx" });
      await rename(replacement, statePath);
    };
  } catch (error) {
    if (error instanceof PreDevMatrixDeviceError) throw error;
    throw new PreDevMatrixDeviceError("Test Access could not verify the approved Pre-Dev Matrix device");
  }
}

async function readFreshAppState(path: string, subject: string): Promise<BrowserState> {
  try {
    const state: BrowserState = JSON.parse(await readFile(path, "utf8"));
    const scopes = state.origins.filter(item => item.origin === PREDEV_ORISO_APP_ORIGIN);
    const cookies = state.cookies.filter(item =>
      item.domain === "predev.oriso.org" && item.name === "keycloak" && item.path === "/");
    const local = scopes.flatMap(item => item.localStorage.filter(entry => entry.name === "auth.keycloak"));
    const accepted = new Set([...cookies, ...local].map(item => item.value));
    const [token] = accepted;
    const parts = token?.split(".");
    if (scopes.length <= 1 && accepted.size === 1 && parts?.length === 3
      && JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"))?.sub === subject) return state;
  } catch {
    // The previously verified product grant must be restorable and bound to the seed.
  }
  throw new PreDevMatrixDeviceError("The approved Pre-Dev Matrix device does not belong to the verified product session");
}
