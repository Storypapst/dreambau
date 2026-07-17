import { z } from "zod";
import { createRunInputSchema } from "./test-run-model.js";

export interface RunApiRequest {
  method: "GET" | "POST";
  path: string;
  body?: Record<string, unknown>;
}

export interface TestRunCliDependencies {
  baseUrl: string;
  identity: string;
  readKeychainToken: (identity: string) => string;
  fetch: typeof fetch;
  write: (value: string) => void;
  writeError?: (value: string) => void;
}

function values(args: string[], flag: string): string[] {
  const result: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === flag && args[index + 1]) result.push(args[index + 1]);
  }
  return result;
}

function required(args: string[], flag: string): string {
  const value = values(args, flag)[0];
  if (!value) throw new Error(`${flag} is required`);
  return value;
}

function positionals(args: string[]): string[] {
  const flags = new Set([
    "--project", "--target", "--pool", "--version", "--commit", "--scenario", "--role", "--result"
  ]);
  const result: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (flags.has(args[index])) {
      index += 1;
      continue;
    }
    if (args[index].startsWith("--")) throw new Error(`unknown option: ${args[index]}`);
    result.push(args[index]);
  }
  return result;
}

function parseRoles(args: string[]) {
  const roles = values(args, "--role").map((value) => {
    const match = value.match(/^([^=]+)=([1-9][0-9]*)$/);
    if (!match) throw new Error(`invalid --role value: ${value}`);
    return { role: match[1], count: Number(match[2]) };
  });
  if (roles.length === 0) throw new Error("--role is required");
  return roles;
}

export function buildRunApiRequest(args: string[]): RunApiRequest {
  const [command, id] = positionals(args);
  if (command === "create") {
    const body = createRunInputSchema.parse({
      project: required(args, "--project"),
      targetEnvironment: required(args, "--target"),
      poolEnvironment: required(args, "--pool"),
      applicationVersion: required(args, "--version"),
      commitSha: required(args, "--commit"),
      scenario: required(args, "--scenario"),
      roles: parseRoles(args)
    });
    return { method: "POST", path: "/runs", body };
  }
  if (command === "list") {
    const query = new URLSearchParams();
    const project = values(args, "--project")[0];
    const target = values(args, "--target")[0];
    if (project) query.set("project", project);
    if (target) query.set("targetEnvironment", target);
    return { method: "GET", path: `/runs${query.size > 0 ? `?${query}` : ""}` };
  }
  if (!id) throw new Error(`${command || "run command"} requires a run id`);
  const encoded = encodeURIComponent(id);
  if (command === "show") return { method: "GET", path: `/runs/${encoded}` };
  if (command === "start") return { method: "POST", path: `/runs/${encoded}/start` };
  if (command === "release") return { method: "POST", path: `/runs/${encoded}/release` };
  if (command === "finish") {
    const result = z.enum(["passed", "failed"]).parse(required(args, "--result"));
    return { method: "POST", path: `/runs/${encoded}/finish`, body: { result } };
  }
  throw new Error("usage: test-access run <create|list|show|start|finish|release> ...");
}

export async function runTestRunCli(args: string[], dependencies: TestRunCliDependencies): Promise<number> {
  const writeError = dependencies.writeError ?? ((value: string) => process.stderr.write(value));
  try {
    if (!dependencies.identity) throw new Error("TEST_ACCESS_IDENTITY or --identity is required");
    const request = buildRunApiRequest(args);
    const token = dependencies.readKeychainToken(dependencies.identity);
    if (!token) throw new Error(`Keychain token missing for identity ${dependencies.identity}`);
    const response = await dependencies.fetch(
      `${dependencies.baseUrl.replace(/\/$/, "")}${request.path}`,
      {
        method: request.method,
        headers: request.body
          ? { authorization: `Bearer ${token}`, "content-type": "application/json" }
          : { authorization: `Bearer ${token}` },
        body: request.body ? JSON.stringify(request.body) : undefined
      }
    );
    if (!response.ok) throw new Error(`Test Run API failed with HTTP ${response.status}`);
    dependencies.write(`${JSON.stringify(await response.json(), null, 2)}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof z.ZodError
      ? "Invalid test run command"
      : error instanceof Error ? error.message : "Test Run CLI failed";
    writeError(`${message}\n`);
    return 1;
  }
}
