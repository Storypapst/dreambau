import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createMachineHttp, createMachineTransport, machineAuthMode } from "./machine-http.js";
import { readMachineCredential, readMacOSKeychainCredential } from "./machine-credential.js";

export async function runCloudDoctor(args: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const write = (line: string) => process.stdout.write(`${line}\n`);
  if (args.includes("--version")) { write(`dreambau-cloud-doctor 1 (Node ${process.version}; source ${env.DREAMBAU_SOURCE_REVISION ?? "source"})`); return 0; }
  const flags = new Set(["--offline", "--browser", "--browser-url", "--screenshot"]);
  for (let index = 0; index < args.length; index += 1) {
    if (!flags.has(args[index])) { write("FAIL configuration: unknown doctor option"); return 1; }
    if (["--browser-url", "--screenshot"].includes(args[index]) && !args[++index]) { write("FAIL configuration: missing option value"); return 1; }
  }
  const value = (flag: string) => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
  const offline = args.includes("--offline");
  const browserRequested = args.includes("--browser");
  let failed = false;
  const gate = async (label: string, action: () => Promise<string>) => {
    try { write(`PASS ${label}: ${await action()}`); }
    catch { failed = true; write(`FAIL ${label}: check configuration, connectivity and grants; response content withheld`); }
  };
  let authMode: ReturnType<typeof machineAuthMode>;
  try {
    authMode = machineAuthMode(env.TEST_ACCESS_AUTH_MODE);
    if (authMode !== machineAuthMode(env.EVIDENCE_AUTH_MODE)) { write("FAIL configuration: both clients must select the same auth mode"); return 1; }
    if (browserRequested && !["direct", "network-proxy"].includes(env.DREAMBAU_BROWSER_PROXY ?? "")) {
      write("FAIL configuration: an explicit browser proxy decision (direct or network-proxy) is required"); return 1;
    }
  } catch { write("FAIL configuration: auth mode must be machine-token or network-proxy"); return 1; }
  await gate("runtime", async () => { if (process.version !== "v20.20.2") throw new Error(); return `Node ${process.version}`; });
  const { chromium } = await import("@playwright/test");
  await gate("locked Chromium executable", async () => { if (!existsSync(chromium.executablePath())) throw new Error(); return "installed from the source lockfile"; });
  if (offline) write("SKIP authenticated probes and public network probes: offline readiness only");
  else {
    const baseUrl = env.TEST_ACCESS_URL ?? "https://dreambau.com/testmails/api/v1";
    const evidenceBase = env.EVIDENCE_URL ?? "https://evidence.dreambau.com/api/v1";
    await gate("public evidence health", async () => {
      const transport = createMachineTransport({ baseUrl: evidenceBase, service: "evidence", authMode, proxyUrl: env.HTTPS_PROXY, fetch });
      const response = await transport(`${evidenceBase.replace(/\/$/, "").replace(/\/api\/v1$/, "")}/health/live`, { signal: AbortSignal.timeout(10_000) });
      if (response.status !== 200 || (await response.json() as { status?: unknown }).status !== "ok") throw new Error();
      return "public health only; authentication not inferred";
    });
    for (const environment of ["dev", "production-test"]) {
      await gate(`Hub ${environment} metadata`, async () => {
        const http = createMachineHttp({ baseUrl, service: "test-access", authMode, proxyUrl: env.HTTPS_PROXY,
          identity: env.TEST_ACCESS_IDENTITY ?? "", fetch,
          readKeychainToken: (identity) => readMachineCredential(identity, { readKeychain: readMacOSKeychainCredential }) });
        const response = await http.fetch(`${baseUrl.replace(/\/$/, "")}/accounts?project=oriso&environment=${environment}`, { signal: AbortSignal.timeout(10_000) });
        if (response.status !== 200) throw new Error();
        const records = await http.json(response);
        if (!Array.isArray(records) || records.some((record) => !record || record.project !== "oriso" || record.environment !== environment)) throw new Error();
        return `oriso/${environment} requested scope permitted; ${records.length} records; contents withheld`;
      });
    }
    await gate("Evidence authenticated read", async () => {
      const http = createMachineHttp({ baseUrl: evidenceBase, service: "evidence", authMode, proxyUrl: env.HTTPS_PROXY,
        identity: env.EVIDENCE_IDENTITY ?? "", fetch,
        readKeychainToken: (identity) => readMachineCredential(identity, {
          readKeychain: (name) => readMacOSKeychainCredential(name, { service: "dreambau-evidence" }), configDirectory: "dreambau-evidence", subsystem: "dreambau-evidence"
        }) });
      const response = await http.fetch(`${evidenceBase.replace(/\/$/, "")}/runs/doctor-${randomUUID()}`, { signal: AbortSignal.timeout(10_000) });
      const payload = await http.json(response) as { error?: unknown };
      if (response.status !== 404 || payload.error !== "run_not_found") throw new Error();
      return "evidence:read granted; project/environment scope not introspected";
    });
    await gate("GitHub authentication", async () => {
      if (spawnSync("gh", ["auth", "status"], { stdio: "ignore", timeout: 15_000 }).status !== 0) throw new Error();
      return "gh reports an authenticated session; write permissions not tested";
    });
  }
  if (!browserRequested) write("SKIP Chromium connectivity: use --browser; API results do not prove browser access");
  else await gate("Chromium connectivity", async () => {
    const url = new URL(value("--browser-url") ?? "https://dev.oriso.org");
    const fixture = url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname);
    if ((!fixture && url.origin !== "https://dev.oriso.org") || url.username || url.password || url.hash || url.search) throw new Error();
    const screenshot = value("--screenshot");
    if (screenshot && !fixture) throw new Error(); // Never screenshot a credential-bearing product session.
    let proxy: { server: string; bypass: string } | undefined;
    if (env.DREAMBAU_BROWSER_PROXY === "network-proxy") {
      const parsed = new URL(env.HTTPS_PROXY ?? "");
      if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) throw new Error();
      proxy = { server: parsed.href, bypass: "<-loopback>" };
    }
    const browser = await chromium.launch({ headless: true, proxy });
    try {
      const page = await browser.newPage();
      const response = await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 30_000 });
      if (!response || response.status() >= 400 || new URL(page.url()).origin !== url.origin) throw new Error();
      if (screenshot) await page.screenshot({ path: screenshot });
      return `${env.DREAMBAU_BROWSER_PROXY}; ${fixture ? "local fixture; no Dev/login proof" : "Dev page reachable; no product login proof"}`;
    } finally { await browser.close(); }
  });
  write("LIMITS factory/Träger provisioning, cleanup, product login, two-hour acceptance and scheduling are not verified by this command.");
  return failed ? 1 : 0;
}

if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  runCloudDoctor(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch(() => {
    process.stderr.write("FAIL doctor runtime: tool or browser runtime unavailable; no response content logged\n"); process.exitCode = 1;
  });
}
