import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { it } from "vitest";

it("validates real operator registry transactions against isolated fixtures", () => {
  execFileSync("python3", [
    "-m", "unittest", "discover", "-s", "tests", "-p", "test_access_admin.py"
  ], { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8" });
}, 30_000);
