import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("portable test-access installer", () => {
  it("installs a working bundled command without a source-machine path", () => {
    const root = mkdtempSync(path.join(tmpdir(), "test-access-install-"));
    const env = {
      ...process.env,
      HOME: path.join(root, "home"),
      XDG_BIN_HOME: path.join(root, "bin"),
      XDG_DATA_HOME: path.join(root, "data")
    };
    const installed = spawnSync("bash", ["scripts/install-test-access-cli.sh"], {
      cwd: new URL("..", import.meta.url),
      env,
      encoding: "utf8"
    });
    const command = path.join(root, "bin", "test-access");
    const invoked = spawnSync(command, ["list"], { env: { ...env, TEST_ACCESS_IDENTITY: "" }, encoding: "utf8" });
    const bundle = readFileSync(path.join(root, "data", "dreambau-agent-tools", "test-access", "test-access.mjs"), "utf8");

    expect(installed.status).toBe(0);
    expect(invoked.status).toBe(1);
    expect(invoked.stderr).toContain("TEST_ACCESS_IDENTITY");
    expect(bundle).not.toContain("/Users/frankgerhardt");
  });
});
