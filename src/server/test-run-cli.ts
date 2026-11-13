import { z } from "zod";
import { headlessClaimInput, headlessOutcomeInput, headlessResourceId } from "./headless-registration-model.js";
import { createRunInputSchema } from "./test-run-model.js";
import { createMachineHttp, type MachineAuthOptions } from "./machine-http.js";
import { safeWorkspaceUrl } from "./workspace-url.js";

export interface RunApiRequest {
  method: "GET" | "POST";
  path: string;
  body?: Record<string, unknown>;
}

export interface TestRunCliDependencies extends MachineAuthOptions {
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
    "--project", "--target", "--pool", "--version", "--commit", "--scenario", "--role", "--result", "--checks", "--failures", "--report-url",
    "--binding-hash", "--resource-id"
  ]);
  const result: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (flags.has(args[index])) {
      if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`missing value: ${args[index]}`);
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
  if (command === "headless-prepare" || command === "headless-claim" || command === "headless-report") {
    const path = `/runs/${z.uuid().parse(id)}/headless-registration`;
    if (command === "headless-prepare") return { method: "GET", path };
    if (command === "headless-claim") {
      return { method: "POST", path, body: headlessClaimInput.parse({ bindingHash: required(args, "--binding-hash") }) };
    }
    const resourceId = headlessResourceId.parse(required(args, "--resource-id"));
    return { method: "POST", path: `${path}/${resourceId}/outcome`, body: headlessOutcomeInput.parse({ result: required(args, "--result") }) };
  }
  if (command === "show") return { method: "GET", path: `/runs/${encoded}` };
  if (command === "start") return { method: "POST", path: `/runs/${encoded}/start` };
  if (command === "release") return { method: "POST", path: `/runs/${encoded}/release` };
  if (command === "finish") {
    const result = z.enum(["passed", "failed"]).parse(required(args, "--result"));
    const evidence: Record<string, unknown> = {};
    for (const key of ["checks", "failures"] as const) {
      const raw = values(args, `--${key}`)[0];
      if (raw !== undefined) evidence[key] = z.coerce.number().int().nonnegative().parse(raw);
    }
    const report = values(args, "--report-url")[0];
    if (report !== undefined) {
      const url = safeWorkspaceUrl(z.url().parse(report));
      if (!url) throw new Error("--report-url must be a safe HTTPS URL without credentials or fragments");
      evidence.reportUrl = url;
    }
    return { method: "POST", path: `/runs/${encoded}/finish`, body: { result, ...(Object.keys(evidence).length ? { evidence } : {}) } };
  }
  throw new Error("usage: test-access run <create|list|show|start|finish|release|headless-prepare|headless-claim|headless-report> ...");
}

export async function runTestRunCli(args: string[], dependencies: TestRunCliDependencies): Promise<number> {
  const writeError = dependencies.writeError ?? ((value: string) => process.stderr.write(value));
  try {
    if (!dependencies.identity) throw new Error("TEST_ACCESS_IDENTITY or --identity is required");
    const request = buildRunApiRequest(args);
    const http = createMachineHttp({ ...dependencies, service: "test-access" });
    const response = await http.fetch(
      `${dependencies.baseUrl.replace(/\/$/, "")}${request.path}`,
      {
        method: request.method,
        headers: request.body
          ? { "content-type": "application/json" }
          : {},
        body: request.body ? JSON.stringify(request.body) : undefined
      }
    );
    if (!response.ok || (args[0] === "headless-claim" && response.status !== 201)) {
      throw new Error(`Test Run API failed with HTTP ${response.status}`);
    }
    dependencies.write(`${JSON.stringify(await http.json(response), null, 2)}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof z.ZodError
      ? "Invalid test run command"
      : error instanceof Error ? error.message : "Test Run CLI failed";
    writeError(`${message}\n`);
    return 1;
  }
}
