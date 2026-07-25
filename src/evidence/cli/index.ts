import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import { readMachineCredential, readMacOSKeychainCredential } from "../../server/machine-credential.js";
import {
  evidenceEnvironments,
  evidenceKinds,
  evidenceResults,
  evidenceSources,
  evidenceProjects,
  type EvidenceFile,
  type EvidenceKind
} from "../model.js";
import { multipartChunkSize } from "../security.js";
import { renderComment } from "./comment.js";
import { createGatewayClient, GatewayError, type GatewayClient } from "./client.js";
import { detectGitHubLogin, GitContextError, resolveTarget, type CommandRunner } from "./git.js";
import {
  defaultWatchOptions,
  emptyWatchState,
  runWatch,
  type WatchDependencies,
  type WatchState
} from "./watch.js";
import { GitHubError, upsertRunComment, type GhRunner } from "./github.js";

export const keychainService = "dreambau-evidence";
const configDirectory = "dreambau-evidence";

export interface CliDependencies {
  baseUrl: string;
  publicBaseUrl: string;
  identity: string;
  readKeychainToken: (identity: string) => string;
  fetch: typeof fetch;
  runCommand: CommandRunner;
  gh: GhRunner;
  /** Windowed read so a 2 GiB recording never has to fit in memory. */
  readChunk: (path: string, start: number, length: number) => Buffer;
  fileSize: (path: string) => number;
  write: (value: string) => void;
  writeError: (value: string) => void;
  clientFactory?: (options: { baseUrl: string; token: string; fetch: typeof fetch }) => GatewayClient;
}

const usage = `usage: dreambau-evidence <command> [options]

  upload <files...>   upload evidence and optionally publish it to the pull request
  publish <run-id>    publish an uploaded run and write the pull request comment
  status <run-id>     show a run, its files and any quarantine findings
  archive <run-id>    remove public reachability for a run
  doctor              check gh, git, the token and gateway reachability
  watch <directory>   upload OBS/Cap recordings as they finish

options:
  --project <oriso|orimo|dreambau>      required for upload
  --environment <local|pre-dev|dev|production-test>
  --result <PASS|FAIL|FLAKY|BLOCKED|INFORMATIONAL>
  --source <codex|claude|kio|github-actions|obs|cap|manual>
  --title <text>                        run title
  --caption <text>                      caption for the next file
  --kind <screenshot|video|...>          override the detected evidence kind
  --pr <number>                         required when a branch has several open PRs
  --publish                             publish and comment after a successful upload
  --draft                               allow an upload without an open pull request
  --allow-older-commit                  upload against a PR whose head has moved on
  --identity <name>                     machine identity (or EVIDENCE_IDENTITY)
  --stable-seconds <n>                  watch: how long a file must stop growing
  --once                                watch: make a single sweep and exit
`;

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function flag(args: string[], name: string): boolean {
  return args.includes(name);
}

const valueOptions = new Set([
  "--project", "--environment", "--result", "--source", "--title", "--caption",
  "--kind", "--pr", "--identity", "--stable-seconds"
]);
const booleanOptions = new Set(["--publish", "--draft", "--allow-older-commit", "--once"]);

export function positionals(args: string[]): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (valueOptions.has(args[index])) { index += 1; continue; }
    if (booleanOptions.has(args[index])) continue;
    if (args[index].startsWith("--")) throw new Error(`unknown option: ${args[index]}`);
    values.push(args[index]);
  }
  return values;
}

const extensionKinds: Array<[RegExp, EvidenceKind]> = [
  [/\.(png|jpg|jpeg|webp)$/i, "screenshot"],
  [/\.(mp4|mov|webm|m4v)$/i, "video"],
  [/(^|[-_.])trace.*\.zip$/i, "trace"],
  [/(^|[-_.])report.*\.zip$/i, "playwright-report"],
  [/\.(log|txt|jsonl)$/i, "log"],
  [/\.(json|md|pdf)$/i, "document"],
  [/\.zip$/i, "document"]
];

export function detectKind(filename: string): EvidenceKind {
  return extensionKinds.find(([pattern]) => pattern.test(filename))?.[1] ?? "other";
}

const contentTypes = new Map<string, string>([
  ["png", "image/png"], ["jpg", "image/jpeg"], ["jpeg", "image/jpeg"], ["webp", "image/webp"],
  ["mp4", "video/mp4"], ["m4v", "video/mp4"], ["mov", "video/quicktime"], ["webm", "video/webm"],
  ["pdf", "application/pdf"], ["zip", "application/zip"],
  ["txt", "text/plain; charset=utf-8"], ["log", "text/plain; charset=utf-8"],
  ["json", "application/json; charset=utf-8"], ["jsonl", "application/json; charset=utf-8"],
  ["md", "text/markdown; charset=utf-8"]
]);

export function contentTypeFor(filename: string): string {
  return contentTypes.get(filename.slice(filename.lastIndexOf(".") + 1).toLowerCase()) ?? "application/octet-stream";
}

const uploadOptionsSchema = z.object({
  project: z.enum(evidenceProjects),
  environment: z.enum(evidenceEnvironments),
  result: z.enum(evidenceResults),
  source: z.enum(evidenceSources),
  title: z.string().trim().min(1).max(200)
});

async function uploadOneFile(
  client: GatewayClient,
  dependencies: CliDependencies,
  runId: string,
  path: string,
  caption: string,
  kind: EvidenceKind
): Promise<EvidenceFile> {
  const filename = basename(path);
  const byteSize = dependencies.fileSize(path);
  const digest = createHash("sha256");
  for (let offset = 0; offset < byteSize; offset += multipartChunkSize) {
    digest.update(dependencies.readChunk(path, offset, multipartChunkSize));
  }
  const initialised = await client.initFile(runId, {
    kind,
    filename,
    caption,
    contentType: contentTypeFor(filename),
    byteSize,
    sha256: digest.digest("hex"),
    head: dependencies.readChunk(path, 0, 4096).toString("base64")
  });
  if (initialised.deduplicated) {
    dependencies.writeError(`${filename}: identical file already in this run, reusing it\n`);
    return initialised.file;
  }

  const partSize = initialised.partSize || multipartChunkSize;
  // Parts the gateway already holds are skipped, so an interrupted upload
  // resumes instead of starting over.
  const already = new Set(initialised.receivedParts);
  const parts = Math.max(1, Math.ceil(byteSize / partSize));
  for (let partNumber = 1; partNumber <= parts; partNumber += 1) {
    if (already.has(partNumber)) continue;
    const chunk = dependencies.readChunk(path, (partNumber - 1) * partSize, partSize);
    await client.uploadPart(runId, initialised.file.id, partNumber, chunk);
    if (parts > 1) dependencies.writeError(`${filename}: part ${partNumber}/${parts}\n`);
  }
  const completed = await client.completeFile(runId, initialised.file.id);
  if (completed.state !== "ready") {
    const rules = completed.findings.map((finding) => finding.rule).join(", ");
    throw new Error(`${filename} was quarantined (${rules}); it has no public URL`);
  }
  return completed.file;
}

async function runUpload(args: string[], dependencies: CliDependencies, client: GatewayClient): Promise<number> {
  const paths = positionals(args).slice(1);
  if (paths.length === 0) throw new Error("upload requires at least one file");
  const draft = flag(args, "--draft");
  const explicit = option(args, "--pr");
  if (explicit !== undefined && !/^[0-9]+$/.test(explicit)) {
    throw new Error(`--pr expects a pull request number, got "${explicit}"`);
  }
  const target = resolveTarget(dependencies.runCommand, {
    explicitPullRequest: explicit === undefined ? undefined : Number(explicit),
    allowOlderCommit: flag(args, "--allow-older-commit"),
    draft
  });

  const parsed = uploadOptionsSchema.parse({
    project: option(args, "--project"),
    environment: option(args, "--environment"),
    result: option(args, "--result"),
    source: option(args, "--source") ?? "codex",
    title: option(args, "--title") ?? basename(paths[0])
  });
  const run = await client.createRun({
    ...parsed,
    repository: target.repository,
    commitSha: target.commitSha,
    pullRequestNumber: target.pullRequest?.number ?? null
  });

  const caption = option(args, "--caption") ?? "";
  const kindOverride = option(args, "--kind");
  const kind = kindOverride ? z.enum(evidenceKinds).parse(kindOverride) : null;
  const files: EvidenceFile[] = [];
  for (const path of paths) {
    files.push(await uploadOneFile(client, dependencies, run.id, path, caption, kind ?? detectKind(basename(path))));
  }

  if (!flag(args, "--publish")) {
    dependencies.write(`${run.id}\n`);
    dependencies.writeError(`uploaded ${files.length} file(s) as a ${draft && !target.pullRequest ? "draft" : "pending"} run; publish with: dreambau-evidence publish ${run.id}\n`);
    return 0;
  }
  if (!target.pullRequest) throw new Error("publishing needs an open pull request; the run stays a private draft");
  return publishRun(run.id, dependencies, client);
}

async function publishRun(runId: string, dependencies: CliDependencies, client: GatewayClient): Promise<number> {
  const detail = await client.getRun(runId);
  if (detail.pullRequestNumber === null) {
    throw new Error(`run ${runId} has no pull request; re-upload with --pr once one is open`);
  }
  const target = {
    repository: detail.repository,
    pullRequestNumber: detail.pullRequestNumber,
    commitSha: detail.commitSha
  };

  // Reserve the addresses first. Nothing is publicly reachable yet, so a GitHub
  // failure below leaves an unpublished run rather than an orphaned link.
  const prepared = await client.publish(runId, { ...target, stage: "prepare" });
  const body = renderComment({
    run: prepared,
    files: prepared.files,
    publicBaseUrl: dependencies.publicBaseUrl
  });
  const { comment, created } = upsertRunComment({
    gh: dependencies.gh,
    repository: prepared.repository,
    pullRequestNumber: detail.pullRequestNumber,
    runId,
    body
  });
  const published = await client.publish(runId, { ...target, stage: "commit", githubCommentUrl: comment.url });

  dependencies.writeError(`${created ? "created" : "updated"} the evidence comment\n`);
  for (const file of published.files) {
    if (file.publicUrl) dependencies.write(`${file.publicUrl}\n`);
  }
  dependencies.write(`${comment.url}\n`);
  return 0;
}

/**
 * Each finished recording becomes its own run and is published straight away,
 * so a long session produces one comment per recording rather than one comment
 * that keeps changing underneath the reader.
 */
async function runWatchCommand(args: string[], dependencies: CliDependencies, client: GatewayClient): Promise<number> {
  const directory = positionals(args)[1];
  if (!directory) throw new Error("watch requires a directory");
  const explicit = option(args, "--pr");
  if (explicit !== undefined && !/^[0-9]+$/.test(explicit)) {
    throw new Error(`--pr expects a pull request number, got "${explicit}"`);
  }
  const draft = flag(args, "--draft");
  const target = resolveTarget(dependencies.runCommand, {
    explicitPullRequest: explicit === undefined ? undefined : Number(explicit),
    allowOlderCommit: flag(args, "--allow-older-commit"),
    draft
  });
  const shared = uploadOptionsSchema.parse({
    project: option(args, "--project"),
    environment: option(args, "--environment"),
    result: option(args, "--result") ?? "PASS",
    source: option(args, "--source") ?? "obs",
    title: option(args, "--title") ?? "Screen recording"
  });

  dependencies.writeError(
    `repository ${target.repository}, commit ${target.commitSha.slice(0, 7)}, environment ${shared.environment}, `
    + `${target.pullRequest ? `pull request #${target.pullRequest.number}` : "no pull request (draft)"}\n`
  );

  return runWatch(
    {
      directory,
      stableMs: stableWindowMs(option(args, "--stable-seconds")),
      pollMs: defaultWatchOptions.pollMs,
      // `--once` makes a single sweep, which is what a CI step wants.
      maxTicks: flag(args, "--once") ? 1 : undefined,
      extensions: defaultWatchOptions.extensions
    },
    {
      ...watchFileSystem(dependencies),
      async upload(path) {
        try {
          const run = await client.createRun({
            ...shared,
            title: `${shared.title}: ${basename(path)}`,
            repository: target.repository,
            commitSha: target.commitSha,
            pullRequestNumber: target.pullRequest?.number ?? null
          });
          const file = await uploadOneFile(
            client, dependencies, run.id, path,
            option(args, "--caption") ?? "",
            detectKind(basename(path))
          );
          if (!target.pullRequest) {
            return { ok: true, publicUrl: null, runId: run.id };
          }
          await publishRun(run.id, dependencies, client);
          return { ok: true, publicUrl: file.publicUrl, runId: run.id };
        } catch (error) {
          const message = messageFor(error);
          // A quarantine is final for this file; anything else may be transient.
          return { ok: false, message, retryable: !/quarantined/i.test(message) };
        }
      },
      write: dependencies.write,
      writeError: dependencies.writeError
    }
  );
}

async function runStatus(runId: string, dependencies: CliDependencies, client: GatewayClient): Promise<number> {
  const detail = await client.getRun(runId);
  dependencies.write(`${JSON.stringify(detail, null, 2)}\n`);
  return 0;
}

async function runDoctor(dependencies: CliDependencies): Promise<number> {
  const checks: Array<[string, boolean, string]> = [];
  const git = dependencies.runCommand("git", ["rev-parse", "HEAD"]);
  checks.push(["git repository", git.code === 0, git.code === 0 ? git.stdout.trim().slice(0, 7) : "not a repository"]);
  const gh = dependencies.runCommand("gh", ["auth", "status"]);
  const login = gh.code === 0 ? detectGitHubLogin(dependencies.runCommand) : "";
  checks.push(["gh authentication", gh.code === 0, gh.code === 0 ? `signed in as ${login || "unknown"}` : "run gh auth login"]);

  // An unreadable *or empty* token is a failure worth reporting. Reporting
  // nothing at all is what made an earlier version exit 0 on a missing token.
  let token = "";
  try {
    token = dependencies.readKeychainToken(dependencies.identity);
    checks.push([
      "keychain token",
      token.length > 0,
      token.length > 0 ? `${keychainService}/${dependencies.identity}` : `empty entry for ${dependencies.identity}`
    ]);
  } catch (error) {
    checks.push(["keychain token", false, error instanceof Error ? error.message : "unreadable"]);
  }

  // Actually ask the gateway rather than echoing the configured address.
  const probe = await probeGateway(dependencies);
  checks.push(["gateway", probe.ok, `${dependencies.baseUrl} — ${probe.detail}`]);

  for (const [name, ok, detail] of checks) {
    dependencies.write(`${ok ? "ok  " : "fail"} ${name.padEnd(20)} ${detail}\n`);
  }
  return checks.every(([, ok]) => ok) ? 0 : 1;
}

async function probeGateway(dependencies: CliDependencies): Promise<{ ok: boolean; detail: string }> {
  const health = `${dependencies.baseUrl.replace(/\/api\/v1$/, "")}/health/live`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await dependencies.fetch(health, { signal: controller.signal });
    return response.ok
      ? { ok: true, detail: "reachable" }
      : { ok: false, detail: `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, detail: (error as { name?: string }).name === "AbortError" ? "timed out" : "unreachable" };
  } finally {
    clearTimeout(timeout);
  }
}

export async function runEvidenceCommand(args: string[], dependencies: CliDependencies): Promise<number> {
  try {
    const command = positionals(args)[0];
    if (!command || command === "help") {
      dependencies.write(usage);
      return command ? 0 : 1;
    }

    if (command === "doctor") return await runDoctor(dependencies);

    if (!dependencies.identity) throw new Error("EVIDENCE_IDENTITY or --identity is required");
    const token = dependencies.readKeychainToken(dependencies.identity);
    if (!token) throw new Error(`Keychain token missing for identity ${dependencies.identity}`);
    const factory = dependencies.clientFactory ?? createGatewayClient;
    const client = factory({ baseUrl: dependencies.baseUrl, token, fetch: dependencies.fetch });

    if (command === "upload") return await runUpload(args, dependencies, client);
    if (command === "watch") return await runWatchCommand(args, dependencies, client);
    const runId = positionals(args)[1];
    if (!runId) throw new Error(`${command} requires a run id`);
    if (command === "publish") return await publishRun(runId, dependencies, client);
    if (command === "status") return await runStatus(runId, dependencies, client);
    if (command === "archive") {
      const archived = await client.archive(runId);
      dependencies.write(`${archived.state}\n`);
      return 0;
    }
    dependencies.write(usage);
    return 1;
  } catch (error) {
    dependencies.writeError(`${messageFor(error)}\n`);
    return 1;
  }
}

function messageFor(error: unknown): string {
  if (error instanceof GitContextError || error instanceof GitHubError || error instanceof GatewayError) return error.message;
  if (error instanceof z.ZodError) {
    const fields = Object.entries(error.flatten().fieldErrors)
      .map(([field, problems]) => `--${field} ${(problems as string[] | undefined ?? []).join(", ")}`)
      .join("; ");
    return `invalid options: ${fields}`;
  }
  return error instanceof Error ? error.message : "dreambau-evidence failed";
}

/** `--stable-seconds 0` is a legitimate value, so this cannot use `||`. */
export function stableWindowMs(raw: string | undefined): number {
  if (raw === undefined) return defaultWatchOptions.stableMs;
  if (!/^[0-9]+$/.test(raw)) throw new Error(`--stable-seconds expects a whole number of seconds, got "${raw}"`);
  return Number(raw) * 1000;
}

/** Real filesystem and clock for the watcher; tests substitute their own. */
export function watchFileSystem(dependencies: CliDependencies): Omit<WatchDependencies, "upload" | "write" | "writeError"> {
  const statePath = join(homedir(), ".config", configDirectory, "watch-state.json");
  return {
    listFiles: (directory) => readdirSync(directory),
    statFile: (path) => {
      try {
        const stat = statSync(path);
        return stat.isFile() ? { size: stat.size, mtimeMs: stat.mtimeMs } : null;
      } catch {
        return null;
      }
    },
    now: () => Date.now(),
    sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    loadState: () => {
      try {
        return JSON.parse(readFileSync(statePath, "utf8")) as WatchState;
      } catch {
        return emptyWatchState;
      }
    },
    saveState: (state) => {
      mkdirSync(dirname(statePath), { recursive: true, mode: 0o700 });
      writeFileSync(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
    }
  };
}

export function readFileChunk(path: string, start: number, length: number): Buffer {
  const descriptor = openSync(path, "r");
  try {
    const buffer = Buffer.alloc(length);
    const read = readSync(descriptor, buffer, 0, length, start);
    return buffer.subarray(0, read);
  } finally {
    closeSync(descriptor);
  }
}

function spawn(command: string, args: string[], input?: string) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 120_000, ...(input === undefined ? {} : { input }) });
  return { code: result.status ?? 1, stdout: String(result.stdout ?? ""), stderr: String(result.stderr ?? "") };
}

async function main() {
  const argv = process.argv.slice(2);
  const identityIndex = argv.indexOf("--identity");
  const identity = identityIndex >= 0 ? argv.splice(identityIndex, 2)[1] : process.env.EVIDENCE_IDENTITY ?? "";
  const publicBaseUrl = process.env.EVIDENCE_PUBLIC_URL ?? "https://evidence.dreambau.com";
  process.exitCode = await runEvidenceCommand(argv, {
    baseUrl: process.env.EVIDENCE_URL ?? `${publicBaseUrl}/api/v1`,
    publicBaseUrl,
    identity,
    readKeychainToken: (name) => readMachineCredential(name, {
      readKeychain: (value) => readMacOSKeychainCredential(value, { service: keychainService }),
      configDirectory,
      subsystem: "dreambau-evidence"
    }),
    fetch,
    runCommand: (command, args) => spawn(command, args),
    gh: (args, input) => spawn("gh", args, input),
    readChunk: readFileChunk,
    fileSize: (path) => statSync(path).size,
    write: (value) => process.stdout.write(value),
    writeError: (value) => process.stderr.write(value)
  });
}

if (
  process.argv[1]
  && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
) void main();
