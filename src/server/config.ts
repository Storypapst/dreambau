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
  orisoProvisioningTargets: Partial<Record<"pre-dev" | "dev", {
    apiBaseUrl: string;
    tokenUrl: string;
    clientId: string;
    adminRecordId: string;
    adminBaseUrl: string;
    appBaseUrl: string;
    defaultTenantId: number;
    defaultAgencyId: number;
    defaultConsultingType: string;
    defaultPostcode: string;
    defaultMainTopicId: number;
    resolveIp: string | null;
    caFile: string | null;
  }>>;
  registryProvider: "file" | "infisical";
  infisical: {
    baseUrl: string;
    organizationSlug: string;
    clientId: string;
    clientSecret: string;
    writer: { clientId: string; clientSecret: string } | null;
    projectIds: { oriso: string; orimo: string; dreambau: string };
  } | null;
}

function required(value: string, name: string) {
  if (!value) throw new Error(`${name} is required when TEST_ACCESS_PROVIDER=infisical`);
  return value;
}

function positiveInteger(value: string | undefined, fallback: number, name: string) {
  const parsed = Number(value?.trim() || fallback);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function orisoProvisioningTarget(
  environment: "pre-dev" | "dev",
  defaults: {
    apiBaseUrl: string;
    tokenUrl: string;
    adminBaseUrl: string;
    appBaseUrl: string;
  }
): RuntimeConfig["orisoProvisioningTargets"]["pre-dev"] | undefined {
  const prefix = environment === "pre-dev" ? "ORISO_PREDEV" : "ORISO_DEV";
  const adminRecordId = process.env[`${prefix}_ADMIN_RECORD_ID`]?.trim() ?? "";
  if (!adminRecordId) return undefined;
  return {
    apiBaseUrl: process.env[`${prefix}_API_BASE_URL`]?.trim() || defaults.apiBaseUrl,
    tokenUrl: process.env[`${prefix}_TOKEN_URL`]?.trim() || defaults.tokenUrl,
    clientId: process.env[`${prefix}_CLIENT_ID`]?.trim() || "app",
    adminRecordId,
    adminBaseUrl: process.env[`${prefix}_ADMIN_URL`]?.trim() || defaults.adminBaseUrl,
    appBaseUrl: process.env[`${prefix}_APP_URL`]?.trim() || defaults.appBaseUrl,
    defaultTenantId: positiveInteger(process.env[`${prefix}_DEFAULT_TENANT_ID`], 1, `${prefix}_DEFAULT_TENANT_ID`),
    defaultAgencyId: positiveInteger(process.env[`${prefix}_DEFAULT_AGENCY_ID`], 1, `${prefix}_DEFAULT_AGENCY_ID`),
    defaultConsultingType: process.env[`${prefix}_DEFAULT_CONSULTING_TYPE`]?.trim() || "1",
    defaultPostcode: process.env[`${prefix}_DEFAULT_POSTCODE`]?.trim() || "10115",
    defaultMainTopicId: positiveInteger(process.env[`${prefix}_DEFAULT_MAIN_TOPIC_ID`], 1, `${prefix}_DEFAULT_MAIN_TOPIC_ID`),
    resolveIp: process.env[`${prefix}_RESOLVE_IP`]?.trim() || null,
    caFile: process.env[`${prefix}_CA_FILE`]?.trim() || null
  };
}

export function loadConfig(): RuntimeConfig {
  const providerValue = process.env.TEST_ACCESS_PROVIDER?.trim() ?? "";
  if (providerValue && providerValue !== "file" && providerValue !== "infisical") {
    throw new Error("TEST_ACCESS_PROVIDER must be file or infisical");
  }
  const registryProvider: RuntimeConfig["registryProvider"] = providerValue === "infisical" ? "infisical" : "file";
  const writerClientId = fromFileOrEnv("writer-client-id", "INFISICAL_WRITER_CLIENT_ID");
  const writerClientSecret = fromFileOrEnv("writer-client-secret", "INFISICAL_WRITER_CLIENT_SECRET");
  if (Boolean(writerClientId) !== Boolean(writerClientSecret)) {
    throw new Error("Complete INFISICAL_WRITER credentials are required to enable TOTP enrollment");
  }
  const readerClientId = registryProvider === "infisical"
    ? required(fromFileOrEnv("client-id", "INFISICAL_CLIENT_ID"), "INFISICAL_CLIENT_ID")
    : "";
  if (writerClientId && writerClientId === readerClientId) {
    throw new Error("TOTP enrollment requires a separate Infisical writer identity");
  }
  const infisical = registryProvider === "infisical" ? {
    baseUrl: required(process.env.INFISICAL_BASE_URL?.trim() ?? "", "INFISICAL_BASE_URL"),
    organizationSlug: required(process.env.INFISICAL_ORGANIZATION_SLUG?.trim() ?? "", "INFISICAL_ORGANIZATION_SLUG"),
    clientId: readerClientId,
    clientSecret: required(fromFileOrEnv("client-secret", "INFISICAL_CLIENT_SECRET"), "INFISICAL_CLIENT_SECRET"),
    writer: writerClientId && writerClientSecret
      ? { clientId: writerClientId, clientSecret: writerClientSecret }
      : null,
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
  const orisoProvisioningTargets: RuntimeConfig["orisoProvisioningTargets"] = {
    "pre-dev": orisoProvisioningTarget("pre-dev", {
      apiBaseUrl: "https://predev.oriso.org/service",
      tokenUrl: "https://predev.oriso.org/auth/realms/online-beratung/protocol/openid-connect/token",
      adminBaseUrl: "https://predev.oriso.org/admin",
      appBaseUrl: "https://predev.oriso.org"
    }),
    dev: orisoProvisioningTarget("dev", {
      apiBaseUrl: "https://dev.oriso.org/service",
      tokenUrl: "https://dev.oriso.org/auth/realms/online-beratung/protocol/openid-connect/token",
      adminBaseUrl: "https://dev.oriso.org/admin",
      appBaseUrl: "https://dev.oriso.org"
    })
  };
  const emailOtpHmacKey = fromFileOrEnv("hmac-key", "TESTMAILS_EMAIL_OTP_HMAC_KEY");
  if (smtp && !emailOtpHmacKey) throw new Error("TESTMAILS_EMAIL_OTP_HMAC_KEY is required when email OTP SMTP is enabled");
  if (smtp && emailOtpHmacKey.length < 32) throw new Error("TESTMAILS_EMAIL_OTP_HMAC_KEY must be at least 32 characters");
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
    orisoProvisioningTargets,
    registryProvider,
    infisical
  };
}
