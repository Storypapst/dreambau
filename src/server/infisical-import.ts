import { createHash } from "node:crypto";
import { z } from "zod";
import { testAccessRecordSchema, type TestAccessRecord, type TestProject } from "./infisical-provider.js";

export type ImportFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

interface ImportOptions {
  baseUrl: string;
  accessToken: string;
  projectIds: Record<TestProject, string>;
  records: TestAccessRecord[];
  fetch?: ImportFetch;
}

export function secretNameForRecord(id: string) {
  return `RECORD_${createHash("sha256").update(id).digest("hex").slice(0, 24).toUpperCase()}`;
}

interface Batch {
  project: TestProject;
  environment: TestAccessRecord["environment"];
  records: TestAccessRecord[];
}

function batchesFor(records: TestAccessRecord[]) {
  const batches = new Map<string, Batch>();
  const ids = new Set<string>();
  for (const input of records) {
    const record = testAccessRecordSchema.parse(input);
    if (ids.has(record.id)) throw new Error("Duplicate test access record in import");
    ids.add(record.id);
    const key = `${record.project}:${record.environment}`;
    const batch = batches.get(key) ?? { project: record.project, environment: record.environment, records: [] };
    batch.records.push(record);
    batches.set(key, batch);
  }
  if (batches.size === 0) throw new Error("Test access import is empty");
  return [...batches.values()].sort((left, right) =>
    `${left.project}:${left.environment}`.localeCompare(`${right.project}:${right.environment}`));
}

export async function importTestAccessRecords(options: ImportOptions) {
  const baseUrl = new URL(options.baseUrl);
  if (baseUrl.protocol !== "https:") throw new Error("Infisical base URL must use HTTPS");
  if (!options.accessToken) throw new Error("A short-lived Infisical access token is required");
  const fetch = options.fetch ?? globalThis.fetch;
  const batches = batchesFor(options.records);
  const headers = { Authorization: `Bearer ${options.accessToken}` };

  for (const batch of batches) {
    const url = new URL("/api/v4/secrets", baseUrl.origin);
    url.search = new URLSearchParams({
      projectId: options.projectIds[batch.project],
      environment: batch.environment,
      secretPath: "/records",
      viewSecretValue: "false",
      recursive: "false",
      includePersonalOverrides: "false",
      expandSecretReferences: "false"
    }).toString();
    const response = await fetch(url, { headers });
    let existing: Set<string>;
    if (!response.ok) {
      if (response.status !== 404) throw new Error("Infisical import preflight failed");
      try {
        z.object({ error: z.literal("SecretPathNotFound") }).passthrough().parse(await response.json());
        existing = new Set();
      } catch {
        throw new Error("Infisical import preflight failed");
      }
    } else {
    try {
      const parsed = z.object({ secrets: z.array(z.object({ secretKey: z.string() }).passthrough()) }).passthrough().parse(await response.json());
      existing = new Set(parsed.secrets.map((secret) => secret.secretKey));
    } catch {
      throw new Error("Infisical import preflight returned an invalid response");
    }
    }
    if (batch.records.some((record) => existing.has(secretNameForRecord(record.id)))) {
      throw new Error("A test access record already exists; import will not overwrite it");
    }
  }

  for (const batch of batches) {
    const response = await fetch(new URL("/api/v4/secrets/batch", baseUrl.origin), {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: options.projectIds[batch.project],
        environment: batch.environment,
        secretPath: "/records",
        secrets: batch.records.map((record) => ({
          secretKey: secretNameForRecord(record.id),
          secretValue: JSON.stringify(record),
          secretComment: "Managed by Dreambau Test Access Hub import",
          skipMultilineEncoding: true
        }))
      })
    });
    if (!response.ok) throw new Error("Infisical record import failed");
  }

  return { imported: options.records.length, batches: batches.length };
}
