import { execFileSync } from "node:child_process";
import { createServer as createHttpServer, request as httpRequest } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { connect, type AddressInfo, type Socket } from "node:net";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createMachineHttp, createMachineTransport } from "../src/server/machine-http.js";
import { runPlaywrightLoginBroker } from "../src/server/playwright-login-broker.js";
import { runTestAccessCommand } from "../src/server/test-access-cli.js";
import { createGatewayClient } from "../src/evidence/cli/client.js";
import { runEvidenceCommand } from "../src/evidence/cli/index.js";

const hub = "https://dreambau.com/testmails/api/v1";
const evidence = "https://evidence.dreambau.com/api/v1";

describe("explicit machine authentication", () => {
  it("prints installed-client auth configuration without reading credentials", async () => {
    const readKeychainToken = vi.fn();
    const write = vi.fn();
    expect(await runTestAccessCommand(["--help"], { baseUrl: hub, identity: "", readKeychainToken, fetch, write })).toBe(0);
    expect(readKeychainToken).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledWith(expect.stringContaining("TEST_ACCESS_AUTH_MODE"));
  });

  it("retains local credential lookup and Bearer authentication", async () => {
    const readKeychainToken = vi.fn(() => "local-token");
    const fetch = vi.fn(async () => Response.json([]));
    const client = createMachineHttp({ baseUrl: hub, service: "test-access", identity: "local", readKeychainToken, fetch });
    await client.fetch(`${hub}/accounts`);
    expect(readKeychainToken).toHaveBeenCalledWith("local");
    expect(fetch).toHaveBeenCalledWith(`${hub}/accounts`, expect.objectContaining({ headers: { authorization: "Bearer local-token" } }));
  });

  it.each(["account", "run", "broker"])("retains local-mode JSON error behavior for %s", async (caller) => {
    const parseError = new SyntaxError("local-parse-error-sentinel");
    const dependencies = { baseUrl: hub, identity: "local", readKeychainToken: vi.fn(() => "local-token"),
      fetch: vi.fn(async () => ({ ok: true, json: async () => { throw parseError; } })) as unknown as typeof fetch,
      write: vi.fn(), writeError: vi.fn() };
    const result = caller === "broker"
      ? await runPlaywrightLoginBroker("oriso/dev/test-consultant-001", dependencies)
      : await runTestAccessCommand(caller === "run" ? ["run", "list"] : ["list"], dependencies);
    expect(result).toBe(1);
    expect(dependencies.writeError).toHaveBeenCalledWith("local-parse-error-sentinel\n");
    expect(dependencies.readKeychainToken).toHaveBeenCalledWith("local");
  });

  it.each(["", "automatic", "NETWORK-PROXY"])("rejects invalid explicit mode %j before credential lookup", (authMode) => {
    const readKeychainToken = vi.fn();
    expect(() => createMachineHttp({ baseUrl: hub, service: "test-access", identity: "cloud", authMode, readKeychainToken, fetch })).toThrow("auth mode");
    expect(readKeychainToken).not.toHaveBeenCalled();
  });

  it.each([undefined, "bad", "socks5://localhost:123", "http://user:secret@localhost:123", "http://localhost/path"])("requires a valid explicit HTTPS_PROXY (%j)", (proxyUrl) => {
    const readKeychainToken = vi.fn();
    expect(() => createMachineHttp({ baseUrl: hub, service: "test-access", identity: "cloud", authMode: "network-proxy", proxyUrl, readKeychainToken, fetch })).toThrow("proxy");
    expect(readKeychainToken).not.toHaveBeenCalled();
  });

  it.each(["http://dreambau.com/testmails/api/v1", "https://dreambau.com/other", "https://evil.test/testmails/api/v1", "https://dreambau.com:444/testmails/api/v1", "https://dreambau.com/testmails/api/v1?secret=x"])("rejects unapproved gateway base %s", (baseUrl) => {
    expect(() => createMachineTransport({ baseUrl, service: "test-access", authMode: "network-proxy", proxyUrl: "http://localhost:123", fetch })).toThrow("gateway");
  });
});

describe("real curl CONNECT proxy transport", () => {
  let directory: string;
  let proxyUrl: string;
  let gateway: ReturnType<typeof createHttpsServer>;
  let origin: ReturnType<typeof createHttpServer>;
  let proxy: ReturnType<typeof createHttpServer>;
  const sockets = new Set<Socket>();
  let brokerAccount: Record<string, string> | undefined;
  let malformedPath: string | undefined;
  let authProbeStatus = 404;
  let authProbeBody = { error: "run_not_found" };
  const requests: Array<{ url: string; authorization?: string; body: Buffer; method: string }> = [];
  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), "machine-proxy-"));
    const key = join(directory, "key.pem");
    const cert = join(directory, "cert.pem");
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "1", "-subj", "/CN=dreambau.com", "-addext", "subjectAltName=DNS:dreambau.com,DNS:evidence.dreambau.com"], { stdio: "ignore" });
    vi.stubEnv("CURL_CA_BUNDLE", cert);
    vi.stubEnv("NO_PROXY", "*");
    origin = createHttpServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        if (req.headers.authorization !== "Bearer proxy-injected") { res.writeHead(401); res.end(); return; }
        if (malformedPath && req.url?.split("?")[0] === malformedPath) { res.end("sensitive-response-sentinel"); return; }
        if (req.url?.endsWith("/redirect")) { res.writeHead(302, { location: "https://evil.test/leak" }); res.end("secret-error-body"); return; }
        if (req.url?.endsWith("/large")) { res.end("x".repeat(9 * 1024 * 1024)); return; }
        if (req.url?.endsWith("/wait")) return;
        if (req.url?.endsWith("/rejected")) { res.writeHead(500); res.end(JSON.stringify({ error: "credential-in-error-body" })); return; }
        res.setHeader("content-type", "application/json");
        if (req.url?.startsWith("/api/v1/runs/doctor-")) { res.statusCode = authProbeStatus; res.end(JSON.stringify(authProbeBody)); return; }
        if (brokerAccount && req.url?.includes("/accounts")) {
          res.end(JSON.stringify(req.url?.includes("/secret") ? { secret: "fixture-password" } : req.url?.includes("/otp") ? { code: "123456", validUntil: new Date(Date.now() + 60_000).toISOString() } : [brokerAccount])); return;
        }
        res.end(JSON.stringify(req.url?.includes("/accounts") ? [] : { id: "run1", publicId: null, state: "archived", injected: req.headers.authorization, byteSize: Buffer.concat(chunks).length }));
      });
    });
    await new Promise<void>((resolve) => origin.listen(0, "127.0.0.1", resolve));
    // Terminate TLS at the proxy, then forward a separate HTTP request with
    // injected authentication to the application. The application verifies it.
    gateway = createHttpsServer({ key: readFileSync(key), cert: readFileSync(cert) }, (req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        requests.push({ url: req.url!, authorization: req.headers.authorization, body: Buffer.concat(chunks), method: req.method! });
        const forwarded = httpRequest({ host: "127.0.0.1", port: (origin.address() as AddressInfo).port, path: req.url, method: req.method,
          headers: { ...req.headers, authorization: "Bearer proxy-injected" }, agent: false }, (response) => {
          res.writeHead(response.statusCode!, response.headers); response.pipe(res);
        });
        forwarded.on("error", () => res.destroy());
        res.on("close", () => forwarded.destroy());
        forwarded.end(Buffer.concat(chunks));
      });
    });
    await new Promise<void>((resolve) => gateway.listen(0, "127.0.0.1", resolve));
    proxy = createHttpServer();
    proxy.on("connect", (req, socket, head) => {
      expect(["dreambau.com:443", "evidence.dreambau.com:443"]).toContain(req.url);
      const upstream = connect((gateway.address() as AddressInfo).port, "127.0.0.1", () => {
        socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) upstream.write(head);
        socket.pipe(upstream); upstream.pipe(socket);
      });
      sockets.add(upstream); sockets.add(socket);
      upstream.on("error", () => socket.destroy());
      socket.on("error", () => upstream.destroy());
      socket.on("close", () => upstream.destroy());
    });
    await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
    proxyUrl = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    for (const socket of sockets) socket.destroy();
    await Promise.all([new Promise<void>((resolve) => proxy.close(() => resolve())), new Promise<void>((resolve) => gateway.close(() => resolve())), new Promise<void>((resolve) => { origin.closeAllConnections(); origin.close(() => resolve()); })]);
    vi.unstubAllEnvs();
    rmSync(directory, { recursive: true, force: true });
  });
  function deps() {
    return { baseUrl: hub, service: "test-access" as const, identity: "cloud", authMode: "network-proxy", browserProxyMode: "network-proxy", proxyUrl, readKeychainToken: vi.fn(() => { throw new Error("must not read credentials"); }), fetch: vi.fn(() => { throw new Error("must not use direct fetch"); }) as unknown as typeof fetch };
  }

  it("uses actual curl CONNECT despite NO_PROXY=* and skips credentials and Authorization", async () => {
    const dependencies = deps();
    const client = createMachineHttp(dependencies);
    const response = await client.fetch(`${hub}/runs`, { method: "POST", headers: { "content-type": "application/json" }, body: '{"secret":"stdin-only"}' });
    expect(await response.json()).toMatchObject({ injected: "Bearer proxy-injected" });
    expect(requests.at(-1)).toMatchObject({ authorization: undefined, method: "POST", body: Buffer.from('{"secret":"stdin-only"}') });
    expect(dependencies.readKeychainToken).not.toHaveBeenCalled();
    expect(dependencies.fetch).not.toHaveBeenCalled();
  });

  it("routes account, run and evidence doctor through the selected transport", async () => {
    for (const args of [["list"], ["doctor"], ["run", "finish", "run1", "--result", "passed"]]) {
      expect(await runTestAccessCommand(args, { ...deps(), write: vi.fn(), writeError: vi.fn() })).toBe(0);
    }
    const dependencies = { ...deps(), baseUrl: evidence, publicBaseUrl: "https://evidence.dreambau.com", write: vi.fn(), writeError: vi.fn(), runCommand: vi.fn(() => ({ code: 0, stdout: "Storypapst/dreambau", stderr: "" })), gh: vi.fn(), readChunk: vi.fn(), fileSize: vi.fn() };
    expect(await runEvidenceCommand(["doctor"], dependencies)).toBe(0);
    expect(dependencies.readKeychainToken).not.toHaveBeenCalled();
    expect(requests.some((request) => request.url === "/health/live")).toBe(true);
    expect(requests.at(-1)?.url).toMatch(/^\/api\/v1\/runs\/doctor-/);
    expect(await runEvidenceCommand(["archive", "run1"], dependencies)).toBe(0);
    expect(requests.at(-1)?.authorization).toBeUndefined();
  });

  it.each([401, 403, 404])("doctor rejects unauthenticated, forbidden and unrelated404 responses (%s)", async (status) => {
    authProbeStatus = status;
    authProbeBody = { error: "wrong" };
    try {
      const dependencies = { ...deps(), baseUrl: evidence, publicBaseUrl: "https://evidence.dreambau.com", write: vi.fn(), writeError: vi.fn(), runCommand: vi.fn(() => ({ code: 0, stdout: "Storypapst/dreambau", stderr: "" })), gh: vi.fn(), readChunk: vi.fn(), fileSize: vi.fn() };
      expect(await runEvidenceCommand(["doctor"], dependencies)).toBe(1);
      expect(dependencies.readKeychainToken).not.toHaveBeenCalled();
      expect(dependencies.write).toHaveBeenCalledWith(expect.stringContaining("fail gateway read grant"));
    } finally { authProbeStatus = 404; authProbeBody = { error: "run_not_found" }; }
  });

  it("routes broker secret and OTP requests through curl without local credentials", async () => {
    const accountId = "oriso/dev/test-consultant-001";
    brokerAccount = { id: accountId, project: "oriso", environment: "dev", username: "fixture-user", loginUrl: "https://dev.oriso.org" };
    const write = vi.fn();
    const writeError = vi.fn();
    try {
      const dependencies = deps();
      const result = await runPlaywrightLoginBroker(accountId, { ...dependencies, write, writeError,
        stateRoot: join(directory, "states"), scheduleCleanup: vi.fn(),
        login: async (request) => {
          expect(request.proxy).toEqual({ server: new URL(proxyUrl).href, bypass: "<-loopback>" });
          expect(request.username).toBe("fixture-user");
          expect(request.password).toBe("fixture-password");
          expect(await request.getOtp()).toBe("123456");
          writeFileSync(request.statePath, "{}");
        }
      });
      expect(writeError).not.toHaveBeenCalled();
      expect(result).toBe(0);
      expect(dependencies.readKeychainToken).not.toHaveBeenCalled();
      expect(requests.at(-1)?.url).toContain("/otp");
      expect(write.mock.calls.join()).not.toMatch(/fixture-password|123456/);
    } finally { brokerAccount = undefined; }
  });

  it("refuses a proxy-mode session without an explicit browser transport", async () => {
    const dependencies = { ...deps(), browserProxyMode: undefined, write: vi.fn(), writeError: vi.fn(), login: vi.fn() };
    expect(await runPlaywrightLoginBroker("oriso/dev/test-consultant-001", dependencies)).toBe(1);
    expect(dependencies.writeError).toHaveBeenCalledWith(expect.stringContaining("explicit browser proxy"));
    expect(dependencies.login).not.toHaveBeenCalled();
    expect(dependencies.readKeychainToken).not.toHaveBeenCalled();
  });

  it.each([
    ["account list", "/testmails/api/v1/accounts", ["list"]],
    ["run finish", "/testmails/api/v1/runs/run1/finish", ["run", "finish", "run1", "--result", "passed"]],
    ["broker initial metadata", "/testmails/api/v1/accounts", undefined],
    ["broker initial secret", "/testmails/api/v1/accounts/oriso%2Fdev%2Ftest-consultant-001/secret", undefined]
  ] as const)("sanitizes malformed successful JSON for %s", async (_name, path, args) => {
    malformedPath = path;
    const accountId = "oriso/dev/test-consultant-001";
    brokerAccount = { id: accountId, project: "oriso", environment: "dev", username: "fixture-user", loginUrl: "https://dev.oriso.org" };
    const write = vi.fn();
    const writeError = vi.fn();
    const dependencies = { ...deps(), write, writeError };
    const login = vi.fn();
    try {
      const result = args
        ? await runTestAccessCommand([...args], dependencies)
        : await runPlaywrightLoginBroker(accountId, { ...dependencies, login });
      expect(result).toBe(1);
      expect(write).not.toHaveBeenCalled();
      expect(writeError).toHaveBeenCalledWith("machine gateway returned invalid JSON\n");
      expect(writeError.mock.calls.join()).not.toContain("sensitive-response-sentinel");
      expect(login).not.toHaveBeenCalled();
      expect(dependencies.readKeychainToken).not.toHaveBeenCalled();
      expect(dependencies.fetch).not.toHaveBeenCalled();
    } finally { malformedPath = undefined; brokerAccount = undefined; }
  });

  it("retains binary evidence bytes", async () => {
    const http = createMachineHttp({ ...deps(), baseUrl: evidence, service: "evidence" });
    const client = createGatewayClient({ baseUrl: evidence, token: http.token, authMode: "network-proxy", fetch: http.fetch });
    const body = Uint8Array.from([0, 255, 128, 10, 13, 1]);
    expect(await client.uploadPart("run1", "file1", 1, body)).toMatchObject({ byteSize: 6 });
    expect(requests.at(-1)).toMatchObject({ authorization: undefined, method: "PUT", body: Buffer.from(body) });
  });

  it("rejects escaped origins, paths, explicit Authorization and redirects without exposing bodies", async () => {
    const client = createMachineHttp(deps());
    for (const url of ["https://evil.test/", "https://dreambau.com/other", `${hub}/../../../other`, `${hub}/accounts/%252e%252e%252f%252e%252e%252f%252e%252e%252fother`]) await expect(client.fetch(url)).rejects.toThrow("gateway");
    await expect(client.fetch(`${hub}/runs`, { headers: { authorization: "Bearer forbidden" } })).rejects.toThrow("header");
    await expect(client.fetch(`${hub}/redirect`)).rejects.toThrow("redirect");
    expect(requests.at(-1)?.url).toBe("/testmails/api/v1/redirect");
  });

  it("does not expose gateway error payloads in proxy-mode errors", async () => {
    const http = createMachineHttp({ ...deps(), baseUrl: evidence, service: "evidence" });
    const client = createGatewayClient({ baseUrl: evidence, token: http.token, authMode: "network-proxy", fetch: http.fetch });
    await expect(client.getRun("rejected")).rejects.toThrow("evidence gateway returned HTTP 500");
    await expect(client.getRun("rejected")).rejects.not.toThrow("credential-in-error-body");
  });

  it("bounds replies and supports aborting an in-flight curl", async () => {
    const client = createMachineHttp(deps());
    await expect(client.fetch(`${hub}/large`)).rejects.toThrow("limit");
    const controller = new AbortController();
    const request = client.fetch(`${hub}/wait`, { signal: controller.signal });
    setTimeout(() => controller.abort(), 50);
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });
});
