import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (name: string) => readFileSync(new URL(`../ops/${name}`, import.meta.url), "utf8");

describe("recovery export systemd operation", () => {
  it("pipes Kubernetes account data without a plaintext temporary file", () => {
    const script = read("test-access-recovery-export.sh");
    expect(script).toContain("TESTMAILS_ACCOUNTS_PATH=-");
    expect(script).toContain("kubectl get secret testmails-accounts");
    expect(script).toContain("base64 -d");
    expect(script).not.toMatch(/mktemp|accounts\.json >/);
    expect(script).toContain("test-access-age-recipients");
  });

  it("uses a persistent daily timer and hardened one-shot service", () => {
    const service = read("test-access-recovery-export.service");
    const timer = read("test-access-recovery-export.timer");
    expect(service).toContain("Type=oneshot");
    expect(service).toContain("UMask=0077");
    expect(service).toContain("NoNewPrivileges=true");
    expect(timer).toContain("OnCalendar=daily");
    expect(timer).toContain("Persistent=true");
  });
});
