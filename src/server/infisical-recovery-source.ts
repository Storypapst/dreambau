import { pathToFileURL } from "node:url";
import { loadConfig } from "./config.js";
import {
  createInfisicalRegistryProvider,
  testAccessRecordSchema,
  type RegistryProvider,
  type TestEnvironment,
  type TestProject
} from "./infisical-provider.js";

export async function buildRegistryRecoveryPayload(
  provider: RegistryProvider,
  exportedAt = new Date().toISOString()
) {
  const records = testAccessRecordSchema.array().parse(await provider.list());
  if (new Set(records.map((record) => record.id)).size !== records.length) {
    throw new Error("Duplicate test access record in recovery export");
  }
  return {
    schemaVersion: 1,
    exportedAt,
    records
  };
}

function configuredRegistryProvider() {
  const config = loadConfig();
  if (config.registryProvider !== "infisical" || !config.infisical) {
    throw new Error("Infisical recovery source is not configured");
  }
  const environments: TestEnvironment[] = ["local", "pre-dev", "dev", "production-test"];
  const projects = Object.entries(config.infisical.projectIds) as Array<[TestProject, string]>;
  return createInfisicalRegistryProvider({
    baseUrl: config.infisical.baseUrl,
    organizationSlug: config.infisical.organizationSlug,
    clientId: config.infisical.clientId,
    clientSecret: config.infisical.clientSecret,
    sources: projects.flatMap(([project, projectId]) =>
      environments.map((environment) => ({ project, projectId, environment }))
    )
  });
}

async function main() {
  if (process.env.TEST_ACCESS_RECOVERY_STREAM !== "1") {
    throw new Error("Recovery stream requires an explicit execution guard");
  }
  const payload = await buildRegistryRecoveryPayload(configuredRegistryProvider());
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    process.stderr.write("Infisical recovery source failed\n");
    process.exitCode = 1;
  });
}
