import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const IDENTITY = "codex-m4-oriso";
const ACCOUNT_ID = "oriso/pre-dev/test-consultant-001";

interface LoginCheckDependencies {
  execute?: (command: string, args: string[]) => string;
  write?: (value: string) => void;
  writeError?: (value: string) => void;
}

export function runOrisoConsultantLoginCheck(dependencies: LoginCheckDependencies = {}) {
  const execute = dependencies.execute ?? ((command: string, args: string[]) =>
    execFileSync(command, args, { encoding: "utf8" }));
  const write = dependencies.write ?? ((value: string) => process.stdout.write(value));
  const writeError = dependencies.writeError ?? ((value: string) => process.stderr.write(value));

  try {
    const result = JSON.parse(execute("test-access", [
      "--identity",
      IDENTITY,
      "playwright-login",
      ACCOUNT_ID
    ])) as { accountId?: string; storageState?: string; expiresAt?: string };

    if (result.accountId !== ACCOUNT_ID || !result.storageState || !result.expiresAt) {
      throw new Error("login broker did not return a complete private state handle");
    }
    write("LOGIN_CHECK: SUCCESS\n");
    return 0;
  } catch {
    writeError("LOGIN_CHECK: FAILED\n");
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runOrisoConsultantLoginCheck();
}
