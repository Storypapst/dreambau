import { describe, expect, it, vi } from "vitest";
import { buildApiRequest, runTestAccessCli, runTestAccessCommand } from "../src/server/test-access-cli.js";

describe("test-access CLI", () => {
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
