#!/usr/bin/env bash
# build-test-access-bundle.sh — build the releasable Test-Access CLI.
#
# Output (default dist/cli/, override with --out DIR):
#   test-access.mjs   single-file ESM bundle (Playwright stays external)
#   manifest.json     { name, version, gitSha, builtAt, playwrightVersion,
#                       files: [{ path, sha256 }] }
#
# The version comes from package.json → testAccessCli.version and is stamped
# into the bundle, so `test-access --version` and the served manifest can never
# disagree. The Dreambau app serves this directory at /understand/api/v1/cli/*
# and understand-kit/test-access-install.sh installs from there.
set -euo pipefail

root_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
out_dir="$root_dir/dist/cli"
while [ $# -gt 0 ]; do
  case "$1" in
    --out) out_dir="${2:?--out needs a directory}"; shift 2 ;;
    *) echo "build-test-access-bundle.sh: unknown argument: $1" >&2; exit 2 ;;
  esac
done

esbuild="$root_dir/node_modules/.bin/esbuild"
test -x "$esbuild" || { echo "Run npm ci before building the test-access bundle" >&2; exit 1; }

version="$(node -p 'require(process.argv[1]).testAccessCli.version' "$root_dir/package.json")"
playwright_version="$(node -p 'require(process.argv[1]).packages["node_modules/playwright"].version' "$root_dir/package-lock.json")"
git_sha="${GIT_SHA:-}"
if [ -z "$git_sha" ] && command -v git >/dev/null 2>&1 && git -C "$root_dir" rev-parse --short=12 HEAD >/dev/null 2>&1; then
  git_sha="$(git -C "$root_dir" rev-parse --short=12 HEAD)"
fi
git_sha="${git_sha:-unknown}"

mkdir -p "$out_dir"
bundle="$out_dir/test-access.mjs"
temporary="$bundle.tmp.$$"
trap 'rm -f "$temporary"' EXIT HUP INT TERM

"$esbuild" "$root_dir/src/server/test-access-cli.ts" \
  --bundle \
  --platform=node \
  --format=esm \
  --external:@playwright/test \
  --target=node20 \
  --log-level=error \
  --define:process.env.TEST_ACCESS_CLI_VERSION="\"$version\"" \
  --define:process.env.TEST_ACCESS_CLI_SHA="\"$git_sha\"" \
  --outfile="$temporary"
mv "$temporary" "$bundle"
trap - EXIT HUP INT TERM

node - "$out_dir" "$version" "$git_sha" "$playwright_version" <<'NODE'
const { createHash } = require("node:crypto");
const { readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const [outDir, version, gitSha, playwrightVersion] = process.argv.slice(2);
const bundle = readFileSync(path.join(outDir, "test-access.mjs"));
const manifest = {
  name: "test-access-cli",
  version,
  gitSha,
  builtAt: new Date().toISOString(),
  node: ">=20",
  playwrightVersion,
  files: [{ path: "test-access.mjs", sha256: createHash("sha256").update(bundle).digest("hex"), bytes: bundle.byteLength }]
};
writeFileSync(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`test-access-cli ${version} (${gitSha}) -> ${outDir}`);
NODE
