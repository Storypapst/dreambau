import { spawnSync } from "node:child_process";
import { runOrisoSeedImportCli } from "./oriso-seed-import.js";

async function readStdin() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function readKeychainToken() {
  const result = spawnSync(
    "security",
    ["find-generic-password", "-s", "dreambau-infisical-import", "-a", "admin-session", "-w"],
    { encoding: "utf8" }
  );
  return result.status === 0 ? result.stdout.trim() : "";
}

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required configuration: ${name}`);
  return value;
};

async function main() {
  try {
    process.exitCode = await runOrisoSeedImportCli(await readStdin(), {
      environment: required("TEST_ACCESS_ENVIRONMENT"),
      loginUrl: required("TEST_ACCESS_LOGIN_URL"),
      documentationUrl: required("TEST_ACCESS_DOCUMENTATION_URL"),
      responsiblePerson: process.env.TEST_ACCESS_RESPONSIBLE_PERSON ?? "ORISO QA",
      baseUrl: process.env.INFISICAL_BASE_URL ?? "https://secrets.dreambau.com",
      projectId: required("TEST_ACCESS_INFISICAL_ORISO_PROJECT_ID")
    }, {
      readKeychainToken,
      fetch,
      write: (value) => process.stdout.write(value),
      writeError: (value) => process.stderr.write(value)
    });
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "ORISO seed import failed"}.\n`);
    process.exitCode = 1;
  }
}

void main();
