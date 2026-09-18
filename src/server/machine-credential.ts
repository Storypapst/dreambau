import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

interface MachineCredentialOptions {
  home?: string;
  readKeychain: (identity: string) => string;
  /** Directory under `~/.config` holding the file fallback. */
  configDirectory?: string;
  /** Named in errors, so an evidence failure does not point at Test Access. */
  subsystem?: string;
}

interface KeychainOptions {
  home?: string;
  spawn?: typeof spawnSync;
  /** Keychain service name; the evidence CLI uses its own. */
  service?: string;
}

export function readMacOSKeychainCredential(identity: string, options: KeychainOptions = {}) {
  const spawn = options.spawn ?? spawnSync;
  const find = () => spawn(
    "security",
    ["find-generic-password", "-s", options.service ?? "dreambau-test-access", "-a", identity, "-w"],
    { encoding: "utf8", timeout: 120_000 }
  );
  const result = find();
  if (result.status === 0) return String(result.stdout).trim();
  const code = (result.error as NodeJS.ErrnoException | undefined)?.code;
  if (result.status === 44 || code === "ENOENT") return "";
  if (code === "ETIMEDOUT") {
    throw new Error("Keychain approval timed out after 120 seconds. Run again and approve the macOS dialog.");
  }
  throw new Error("macOS Keychain access was denied or unavailable. Approve the Keychain dialog and retry; the stored token has not been changed.");
}

const safeNamePattern = /^[A-Za-z0-9._-]+$/;

export function machineCredentialPath(identity: string, home = homedir(), configDirectory = "dreambau-test-access") {
  if (!safeNamePattern.test(identity)) throw new Error("invalid machine identity name");
  // Both halves are joined into a path, so both are checked.
  if (!safeNamePattern.test(configDirectory)) throw new Error("invalid credential directory name");
  return join(home, ".config", configDirectory, "identities", `${identity}.token`);
}

export function readMachineCredential(identity: string, options: MachineCredentialOptions) {
  const keychainCredential = options.readKeychain(identity).trim();
  if (keychainCredential) return keychainCredential;

  const subsystem = options.subsystem ?? "Test Access";
  const path = machineCredentialPath(identity, options.home, options.configDirectory);
  const metadata = lstatSync(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`${subsystem} machine credential must be a regular file`);
  }
  if (typeof process.getuid === "function" && metadata.uid !== process.getuid()) {
    throw new Error(`${subsystem} machine credential must belong to the current user`);
  }
  if ((metadata.mode & 0o077) !== 0) {
    throw new Error(`${subsystem} machine credential must not grant group or world access`);
  }
  const fileCredential = readFileSync(path, "utf8").trim();
  if (!fileCredential) throw new Error(`${subsystem} machine credential is empty`);
  return fileCredential;
}
