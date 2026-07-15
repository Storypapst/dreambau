#!/usr/bin/env bash
set -euo pipefail

root_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
esbuild="$root_dir/node_modules/.bin/esbuild"
test -x "$esbuild" || { echo "Run npm ci before installing test-access" >&2; exit 1; }

bin_dir=${XDG_BIN_HOME:-"$HOME/.local/bin"}
data_dir=${XDG_DATA_HOME:-"$HOME/.local/share"}/dreambau-agent-tools/test-access
install -d -m 0755 "$bin_dir"
install -d -m 0700 "$data_dir"

bundle="$data_dir/test-access.mjs"
temporary="$bundle.tmp.$$"
wrapper="$bin_dir/test-access"
wrapper_temporary="$wrapper.tmp.$$"
runtime_temporary="$data_dir/node_modules.tmp.$$"
trap 'rm -rf "$runtime_temporary"; rm -f "$temporary" "$wrapper_temporary"' EXIT HUP INT TERM

"$esbuild" "$root_dir/src/server/test-access-cli.ts" \
  --bundle \
  --platform=node \
  --format=esm \
  --external:@playwright/test \
  --target=node20 \
  --log-level=error \
  --outfile="$temporary"
chmod 0600 "$temporary"
mv "$temporary" "$bundle"

# Keep Playwright adjacent to the portable bundle. The broker imports it only
# for `playwright-login`, so ordinary metadata commands remain lightweight.
install -d -m 0700 "$runtime_temporary/@playwright"
cp -R "$root_dir/node_modules/@playwright/test" "$runtime_temporary/@playwright/test"
cp -R "$root_dir/node_modules/playwright" "$runtime_temporary/playwright"
cp -R "$root_dir/node_modules/playwright-core" "$runtime_temporary/playwright-core"
if test -d "$data_dir/node_modules"; then
  mv "$data_dir/node_modules" "$data_dir/node_modules.backup.$(date +%Y%m%d-%H%M%S)"
fi
mv "$runtime_temporary" "$data_dir/node_modules"

printf '%s\n' \
  '#!/bin/sh' \
  'set -eu' \
  'PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"' \
  'export PATH' \
  'exec node "${XDG_DATA_HOME:-$HOME/.local/share}/dreambau-agent-tools/test-access/test-access.mjs" "$@"' \
  > "$wrapper_temporary"
chmod 0755 "$wrapper_temporary"
mv "$wrapper_temporary" "$wrapper"
trap - EXIT HUP INT TERM

printf '%s\n' "$wrapper"
