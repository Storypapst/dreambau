import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const browserCache = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(homedir(), process.platform === "darwin" ? "Library/Caches/ms-playwright" : ".cache/ms-playwright");
let home: string; let bundle: string; let bin: string;
beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), "cloud-doctor-")); bin = join(home, "bin"); mkdirSync(bin);
  bundle = join(home, "doctor.mjs");
  execFileSync(join(root, "node_modules/.bin/esbuild"), [join(root, "src/server/cloud-doctor.ts"), "--bundle", "--platform=node", "--format=esm", "--external:@playwright/test", `--outfile=${bundle}`, "--log-level=error"]);
  symlinkSync(join(root, "node_modules"), join(home, "node_modules"), "dir");
  writeFileSync(join(bin, "curl"), '#!/bin/sh\nexec "' + process.execPath + '" "' + join(home, "curl.cjs") + '" "$@"\n', { mode: 0o755 });
  writeFileSync(join(home, "curl.cjs"), `const url=process.argv[process.argv.indexOf('--url')+1];let body,status=200;
if(process.env.DOCTOR_FIXTURE==='denied'&&url.includes('/accounts')){status=403;body={error:'sensitive-response-sentinel'};}
else if(url.includes('/accounts')){const env=new URL(url).searchParams.get('environment');body=[{id:'fixture',project:'oriso',environment:env,username:'must-not-print-account'}];}
else if(url.includes('/runs/')){status=404;body={error:process.env.DOCTOR_FIXTURE==='bad-evidence'?'wrong':'run_not_found'};}
else body={status:'ok'};
process.stdout.write(JSON.stringify(body)+'\\n'+status);`);
  writeFileSync(join(bin, "gh"), `#!/bin/sh\nprintf '%s\\n' "$@" > "${join(home, "gh-args")}"\nexit 0\n`, { mode: 0o755 });
});
afterAll(() => rmSync(home, { recursive: true, force: true }));
function run(args: string[], additional: Record<string, string> = {}) {
  return new Promise<{ code: number | null; output: string }>((resolve) => {
    const child = spawn(process.execPath, [bundle, ...args], { env: { ...process.env, HOME: home, PLAYWRIGHT_BROWSERS_PATH: browserCache, PATH: `${bin}:${process.env.PATH}`, TEST_ACCESS_AUTH_MODE: "network-proxy", EVIDENCE_AUTH_MODE: "network-proxy", TEST_ACCESS_IDENTITY: "claude-cloud-oriso-dev", EVIDENCE_IDENTITY: "claude-cloud-oriso-evidence-dev", HTTPS_PROXY: "http://127.0.0.1:1", DREAMBAU_BROWSER_PROXY: "direct", ...additional } });
    let output = ""; child.stdout.on("data", (chunk) => output += chunk); child.stderr.on("data", (chunk) => output += chunk);
    child.on("close", (code) => resolve({ code, output }));
  });
}
describe("installed cloud doctor command", () => {
  it("distinguishes public, scoped Hub and Evidence authentication without printing records", async () => {
    const result = await run([]);
    expect(result.code, result.output).toBe(0);
    for (const gate of ["PASS public evidence health", "PASS Hub dev metadata", "PASS Hub production-test metadata", "PASS Evidence authenticated read", "scope not introspected", "SKIP Chromium connectivity"]) expect(result.output).toContain(gate);
    expect(result.output).not.toMatch(/must-not-print-account|sensitive-response-sentinel/);
    expect(existsSync(join(home, ".config/dreambau-test-access/identities"))).toBe(false);
  });
  it("probes the attached repository REST path without requiring account-wide auth status", async () => {
    const result = await run([], { DREAMBAU_GITHUB_REPOSITORY: "OpenResilienceInitiative/ORISO-E2E" });
    expect(result.code, result.output).toBe(0);
    expect(result.output).toContain("repository REST readable: OpenResilienceInitiative/ORISO-E2E");
    expect(readFileSync(join(home, "gh-args"), "utf8")).toBe("api\nrepos/OpenResilienceInitiative/ORISO-E2E\n--silent\n");
  });
  it.each(["denied", "bad-evidence"])("fails closed without body excerpts for %s", async (DOCTOR_FIXTURE) => {
    const result = await run([], { DOCTOR_FIXTURE });
    expect(result.code).toBe(1); expect(result.output).toContain("FAIL"); expect(result.output).not.toContain("sensitive-response-sentinel");
  });
  it("rejects mixed proxy/local authentication and a missing browser decision", async () => {
    const mixed = await run([], { EVIDENCE_AUTH_MODE: "machine-token" });
    expect(mixed.code).toBe(1); expect(mixed.output).toContain("same auth mode");
    const missing = await run(["--browser"], { DREAMBAU_BROWSER_PROXY: "" });
    expect(missing.code).toBe(1); expect(missing.output).toContain("explicit browser proxy");
  });
  it("launches locked Chromium and writes a harmless local screenshot without authenticating", async () => {
    const server = createServer((_req, res) => res.end("<!doctype html><title>Harmless cloud fixture</title><h1>Browser works</h1>"));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); const url = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
    const screenshot = join(home, "fixture.png");
    try {
      const result = await run(["--offline", "--browser", "--browser-url", url, "--screenshot", screenshot]);
      expect(result.code, result.output).toBe(0); expect(result.output).toContain("PASS Chromium connectivity");
      expect(result.output).toContain("local fixture; no Dev/login proof"); expect(existsSync(screenshot)).toBe(true);
      expect(result.output).toContain("SKIP authenticated probes");
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  }, 15_000);
});
