import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readFileChunk } from "../../src/evidence/cli/index.js";

describe("portable dreambau-evidence installer", () => {
  it("installs a bundled command that carries no source-machine path", () => {
    const root = mkdtempSync(path.join(tmpdir(), "evidence-install-"));
    const env = {
      ...process.env,
      HOME: path.join(root, "home"),
      XDG_BIN_HOME: path.join(root, "bin"),
      XDG_DATA_HOME: path.join(root, "data")
    };
    const installed = spawnSync("bash", ["scripts/install-evidence-cli.sh"], {
      cwd: new URL("../..", import.meta.url),
      env,
      encoding: "utf8"
    });
    expect(installed.stderr).toBe("");
    expect(installed.status).toBe(0);

    const command = path.join(root, "bin", "dreambau-evidence");
    const invoked = spawnSync(command, ["status", "run-1"], {
      env: { ...env, EVIDENCE_IDENTITY: "" },
      encoding: "utf8"
    });
    expect(invoked.status).toBe(1);
    expect(invoked.stderr).toContain("EVIDENCE_IDENTITY");

    const bundle = readFileSync(path.join(root, "data", "dreambau-agent-tools", "evidence", "dreambau-evidence.mjs"), "utf8");
    expect(bundle).not.toContain("/Users/frankgerhardt");
    expect(statSync(path.join(root, "data", "dreambau-agent-tools", "evidence")).mode & 0o077).toBe(0);
  }, 60_000);

  it("keeps the storage SDK out of the portable bundle", () => {
    const script = readFileSync(new URL("../../scripts/install-evidence-cli.sh", import.meta.url), "utf8");
    expect(script).toContain("--external:@aws-sdk/client-s3");
    expect(script).toContain("src/evidence/cli/index.ts");
  });

  it("prints usage when invoked without a command", () => {
    const usage = spawnSync("npx", ["tsx", "src/evidence/cli/index.ts"], {
      cwd: new URL("../..", import.meta.url),
      encoding: "utf8"
    });
    expect(usage.stdout).toContain("dreambau-evidence <command>");
    expect(usage.stdout).toContain("--draft");
  }, 60_000);
});

describe("readFileChunk", () => {
  it("reads a window without buffering the whole file", () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "evidence-chunk-")), "sample.bin");
    writeFileSync(file, Buffer.from("0123456789"));
    expect(readFileChunk(file, 0, 4).toString()).toBe("0123");
    expect(readFileChunk(file, 4, 4).toString()).toBe("4567");
    expect(readFileChunk(file, 8, 4).toString()).toBe("89");
    expect(readFileChunk(file, 20, 4)).toHaveLength(0);
  });
});
