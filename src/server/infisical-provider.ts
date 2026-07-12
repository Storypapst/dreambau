import { z } from "zod";

const projects = ["oriso", "orimo", "dreambau"] as const;
const environments = ["local", "pre-dev", "dev", "production-test"] as const;
const kinds = ["mailbox", "app-user", "admin", "api-token", "seed-profile"] as const;

export const testAccessRecordSchema = z.object({
  id: z.string().min(1),
  project: z.enum(projects),
  environment: z.enum(environments),
  kind: z.enum(kinds),
  displayName: z.string().min(1),
  username: z.string().min(1),
  email: z.string().email().nullable().optional(),
  roles: z.array(z.string().min(1)),
  permissionsDescription: z.string().min(1),
  loginUrl: z.string().url(),
  secret: z.string().min(1),
  totpSecret: z.string().min(1).optional(),
  responsiblePerson: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  expiresAt: z.string().datetime().nullable(),
  shared: z.boolean(),
  rotationStatus: z.enum(["current", "due", "expired", "unknown"]),
  documentationUrl: z.string().url()
}).strict();

export type TestAccessRecord = z.infer<typeof testAccessRecordSchema>;
export type TestProject = TestAccessRecord["project"];
export type TestEnvironment = TestAccessRecord["environment"];
export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface RegistryProvider {
  list(): Promise<TestAccessRecord[]>;
  get(id: string): Promise<TestAccessRecord | null>;
  health?(): Promise<void>;
}

interface Source {
  project: TestProject;
  projectId: string;
  environment: TestEnvironment;
}

interface InfisicalProviderOptions {
  baseUrl: string;
  organizationSlug: string;
  clientId: string;
  clientSecret: string;
  sources: Source[];
  fetch?: FetchLike;
  now?: () => number;
}

const authResponseSchema = z.object({
  accessToken: z.string().min(1),
  expiresIn: z.number().positive(),
  accessTokenMaxTTL: z.number().positive(),
  tokenType: z.literal("Bearer")
});

const secretsResponseSchema = z.object({
  secrets: z.array(z.object({
    secretKey: z.string().min(1),
    secretValue: z.string()
  }).passthrough()),
  imports: z.array(z.unknown()).optional()
});

function normalizedBaseUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Infisical base URL must use HTTPS");
  return url.origin;
}

export function createInfisicalRegistryProvider(options: InfisicalProviderOptions): RegistryProvider {
  const baseUrl = normalizedBaseUrl(options.baseUrl);
  const fetch = options.fetch ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  let cachedToken: { value: string; expiresAt: number } | null = null;
  let pendingToken: Promise<string> | null = null;
  if (options.sources.length === 0) throw new Error("At least one Infisical source is required");

  async function authenticate() {
    const response = await fetch(`${baseUrl}/api/v1/auth/universal-auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: options.clientId,
        clientSecret: options.clientSecret,
        organizationSlug: options.organizationSlug
      })
    });
    if (!response.ok) throw new Error("Infisical authentication failed");
    let parsed: z.infer<typeof authResponseSchema>;
    try {
      parsed = authResponseSchema.parse(await response.json());
    } catch {
      throw new Error("Infisical authentication returned an invalid response");
    }
    cachedToken = { value: parsed.accessToken, expiresAt: now() + parsed.expiresIn * 1000 };
    return cachedToken.value;
  }

  async function accessToken() {
    if (cachedToken && cachedToken.expiresAt > now() + 30_000) return cachedToken.value;
    if (!pendingToken) pendingToken = authenticate().finally(() => { pendingToken = null; });
    return pendingToken;
  }

  async function readSource(source: Source) {
    const url = new URL("/api/v4/secrets", baseUrl);
    url.search = new URLSearchParams({
      projectId: source.projectId,
      environment: source.environment,
      secretPath: "/records",
      recursive: "true",
      viewSecretValue: "true",
      expandSecretReferences: "false",
      includePersonalOverrides: "false"
    }).toString();
    const response = await fetch(url, { headers: { Authorization: `Bearer ${await accessToken()}` } });
    if (!response.ok) throw new Error("Infisical secret lookup failed");
    let parsed: z.infer<typeof secretsResponseSchema>;
    try {
      parsed = secretsResponseSchema.parse(await response.json());
    } catch {
      throw new Error("Infisical secret lookup returned an invalid response");
    }
    return parsed.secrets.map((secret) => {
      let record: TestAccessRecord;
      try {
        record = testAccessRecordSchema.parse(JSON.parse(secret.secretValue));
      } catch {
        throw new Error(`Invalid test access record: ${secret.secretKey}`);
      }
      if (record.project !== source.project || record.environment !== source.environment) {
        throw new Error(`Test access record scope mismatch: ${secret.secretKey}`);
      }
      return record;
    });
  }

  async function list() {
    const records = (await Promise.all(options.sources.map(readSource))).flat();
    const ids = new Set<string>();
    for (const record of records) {
      if (ids.has(record.id)) throw new Error(`Duplicate test access record: ${record.id}`);
      ids.add(record.id);
    }
    return records;
  }

  return {
    list,
    async get(id) {
      return (await list()).find((record) => record.id === id) ?? null;
    },
    async health() {
      const source = options.sources[0];
      const url = new URL("/api/v4/secrets", baseUrl);
      url.search = new URLSearchParams({
        projectId: source.projectId,
        environment: source.environment,
        secretPath: "/records",
        recursive: "false",
        viewSecretValue: "false",
        expandSecretReferences: "false",
        includePersonalOverrides: "false"
      }).toString();
      const response = await fetch(url, { headers: { Authorization: `Bearer ${await accessToken()}` } });
      if (!response.ok) throw new Error("Infisical readiness check failed");
    }
  };
}
