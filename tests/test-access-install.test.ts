import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

describe("portable test-access installer", () => {
  it("installs a working bundled command without a source-machine path", () => {
    const root = mkdtempSync(path.join(tmpdir(), "test-access-install-"));
    try {
      const env = {
        ...process.env,
        HOME: path.join(root, "home"),
        XDG_BIN_HOME: path.join(root, "bin"),
        XDG_DATA_HOME: path.join(root, "data")
      };
      const installed = spawnSync("bash", ["scripts/install-test-access-cli.sh"], {
        cwd: new URL("..", import.meta.url),
        env,
        encoding: "utf8",
        timeout: 10_000,
        killSignal: "SIGKILL"
      });
      expect(installed.status, installed.error?.message ?? installed.stderr).toBe(0);
      const command = path.join(root, "bin", "test-access");
      const invoked = spawnSync(command, ["list"], { env: { ...env, TEST_ACCESS_IDENTITY: "" }, encoding: "utf8", timeout: 3_000, killSignal: "SIGKILL" });
      const bundle = readFileSync(path.join(root, "data", "dreambau-agent-tools", "test-access", "test-access.mjs"), "utf8");

      expect(invoked.status, invoked.error?.message ?? invoked.stderr).toBe(1);
      expect(invoked.stderr).toContain("TEST_ACCESS_IDENTITY");
      expect(bundle).not.toContain("/Users/frankgerhardt");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
    // Real bundling and the complete Playwright copy took 5,411 ms in CI.
  }, 15_000);

  it("checks a private file credential without invoking Keychain and rejects unsafe files", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "test-access-file-install-"));
    const home = path.join(root, "home");
    const credentials = path.join(home, ".config", "dreambau-test-access", "identities");
    const tokenFile = path.join(credentials, "fixture-oriso.token");
    const fakeBin = path.join(root, "tools");
    const marker = path.join(root, "keychain-invoked");
    const dataHome = path.join(root, "data");
    const runtime = path.join(dataHome, "dreambau-agent-tools", "test-access");
    mkdirSync(credentials, { recursive: true, mode: 0o700 });
    mkdirSync(fakeBin);
    mkdirSync(runtime, { recursive: true });
    writeFileSync(tokenFile, "private-fixture-token", { mode: 0o600 });
    writeFileSync(path.join(runtime, "manifest.json"), JSON.stringify({ version: "1.1.0" }));
    writeFileSync(path.join(runtime, "test-access.mjs"), "// fixture");
    writeFileSync(path.join(fakeBin, "security"), '#!/bin/sh\nprintf invoked > "$KEYCHAIN_MARKER"\nexit 36\n', { mode: 0o755 });
    const authorizations: (string | undefined)[] = [];
    const fixtureBundle = 'console.log(process.env.PROFILE_PROOF ?? "missing-profile");';
    const server = createServer((request, response) => {
      authorizations.push(request.headers.authorization);
      if (request.url?.endsWith("/bundle")) { response.end(fixtureBundle); return; }
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ version: "1.1.0", gitSha: "fixture", files: [{ path: "test-access.mjs", sha256: createHash("sha256").update(fixtureBundle).digest("hex") }] }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing local test server port");
    const env = {
      ...process.env,
      HOME: home,
      PATH: `${fakeBin}:${process.env.PATH}`,
      XDG_DATA_HOME: dataHome,
      KEYCHAIN_MARKER: marker,
      ORISO_KIT_TOKEN: "",
      ORISO_TEST_ACCESS_IDENTITY: "fixture-oriso",
      ORISO_KIT_BASE_CLI: `http://127.0.0.1:${address.port}`,
      TEST_ACCESS_CREDENTIAL_PROVIDER: "file"
    };
    const invoke = () => promisify(execFile)("bash", ["understand-kit/test-access-install.sh", "--check"], { cwd: new URL("..", import.meta.url), env });
    try {
      const result = await invoke();
      expect(result.stdout).toContain("served: 1.1.0");
      expect(existsSync(marker)).toBe(false);
      expect(authorizations).toEqual(["Bearer private-fixture-token"]);
      chmodSync(tokenFile, 0o644);
      await expect(invoke()).rejects.toMatchObject({ code: 1 });
      expect(authorizations).toHaveLength(1);
      chmodSync(tokenFile, 0o600);
      writeFileSync(tokenFile, "private-fixture-token\nsecond-line");
      await expect(invoke()).rejects.toMatchObject({ code: 1 });
      expect(authorizations).toHaveLength(1);
      writeFileSync(tokenFile, "private-fixture-token");
      await expect(promisify(execFile)("bash", ["understand-kit/test-access-install.sh", "--check"], {
        cwd: new URL("..", import.meta.url), env: { ...env, ORISO_KIT_TOKEN: "private-fixture-token\nsecond-line" }
      })).rejects.toMatchObject({ code: 1, stdout: expect.not.stringContaining("private-fixture-token") });
      expect(authorizations).toHaveLength(1);
      const beforeBundle = readFileSync(path.join(runtime, "test-access.mjs"), "utf8");
      await expect(promisify(execFile)("bash", ["understand-kit/test-access-install.sh", "--force"], {
        cwd: new URL("..", import.meta.url), env: { ...env, DREAMBAU_CLI_PROFILE: path.join(root, "missing-profile.sh") }
      })).rejects.toMatchObject({ code: 1 });
      expect(readFileSync(path.join(runtime, "test-access.mjs"), "utf8")).toBe(beforeBundle);
      const profile = path.join(root, "agent's profile.sh");
      writeFileSync(profile, "export PROFILE_PROOF=loaded-profile\n", { mode: 0o600 });
      const installed = await promisify(execFile)("bash", ["understand-kit/test-access-install.sh", "--force"], {
        cwd: new URL("..", import.meta.url), env: { ...env, DREAMBAU_CLI_PROFILE: profile }
      });
      expect(installed.stdout).toContain("loaded-profile");
      expect(existsSync(marker)).toBe(false);
      const invoked = spawnSync(path.join(home, ".local", "bin", "test-access"), ["--version"], { env, encoding: "utf8" });
      expect(invoked.status).toBe(0);
      expect(invoked.stdout).toContain("loaded-profile");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("removes only the previous runtime backup after a successful swap", () => {
    const script = readFileSync(new URL("../scripts/install-test-access-cli.sh", import.meta.url), "utf8");
    expect(script).toContain('runtime_backup="$data_dir/node_modules.backup.');
    expect(script).toContain('mv "$data_dir/node_modules" "$runtime_backup"');
    expect(script).toContain('if ! mv "$runtime_temporary" "$data_dir/node_modules"; then');
    expect(script).toContain('mv "$runtime_backup" "$data_dir/node_modules"');
    expect(script).toContain('rm -rf "$runtime_backup"');
  });
});
