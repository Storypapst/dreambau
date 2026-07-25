#!/usr/bin/env bash
set -euo pipefail

root_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
esbuild="$root_dir/node_modules/.bin/esbuild"
test -x "$esbuild" || { echo "Run npm ci before installing dreambau-evidence" >&2; exit 1; }

bin_dir=${XDG_BIN_HOME:-"$HOME/.local/bin"}
data_dir=${XDG_DATA_HOME:-"$HOME/.local/share"}/dreambau-agent-tools/evidence
install -d -m 0755 "$bin_dir"
install -d -m 0700 "$data_dir"

bundle="$data_dir/dreambau-evidence.mjs"
temporary="$bundle.tmp.$$"
wrapper="$bin_dir/dreambau-evidence"
wrapper_temporary="$wrapper.tmp.$$"
trap 'rm -f "$temporary" "$wrapper_temporary"' EXIT HUP INT TERM

# The CLI never talks to MinIO, so the AWS SDK stays out of the portable bundle.
"$esbuild" "$root_dir/src/evidence/cli/index.ts" \
  --bundle \
  --platform=node \
  --format=esm \
  --external:@aws-sdk/client-s3 \
  --external:better-sqlite3 \
  --target=node20 \
  --log-level=error \
  --outfile="$temporary"
chmod 0600 "$temporary"
mv "$temporary" "$bundle"

printf '%s\n' \
  '#!/bin/sh' \
  'set -eu' \
  'PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"' \
  'export PATH' \
  'exec node "${XDG_DATA_HOME:-$HOME/.local/share}/dreambau-agent-tools/evidence/dreambau-evidence.mjs" "$@"' \
  > "$wrapper_temporary"
chmod 0755 "$wrapper_temporary"
mv "$wrapper_temporary" "$wrapper"
trap - EXIT HUP INT TERM

printf '%s\n' "$wrapper"
