import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import { serializeDotenv } from "./seed-profile.js";
import { readMachineCredential, readMacOSKeychainCredential } from "./machine-credential.js";
import {
  runPlaywrightLoginBroker,
  type BrokerDependencies
} from "./playwright-login-broker.js";

type OutputMode = "json" | "secret" | "otp" | "env";

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
  if (command === "env") return { path: `/accounts/${encoded}/env`, output: "env" };
  const query = terms.length ? `?${new URLSearchParams({ query: terms.join(" ") })}` : "";
  if (command === "otp") return { path: `/accounts/${encoded}/otp${query}`, output: "otp" };
  if (command === "mail") return { path: `/accounts/${encoded}/mail/latest${query}`, output: "json" };
  throw new Error("usage: test-access <list|get|otp|mail|env|session open> ...");
}

interface CliDependencies {
  baseUrl: string;
  identity: string;
  readKeychainToken: (identity: string) => string;
  fetch: typeof fetch;
  write: (value: string) => void;
  writeError?: (value: string) => void;
  playwrightLoginBroker?: typeof runPlaywrightLoginBroker;
}

export async function runTestAccessCommand(args: string[], dependencies: CliDependencies) {
  const isSessionOpen = args[0] === "session" && args[1] === "open";
  if (args[0] === "playwright-login" || isSessionOpen) {
    const accountId = isSessionOpen ? args[2] ?? "" : args[1] ?? "";
    const brokerDependencies: BrokerDependencies = dependencies;
    return (dependencies.playwrightLoginBroker ?? runPlaywrightLoginBroker)(accountId, brokerDependencies);
  }
  return runTestAccessCli(args, dependencies);
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
    const body = await response.json() as unknown;
    if (request.output === "secret") {
      const { secret } = z.object({ secret: z.string() }).passthrough().parse(body);
      dependencies.write(`${secret}\n`);
    }
    else if (request.output === "otp") {
      const { code } = z.object({ code: z.string() }).passthrough().parse(body);
      dependencies.write(`${code}\n`);
    }
    else if (request.output === "env") {
      const { variables } = z.object({ variables: z.record(z.string(), z.string()) }).passthrough().parse(body);
      dependencies.write(serializeDotenv(variables));
    }
    else dependencies.write(`${JSON.stringify(body, null, 2)}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof z.ZodError ? "Test Access API returned an invalid response" : error instanceof Error ? error.message : "Test Access CLI failed";
    writeError(`${message}\n`);
    return 1;
  }
}

function readTestAccessCredential(identity: string) {
  return readMachineCredential(identity, { readKeychain: readMacOSKeychainCredential });
}

async function main() {
  const argv = process.argv.slice(2);
  const identityIndex = argv.indexOf("--identity");
  const identity = identityIndex >= 0 ? argv.splice(identityIndex, 2)[1] : process.env.TEST_ACCESS_IDENTITY ?? "";
  const baseUrl = process.env.TEST_ACCESS_URL ?? "https://dreambau.com/testmails/api/v1";
  process.exitCode = await runTestAccessCommand(argv, {
    baseUrl,
    identity,
    readKeychainToken: readTestAccessCredential,
    fetch,
    write: (value) => process.stdout.write(value)
  });
}

if (
  process.argv[1]
  && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
) void main();
