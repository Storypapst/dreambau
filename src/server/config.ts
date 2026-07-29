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
  emailOtpHmacKey: string;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    username: string;
    password: string;
    fromAddress: string;
    fromName: string;
  } | null;
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
  const providerValue = process.env.TEST_ACCESS_PROVIDER?.trim() ?? "";
  if (providerValue && providerValue !== "file" && providerValue !== "infisical") {
    throw new Error("TEST_ACCESS_PROVIDER must be file or infisical");
  }
  const registryProvider: RuntimeConfig["registryProvider"] = providerValue === "infisical" ? "infisical" : "file";
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
  const smtpValues = {
    host: fromFileOrEnv("host", "TESTMAILS_SMTP_HOST"),
    port: fromFileOrEnv("port", "TESTMAILS_SMTP_PORT"),
    username: fromFileOrEnv("username", "TESTMAILS_SMTP_USERNAME"),
    password: fromFileOrEnv("password", "TESTMAILS_SMTP_PASSWORD"),
    fromAddress: fromFileOrEnv("from-address", "TESTMAILS_SMTP_FROM_ADDRESS")
  };
  const hasSmtpValue = Object.values(smtpValues).some(Boolean);
  if (hasSmtpValue && Object.values(smtpValues).some((value) => !value)) {
    throw new Error("Complete TESTMAILS_SMTP_* configuration is required when email OTP SMTP is enabled");
  }
  const smtpPort = hasSmtpValue ? Number(smtpValues.port) : 0;
  if (hasSmtpValue && (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535)) {
    throw new Error("TESTMAILS_SMTP_PORT must be a valid TCP port");
  }
  const smtp = hasSmtpValue ? {
    host: smtpValues.host,
    port: smtpPort,
    secure: process.env.TESTMAILS_SMTP_SECURE?.trim() === "true" || smtpPort === 465,
    username: smtpValues.username,
    password: smtpValues.password,
    fromAddress: smtpValues.fromAddress,
    fromName: process.env.TESTMAILS_SMTP_FROM_NAME?.trim() || "Dreambau Test Access"
  } : null;
  const emailOtpHmacKey = fromFileOrEnv("hmac-key", "TESTMAILS_EMAIL_OTP_HMAC_KEY");
  if (smtp && !emailOtpHmacKey) throw new Error("TESTMAILS_EMAIL_OTP_HMAC_KEY is required when email OTP SMTP is enabled");
  return {
    passwordHash: fromFileOrEnv("password-hash", "TESTMAILS_PASSWORD_HASH"),
    sessionSecret: fromFileOrEnv("session-secret", "TESTMAILS_SESSION_SECRET"),
    accountsPath: process.env.TESTMAILS_ACCOUNTS_PATH ?? "/run/secrets/testmails/accounts.json",
    databasePath: process.env.TESTMAILS_DATABASE_PATH ?? "/data/testmails.sqlite",
    exportPath: process.env.TESTMAILS_EXPORT_PATH ?? "/data/export/testmails.md",
    machineIdentitiesPath: process.env.TEST_ACCESS_IDENTITIES_PATH ?? "/run/secrets/test-access/machine-identities.json",
    secureCookies: process.env.NODE_ENV !== "test",
    emailOtpHmacKey,
    smtp,
    registryProvider,
    infisical
  };
}
