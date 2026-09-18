import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The bundle ships whatever `PAYLOAD` lists and a subscriber verifies whatever
// `manifest.json` lists. When those two drift, the extra file travels unverified
// and `install.sh --subscribe` still executes it. This happened once with
// `test-access-install.sh`, which reads the Test-Access credential.
const kitDir = path.resolve(__dirname, "../understand-kit");

function shippedPayload(): string[] {
  const script = readFileSync(path.join(kitDir, "build-bundle.sh"), "utf8");
  const declaration = /^PAYLOAD=\(([\s\S]*?)\)$/m.exec(script);
  if (!declaration) throw new Error("PAYLOAD array not found in build-bundle.sh");
  return declaration[1]
    .replace(/\\\n/g, " ")
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

describe("understand-kit manifest", () => {
  it("checksums every file the bundle ships", () => {
    const manifest = JSON.parse(readFileSync(path.join(kitDir, "manifest.json"), "utf8"));
    const covered: string[] = manifest.files.map((file: { path: string }) => file.path);

    const uncovered = shippedPayload().filter((entry) => {
      const target = path.join(kitDir, entry);
      const isDirectory = statSync(target).isDirectory();
      return isDirectory
        ? !covered.some((file) => file.startsWith(`${entry}/`))
        : !covered.includes(entry);
    });

    expect(uncovered).toEqual([]);
  });

  it("gives every manifest entry a sha256", () => {
    const manifest = JSON.parse(readFileSync(path.join(kitDir, "manifest.json"), "utf8"));
    for (const file of manifest.files) expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
