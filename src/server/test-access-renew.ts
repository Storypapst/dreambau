import { spawn } from "node:child_process";
import { z } from "zod";

const identitySchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/);
const hostSchema = z.string().regex(/^(?:[A-Za-z0-9_][A-Za-z0-9_.-]*@)?[A-Za-z0-9][A-Za-z0-9_.-]*$/);
const requestSchema = z.object({
  identity: identitySchema,
  days: z.number().int().min(1).max(90),
  dryRun: z.boolean()
}).strict();
const receiptSchema = z.object({
  identity: identitySchema,
  oldExpiry: z.string().datetime(),
  newExpiry: z.string().datetime(),
  dryRun: z.boolean(),
  changed: z.boolean(),
  receiptPath: z.string().regex(/^\/var\/backups\/dreambau\/test-access\/[A-Za-z0-9][A-Za-z0-9._-]*\.receipt\.json$/).nullable()
}).strict();

export type RenewalRequest = z.infer<typeof requestSchema>;
export type RenewalOperatorRequest = (host: string, request: RenewalRequest) => Promise<string>;

interface RenewalDependencies {
  identity: string;
  write: (value: string) => void;
  writeError?: (value: string) => void;
  renewOperatorRequest?: RenewalOperatorRequest;
}

class RenewalError extends Error {}

const safeOperatorErrors = new Set([
  "invalid_request", "invalid_registry", "identity_not_found", "identity_revoked",
  "registry_changed", "unsafe_path", "permission_denied", "operation_failed"
]);

function parseOptions(args: string[], identity: string) {
  let host = "";
  let days = 90;
  let dryRun = false;
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i];
    if (seen.has(flag)) throw new RenewalError("Renewal options must not be repeated.");
    seen.add(flag);
    if (flag === "--dry-run") dryRun = true;
    else if (flag === "--operator-host") host = args[++i] ?? "";
    else if (flag === "--days") {
      const value = args[++i] ?? "";
      if (!/^[1-9][0-9]?$/.test(value)) throw new RenewalError("Renewal days must be an integer from 1 to 90.");
      days = Number(value);
    } else throw new RenewalError("Usage: test-access --identity <id> renew --operator-host <SSH host> [--days 1..90] [--dry-run]");
  }
  if (!hostSchema.safeParse(host).success) throw new RenewalError("A valid --operator-host SSH alias or user@host is required.");
  if (!identitySchema.safeParse(identity).success) throw new RenewalError("A valid machine identity is required.");
  if (days > 90) throw new RenewalError("Renewal days must be an integer from 1 to 90.");
  return { host, request: requestSchema.parse({ identity, days, dryRun }) };
}

function sshOperatorRequest(host: string, request: RenewalRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("ssh", [
      "-T", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "-o", "ForwardAgent=no",
      "--", host, "sudo -n /usr/bin/python3 /usr/local/lib/dreambau/test-access-admin.py"
    ], { stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    let errors = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new RenewalError("Operator request timed out; check with --dry-run before retrying."));
    }, 30_000);
    timer.unref();
    const collect = (target: "output" | "errors", chunk: Buffer) => {
      if (target === "output") output += chunk.toString("utf8");
      else errors += chunk.toString("utf8");
      if (output.length + errors.length > 65_536) {
        child.kill();
        reject(new RenewalError("Operator returned an invalid response."));
      }
    };
    child.stdout.on("data", (chunk: Buffer) => collect("output", chunk));
    child.stderr.on("data", (chunk: Buffer) => collect("errors", chunk));
    child.on("error", () => reject(new RenewalError("Could not start the operator SSH connection.")));
    child.stdin.on("error", () => reject(new RenewalError("Operator SSH request could not be delivered.")));
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve(output);
      try {
        const body = JSON.parse(errors);
        if (safeOperatorErrors.has(body.error)) return reject(new RenewalError(`Operator refused renewal: ${body.error}.`));
      } catch { /* Arbitrary SSH/helper errors must never be echoed. */ }
      reject(new RenewalError("Operator renewal failed; check SSH authorization, helper installation and identity state."));
    });
    child.stdin.end(`${JSON.stringify(request)}\n`);
  });
}

export async function runTestAccessRenew(args: string[], dependencies: RenewalDependencies) {
  const writeError = dependencies.writeError ?? ((value: string) => process.stderr.write(value));
  if (args.length === 1 && ["--help", "-h", "help"].includes(args[0])) {
    dependencies.write("Usage: test-access --identity <id> renew --operator-host <SSH host> [--days 1..90] [--dry-run]\nRequires an authorized SSH operator and the installed root-owned host helper; no machine bearer is used.\n");
    return 0;
  }
  try {
    const { host, request } = parseOptions(args, dependencies.identity);
    const raw = await (dependencies.renewOperatorRequest ?? sshOperatorRequest)(host, request);
    const receipt = receiptSchema.parse(JSON.parse(raw));
    const oldTime = Date.parse(receipt.oldExpiry);
    const newTime = Date.parse(receipt.newExpiry);
    if (receipt.identity !== request.identity || receipt.dryRun !== request.dryRun
      || newTime < oldTime
      || (receipt.dryRun && (receipt.changed || receipt.receiptPath !== null))
      || (receipt.changed && (newTime <= oldTime || receipt.receiptPath === null))
      || (!receipt.changed && receipt.receiptPath !== null)
      || (!receipt.changed && !receipt.dryRun && newTime !== oldTime)) {
      throw new RenewalError("Operator returned an invalid renewal receipt.");
    }
    dependencies.write(`${JSON.stringify(receipt, null, 2)}\n`);
    return 0;
  } catch (error) {
    writeError(`${error instanceof RenewalError ? error.message : "Operator renewal failed or returned an invalid response."}\n`);
    return 1;
  }
}
