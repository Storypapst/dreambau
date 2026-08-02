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
  createRecord?(record: TestAccessRecord): Promise<{ recordId: string }>;
  updateRecord?(record: TestAccessRecord): Promise<{ recordId: string; updatedAt: string }>;
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

  async function postSecret(record: TestAccessRecord, headers: Record<string, string>) {
    return fetch(new URL(`/api/v4/secrets/${secretNameForRecord(record.id)}`, baseUrl), {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      signal: requestSignal(),
      body: JSON.stringify({
        projectId: options.projectIds[record.project],
        environment: record.environment,
        secretPath: "/records",
        secretValue: JSON.stringify(record),
        secretComment: "Provisioned by Dreambau Test Access Hub",
        skipMultilineEncoding: true,
        type: "shared"
      })
    });
  }

  return {
    async createRecord(input) {
      const record = testAccessRecordSchema.parse(input);
      if (record.kind !== "app-user" && record.kind !== "admin") {
        throw new Error("Infisical record creation only supports application records");
      }
      return serializeEnrollment(record.id, async () => {
        const headers = { Authorization: `Bearer ${await accessToken()}` };
        let response = await postSecret(record, headers);
        if (response.status === 404) {
          // The /records folder does not exist yet for this project/environment.
          const folderResponse = await fetch(new URL("/api/v2/folders", baseUrl), {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            signal: requestSignal(),
            body: JSON.stringify({
              projectId: options.projectIds[record.project],
              environment: record.environment,
              name: "records",
              path: "/",
              description: "Dreambau Test Access Hub records"
            })
          });
          if (!folderResponse.ok) throw new Error("Infisical records folder creation failed");
          response = await postSecret(record, headers);
        }
        if (!response.ok) throw new Error("Infisical record creation failed");
        return { recordId: record.id };
      });
    },
    async updateRecord(input) {
      const record = testAccessRecordSchema.parse(input);
      if (record.kind !== "app-user" && record.kind !== "admin") {
        throw new Error("Infisical record update only supports application records");
      }
      return serializeEnrollment(record.id, async () => {
        const secretName = secretNameForRecord(record.id);
        const query = new URLSearchParams({
          projectId: options.projectIds[record.project],
          environment: record.environment,
          secretPath: "/records",
          type: "shared",
          viewSecretValue: "true",
          expandSecretReferences: "false",
          includeImports: "false"
        });
        const lookupUrl = new URL(`/api/v4/secrets/${secretName}`, baseUrl);
        lookupUrl.search = query.toString();
        const headers = { Authorization: `Bearer ${await accessToken()}` };
        const currentResponse = await fetch(lookupUrl, { headers, signal: requestSignal() });
        if (!currentResponse.ok) throw new Error("Infisical record update lookup failed");
        let current: TestAccessRecord;
        try {
          const parsed = secretResponseSchema.parse(await currentResponse.json());
          if (parsed.secret.secretKey !== secretName) throw new Error("secret name mismatch");
          current = testAccessRecordSchema.parse(JSON.parse(parsed.secret.secretValue));
          if (
            current.id !== record.id
            || current.project !== record.project
            || current.environment !== record.environment
          ) throw new Error("record scope mismatch");
        } catch {
          throw new Error("Infisical record update validation failed");
        }
        // updateRecord owns the provisioning state only. Re-reading under the
        // per-record lock preserves concurrent metadata and TOTP enrollment.
        const updated = testAccessRecordSchema.parse({
          ...current,
          provisioningStatus: record.provisioningStatus,
          updatedAt: record.updatedAt,
          totpSecret: record.totpSecret ?? current.totpSecret
        });
        const response = await fetch(new URL(`/api/v4/secrets/${secretName}`, baseUrl), {
          method: "PATCH",
          headers: {
            ...headers,
            "Content-Type": "application/json"
          },
          signal: requestSignal(),
          body: JSON.stringify({
            projectId: options.projectIds[updated.project],
            environment: updated.environment,
            secretPath: "/records",
            secretValue: JSON.stringify(updated),
            skipMultilineEncoding: true,
            type: "shared",
            secretComment: "Provisioning state managed by Dreambau Test Access Hub"
          })
        });
        if (!response.ok) throw new Error("Infisical record update failed");
        return { recordId: updated.id, updatedAt: updated.updatedAt };
      });
    },
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
