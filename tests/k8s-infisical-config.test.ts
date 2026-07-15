import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function environmentEntries(source: string) {
  const entries: Array<{ name: string; value?: string }> = [];
  let inEnvironment = false;
  let environmentIndent = 0;
  let current: { name: string; value?: string } | null = null;
  for (const line of source.split("\n")) {
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    if (!inEnvironment && /^\s*env:\s*$/.test(line)) {
      inEnvironment = true; environmentIndent = indent; continue;
    }
    if (!inEnvironment) continue;
    if (line.trim() && indent <= environmentIndent) break;
    const inline = line.match(/-\s*\{\s*name:\s*([^,}]+)(?:,\s*value:\s*([^}]+))?/);
    if (inline) { entries.push({ name: inline[1].trim(), ...(inline[2] ? { value: inline[2].trim() } : {}) }); current = null; continue; }
    const name = line.match(/-\s*name:\s*(\S+)/);
    if (name) { current = { name: name[1] }; entries.push(current); continue; }
    const value = line.match(/^\s*value:\s*(.+)$/);
    if (current && value) current.value = value[1].trim();
  }
  return entries;
}

describe("Kubernetes Infisical bootstrap", () => {
  it("mounts only client credentials from a dedicated Secret and keeps project IDs non-secret", () => {
    const deployment = readFileSync(new URL("../k8s/deployment.yaml", import.meta.url), "utf8");
    expect(deployment).toContain("TEST_ACCESS_PROVIDER, value: infisical");
    expect(deployment).toContain("INFISICAL_CLIENT_ID_FILE, value: /run/secrets/infisical/client-id");
    expect(deployment).toContain("INFISICAL_CLIENT_SECRET_FILE, value: /run/secrets/infisical/client-secret");
    expect(deployment).toContain("secretName: test-access-infisical");
    expect(deployment).toContain("TEST_ACCESS_INFISICAL_ORISO_PROJECT_ID");
    expect(deployment).toContain("2808af88-2c60-4023-8754-98665192cfdf");
    const entries = environmentEntries(deployment);
    expect(entries.find((entry) => entry.name === "INFISICAL_CLIENT_SECRET")).toBeUndefined();
    expect(entries.find((entry) => entry.name === "INFISICAL_CLIENT_SECRET_FILE")).toEqual({
      name: "INFISICAL_CLIENT_SECRET_FILE", value: "/run/secrets/infisical/client-secret"
    });
    expect(environmentEntries("env:\n  - name: INFISICAL_CLIENT_SECRET\n    value: literal-secret"))
      .toContainEqual({ name: "INFISICAL_CLIENT_SECRET", value: "literal-secret" });
  });
});
