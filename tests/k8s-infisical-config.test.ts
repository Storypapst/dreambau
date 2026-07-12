import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Kubernetes Infisical bootstrap", () => {
  it("mounts only client credentials from a dedicated Secret and keeps project IDs non-secret", () => {
    const deployment = readFileSync(new URL("../k8s/deployment.yaml", import.meta.url), "utf8");
    expect(deployment).toContain("TEST_ACCESS_PROVIDER, value: infisical");
    expect(deployment).toContain("INFISICAL_CLIENT_ID_FILE, value: /run/secrets/infisical/client-id");
    expect(deployment).toContain("INFISICAL_CLIENT_SECRET_FILE, value: /run/secrets/infisical/client-secret");
    expect(deployment).toContain("secretName: test-access-infisical");
    expect(deployment).toContain("TEST_ACCESS_INFISICAL_ORISO_PROJECT_ID");
    expect(deployment).toContain("2808af88-2c60-4023-8754-98665192cfdf");
    expect(deployment).not.toMatch(/client-secret[^\n]*value:/i);
  });
});
