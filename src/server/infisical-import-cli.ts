import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { importTestAccessRecords } from "./infisical-import.js";
import { testAccessRecordSchema, type TestProject } from "./infisical-provider.js";

interface ImportCliDependencies {
  readKeychainToken: () => string;
  fetch: typeof fetch;
  write: (value: string) => void;
  writeError?: (value: string) => void;
  baseUrl: string;
  projectIds: Record<TestProject, string>;
}

export async function runInfisicalImportCli(rawInput: string, dependencies: ImportCliDependencies) {
  const writeError = dependencies.writeError ?? ((value: string) => process.stderr.write(value));
  let records: z.infer<typeof testAccessRecordSchema>[];
  try {
    records = z.array(testAccessRecordSchema).min(1).parse(JSON.parse(rawInput));
  } catch {
    writeError("Test access import failed validation.\n");
    return 1;
  }
  try {
    const accessToken = dependencies.readKeychainToken();
    if (!accessToken) throw new Error("Infisical import token is missing from Keychain");
    const result = await importTestAccessRecords({
      baseUrl: dependencies.baseUrl,
      accessToken,
      projectIds: dependencies.projectIds,
      records,
      fetch: dependencies.fetch
    });
    dependencies.write(`Imported ${result.imported} ${result.imported === 1 ? "record" : "records"} in ${result.batches} ${result.batches === 1 ? "batch" : "batches"}.\n`);
    return 0;
  } catch (error) {
    writeError(`${error instanceof Error ? error.message : "Test access import failed"}.\n`);
    return 1;
  }
}

function readKeychainToken() {
  const result = spawnSync(
    "security",
    ["find-generic-password", "-s", "dreambau-infisical-import", "-a", "admin-session", "-w"],
    { encoding: "utf8" }
  );
  return result.status === 0 ? result.stdout.trim() : "";
}

async function readStdin() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const projectIds = {
    oriso: process.env.TEST_ACCESS_INFISICAL_ORISO_PROJECT_ID ?? "",
    orimo: process.env.TEST_ACCESS_INFISICAL_ORIMO_PROJECT_ID ?? "",
    dreambau: process.env.TEST_ACCESS_INFISICAL_DREAMBAU_PROJECT_ID ?? ""
  };
  if (Object.values(projectIds).some((value) => !value)) {
    process.stderr.write("All three Infisical project IDs are required.\n");
    process.exitCode = 1;
    return;
  }
  process.exitCode = await runInfisicalImportCli(await readStdin(), {
    readKeychainToken,
    fetch,
    write: (value) => process.stdout.write(value),
    baseUrl: process.env.INFISICAL_BASE_URL ?? "https://secrets.dreambau.com",
    projectIds
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
