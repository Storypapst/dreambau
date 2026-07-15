import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync(new URL("../ops/enable-k3s-secrets-encryption.sh", import.meta.url), "utf8");

describe("K3s secrets-at-rest operation", () => {
  it("defaults to a non-mutating status report", () => {
    expect(script).toContain('apply=false');
    expect(script).toContain('case "${1:-}" in');
    expect(script).toContain('--apply) apply=true');
    expect(script).toContain('k3s secrets-encrypt status');
  });

  it("requires a successful datastore backup before activation", () => {
    expect(script).toContain('k3s etcd-snapshot save');
    expect(script).toContain('test -d /var/lib/rancher/k3s/server/db/etcd');
    expect(script).toContain('exit 1');
  });

  it("enables, restarts, reencrypts and verifies in a single locked operation", () => {
    expect(script).toContain('flock');
    expect(script).toContain('k3s secrets-encrypt enable');
    expect(script).toContain('systemctl restart k3s');
    expect(script).toContain('k3s secrets-encrypt reencrypt');
    expect(script).toMatch(/Encryption Status: Enabled/);
    expect(script).toContain("Current Rotation Stage: reencrypt_finished");
    expect(script).toContain("All hashes match");
    expect(script.match(/encryption_complete/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
