#!/usr/bin/env node
// Compatibility entrypoint. Credential handling and browser automation live in
// the canonical Test Access Playwright broker invoked by the TypeScript check.
import { spawnSync } from "node:child_process";

const result = spawnSync(
  "npx",
  ["--no-install", "tsx", "src/server/oriso-consultant-login-check.ts"],
  { cwd: new URL("..", import.meta.url), stdio: "inherit" }
);

process.exitCode = result.status ?? 1;
