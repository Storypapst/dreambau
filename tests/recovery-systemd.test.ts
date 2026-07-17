import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (name: string) => readFileSync(new URL(`../ops/${name}`, import.meta.url), "utf8");

describe("recovery export systemd operation", () => {
  it("pipes the complete Infisical registry into SOPS without a plaintext temporary file", () => {
    const script = read("test-access-recovery-export.sh");
    expect(script).toContain("set -euo pipefail");
    expect(script).toContain("TEST_ACCESS_RECOVERY_STREAM=1");
    expect(script).toContain("infisical-recovery-source.js");
    expect(script).toContain("sops encrypt");
    expect(script).not.toContain("testmails-accounts");
    expect(script).toContain("mv \"$temporary\" \"$output\"");
    expect(script).toContain("test-access-age-recipients");
    expect(script).toContain("^age1[0-9a-z]{58}$");
    expect(script).toContain("Exactly two distinct valid age recipients are required");
  });

  it("uses a persistent daily timer and hardened one-shot service", () => {
    const service = read("test-access-recovery-export.service");
    const timer = read("test-access-recovery-export.timer");
    const tmpfiles = read("test-access-recovery-export.tmpfiles");
    expect(service).toContain("Type=oneshot");
    expect(service).toContain("UMask=0077");
    expect(service).toContain("NoNewPrivileges=true");
    expect(timer).toContain("OnCalendar=daily");
    expect(timer).toContain("Persistent=true");
    expect(tmpfiles.trim()).toBe("d /var/backups/test-access 0700 root root -");
  });
});
