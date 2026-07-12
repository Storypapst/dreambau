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
}

export function loadConfig(): RuntimeConfig {
  return {
    passwordHash: fromFileOrEnv("password-hash", "TESTMAILS_PASSWORD_HASH"),
    sessionSecret: fromFileOrEnv("session-secret", "TESTMAILS_SESSION_SECRET"),
    accountsPath: process.env.TESTMAILS_ACCOUNTS_PATH ?? "/run/secrets/testmails/accounts.json",
    databasePath: process.env.TESTMAILS_DATABASE_PATH ?? "/data/testmails.sqlite",
    exportPath: process.env.TESTMAILS_EXPORT_PATH ?? "/data/export/testmails.md",
    machineIdentitiesPath: process.env.TEST_ACCESS_IDENTITIES_PATH ?? "/run/secrets/test-access/machine-identities.json",
    secureCookies: process.env.NODE_ENV !== "test"
  };
}
