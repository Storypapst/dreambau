import { checkLiveTestAccess } from "./live-smoke.js";

try {
  const result = await checkLiveTestAccess();
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown live smoke failure";
  process.stderr.write(`Test Access live smoke failed: ${message}\n`);
  process.exitCode = 1;
}
