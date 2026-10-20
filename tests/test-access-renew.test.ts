import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runTestAccessCommand } from "../src/server/test-access-cli.js";

const preview = {
  identity: "codex-m4-oriso",
  oldExpiry: "2026-10-20T16:08:48.872Z",
  newExpiry: "2027-01-18T17:07:58.548Z",
  dryRun: true,
  changed: false,
  receiptPath: null
};

function client(operator: (host: string, request: unknown) => Promise<string>) {
  const output: string[] = [];
  const errors: string[] = [];
  return {
    output,
    errors,
    dependencies: {
      baseUrl: "https://dreambau.com/testmails/api/v1",
      identity: "codex-m4-oriso",
      readKeychainToken: () => { throw new Error("Renewal must not read a bearer"); },
      fetch: async () => { throw new Error("Renewal must not call the machine API"); },
      write: (value: string) => output.push(value),
      writeError: (value: string) => errors.push(value),
      renewOperatorRequest: operator
    }
  };
}

describe("operator machine renewal", () => {
  it("sends a validated request on stdin to a fixed SSH helper command", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "renew-ssh-"));
    const capture = path.join(directory, "request.json");
    const reply = path.join(directory, "reply.json");
    writeFileSync(reply, JSON.stringify(preview));
    const executable = path.join(directory, "ssh");
    writeFileSync(executable, `#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
expected = ['-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'ForwardAgent=no', '--', 'm4dreambau', 'sudo -n /usr/bin/python3 /usr/local/lib/dreambau/test-access-admin.py']
if sys.argv[1:] != expected:
    print('{"error":"invalid_request"}', file=sys.stderr)
    sys.exit(1)
request = json.loads(sys.stdin.read())
Path(os.environ['RENEW_TEST_CAPTURE']).write_text(json.dumps(request))
print(Path(os.environ['RENEW_TEST_REPLY']).read_text())
`);
    chmodSync(executable, 0o700);
    vi.stubEnv("PATH", `${directory}:${process.env.PATH}`);
    vi.stubEnv("RENEW_TEST_CAPTURE", capture);
    vi.stubEnv("RENEW_TEST_REPLY", reply);
    const fixture = client(async () => { throw new Error("unused"); });
    const { renewOperatorRequest: _unused, ...dependencies } = fixture.dependencies;
    try {
      expect(await runTestAccessCommand(
        ["renew", "--operator-host", "m4dreambau", "--dry-run"], dependencies
      )).toBe(0);
      expect(JSON.parse(readFileSync(capture, "utf8"))).toEqual({
        identity: "codex-m4-oriso", days: 90, dryRun: true
      });
      expect(JSON.parse(fixture.output.join(""))).toEqual(preview);
    } finally {
      vi.unstubAllEnvs();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("previews an expired identity through operator authorization without a bearer", async () => {
    const fixture = client(async (host, request) => {
      if (host !== "m4dreambau" || JSON.stringify(request) !== JSON.stringify({
        identity: "codex-m4-oriso", days: 90, dryRun: true
      })) throw new Error("Wrong operator request");
      return JSON.stringify(preview);
    });
    const code = await runTestAccessCommand(
      ["renew", "--operator-host", "m4dreambau", "--days", "90", "--dry-run"],
      fixture.dependencies
    );
    expect(code).toBe(0);
    expect(JSON.parse(fixture.output.join(""))).toEqual(preview);
    expect(fixture.errors).toEqual([]);
  });

  it("reports only the allowlisted committed renewal receipt", async () => {
    const receipt = {
      ...preview, dryRun: false, changed: true,
      receiptPath: "/var/backups/dreambau/test-access/renewal-20261020.receipt.json"
    };
    const fixture = client(async () => JSON.stringify(receipt));
    expect(await runTestAccessCommand(
      ["renew", "--operator-host", "root@dreambau.com"], fixture.dependencies
    )).toBe(0);
    expect(JSON.parse(fixture.output.join(""))).toEqual(receipt);
  });

  it.each([
    [], ["--operator-host", "safe", "--days", "0"],
    ["--operator-host", "safe", "--days", "91"],
    ["--operator-host", "safe", "--days", "1e1"],
    ["--operator-host", "-oProxyCommand=bad"],
    ["--operator-host", "host;bad"], ["--operator-host", "user@host\nbad"],
    ["--operator-host", "safe", "--operator-host", "other"],
    ["--operator-host", "safe", "--days", "30", "--days", "90"],
    ["--operator-host", "safe", "--unknown"]
  ].map((args) => ({ args })))("rejects invalid options before contacting an operator: $args", async ({ args }) => {
    let contacted = false;
    const fixture = client(async () => { contacted = true; return JSON.stringify(preview); });
    expect(await runTestAccessCommand(["renew", ...args], fixture.dependencies)).toBe(1);
    expect(contacted).toBe(false);
    expect(fixture.output).toEqual([]);
  });

  it("rejects a malformed identity before operator execution", async () => {
    let contacted = false;
    const fixture = client(async () => { contacted = true; return JSON.stringify(preview); });
    expect(await runTestAccessCommand(["renew", "--operator-host", "safe"], {
      ...fixture.dependencies, identity: "another\ncommand"
    })).toBe(1);
    expect(contacted).toBe(false);
  });

  it.each([
    { ...preview, identity: "another-machine" },
    { ...preview, token: "must-never-print-a-token" },
    { ...preview, changed: true },
    { ...preview, dryRun: false },
    { ...preview, newExpiry: "2026-01-01T00:00:00.000Z" },
    { ...preview, receiptPath: "/etc/private" }
  ])("rejects an invalid operator reply without leaking it", async (reply) => {
    const fixture = client(async () => JSON.stringify(reply));
    expect(await runTestAccessCommand(
      ["renew", "--operator-host", "m4dreambau", "--dry-run"], fixture.dependencies
    )).toBe(1);
    expect(fixture.output).toEqual([]);
    expect(fixture.errors.join("")).not.toContain("must-never-print-a-token");
  });

  it("does not expose arbitrary transport errors", async () => {
    const fixture = client(async () => { throw new Error("Bearer must-never-print-a-token"); });
    expect(await runTestAccessCommand(
      ["renew", "--operator-host", "m4dreambau"], fixture.dependencies
    )).toBe(1);
    expect(fixture.output).toEqual([]);
    expect(fixture.errors.join("")).not.toContain("must-never-print-a-token");
  });
});
