import { z } from "zod";
import type { RegistryProvider, TestAccessRecord } from "./infisical-provider.js";
import { generateCompatibleOrisoTotp } from "./totp.js";

export type ProvisioningFetch = (input: string | URL, init?: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  redirect?: "error";
}) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; body?: ReadableStream<Uint8Array> | null }>;

export type OrisoManagedAdminErrorCode = "admin_record_unavailable" | "oriso_authentication_failed";
export class OrisoManagedAdminError extends Error {
  constructor(readonly code: OrisoManagedAdminErrorCode) { super(code); this.name = "OrisoManagedAdminError"; }
}
export interface OrisoManagedAdminClientOptions {
  environment: "pre-dev" | "dev";
  apiBaseUrl: string;
  tokenUrl: string;
  clientId: string;
  adminRecordId: string;
  registryProvider: RegistryProvider;
  fetch?: ProvisioningFetch;
  now?: () => Date;
  redirect?: "error";
  admitRecord?: (record: TestAccessRecord) => boolean;
  error?: (code: OrisoManagedAdminErrorCode) => Error;
}
export function createOrisoManagedAdminClient(options: OrisoManagedAdminClientOptions) {
  for (const url of [options.apiBaseUrl, options.tokenUrl]) {
    if (new URL(url).protocol !== "https:") throw new Error("ORISO provisioning endpoints must use HTTPS");
  }
  const fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }));
  const now = options.now ?? (() => new Date());
  const error = options.error ?? ((code) => new OrisoManagedAdminError(code));
  const apiBaseUrl = options.apiBaseUrl.replace(/\/+$/, "");
  const requestSignal = () => AbortSignal.timeout(15_000);
  const tokenResponseSchema = z.object({ access_token: z.string().min(1), expires_in: z.number().positive() }).passthrough();
  let cachedToken: { value: string; expiresAt: number } | null = null;
  let pendingToken: Promise<string> | null = null;

  async function authenticate() {
    const record = await options.registryProvider.get(options.adminRecordId);
    if (!record || record.project !== "oriso" || record.environment !== options.environment
      || (options.admitRecord && !options.admitRecord(record))) {
      throw error("admin_record_unavailable");
    }
    const form = new URLSearchParams({
      client_id: options.clientId,
      grant_type: "password",
      username: record.username,
      password: record.secret
    });
    if (record.totpSecret) form.set("otp", generateCompatibleOrisoTotp(record.totpSecret, now()).code);
    const response = await fetch(options.tokenUrl, {
      method: "POST",
      ...(options.redirect ? { redirect: options.redirect } : {}),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: requestSignal()
    });
    if (!response.ok) throw error("oriso_authentication_failed");
    try {
      const parsed = tokenResponseSchema.parse(await response.json());
      cachedToken = { value: parsed.access_token, expiresAt: now().getTime() + parsed.expires_in * 1000 };
      return cachedToken.value;
    } catch {
      throw error("oriso_authentication_failed");
    }
  }

  async function accessToken() {
    if (cachedToken && cachedToken.expiresAt > now().getTime() + 30_000) return cachedToken.value;
    if (!pendingToken) pendingToken = authenticate().finally(() => { pendingToken = null; });
    return pendingToken;
  }

  async function authorizedJson(path: string, init?: { method?: string; body?: string; redirect?: "error" }, beforeSend?: () => void) {
    const token = await accessToken();
    beforeSend?.();
    const response = await fetch(`${apiBaseUrl}${path}`, {
      method: init?.method ?? "GET",
      ...(init?.redirect ? { redirect: init.redirect } : {}),
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {})
      },
      body: init?.body,
      signal: requestSignal()
    });
    return response;
  }

  return { request: authorizedJson };
}
