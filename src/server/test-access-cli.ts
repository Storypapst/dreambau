import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import { serializeDotenv } from "./seed-profile.js";
import { readMachineCredential, readMacOSKeychainCredential } from "./machine-credential.js";
import {
  runPlaywrightLoginBroker,
  type BrokerDependencies
} from "./playwright-login-broker.js";
import { runTestRunCli } from "./test-run-cli.js";

type OutputMode = "json" | "secret" | "otp" | "env";

export interface ApiRequest {
  path: string;
  output: OutputMode;
  method?: "POST";
  body?: Record<string, unknown>;
  requiresTotpSecret?: true;
}

function option(args: string[], name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function positional(args: string[]) {
  const options = new Set(["--project", "--environment", "--role", "--version", "--status", "--topics", "--note", "--email"]);
  const switches = new Set(["--json", "--repair"]);
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (options.has(args[index])) {
      index += 1;
      continue;
    }
    if (switches.has(args[index])) continue;
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
  if (command === "lookup") {
    const email = option(args, "--email");
    if (!email) throw new Error("lookup requires --email");
    const query = new URLSearchParams({ email });
    for (const [flag, key] of [["--project", "project"], ["--environment", "environment"]] as const) {
      const value = option(args, flag);
      if (value) query.set(key, value);
    }
    return { path: `/lookup?${query}`, output: "json" };
  }
  if (command === "doctor") {
    const query = args.includes("--repair") ? "?repair=true" : "";
    return { path: `/doctor${query}`, output: "json" };
  }
  if (!id) throw new Error(`${command || "command"} requires an account id`);
  const encoded = encodeURIComponent(id);
  if (command === "sync") {
    const applicationVersion = option(args, "--version");
    if (!applicationVersion) throw new Error("sync requires --version");
    const topics = (option(args, "--topics") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
    return {
      path: `/accounts/${encoded}/catalog`,
      output: "json",
      method: "POST",
      body: {
        applicationVersion,
        lifecycleStatus: option(args, "--status") ?? "active",
        topics,
        notes: option(args, "--note") ?? ""
      }
    };
  }
  if (command === "get") return { path: `/accounts/${encoded}/secret`, output: "secret" };
  if (command === "env") return { path: `/accounts/${encoded}/env`, output: "env" };
  if (command === "enroll-totp") {
    return {
      path: `/accounts/${encoded}/totp`,
      output: "json",
      method: "POST",
      requiresTotpSecret: true
    };
  }
  const query = terms.length ? `?${new URLSearchParams({ query: terms.join(" ") })}` : "";
  if (command === "otp") return { path: `/accounts/${encoded}/otp${query}`, output: args.includes("--json") ? "json" : "otp" };
  if (command === "mail") return { path: `/accounts/${encoded}/mail/latest${query}`, output: "json" };
  throw new Error("usage: test-access <list|lookup|get|enroll-totp|otp|mail|env|doctor|sync|session open> ...");
}

interface CliDependencies {
  baseUrl: string;
  identity: string;
  readKeychainToken: (identity: string) => string;
  fetch: typeof fetch;
  write: (value: string) => void;
  writeError?: (value: string) => void;
  readTotpSecret?: () => Promise<string>;
  playwrightLoginBroker?: typeof runPlaywrightLoginBroker;
}

export async function runTestAccessCommand(args: string[], dependencies: CliDependencies) {
  if (args[0] === "run") return runTestRunCli(args.slice(1), dependencies);
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
    if (request.requiresTotpSecret) {
      const totpSecret = (await (dependencies.readTotpSecret ?? readHiddenTotpSecret)()).trim();
      if (!totpSecret) throw new Error("TOTP secret is required");
      request.body = { totpSecret };
    }
    const token = dependencies.readKeychainToken(dependencies.identity);
    if (!token) throw new Error(`Keychain token missing for identity ${dependencies.identity}`);
    const headers: Record<string, string> = { authorization: `Bearer ${token}` };
    if (request.body) headers["content-type"] = "application/json";
    const response = await dependencies.fetch(`${dependencies.baseUrl.replace(/\/$/, "")}${request.path}`, {
      headers,
      ...(request.method ? { method: request.method } : {}),
      ...(request.body ? { body: JSON.stringify(request.body) } : {})
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
    else if (request.requiresTotpSecret) {
      const value = z.object({
        accountId: z.string(),
        enrolled: z.literal(true),
        updatedAt: z.string().datetime()
      }).passthrough().parse(body);
      dependencies.write(`${JSON.stringify({
        accountId: value.accountId,
        enrolled: value.enrolled,
        updatedAt: value.updatedAt
      }, null, 2)}\n`);
    }
    else if (args.includes("--json") && args[0] === "otp") {
      z.object({ code: z.string().regex(/^\d{6,8}$/) }).passthrough().parse(body);
      dependencies.write(`${JSON.stringify(body, null, 2)}\n`);
    }
    else dependencies.write(`${JSON.stringify(body, null, 2)}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof z.ZodError ? "Test Access API returned an invalid response" : error instanceof Error ? error.message : "Test Access CLI failed";
    writeError(`${message}\n`);
    return 1;
  }
}

async function readHiddenTotpSecret(): Promise<string> {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    return readFileSync(0, "utf8").split(/\r?\n/, 1)[0] ?? "";
  }
  process.stderr.write("TOTP secret: ");
  return new Promise<string>((resolve, reject) => {
    let value = "";
    const cleanup = () => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stderr.write("\n");
    };
    const onData = (chunk: Buffer | string) => {
      for (const character of String(chunk)) {
        if (character === "\u0003") {
          cleanup();
          reject(new Error("TOTP enrollment cancelled"));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          resolve(value);
          return;
        }
        if (character === "\u007f") value = value.slice(0, -1);
        else value += character;
      }
    };
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
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
