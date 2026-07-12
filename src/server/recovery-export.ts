import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import type { AccountRecord } from "./accounts.js";
import { loadAccounts, parseAccounts } from "./accounts.js";

function projectForDomain(domain: string) {
  if (domain === "oriso.org" || domain === "openresilience.cc") return "oriso" as const;
  if (domain === "trail.ist") return "orimo" as const;
  return "dreambau" as const;
}

export function buildRecoveryPayload(accounts: AccountRecord[], exportedAt = new Date().toISOString()) {
  return {
    schemaVersion: 1,
    exportedAt,
    records: accounts.map((account) => ({
      id: `mailbox:${account.email}`,
      project: projectForDomain(account.domain),
      environment: "production-test" as const,
      kind: "mailbox" as const,
      displayName: account.displayName,
      username: account.email,
      email: account.email,
      roles: ["mailbox"],
      permissionsDescription: "Read-only Dreambau test mailbox access",
      loginUrl: "https://mail.dreambau.com",
      secret: account.password,
      responsiblePerson: "dreambau",
      createdAt: exportedAt,
      updatedAt: exportedAt,
      expiresAt: null,
      shared: true,
      rotationStatus: "unknown" as const,
      documentationUrl: "https://dreambau.com/testmails/"
    }))
  };
}

export function encryptWithSops(plaintext: string, recipients: string[]) {
  const result = spawnSync(
    "sops",
    ["encrypt", "--age", recipients.join(","), "--input-type", "json", "--output-type", "json", "/dev/stdin"],
    { input: plaintext, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
  if (result.status !== 0 || !result.stdout) throw new Error("SOPS encryption failed");
  return result.stdout;
}

export function writeEncryptedRecoveryExport(options: {
  accounts: AccountRecord[];
  output: string;
  recipients: string[];
  encrypt?: (plaintext: string, recipients: string[]) => string;
}) {
  const recipients = [...new Set(options.recipients.map((value) => value.trim()).filter(Boolean))];
  if (recipients.length < 2) throw new Error("Recovery export requires two distinct age recipients");
  if (!options.output.endsWith(".enc.json")) throw new Error("Recovery export must end in .enc.json");
  const plaintext = `${JSON.stringify(buildRecoveryPayload(options.accounts), null, 2)}\n`;
  const ciphertext = (options.encrypt ?? encryptWithSops)(plaintext, recipients);
  if (options.accounts.some((account) => ciphertext.includes(account.password))) {
    throw new Error("SOPS output contains a plaintext secret");
  }

  mkdirSync(path.dirname(options.output), { recursive: true, mode: 0o700 });
  const temporary = `${options.output}.tmp-${process.pid}`;
  try {
    writeFileSync(temporary, ciphertext, { encoding: "utf8", flag: "wx", mode: 0o600 });
    chmodSync(temporary, 0o600);
    renameSync(temporary, options.output);
    chmodSync(options.output, 0o600);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}

function main() {
  const accountsPath = process.env.TESTMAILS_ACCOUNTS_PATH ?? "/run/secrets/testmails/accounts.json";
  const output = process.env.TEST_ACCESS_RECOVERY_OUTPUT ?? "/var/backups/test-access/test-access.enc.json";
  const recipients = (process.env.TEST_ACCESS_AGE_RECIPIENTS ?? "").split(",");
  const accounts = accountsPath === "-" ? parseAccounts(readFileSync(0, "utf8")) : loadAccounts(accountsPath);
  writeEncryptedRecoveryExport({ accounts, output, recipients });
  process.stdout.write(`${output}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
