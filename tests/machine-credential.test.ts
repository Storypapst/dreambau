import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { readMachineCredential, readMacOSKeychainCredential } from "../src/server/machine-credential.js";

describe("Test Access machine credential", () => {
  it("unlocks the macOS login Keychain and retries a headless credential read", () => {
    const spawn = vi.fn()
      .mockReturnValueOnce({ status: 36, stdout: "" })
      .mockReturnValueOnce({ status: 0, stdout: "" })
      .mockReturnValueOnce({ status: 0, stdout: "keychain-machine-token\n" });

    expect(readMacOSKeychainCredential("agent-mac-mini-oriso", {
      home: "/Users/kio",
      spawn
    })).toBe("keychain-machine-token");
    expect(spawn).toHaveBeenNthCalledWith(
      2,
      "security",
      ["unlock-keychain", "/Users/kio/Library/Keychains/login.keychain-db"],
      expect.objectContaining({ timeout: 2_000 })
    );
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
