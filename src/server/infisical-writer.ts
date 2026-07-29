import { z } from "zod";
import { secretNameForRecord } from "./infisical-import.js";
import {
  testAccessRecordSchema,
  type TestAccessRecord,
  type TestProject
} from "./infisical-provider.js";
import { assertTotpNotEnrolled } from "./totp-enrollment.js";

export type WriterFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface RegistryWriter {
  enrollTotp(
    expectedRecord: TestAccessRecord,
    totpSecret: string,
    updatedAt: string
  ): Promise<{ recordId: string; updatedAt: string }>;
}

interface WriterOptions {
  baseUrl: string;
  organizationSlug: string;
  clientId: string;
  clientSecret: string;
  projectIds: Record<TestProject, string>;
  fetch?: WriterFetch;
  now?: () => number;
}

const authResponseSchema = z.object({
  accessToken: z.string().min(1),
  expiresIn: z.number().positive(),
  accessTokenMaxTTL: z.number().positive(),
  tokenType: z.literal("Bearer")
});

const secretResponseSchema = z.object({
  secret: z.object({
    secretKey: z.string().min(1),
    secretValue: z.string()
  }).passthrough()
}).passthrough();

function normalizedBaseUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Infisical base URL must use HTTPS");
  return url.origin;
}

export function createInfisicalRegistryWriter(options: WriterOptions): RegistryWriter {
  const baseUrl = normalizedBaseUrl(options.baseUrl);
  const fetch = options.fetch ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  let cachedToken: { value: string; expiresAt: number } | null = null;
  let pendingToken: Promise<string> | null = null;
  const enrollmentLocks = new Map<string, Promise<unknown>>();
  const requestSignal = () => AbortSignal.timeout(15_000);

  async function authenticate() {
    const response = await fetch(`${baseUrl}/api/v1/auth/universal-auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: options.clientId,
        clientSecret: options.clientSecret,
        organizationSlug: options.organizationSlug
      }),
      signal: requestSignal()
    });
    if (!response.ok) throw new Error("Infisical TOTP authentication failed");
    try {
      const parsed = authResponseSchema.parse(await response.json());
      cachedToken = { value: parsed.accessToken, expiresAt: now() + parsed.expiresIn * 1000 };
      return cachedToken.value;
    } catch {
      throw new Error("Infisical TOTP authentication failed");
    }
  }

  async function accessToken() {
    if (cachedToken && cachedToken.expiresAt > now() + 30_000) return cachedToken.value;
    if (!pendingToken) pendingToken = authenticate().finally(() => { pendingToken = null; });
    return pendingToken;
  }

  async function serializeEnrollment<T>(recordId: string, operation: () => Promise<T>) {
    const previous = enrollmentLocks.get(recordId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    enrollmentLocks.set(recordId, current);
    try {
      return await current;
    } finally {
      if (enrollmentLocks.get(recordId) === current) enrollmentLocks.delete(recordId);
    }
  }

  return {
    async enrollTotp(expectedRecord, totpSecret, updatedAt) {
      const expected = testAccessRecordSchema.parse(expectedRecord);
      if (expected.kind !== "app-user" && expected.kind !== "admin") {
        throw new Error("Infisical TOTP record validation failed");
      }
      return serializeEnrollment(expected.id, async () => {
        const secretName = secretNameForRecord(expected.id);
        const query = new URLSearchParams({
          projectId: options.projectIds[expected.project],
          environment: expected.environment,
          secretPath: "/records",
          type: "shared",
          viewSecretValue: "true",
          expandSecretReferences: "false",
          includeImports: "false"
        });
        const url = new URL(`/api/v4/secrets/${secretName}`, baseUrl);
        url.search = query.toString();
        const headers = { Authorization: `Bearer ${await accessToken()}` };
        const response = await fetch(url, { headers, signal: requestSignal() });
        if (!response.ok) throw new Error("Infisical TOTP record lookup failed");
        let current: TestAccessRecord;
        try {
          const parsed = secretResponseSchema.parse(await response.json());
          if (parsed.secret.secretKey !== secretName) throw new Error("secret name mismatch");
          current = testAccessRecordSchema.parse(JSON.parse(parsed.secret.secretValue));
          if (
            current.id !== expected.id
            || current.project !== expected.project
            || current.environment !== expected.environment
            || (current.kind !== "app-user" && current.kind !== "admin")
          ) throw new Error("record scope mismatch");
        } catch {
          throw new Error("Infisical TOTP record validation failed");
        }
        assertTotpNotEnrolled(current);
        const updated = testAccessRecordSchema.parse({ ...current, totpSecret, updatedAt });
        const patchResponse = await fetch(new URL(`/api/v4/secrets/${secretName}`, baseUrl), {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/json" },
          signal: requestSignal(),
          body: JSON.stringify({
            projectId: options.projectIds[current.project],
            environment: current.environment,
            secretPath: "/records",
            secretValue: JSON.stringify(updated),
            skipMultilineEncoding: true,
            type: "shared",
            secretComment: "TOTP managed by Dreambau Test Access Hub"
          })
        });
        if (!patchResponse.ok) throw new Error("Infisical TOTP update failed");
        return { recordId: current.id, updatedAt };
      });
    }
  };
}
