import { z } from "zod";
import { testAccessRecordSchema, type TestAccessRecord } from "./infisical-provider.js";
import { importTestAccessRecords, type ImportFetch } from "./infisical-import.js";
import { parseSeedProfile } from "./seed-profile.js";

interface OrisoSeedImportOptions {
  environment: string;
  loginUrl: string;
  documentationUrl: string;
  responsiblePerson: string;
  now?: () => Date;
}

interface RunOrisoSeedImportOptions extends OrisoSeedImportOptions {
  baseUrl: string;
  projectId: string;
  accessToken: string;
  fetch: ImportFetch;
  write: (value: string) => void;
  writeError?: (value: string) => void;
}

type OrisoSeedImportCliConfig = Omit<RunOrisoSeedImportOptions, "accessToken" | "fetch" | "write" | "writeError">;

interface OrisoSeedImportCliDependencies {
  readKeychainToken: () => string;
  fetch: ImportFetch;
  write: (value: string) => void;
  writeError?: (value: string) => void;
}

const seedStoreSchema = z.object({
  users: z.array(z.object({
    username: z.string().min(1),
    password: z.string().min(1),
    role: z.string().min(1),
    env: z.string().min(1),
    tenant: z.string().min(1).optional()
  }).passthrough()),
  profile: z.object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    variables: z.record(z.string(), z.string())
  }).strict().optional()
}).strict().refine((store) => store.users.length > 0 || Boolean(store.profile), {
  message: "At least one ORISO seed user or profile is required"
});

export function convertOrisoSeedStore(rawInput: string, options: OrisoSeedImportOptions): TestAccessRecord[] {
  if (options.environment === "production") {
    throw new Error("Production test access imports are forbidden");
  }
  const environment = z.enum(["local", "pre-dev", "dev"]).parse(options.environment);
  const store = seedStoreSchema.parse(JSON.parse(rawInput));
  const normalizedSourceEnvironment = (value: string) => value === "predev" ? "pre-dev" : value;
  if (store.users.some((user) => normalizedSourceEnvironment(user.env) !== environment)) {
    throw new Error("Source and target environments do not match");
  }
  const timestamp = (options.now ?? (() => new Date()))().toISOString();
  const records = store.users.map((user) => testAccessRecordSchema.parse({
    id: `oriso/${environment}/${user.username}`,
    project: "oriso",
    environment,
    kind: "app-user",
    displayName: user.username,
    username: user.username,
    email: null,
    roles: [user.role],
    permissionsDescription: `ORISO ${environment} ${user.role}${user.tenant ? ` in tenant ${user.tenant}` : ""}`,
    loginUrl: options.loginUrl,
    secret: user.password,
    responsiblePerson: options.responsiblePerson,
    createdAt: timestamp,
    updatedAt: timestamp,
    expiresAt: null,
    shared: true,
    rotationStatus: "current",
    documentationUrl: options.documentationUrl
  }));
  if (store.profile) {
    const variables = parseSeedProfile(JSON.stringify(store.profile.variables));
    records.push(testAccessRecordSchema.parse({
      id: `oriso/${environment}/${store.profile.id}`,
      project: "oriso",
      environment,
      kind: "seed-profile",
      displayName: `ORISO ${environment} ${store.profile.id}`,
      username: store.profile.id,
      email: null,
      roles: ["e2e"],
      permissionsDescription: `References for the ORISO ${environment} E2E profile`,
      loginUrl: options.loginUrl,
      secret: JSON.stringify(variables),
      responsiblePerson: options.responsiblePerson,
      createdAt: timestamp,
      updatedAt: timestamp,
      expiresAt: null,
      shared: true,
      rotationStatus: "current",
      documentationUrl: options.documentationUrl
    }));
  }
  return records;
}

export async function runOrisoSeedImport(rawInput: string, options: RunOrisoSeedImportOptions) {
  const writeError = options.writeError ?? ((value: string) => process.stderr.write(value));
  try {
    const records = convertOrisoSeedStore(rawInput, options);
    const result = await importTestAccessRecords({
      baseUrl: options.baseUrl,
      accessToken: options.accessToken,
      projectIds: { oriso: options.projectId, orimo: "unused", dreambau: "unused" },
      records,
      fetch: options.fetch
    });
    options.write(`Imported ${result.imported} ORISO ${options.environment} test access ${result.imported === 1 ? "record" : "records"}.\n`);
    return 0;
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      writeError("ORISO seed import failed validation.\n");
    } else {
      writeError(`${error instanceof Error ? error.message : "ORISO seed import failed"}.\n`);
    }
    return 1;
  }
}

export async function runOrisoSeedImportCli(
  rawInput: string,
  config: OrisoSeedImportCliConfig,
  dependencies: OrisoSeedImportCliDependencies
) {
  return runOrisoSeedImport(rawInput, {
    ...config,
    accessToken: dependencies.readKeychainToken(),
    fetch: dependencies.fetch,
    write: dependencies.write,
    writeError: dependencies.writeError
  });
}
