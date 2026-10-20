import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  createMachineHttp,
  type MachineHttpDependencies,
} from "../machine-http.js";
import {
  readMachineCredential,
  readMacOSKeychainCredential,
} from "../machine-credential.js";
import { checkpointSchema } from "./model.js";
class CommandError extends Error {}
interface Dependencies extends Omit<MachineHttpDependencies, "service"> {
  write: (v: string) => void;
  writeError?: (v: string) => void;
}
const help =
  "work-state attention [--project oriso --limit 25 --cursor 0]\nwork-state resume ITEM_ID [--checkout PATH]\nwork-state detail PR_NUMBER --repo REPO_ID --section overview|checks|reviews|threads\nwork-state text ITEM_ID --section FIELD [--cursor N --version N]\nwork-state checkpoint ITEM_ID --input FILE --idempotency-key KEY\nUse WORK_STATE_IDENTITY or --identity with its own work-state credential.\n";
const packetSchema = z
  .object({
    branch: z.string().nullable().optional(),
    commit: z.string().nullable().optional(),
    pulls: z
      .array(z.object({ repository: z.string().nullable().optional() }))
      .optional(),
    truncatedFields: z.array(z.string()).optional(),
  })
  .passthrough();
/** Read-only git inspection. No command or path from saved content is executed. */
export function inspectCheckout(
  checkout: string,
  context: z.input<typeof packetSchema>,
) {
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", checkout, ...args], {
      encoding: "utf8",
      timeout: 5000,
      maxBuffer: 2 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  try {
    const root = git("rev-parse", "--show-toplevel"),
      branch = git("rev-parse", "--abbrev-ref", "HEAD"),
      commit = git("rev-parse", "HEAD"),
      dirty = git("status", "--porcelain").length > 0;
    let repository: string | null = null;
    try {
      const remote = git("remote", "get-url", "origin");
      const scp = remote.match(
        /^git@github\.com:([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/,
      );
      if (scp) repository = scp[1];
      else {
        const url = new URL(remote);
        if (
          ["https:", "ssh:"].includes(url.protocol) &&
          url.hostname === "github.com" &&
          !url.port &&
          !url.search &&
          !url.hash
        )
          repository =
            url.pathname.match(
              /^\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/,
            )?.[1] ?? null;
      }
    } catch {}
    const complete = (field: string) =>
      !context.truncatedFields?.includes(field);
    const matches = {
      repository:
        repository && context.pulls?.some((p) => p.repository)
          ? context.pulls.some((p) => p.repository === repository)
          : null,
      branch:
        context.branch && complete("branch") ? branch === context.branch : null,
      commit:
        context.commit && complete("commit") ? commit === context.commit : null,
    };
    return {
      root,
      repository,
      branch,
      commit,
      dirty,
      matches,
      requiresInspection:
        dirty || Object.values(matches).some((v) => v !== true),
    };
  } catch {
    return {
      root: null,
      repository: null,
      branch: null,
      commit: null,
      dirty: null,
      matches: { repository: null, branch: null, commit: null },
      requiresInspection: true,
      error: "checkout_unavailable",
    };
  }
}
function parse(args: string[]) {
  const flags = new Set([
    "project",
    "limit",
    "cursor",
    "view",
    "repo",
    "person",
    "priority",
    "reason",
    "identity",
    "checkout",
    "input",
    "idempotency-key",
    "section",
    "version",
    "revision",
  ]);
  const options: Record<string, string> = {},
    pos: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (
        !flags.has(key) ||
        !args[i + 1] ||
        args[i + 1].startsWith("--") ||
        options[key] !== undefined
      )
        throw new CommandError("Invalid work-state arguments");
      options[key] = args[++i];
    } else pos.push(arg);
  }
  const [command, id] = pos;
  if (
    !["attention", "resume", "checkpoint", "detail", "text"].includes(
      command,
    ) ||
    pos.length !== (command === "attention" ? 1 : 2)
  )
    throw new CommandError(help);
  if (options.project && options.project !== "oriso")
    throw new CommandError("Only project oriso is supported");
  const number = (key: string, max = Number.MAX_SAFE_INTEGER) => {
    if (
      options[key] !== undefined &&
      (!/^\d+$/.test(options[key]) || Number(options[key]) > max)
    )
      throw new CommandError(`Invalid --${key}`);
  };
  number("limit", 25);
  number("cursor");
  number("version");
  if (options.limit === "0") throw new CommandError("Invalid --limit");
  let path = "",
    method = "GET",
    body: unknown,
    key: string | undefined;
  const params = new URLSearchParams();
  const copy = (names: string[]) => {
    for (const n of names)
      if (options[n] !== undefined)
        params.set(n === "repo" ? "repositoryId" : n, options[n]);
  };
  if (command === "attention") {
    path = "/attention";
    copy(["limit", "cursor", "view", "repo", "person", "priority", "reason"]);
  }
  if (command === "resume") path = `/items/${encodeURIComponent(id)}/context`;
  if (command === "text") {
    if (!options.section) throw new CommandError("--section required");
    path = `/items/${encodeURIComponent(id)}/sections/${encodeURIComponent(options.section)}`;
    copy(["cursor", "version"]);
  }
  if (command === "detail") {
    if (
      !options.repo ||
      !options.section ||
      !/^\d+$/.test(id) ||
      Number(id) < 1
    )
      throw new CommandError("PR number, --repo and --section required");
    path = `/repositories/${encodeURIComponent(options.repo)}/pulls/${id}/sections/${encodeURIComponent(options.section)}`;
    copy(["cursor", "revision"]);
  }
  if (command === "checkpoint") {
    key = options["idempotency-key"];
    if (!options.input || !key || !/^[A-Za-z0-9._-]{1,200}$/.test(key))
      throw new CommandError("--input and --idempotency-key required");
    if (statSync(options.input).size > 65536)
      throw new CommandError("Checkpoint input exceeds64KiB");
    body = checkpointSchema.parse(
      JSON.parse(readFileSync(options.input, "utf8")),
    );
    if (Buffer.byteLength(JSON.stringify(body)) > 65536)
      throw new CommandError("Checkpoint input exceeds64KiB");
    method = "PUT";
    path = `/items/${encodeURIComponent(id)}/checkpoint`;
  }
  return {
    command,
    id,
    options,
    path: path + (params.size ? `?${params}` : ""),
    method,
    body,
    key,
  };
}
async function jsonWithin(response: Response) {
  if (!response.ok)
    throw new CommandError(
      `Work-state API HTTP ${response.status}; no successful write confirmed`,
    );
  const reader = response.body?.getReader();
  if (!reader) throw new CommandError("Empty work-state response");
  let length = 0;
  const buffers: Uint8Array[] = [];
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    length += part.value.byteLength;
    if (length > 12288) {
      await reader.cancel();
      throw new CommandError("Work-state response exceeds12KiB");
    }
    buffers.push(part.value);
  }
  try {
    return JSON.parse(Buffer.concat(buffers).toString("utf8")) as unknown;
  } catch {
    throw new CommandError("Invalid work-state JSON response");
  }
}
export async function runWorkStateCli(args: string[], deps: Dependencies) {
  try {
    if (args.length === 0 || args.includes("--help")) {
      deps.write(help);
      return 0;
    }
    const r = parse(args),
      identity = r.options.identity ?? deps.identity;
    if (!identity)
      throw new CommandError("WORK_STATE_IDENTITY or --identity is required");
    const http = createMachineHttp({
        ...deps,
        identity,
        service: "work-state",
      }),
      base = deps.baseUrl.replace(/\/$/, "");
    const result = await jsonWithin(
      await http.fetch(base + r.path, {
        method: r.method,
        headers: r.body
          ? { "content-type": "application/json", "Idempotency-Key": r.key! }
          : {},
        body: r.body ? JSON.stringify(r.body) : undefined,
        signal: AbortSignal.timeout(15000),
      }),
    );
    let output: unknown = result;
    if (r.command === "checkpoint") {
      const receipt = await jsonWithin(
        await http.fetch(
          `${base}/items/${encodeURIComponent(r.id)}/checkpoint-receipts/${encodeURIComponent(r.key!)}`,
          { signal: AbortSignal.timeout(15000) },
        ),
      );
      const schema = z.object({
        id: z.string(),
        version: z.number().int().positive(),
      });
      const saved = schema.parse(result),
        readback = schema.parse(receipt);
      if (
        saved.id !== r.id ||
        readback.id !== r.id ||
        saved.version !== readback.version
      )
        throw new CommandError("Checkpoint readback mismatch");
      output = { ...saved, confirmed: true };
    }
    if (r.command === "resume") {
      const context = packetSchema.parse(result);
      output = {
        context: result,
        checkout: inspectCheckout(r.options.checkout ?? process.cwd(), context),
      };
    }
    const encoded = JSON.stringify(output);
    if (Buffer.byteLength(encoded) > 12288)
      throw new CommandError("CLI output exceeds12KiB");
    deps.write(encoded + "\n");
    return 0;
  } catch (error) {
    deps.writeError?.(
      (error instanceof CommandError
        ? error.message
        : "Work-state command failed; no successful write confirmed") + "\n",
    );
    return 1;
  }
}
async function main() {
  process.exitCode = await runWorkStateCli(process.argv.slice(2), {
    identity: process.env.WORK_STATE_IDENTITY ?? "",
    baseUrl:
      process.env.WORK_STATE_URL ?? "https://dreambau.com/work-state/api/v1",
    authMode: process.env.WORK_STATE_AUTH_MODE,
    proxyUrl: process.env.HTTPS_PROXY,
    fetch,
    readKeychainToken: (identity) =>
      readMachineCredential(identity, {
        readKeychain: (id) =>
          readMacOSKeychainCredential(id, { service: "dreambau-work-state" }),
        configDirectory: "dreambau-work-state",
        subsystem: "Work State",
      }),
    write: (s) => process.stdout.write(s),
    writeError: (s) => process.stderr.write(s),
  });
}
if (
  process.argv[1] &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
)
  void main();
