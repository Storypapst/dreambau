import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

interface MachineCredentialOptions {
  home?: string;
  readKeychain: (identity: string) => string;
}

interface KeychainOptions {
  home?: string;
  spawn?: typeof spawnSync;
}

export function readMacOSKeychainCredential(identity: string, options: KeychainOptions = {}) {
  const spawn = options.spawn ?? spawnSync;
  const find = () => spawn(
    "security",
    ["find-generic-password", "-s", "dreambau-test-access", "-a", identity, "-w"],
    { encoding: "utf8", timeout: 2_000 }
  );
  let result = find();
  if (result.status !== 0) {
    spawn(
      "security",
      ["unlock-keychain", join(options.home ?? homedir(), "Library", "Keychains", "login.keychain-db")],
      { encoding: "utf8", timeout: 2_000, stdio: ["ignore", "pipe", "pipe"] }
    );
    result = find();
  }
  return result.status === 0 ? String(result.stdout).trim() : "";
}

export function machineCredentialPath(identity: string, home = homedir()) {
  if (!/^[A-Za-z0-9._-]+$/.test(identity)) throw new Error("invalid Test Access identity name");
  return join(home, ".config", "dreambau-test-access", "identities", `${identity}.token`);
}

export function readMachineCredential(identity: string, options: MachineCredentialOptions) {
  const keychainCredential = options.readKeychain(identity).trim();
  if (keychainCredential) return keychainCredential;

  const path = machineCredentialPath(identity, options.home);
  const metadata = lstatSync(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error("Test Access machine credential must be a regular file");
  }
  if (typeof process.getuid === "function" && metadata.uid !== process.getuid()) {
    throw new Error("Test Access machine credential must belong to the current user");
  }
  if ((metadata.mode & 0o077) !== 0) {
    throw new Error("Test Access machine credential must not grant group or world access");
  }
  const fileCredential = readFileSync(path, "utf8").trim();
  if (!fileCredential) throw new Error("Test Access machine credential is empty");
  return fileCredential;
}
