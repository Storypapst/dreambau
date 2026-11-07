import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { buildApiRequest, runTestAccessCli, runTestAccessCommand } from "../src/server/test-access-cli.js";

describe("test-access CLI", () => {
  it.each([
    {
      name: "list with file provider", args: ["list", "--project", "oriso", "--environment", "dev"],
      provider: "file", exitCode: 0, authorization: ["Bearer private-test-machine-token"], keychainCalled: false, error: null
    },
    {
      name: "doctor with file provider", args: ["doctor"],
      provider: "file", exitCode: 0, authorization: ["Bearer private-test-machine-token"], keychainCalled: false, error: null
    },
    {
      name: "session open with file provider", args: ["session", "open", "oriso/dev/reusable-actor"],
      provider: "file", exitCode: 1, authorization: ["Bearer private-test-machine-token"], keychainCalled: false,
      error: "account not found in the identity scope"
    },
    {
      name: "default auto provider after denied Keychain access", args: ["list"],
      provider: undefined, exitCode: 1, authorization: [], keychainCalled: true, error: "macOS Keychain access was denied"
    },
    {
      name: "unknown provider", args: ["list"],
      provider: "unknown", exitCode: 1, authorization: [], keychainCalled: false, error: "machine credential provider must be auto or file"
    },
    {
      name: "malformed private credential", args: ["list"],
      provider: "file", exitCode: 1, authorization: [], keychainCalled: false,
      credential: "synthetic-first-secret\r\nsynthetic-second-secret",
      error: "machine credential must be a single header-safe token"
    }
  ])("honors credential selection through the normal CLI for $name", async (testCase) => {
    const home = await mkdtemp(join(tmpdir(), "test-access-cli-home-"));
    const directory = join(home, ".config", "dreambau-test-access", "identities");
    const bin = join(home, "bin");
    await mkdir(directory, { recursive: true });
    await mkdir(bin);
    const credential = testCase.credential ?? "private-test-machine-token";
    await writeFile(join(directory, "file-provider-probe.token"), `${credential}\n`, { mode: 0o600 });
    await writeFile(join(bin, "security"), '#!/bin/sh\nprintf called > "$HOME/security-called"\nexit 51\n', { mode: 0o755 });

    const requests: string[] = [];
    const authorization: Array<string | undefined> = [];
    const server = createServer((request, response) => {
      requests.push(request.url ?? "");
      authorization.push(request.headers.authorization);
      response.writeHead(200, { "content-type": "application/json" });
      response.end("[]");
    });
    try {
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("test server address unavailable");
      const child = spawn(process.execPath, ["--import", "tsx", "src/server/test-access-cli.ts", ...testCase.args], {
        cwd: fileURLToPath(new URL("../", import.meta.url)),
        env: {
          ...process.env,
          HOME: home,
          PATH: `${bin}:${process.env.PATH ?? ""}`,
          TEST_ACCESS_IDENTITY: "file-provider-probe",
          TEST_ACCESS_URL: `http://127.0.0.1:${address.port}`,
          TEST_ACCESS_AUTH_MODE: "machine-token",
          TEST_ACCESS_CREDENTIAL_PROVIDER: testCase.provider
        },
        stdio: ["ignore", "pipe", "pipe"]
      });
      let output = "";
      let errors = "";
      child.stdout.on("data", (chunk) => { output += String(chunk); });
      child.stderr.on("data", (chunk) => { errors += String(chunk); });
      const code = await new Promise<number | null>((resolve, reject) => {
        child.on("error", reject);
        child.on("close", resolve);
      });

      expect(code, errors).toBe(testCase.exitCode);
      expect(requests).toHaveLength(testCase.authorization.length);
      expect(authorization).toEqual(testCase.authorization);
      expect(existsSync(join(home, "security-called"))).toBe(testCase.keychainCalled);
      for (const part of credential.split(/\s+/)) expect(output + errors).not.toContain(part);
      if (testCase.error) expect(errors).toContain(testCase.error);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(home, { recursive: true, force: true });
    }
  });

  it("dispatches versioned run commands through the same Keychain-backed client", async () => {
    const fetchMock = vi.fn(async () => Response.json([]));
    const result = await runTestAccessCommand(
      ["run", "list", "--project", "oriso", "--target", "pre-dev"],
      {
        baseUrl: "https://dreambau.com/testmails/api/v1",
        identity: "kio-oriso",
        readKeychainToken: () => "keychain-token",
        fetch: fetchMock as unknown as typeof fetch,
        write: vi.fn()
      }
    );
    expect(result).toBe(0);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://dreambau.com/testmails/api/v1/runs?project=oriso&targetEnvironment=pre-dev",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("opens an authenticated browser session without exposing a credential command", async () => {
    const broker = vi.fn(async () => 0);
    const write = vi.fn();
    const result = await runTestAccessCommand(
      ["session", "open", "oriso/pre-dev/test-consultant-001"],
      {
        baseUrl: "https://dreambau.com/testmails/api/v1",
        identity: "agent-mac-mini-oriso",
        readKeychainToken: () => "machine-bootstrap-token",
        fetch: vi.fn() as unknown as typeof fetch,
        write,
        playwrightLoginBroker: broker
      }
    );

    expect(result).toBe(0);
    expect(broker).toHaveBeenCalledWith(
      "oriso/pre-dev/test-consultant-001",
      expect.objectContaining({ identity: "agent-mac-mini-oriso" })
    );
    expect(write).not.toHaveBeenCalledWith(expect.stringContaining("machine-bootstrap-token"));
  });
  it("routes playwright-login without sending credentials through normal CLI output", async () => {
    const broker = vi.fn(async () => 0);
    const result = await runTestAccessCommand(
      ["playwright-login", "oriso/pre-dev/test-consultant-001"],
      {
        baseUrl: "https://dreambau.com/testmails/api/v1",
        identity: "codex-m4-oriso",
        readKeychainToken: () => "keychain-token",
        fetch: vi.fn() as unknown as typeof fetch,
        write: vi.fn(),
        playwrightLoginBroker: broker
      }
    );
    expect(result).toBe(0);
    expect(broker).toHaveBeenCalledWith(
      "oriso/pre-dev/test-consultant-001",
      expect.objectContaining({ identity: "codex-m4-oriso" })
    );
  });

  it.each([["session", "open"], ["playwright-login"]])("routes the strict App-TOTP switch through %j", async (...command) => {
    const broker = vi.fn(async () => 0);
    const writeError = vi.fn();
    const dependencies = {
      baseUrl: "https://dreambau.com/testmails/api/v1",
      identity: "agent-fixture",
      readKeychainToken: () => "synthetic-token",
      fetch: vi.fn() as unknown as typeof fetch,
      write: vi.fn(),
      writeError,
      playwrightLoginBroker: broker
    };
    const account = "oriso/dev/fixture";
    expect(await runTestAccessCommand([...command, account, "--require-app-totp"], dependencies)).toBe(0);
    expect(broker).toHaveBeenCalledWith(account, expect.objectContaining({ requireAppTotp: true }));
    expect(await runTestAccessCommand([...command, account, "--require-app-top"], dependencies)).toBe(1);
    expect(broker).toHaveBeenCalledTimes(1);
    expect(writeError).toHaveBeenCalledWith(expect.stringContaining("--require-app-totp"));
  });

  it("builds list, get, OTP, mail and env URLs without embedding a token", () => {
    const baseUrl = "https://dreambau.com/testmails/api/v1";
    expect(buildApiRequest(["list", "--project", "oriso", "--environment", "pre-dev"], baseUrl)).toEqual({
      path: "/accounts?project=oriso&environment=pre-dev",
      output: "json"
    });
    expect(buildApiRequest(["get", "mailbox:test@example.test"], baseUrl)).toEqual({
      path: "/accounts/mailbox%3Atest%40example.test/secret",
      output: "secret"
    });
    expect(buildApiRequest(["otp", "mailbox:test@example.test", "verification"], baseUrl)).toEqual({
      path: "/accounts/mailbox%3Atest%40example.test/otp?query=verification",
      output: "otp"
    });
    expect(buildApiRequest(["mail", "mailbox:test@example.test"], baseUrl)).toEqual({
      path: "/accounts/mailbox%3Atest%40example.test/mail/latest",
      output: "json"
    });
    expect(buildApiRequest(["env", "oriso/pre-dev/e2e-default"], baseUrl)).toEqual({
      path: "/accounts/oriso%2Fpre-dev%2Fe2e-default/env",
      output: "env"
    });
    expect(buildApiRequest(["lookup", "--email", "abe.simpson@dreambau.de", "--project", "oriso", "--environment", "pre-dev"], baseUrl)).toEqual({
      path: "/lookup?email=abe.simpson%40dreambau.de&project=oriso&environment=pre-dev",
      output: "json"
    });
    expect(buildApiRequest(["doctor", "--repair", "--json"], baseUrl)).toEqual({
      path: "/doctor?repair=true",
      output: "json"
    });
    expect(buildApiRequest(["enroll-totp", "oriso/pre-dev/admin"], baseUrl)).toEqual({
      path: "/accounts/oriso%2Fpre-dev%2Fadmin/totp",
      output: "json",
      method: "POST",
      requiresTotpSecret: true
    });
    expect(buildApiRequest(["otp", "oriso/pre-dev/admin", "--json"], baseUrl)).toEqual({
      path: "/accounts/oriso%2Fpre-dev%2Fadmin/otp",
      output: "json"
    });
  });

  it("reads TOTP enrollment input outside argv and never prints the seed", async () => {
    const seed = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    const output: string[] = [];
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.method).toBe("POST");
      expect(JSON.parse(String(init.body))).toEqual({ totpSecret: seed });
      return Response.json({
        accountId: "oriso/pre-dev/admin",
        enrolled: true,
        updatedAt: "2026-07-29T10:00:00.000Z"
      });
    });
    const result = await runTestAccessCli(["enroll-totp", "oriso/pre-dev/admin", "--json"], {
      baseUrl: "https://dreambau.com/testmails/api/v1",
      identity: "codex-m4-oriso",
      readKeychainToken: () => "keychain-token",
      readTotpSecret: async () => seed,
      fetch: fetchMock as unknown as typeof fetch,
      write: (value) => output.push(value)
    });
    expect(result).toBe(0);
    expect(output.join("")).toContain('"enrolled": true');
    expect(output.join("")).not.toContain(seed);
  });

  it("preserves plain OTP output and prints the validated response with --json", async () => {
    const response = { accountId: "oriso/pre-dev/admin", code: "287082", generatedAt: "2026-07-29T10:00:00.000Z", expiresAt: "2026-07-29T10:00:30.000Z" };
    for (const [args, expected] of [
      [["otp", "oriso/pre-dev/admin"], "287082\n"],
      [["otp", "oriso/pre-dev/admin", "--json"], `${JSON.stringify(response, null, 2)}\n`]
    ] as const) {
      const output: string[] = [];
      const result = await runTestAccessCli([...args], {
        baseUrl: "https://dreambau.com/testmails/api/v1",
        identity: "codex-m4-oriso",
        readKeychainToken: () => "keychain-token",
        fetch: vi.fn(async () => Response.json(response)) as unknown as typeof fetch,
        write: (value) => output.push(value)
      });
      expect(result).toBe(0);
      expect(output).toEqual([expected]);
    }
  });

  it("exposes the explicit account-bound TOTP API through the private CLI", async () => {
    const accountId = "oriso/dev/fixture-counsellor";
    const baseUrl = "https://dreambau.com/testmails/api/v1";
    const response = {
      accountId, source: "totp", code: "123456",
      generatedAt: "2026-11-07T20:01:00.000Z", expiresAt: "2026-11-07T20:01:30.000Z"
    };
    const output: string[] = [];
    const fetchMock = vi.fn(async url => {
      expect(url).toBe(`${baseUrl}/accounts/${encodeURIComponent(accountId)}/otp?source=totp`);
      return Response.json({ ...response, unrelatedField: "private-upstream-canary" });
    });
    const result = await runTestAccessCommand(["otp", accountId, "--source", "totp", "--json"], {
      baseUrl, identity: "fixture-machine", readKeychainToken: () => "fixture-token",
      fetch: fetchMock, write: value => output.push(value), writeError: () => {}
    });
    expect(result).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(output.map(value => JSON.parse(value))).toEqual([response]);
  });

  it("prints no code when the broker cannot attest the requested source and account", async () => {
    const accountId = "oriso/dev/fixture-counsellor";
    const response = {
      accountId, source: "totp", code: "123456",
      generatedAt: "2026-11-07T20:01:00.000Z", expiresAt: "2026-11-07T20:01:30.000Z"
    };
    for (const patch of [{ source: undefined }, { source: "mail" }, { accountId: "oriso/dev/foreign" }, { expiresAt: response.generatedAt }]) {
      const write = vi.fn();
      const writeError = vi.fn();
      const fetchMock = vi.fn(async () => Response.json({ ...response, ...patch }));
      const result = await runTestAccessCli(["otp", accountId, "--source", "totp"], {
        baseUrl: "https://dreambau.com/testmails/api/v1", identity: "fixture-machine", readKeychainToken: () => "fixture-token",
        fetch: fetchMock, write, writeError
      });
      expect(result).toBe(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(write).not.toHaveBeenCalled();
      expect(writeError).toHaveBeenCalledWith("Test Access API returned an invalid response\n");
    }
  });

  it("builds a secret-free Springfield catalog sync request", () => {
    expect(buildApiRequest([
      "sync",
      "oriso/pre-dev/e2e-platform-admin-predev",
      "--version", "2.02",
      "--status", "active",
      "--topics", "",
      "--note", "Dedicated ORISO PreDev platform administrator."
    ], "https://dreambau.com/testmails/api/v1")).toEqual({
      path: "/accounts/oriso%2Fpre-dev%2Fe2e-platform-admin-predev/catalog",
      output: "json",
      method: "POST",
      body: {
        applicationVersion: "2.02",
        lifecycleStatus: "active",
        topics: [],
        notes: "Dedicated ORISO PreDev platform administrator."
      }
    });
  });

  it("sends catalog sync as JSON without printing credentials", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.method).toBe("POST");
      expect(init.headers).toEqual({ authorization: "Bearer keychain-token", "content-type": "application/json" });
      expect(JSON.parse(String(init.body))).toEqual({ applicationVersion: "2.02", lifecycleStatus: "active", topics: [], notes: "E2E admin" });
      return Response.json({ id: "oriso/pre-dev/admin", email: "abe.simpson@dreambau.de", metadata: { shippedVersion: "2.02" } });
    });
    const output: string[] = [];
    const result = await runTestAccessCli(["sync", "oriso/pre-dev/admin", "--version", "2.02", "--status", "active", "--note", "E2E admin"], {
      baseUrl: "https://dreambau.com/testmails/api/v1",
      identity: "codex-m4-oriso",
      readKeychainToken: () => "keychain-token",
      fetch: fetchMock as unknown as typeof fetch,
      write: (value) => output.push(value)
    });
    expect(result).toBe(0);
    expect(output.join(" ")).toContain("abe.simpson@dreambau.de");
    expect(output.join(" ")).not.toContain("keychain-token");
  });

  it("prints a requested seed profile as safely quoted dotenv", async () => {
    const output: string[] = [];
    const result = await runTestAccessCli(["env", "oriso/pre-dev/e2e-default"], {
      baseUrl: "https://dreambau.com/testmails/api/v1",
      identity: "codex-m4-oriso",
      readKeychainToken: () => "keychain-token",
      fetch: vi.fn(async () => Response.json({ id: "oriso/pre-dev/e2e-default", variables: { USERNAME: "test user", PASSWORD: "$(not-shell)" } })) as unknown as typeof fetch,
      write: (value) => output.push(value)
    });
    expect(result).toBe(0);
    expect(output).toEqual(["PASSWORD='$(not-shell)'\nUSERNAME='test user'\n"]);
  });

  it("loads the bearer token from Keychain and prints only the requested secret", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.headers).toEqual({ authorization: "Bearer keychain-token" });
      return new Response(JSON.stringify({ id: "mailbox:test@example.test", secret: "target-secret" }), { status: 200 });
    });
    const output: string[] = [];
    const result = await runTestAccessCli(
      ["get", "mailbox:test@example.test"],
      {
        baseUrl: "https://dreambau.com/testmails/api/v1",
        identity: "codex-m4-oriso",
        readKeychainToken: () => "keychain-token",
        fetch: fetchMock as unknown as typeof fetch,
        write: (value) => output.push(value)
      }
    );
    expect(result).toBe(0);
    expect(output).toEqual(["target-secret\n"]);
    expect(output.join("")).not.toContain("keychain-token");
  });

  it("does not print response bodies on authorization errors", async () => {
    const output: string[] = [];
    const errors: string[] = [];
    const result = await runTestAccessCli(
      ["list", "--project", "oriso"],
      {
        baseUrl: "https://dreambau.com/testmails/api/v1",
        identity: "codex-m4-oriso",
        readKeychainToken: () => "keychain-token",
        fetch: vi.fn(async () => new Response(JSON.stringify({ error: "unauthorized", debug: "do-not-print" }), { status: 401 })) as unknown as typeof fetch,
        write: (value) => output.push(value),
        writeError: (value) => errors.push(value)
      }
    );
    expect(result).toBe(1);
    expect(output).toEqual([]);
    expect(errors.join("")).toContain("HTTP 401");
    expect(errors.join("")).not.toContain("do-not-print");
  });

  it("rejects malformed successful secret, OTP and environment responses", async () => {
    for (const [args, body] of [
      [["get", "oriso/pre-dev/user"], { secret: 123 }],
      [["otp", "oriso/pre-dev/user"], {}],
      [["env", "oriso/pre-dev/profile"], { variables: ["not-an-object"] }]
    ] as const) {
      const output: string[] = [];
      const errors: string[] = [];
      const result = await runTestAccessCli([...args], {
        baseUrl: "https://dreambau.com/testmails/api/v1",
        identity: "codex-m4-oriso",
        readKeychainToken: () => "keychain-token",
        fetch: vi.fn(async () => Response.json(body)) as unknown as typeof fetch,
        write: (value) => output.push(value),
        writeError: (value) => errors.push(value)
      });
      expect(result).toBe(1);
      expect(output).toEqual([]);
      expect(errors.join("")).toContain("invalid response");
    }
  });
});
