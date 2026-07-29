import { readFileSync } from "node:fs";

function fromFileOrEnv(envName: string): string {
  const path = process.env[`${envName}_FILE`];
  if (path) return readFileSync(path, "utf8").trim();
  return process.env[envName]?.trim() ?? "";
}

export interface EvidenceStorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface EvidenceConfig {
  databasePath: string;
  publicBaseUrl: string;
  machineIdentitiesPath: string;
  /** `null` keeps the service on in-memory storage, which only unit tests use. */
  storage: EvidenceStorageConfig | null;
  draftRetentionDays: number;
  originalVideoRetentionDays: number;
}

function required(value: string, name: string): string {
  if (!value) throw new Error(`${name} is required when EVIDENCE_STORAGE=minio`);
  return value;
}

export function loadEvidenceConfig(env: NodeJS.ProcessEnv = process.env): EvidenceConfig {
  const storageMode = env.EVIDENCE_STORAGE?.trim() ?? "";
  if (storageMode && storageMode !== "memory" && storageMode !== "minio") {
    throw new Error("EVIDENCE_STORAGE must be memory or minio");
  }
  const storage = storageMode === "minio" ? {
    endpoint: required(env.EVIDENCE_S3_ENDPOINT?.trim() ?? "", "EVIDENCE_S3_ENDPOINT"),
    region: env.EVIDENCE_S3_REGION?.trim() || "us-east-1",
    bucket: required(env.EVIDENCE_S3_BUCKET?.trim() ?? "", "EVIDENCE_S3_BUCKET"),
    accessKeyId: required(fromFileOrEnv("EVIDENCE_S3_ACCESS_KEY_ID"), "EVIDENCE_S3_ACCESS_KEY_ID"),
    secretAccessKey: required(fromFileOrEnv("EVIDENCE_S3_SECRET_ACCESS_KEY"), "EVIDENCE_S3_SECRET_ACCESS_KEY")
  } : null;
  return {
    databasePath: env.EVIDENCE_DATABASE_PATH ?? "/data/evidence.sqlite",
    publicBaseUrl: (env.EVIDENCE_PUBLIC_BASE_URL ?? "https://evidence.dreambau.com").replace(/\/$/, ""),
    machineIdentitiesPath: env.EVIDENCE_IDENTITIES_PATH ?? "/run/secrets/evidence/machine-identities.json",
    storage,
    draftRetentionDays: Number(env.EVIDENCE_DRAFT_RETENTION_DAYS ?? 60),
    originalVideoRetentionDays: Number(env.EVIDENCE_ORIGINAL_VIDEO_RETENTION_DAYS ?? 7)
  };
}
