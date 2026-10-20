import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const homes: string[] = [];
afterEach(() => { for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true }); });
function fixture() {
  const home = mkdtempSync(join(tmpdir(), "cloud-bootstrap-'")); homes.push(home);
  const source = join(home, "source"); const project = join(home, "project");
  mkdirSync(source); mkdirSync(project); mkdirSync(join(source, "scripts"));
  for (const name of ["install-test-access-cli.sh", "install-evidence-cli.sh"]) cpSync(join(root, "scripts", name), join(source, "scripts", name));
  // Tiny committed source exercises real npm ci and the existing installers,
  // without downloading the application's dependencies for every unit test.
  writeFileSync(join(source, "package.json"), JSON.stringify({ name: "bootstrap-fixture", version: "1.0.0", scripts: { postinstall: "node prepare.cjs" } }));
  writeFileSync(join(source, "package-lock.json"), JSON.stringify({ name: "bootstrap-fixture", version: "1.0.0", lockfileVersion: 3, packages: { "": { name: "bootstrap-fixture", version: "1.0.0", hasInstallScript: true } } }));
  writeFileSync(join(source, "prepare.cjs"), `const fs=require('fs');
for(const name of ['@playwright/test','playwright','playwright-core']) {fs.mkdirSync('node_modules/'+name,{recursive:true});fs.writeFileSync('node_modules/'+name+'/package.json',JSON.stringify({version:'1.0.0'}));}
fs.mkdirSync('node_modules/.bin',{recursive:true});
fs.writeFileSync('node_modules/.bin/esbuild', '#!/usr/bin/env node\\nconst fs=require("fs");const arg=process.argv.find(x=>x.startsWith("--outfile="));fs.writeFileSync(arg.slice(10),"console.log(process.version)\\\\n");', {mode:0o755});
fs.writeFileSync('node_modules/.bin/playwright','#!/bin/sh\\nmkdir -p "$PLAYWRIGHT_BROWSERS_PATH"\\ntouch "$PLAYWRIGHT_BROWSERS_PATH/fixture-installed"\\n',{mode:0o755});`);
  // Installation assets always come from the immutable committed source too.
  cpSync(join(root, "scripts", "cloud"), join(source, "scripts", "cloud"), { recursive: true });
  writeFileSync(join(source, "scripts", "cloud", "build-doctor.sh"), '#!/bin/sh\nprintf "console.log(process.version)\\n" > "$1"\n', { mode: 0o755 });
  execFileSync("git", ["init", "-q", source]);
  execFileSync("git", ["-C", source, "add", "."]);
  execFileSync("git", ["-C", source, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-qm", "fixture"]);
  const revision = execFileSync("git", ["-C", source, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const bin = join(home, "wrong-bin"); mkdirSync(bin);
  writeFileSync(join(bin, "node"), "#!/bin/sh\necho wrong-node >&2\nexit 91\n", { mode: 0o755 });
  const env = { ...process.env, HOME: home, XDG_DATA_HOME: join(home, "data"), XDG_BIN_HOME: join(home, "bin"), XDG_CONFIG_HOME: join(home, "config"), PATH: `${bin}:${process.env.PATH}`, CLAUDE_PROJECT_DIR: project, TEST_ACCESS_TOKEN: "must-not-be-persisted" };
  const args = ["--revision", revision, "--source-dir", source, "--node-dir", dirname(dirname(process.execPath)), "--auth-mode", "network-proxy", "--skip-system-deps"];
  return { home, project, source, revision, env, args, run: (extra: string[] = []) => spawnSync("bash", [join(root, "scripts", "bootstrap-agent-environment.sh"), ...args, ...extra], { env, cwd: project, encoding: "utf8", timeout: 30_000 }) };
}

describe("cloud bootstrap executable contract", () => {
  it("installs and reruns using pinned Node, preserves instructions and stays secret-free", () => {
    const f = fixture();
    writeFileSync(join(f.project, "CLAUDE.md"), "My existing project rules.\n");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = f.run(); expect(result.status, result.stdout + result.stderr).toBe(0);
      expect(result.stdout).not.toContain("must-not-be-persisted");
      expect(result.stdout).toContain("No authenticated checks ran");
    }
    const instructions = readFileSync(join(f.project, "CLAUDE.md"), "utf8");
    expect(instructions).toContain("My existing project rules.");
    expect(instructions.match(/dreambau-cloud:begin/g)).toHaveLength(1);
    for (const name of ["test-access", "dreambau-evidence", "dreambau-cloud-doctor"]) {
      const result = spawnSync(join(f.home, "bin", name), ["--version"], { env: { ...f.env, HOME: join(f.home, "other-home") }, encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0); expect(result.stdout.trim()).toBe("v20.20.2");
    }
    const configuration = readFileSync(join(f.home, "data/dreambau-cloud/profile.sh"), "utf8");
    expect(configuration).not.toContain("must-not-be-persisted");
    const directory = join(f.home, "changed-project"); mkdirSync(directory);
    const route = spawnSync("sh", ["-c", '. "$1"; printf "%s" "$DREAMBAU_PROJECT_ROOT"', "fixture", join(f.home, "data/dreambau-cloud/profile.sh")], { env: { ...f.env, CLAUDE_PROJECT_DIR: directory }, encoding: "utf8" });
    expect(route.stdout).toBe(directory);
    const modes = spawnSync("sh", ["-c", '. "$1"; printf "%s\\n%s" "$TEST_ACCESS_AUTH_MODE" "$TEST_ACCESS_URL"', "fixture", join(f.home, "data/dreambau-cloud/profile.sh")], { env: { ...f.env, TEST_ACCESS_AUTH_MODE: undefined, TEST_ACCESS_URL: undefined }, encoding: "utf8" });
    expect(modes.stdout).toBe("network-proxy\nhttps://dreambau.com/testmails/api/v1");
    expect(existsSync(join(f.home, ".config/dreambau-test-access/identities"))).toBe(false);
  });

  it("rejects mutable revisions, unknown modes and mismatched committed sources", () => {
    const f = fixture();
    for (const extra of [["--revision", "main"], ["--revision", "a".repeat(40)], ["--auth-mode", "automatic"]]) {
      const result = f.run(extra); expect(result.status).not.toBe(0);
      expect(result.stdout + result.stderr).not.toContain("must-not-be-persisted");
    }
    expect(existsSync(join(f.home, "bin/test-access"))).toBe(false);
  });

  it("rejects a downloaded Node archive with the wrong checksum", () => {
    const f = fixture();
    writeFileSync(join(f.home, "wrong-bin/curl"), '#!/bin/sh\nwhile [ "$#" -gt 0 ]; do if [ "$1" = --output ]; then shift; output=$1; fi; shift; done\nprintf bad-archive > "$output"\n', { mode: 0o755 });
    const args = [...f.args]; const nodeIndex = args.indexOf("--node-dir"); args.splice(nodeIndex, 2);
    const result = spawnSync("bash", [join(root, "scripts/bootstrap-agent-environment.sh"), ...args], { env: f.env, cwd: f.project, encoding: "utf8" });
    expect(result.status).toBe(1); expect(result.stderr).toContain("Node archive checksum mismatch");
    expect(existsSync(join(f.home, "bin/test-access"))).toBe(false);
  });

  it("generates an immutable loader which executes only the matching downloaded bytes", () => {
    const f = fixture();
    cpSync(join(root, "scripts/print-cloud-loader.sh"), join(f.source, "scripts/print-cloud-loader.sh"));
    const marker = join(f.home, "executed");
    writeFileSync(join(f.source, "scripts/bootstrap-agent-environment.sh"), `#!/bin/sh\nprintf '%s\\n' "$@" > "${marker}"\n`);
    execFileSync("git", ["-C", f.source, "add", "."]);
    execFileSync("git", ["-C", f.source, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-qm", "loader fixture"]);
    const revision = execFileSync("git", ["-C", f.source, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const loader = execFileSync("bash", [join(f.source, "scripts/print-cloud-loader.sh"), revision], { encoding: "utf8" });
    const script = join(f.home, "loader.sh"); writeFileSync(script, loader);
    writeFileSync(join(f.home, "wrong-bin/curl"), `#!/bin/sh\nwhile [ "$#" -gt 0 ]; do if [ "$1" = --output ]; then shift; output=$1; fi; shift; done\ncp "${f.source}/scripts/bootstrap-agent-environment.sh" "$output"\nif [ "\${CORRUPT:-}" = yes ]; then printf '\\n# tampered' >> "$output"; fi\n`, { mode: 0o755 });
    const valid = spawnSync("bash", [script], { env: f.env, encoding: "utf8" });
    expect(valid.status, valid.stderr).toBe(0);
    expect(readFileSync(marker, "utf8")).toBe(`--revision\n${revision}\n--auth-mode\nnetwork-proxy\n`);
    rmSync(marker);
    const corrupt = spawnSync("bash", [script], { env: { ...f.env, CORRUPT: "yes" }, encoding: "utf8" });
    expect(corrupt.status).toBe(1); expect(corrupt.stderr).toContain("Bootstrap checksum mismatch"); expect(existsSync(marker)).toBe(false);
  });

  it("refuses the wrong explicitly selected Node runtime", () => {
    const f = fixture(); const runtime = join(f.home, "wrong-runtime"); mkdirSync(join(runtime, "bin"), { recursive: true });
    writeFileSync(join(runtime, "bin/node"), '#!/bin/sh\necho v24.0.0\n', { mode: 0o755 });
    const result = f.run(["--node-dir", runtime]); expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain("20.20.2");
  });
});
