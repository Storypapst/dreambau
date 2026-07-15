import { describe, expect, it, vi } from "vitest";
import { buildApiRequest, runTestAccessCli, runTestAccessCommand } from "../src/server/test-access-cli.js";

describe("test-access CLI", () => {
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
