import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const sha256 = (buffer: Buffer | string) => createHash("sha256").update(buffer).digest("hex");

describe("test-access release bundle", () => {
  const outDir = path.join(mkdtempSync(path.join(tmpdir(), "test-access-bundle-")), "cli");

  it("builds a stamped bundle with a manifest whose checksum matches", () => {
    const built = spawnSync("bash", ["scripts/build-test-access-bundle.sh", "--out", outDir], {
      cwd: repoRoot, env: { ...process.env, GIT_SHA: "abc123def456" }, encoding: "utf8"
    });
    expect(built.status, built.stderr).toBe(0);
    const manifest = JSON.parse(readFileSync(path.join(outDir, "manifest.json"), "utf8"));
    const bundle = readFileSync(path.join(outDir, "test-access.mjs"));
    const expectedVersion = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")).testAccessCli.version;
    expect(manifest).toMatchObject({ name: "test-access-cli", version: expectedVersion, gitSha: "abc123def456" });
    expect(manifest.playwrightVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(manifest.files).toEqual([{ path: "test-access.mjs", sha256: sha256(bundle), bytes: bundle.byteLength }]);
    expect(bundle.toString("utf8")).not.toContain("/Users/frankgerhardt");

    const version = spawnSync("node", [path.join(outDir, "test-access.mjs"), "--version"], { encoding: "utf8" });
    expect(version.status).toBe(0);
    expect(version.stdout.trim()).toBe(`test-access ${expectedVersion} (abc123def456)`);
  });
});

describe("test-access-install.sh against a release endpoint", () => {
  let server: Server;
  let base = "";
  let served: { manifest: string; bundle: string; token: string };

  beforeAll(async () => {
    const bundle = "#!/usr/bin/env node\nconsole.log('test-access 9.9.9 (fake)');\n";
    served = {
      token: "release-token",
      bundle,
      manifest: JSON.stringify({ name: "test-access-cli", version: "9.9.9", gitSha: "fake", playwrightVersion: "", files: [{ path: "test-access.mjs", sha256: sha256(bundle) }] })
    };
    server = createServer((req, res) => {
      if (req.headers.authorization !== `Bearer ${served.token}`) { res.writeHead(401).end(JSON.stringify({ error: "unauthorized" })); return; }
      if (req.url === "/cli/manifest") { res.writeHead(200, { "content-type": "application/json" }).end(served.manifest); return; }
      if (req.url === "/cli/bundle") { res.writeHead(200, { "content-type": "text/javascript" }).end(served.bundle); return; }
      res.writeHead(404).end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/cli`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  // The release server lives in this process, so the installer must run
  // asynchronously: spawnSync would block the event loop and starve it.
  function run(args: string[], home: string, token = served.token) {
    return new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
      const child = spawn("bash", [path.join(repoRoot, "understand-kit", "test-access-install.sh"), ...args], {
        env: {
          PATH: process.env.PATH ?? "", HOME: home, TMPDIR: home,
          XDG_BIN_HOME: path.join(home, "bin"), XDG_DATA_HOME: path.join(home, "data"),
          ORISO_KIT_BASE_CLI: base, ORISO_KIT_TOKEN: token
        }
      });
      let stdout = ""; let stderr = "";
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.on("close", (status) => resolve({ status, stdout, stderr }));
    });
  }

  it("installs, verifies the checksum, reports current on the second run and refuses a tampered bundle", async () => {
    const home = mkdtempSync(path.join(tmpdir(), "test-access-home-"));
    mkdirSync(path.join(home, "bin"), { recursive: true });

    const first = await run([], home);
    expect(first.status, first.stdout + first.stderr).toBe(0);
    expect(first.stdout).toContain("installed none -> 9.9.9");
    const dataDir = path.join(home, "data", "dreambau-agent-tools", "test-access");
    expect(readFileSync(path.join(dataDir, "test-access.mjs"), "utf8")).toBe(served.bundle);
    expect(JSON.parse(readFileSync(path.join(dataDir, "manifest.json"), "utf8")).version).toBe("9.9.9");
    const wrapper = readFileSync(path.join(home, "bin", "test-access"), "utf8");
    expect(wrapper).toContain("dreambau-agent-tools/test-access/test-access.mjs");
    expect(wrapper).not.toContain(home);
    expect(first.stdout).not.toContain(served.token);

    const second = await run([], home);
    expect(second.status).toBe(0);
    expect(second.stdout).toContain("current (version 9.9.9)");

    const check = await run(["--check"], home);
    expect(check.status).toBe(0);
    expect(check.stdout).toContain("installed: 9.9.9, served: 9.9.9");

    // A bundle that does not match its manifest must leave the installed one untouched.
    const original = served.bundle;
    served = { ...served, manifest: served.manifest.replace("9.9.9", "9.9.10"), bundle: `${original}// tampered\n` };
    const tampered = await run([], home);
    expect(tampered.status).toBe(1);
    expect(tampered.stdout).toContain("sha256 does not match");
    expect(readFileSync(path.join(dataDir, "test-access.mjs"), "utf8")).toBe(original);
    expect(existsSync(path.join(dataDir, "test-access.mjs.backup.9.9.9"))).toBe(false);
    served = { ...served, bundle: original, manifest: served.manifest.replace("9.9.10", "9.9.9") };
  });

  it("stops with a clear message when the token is rejected", async () => {
    const home = mkdtempSync(path.join(tmpdir(), "test-access-home-"));
    const result = await run([], home, "wrong-token");
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("401 unauthorized");
    expect(existsSync(path.join(home, "bin", "test-access"))).toBe(false);
  });
});
