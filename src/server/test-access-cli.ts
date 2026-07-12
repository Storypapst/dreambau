import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

type OutputMode = "json" | "secret" | "otp";

export interface ApiRequest {
  path: string;
  output: OutputMode;
}

function option(args: string[], name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function positional(args: string[]) {
  const options = new Set(["--project", "--environment", "--role"]);
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (options.has(args[index])) {
      index += 1;
      continue;
    }
    if (args[index].startsWith("--")) throw new Error(`unknown option: ${args[index]}`);
    values.push(args[index]);
  }
  return values;
}

export function buildApiRequest(args: string[], _baseUrl: string): ApiRequest {
  const [command, id, ...terms] = positional(args);
  if (command === "list") {
    const query = new URLSearchParams();
    for (const [flag, key] of [["--project", "project"], ["--environment", "environment"], ["--role", "role"]] as const) {
      const value = option(args, flag);
      if (value) query.set(key, value);
    }
    return { path: `/accounts${query.size ? `?${query}` : ""}`, output: "json" };
  }
  if (!id) throw new Error(`${command || "command"} requires an account id`);
  const encoded = encodeURIComponent(id);
  if (command === "get") return { path: `/accounts/${encoded}/secret`, output: "secret" };
  const query = terms.length ? `?${new URLSearchParams({ query: terms.join(" ") })}` : "";
  if (command === "otp") return { path: `/accounts/${encoded}/otp${query}`, output: "otp" };
  if (command === "mail") return { path: `/accounts/${encoded}/mail/latest${query}`, output: "json" };
  throw new Error("usage: test-access <list|get|otp|mail> ...");
}

interface CliDependencies {
  baseUrl: string;
  identity: string;
  readKeychainToken: (identity: string) => string;
  fetch: typeof fetch;
  write: (value: string) => void;
  writeError?: (value: string) => void;
}

export async function runTestAccessCli(args: string[], dependencies: CliDependencies) {
  const writeError = dependencies.writeError ?? ((value: string) => process.stderr.write(value));
  try {
    if (!dependencies.identity) throw new Error("TEST_ACCESS_IDENTITY or --identity is required");
    const request = buildApiRequest(args, dependencies.baseUrl);
    const token = dependencies.readKeychainToken(dependencies.identity);
    if (!token) throw new Error(`Keychain token missing for identity ${dependencies.identity}`);
    const response = await dependencies.fetch(`${dependencies.baseUrl.replace(/\/$/, "")}${request.path}`, {
      headers: { authorization: `Bearer ${token}` }
    });
    if (!response.ok) throw new Error(`Test Access API failed with HTTP ${response.status}`);
    const body = await response.json() as any;
    if (request.output === "secret") dependencies.write(`${String(body.secret)}\n`);
    else if (request.output === "otp") dependencies.write(`${String(body.code)}\n`);
    else dependencies.write(`${JSON.stringify(body, null, 2)}\n`);
    return 0;
  } catch (error) {
    writeError(`${error instanceof Error ? error.message : "Test Access CLI failed"}\n`);
    return 1;
  }
}

function readKeychainToken(identity: string) {
  const result = spawnSync(
    "security",
    ["find-generic-password", "-s", "dreambau-test-access", "-a", identity, "-w"],
    { encoding: "utf8" }
  );
  return result.status === 0 ? result.stdout.trim() : "";
}

async function main() {
  const argv = process.argv.slice(2);
  const identityIndex = argv.indexOf("--identity");
  const identity = identityIndex >= 0 ? argv.splice(identityIndex, 2)[1] : process.env.TEST_ACCESS_IDENTITY ?? "";
  const baseUrl = process.env.TEST_ACCESS_URL ?? "https://dreambau.com/testmails/api/v1";
  process.exitCode = await runTestAccessCli(argv, {
    baseUrl,
    identity,
    readKeychainToken,
    fetch,
    write: (value) => process.stdout.write(value)
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
