import { readFileSync } from "node:fs";

function fromFileOrEnv(fileName: string, envName: string) {
  const path = process.env[`${envName}_FILE`];
  if (path) return readFileSync(path, "utf8").trim();
  return process.env[envName]?.trim() ?? "";
}

export interface RuntimeConfig {
  passwordHash: string;
  sessionSecret: string;
  accountsPath: string;
  databasePath: string;
  exportPath: string;
  machineIdentitiesPath: string;
  secureCookies: boolean;
  registryProvider: "file" | "infisical";
  infisical: {
    baseUrl: string;
    organizationSlug: string;
    clientId: string;
    clientSecret: string;
    projectIds: { oriso: string; orimo: string; dreambau: string };
  } | null;
}

function required(value: string, name: string) {
  if (!value) throw new Error(`${name} is required when TEST_ACCESS_PROVIDER=infisical`);
  return value;
}

export function loadConfig(): RuntimeConfig {
  const registryProvider = process.env.TEST_ACCESS_PROVIDER === "infisical" ? "infisical" : "file";
  const infisical = registryProvider === "infisical" ? {
    baseUrl: required(process.env.INFISICAL_BASE_URL?.trim() ?? "", "INFISICAL_BASE_URL"),
    organizationSlug: required(process.env.INFISICAL_ORGANIZATION_SLUG?.trim() ?? "", "INFISICAL_ORGANIZATION_SLUG"),
    clientId: required(fromFileOrEnv("client-id", "INFISICAL_CLIENT_ID"), "INFISICAL_CLIENT_ID"),
    clientSecret: required(fromFileOrEnv("client-secret", "INFISICAL_CLIENT_SECRET"), "INFISICAL_CLIENT_SECRET"),
    projectIds: {
      oriso: required(process.env.TEST_ACCESS_INFISICAL_ORISO_PROJECT_ID?.trim() ?? "", "TEST_ACCESS_INFISICAL_ORISO_PROJECT_ID"),
      orimo: required(process.env.TEST_ACCESS_INFISICAL_ORIMO_PROJECT_ID?.trim() ?? "", "TEST_ACCESS_INFISICAL_ORIMO_PROJECT_ID"),
      dreambau: required(process.env.TEST_ACCESS_INFISICAL_DREAMBAU_PROJECT_ID?.trim() ?? "", "TEST_ACCESS_INFISICAL_DREAMBAU_PROJECT_ID")
    }
  } : null;
  return {
    passwordHash: fromFileOrEnv("password-hash", "TESTMAILS_PASSWORD_HASH"),
    sessionSecret: fromFileOrEnv("session-secret", "TESTMAILS_SESSION_SECRET"),
    accountsPath: process.env.TESTMAILS_ACCOUNTS_PATH ?? "/run/secrets/testmails/accounts.json",
    databasePath: process.env.TESTMAILS_DATABASE_PATH ?? "/data/testmails.sqlite",
    exportPath: process.env.TESTMAILS_EXPORT_PATH ?? "/data/export/testmails.md",
    machineIdentitiesPath: process.env.TEST_ACCESS_IDENTITIES_PATH ?? "/run/secrets/test-access/machine-identities.json",
    secureCookies: process.env.NODE_ENV !== "test",
    registryProvider,
    infisical
  };
}
