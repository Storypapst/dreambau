import { chmod, mkdir, mkdtemp, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { readMachineCredential, readMacOSKeychainCredential } from "../src/server/machine-credential.js";

const temporaryHomes: string[] = [];

async function privateCredential() {
  const home = await mkdtemp(join(tmpdir(), "test-access-home-"));
  temporaryHomes.push(home);
  const directory = join(home, ".config", "dreambau-test-access", "identities");
  const path = join(directory, "agent-mac-mini-oriso.token");
  await mkdir(directory, { recursive: true });
  await writeFile(path, "file-backed-machine-token\n", { mode: 0o600 });
  return { home, path };
}

afterEach(async () => {
  await Promise.all(temporaryHomes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("Test Access machine credential", () => {
  it("allows time for human approval without a blind unlock", () => {
    const spawn = vi.fn().mockReturnValue({ status: 0, stdout: "keychain-machine-token\n" });

    expect(readMacOSKeychainCredential("agent-mac-mini-oriso", {
      home: "/Users/kio",
      spawn
    })).toBe("keychain-machine-token");
    expect(spawn).toHaveBeenNthCalledWith(
      1,
      "security",
      ["find-generic-password", "-s", "dreambau-test-access", "-a", "agent-mac-mini-oriso", "-w"],
      expect.objectContaining({ timeout: 120_000 })
    );
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it("reports denied access without trying another credential source", () => {
    const spawn = vi.fn().mockReturnValue({ status: 51, stdout: "" });
    expect(() => readMacOSKeychainCredential("probe", { spawn })).toThrow(/Keychain access/);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it("reports an approval timeout without leaking subprocess output", () => {
    const spawn = vi.fn().mockReturnValue({ status: null, error: { code: "ETIMEDOUT" }, stderr: "sensitive" });
    expect(() => readMacOSKeychainCredential("probe", { spawn })).toThrow(/timed out after 120 seconds/);
  });

  it("allows file fallback when the keychain item is absent", () => {
    const spawn = vi.fn().mockReturnValue({ status: 44, stdout: "" });
    expect(readMacOSKeychainCredential("probe", { spawn })).toBe("");
  });

  it("uses a private machine credential file when headless Keychain access is unavailable", async () => {
    const { home } = await privateCredential();

    expect(readMachineCredential("agent-mac-mini-oriso", {
      home,
      readKeychain: () => ""
    })).toBe("file-backed-machine-token");
  });

  it("uses the explicitly selected private file without requesting Keychain access", async () => {
    const { home } = await privateCredential();
    const readKeychain = vi.fn(() => { throw new Error("Keychain access denied"); });

    expect(readMachineCredential("agent-mac-mini-oriso", {
      home,
      provider: "file",
      readKeychain
    })).toBe("file-backed-machine-token");
    expect(readKeychain).not.toHaveBeenCalled();
  });

  it("rejects an unknown provider before reading any credential", () => {
    const readKeychain = vi.fn(() => "keychain-machine-token");

    expect(() => readMachineCredential("probe", {
      home: "/nonexistent-test-access-home",
      provider: "unknown",
      readKeychain
    })).toThrow("machine credential provider must be auto or file");
    expect(readKeychain).not.toHaveBeenCalled();
  });

  it.each([undefined, "auto"])("preserves Keychain denial for provider %s despite a private file", async (provider) => {
    const { home } = await privateCredential();
    const readKeychain = vi.fn(() => { throw new Error("Keychain access denied"); });

    expect(() => readMachineCredential("agent-mac-mini-oriso", {
      home,
      provider,
      readKeychain
    })).toThrow("Keychain access denied");
  });

  it("does not apply Test Access environment settings to shared credential callers", async () => {
    const { home } = await privateCredential();
    vi.stubEnv("TEST_ACCESS_CREDENTIAL_PROVIDER", "file");

    expect(readMachineCredential("agent-mac-mini-oriso", {
      home,
      readKeychain: () => "keychain-machine-token"
    })).toBe("keychain-machine-token");
  });

  it.each(["auto", "file"])("rejects unsafe %s credentials with an error that contains no credential", async (provider) => {
    const { home, path } = await privateCredential();
    for (const credential of [
      "synthetic-first\r\nsynthetic-second",
      "synthetic first",
      "synthetic\tfirst",
      "synthetic\u0000first",
      "synthetic\u007ffirst",
      "synthetic\u2603first"
    ]) {
      await writeFile(path, credential);

      expect(() => readMachineCredential("agent-mac-mini-oriso", {
        home,
        provider,
        readKeychain: () => credential
      })).toThrow(/^machine credential must be a single header-safe token$/);
    }
  });

  it.each(["auto", "file"])("preserves a valid opaque token from the %s provider", async (provider) => {
    const { home, path } = await privateCredential();
    const credential = "Az09-._~+/=opaque";
    await writeFile(path, ` ${credential}\n`);

    expect(readMachineCredential("agent-mac-mini-oriso", {
      home,
      provider,
      readKeychain: () => ` ${credential}\n`
    })).toBe(credential);
  });

  it.each([
    {
      name: "directory",
      prepare: async (path: string) => {
        await rm(path);
        await mkdir(path);
      },
      error: "must be a regular file"
    },
    {
      name: "symbolic link",
      prepare: async (path: string) => {
        await rename(path, `${path}.target`);
        await symlink(`${path}.target`, path);
      },
      error: "must be a regular file"
    },
    {
      name: "group-readable file",
      prepare: (path: string) => chmod(path, 0o640),
      error: "must not grant group or world access"
    },
    {
      name: "world-readable file",
      prepare: (path: string) => chmod(path, 0o604),
      error: "must not grant group or world access"
    },
    {
      name: "empty file",
      prepare: (path: string) => writeFile(path, " \n"),
      error: "machine credential is empty"
    }
  ])("rejects an unsafe $name with the file provider", async ({ prepare, error }) => {
    const { home, path } = await privateCredential();
    await prepare(path);
    const readKeychain = vi.fn(() => { throw new Error("Keychain access denied"); });

    expect(() => readMachineCredential("agent-mac-mini-oriso", {
      home,
      provider: "file",
      readKeychain
    })).toThrow(error);
    expect(readKeychain).not.toHaveBeenCalled();
  });

  it.skipIf(typeof process.getuid !== "function")("rejects a credential owned by another user with the file provider", async () => {
    const { home } = await privateCredential();
    const uid = process.getuid?.() ?? 0;
    vi.spyOn(process, "getuid").mockReturnValue(uid + 1);

    expect(() => readMachineCredential("agent-mac-mini-oriso", {
      home,
      provider: "file",
      readKeychain: () => ""
    })).toThrow("must belong to the current user");
  });
});
