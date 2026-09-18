import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { readMachineCredential, readMacOSKeychainCredential } from "../src/server/machine-credential.js";

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
    const home = await mkdtemp(join(tmpdir(), "test-access-home-"));
    const directory = join(home, ".config", "dreambau-test-access", "identities");
    const credentialPath = join(directory, "agent-mac-mini-oriso.token");
    await mkdir(directory, { recursive: true });
    await writeFile(credentialPath, "file-backed-machine-token\n", { mode: 0o600 });
    await chmod(credentialPath, 0o600);

    expect(readMachineCredential("agent-mac-mini-oriso", {
      home,
      readKeychain: () => ""
    })).toBe("file-backed-machine-token");
  });
});
