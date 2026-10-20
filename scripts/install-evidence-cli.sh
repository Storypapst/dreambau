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
wrapper="$bin_dir/dreambau-evidence"
# mktemp, not $$: a predictable name in a writable directory can be pre-empted
# by a symlink and redirect the write.
temporary=$(mktemp "$data_dir/.dreambau-evidence.XXXXXXXX")
wrapper_temporary=$(mktemp "$bin_dir/.dreambau-evidence.XXXXXXXX")
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

# The bundle path is resolved at install time and baked in. Recomputing it from
# XDG_DATA_HOME at runtime would break every later invocation that does not
# happen to carry the same value the install used.
node_binary=${DREAMBAU_NODE_BINARY:-node}
if [ "$node_binary" != node ] && { [ ! -x "$node_binary" ] || [[ "$node_binary" != /* ]]; }; then
  echo 'DREAMBAU_NODE_BINARY must name an absolute executable' >&2; exit 1
fi
node - "$wrapper_temporary" "$node_binary" "$bundle" "${DREAMBAU_CLI_PROFILE:-}" <<'NODE'
const { writeFileSync } = require("node:fs");
const [wrapper, runtime, bundle, profile] = process.argv.slice(2);
const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
let script = "#!/bin/sh\nset -eu\n";
if (runtime === "node") script += 'PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"\nexport PATH\n';
if (profile) script += `. ${quote(profile)}\n`;
script += `exec ${quote(runtime)} ${quote(bundle)} "$@"\n`;
writeFileSync(wrapper, script);
NODE
chmod 0755 "$wrapper_temporary"
mv "$wrapper_temporary" "$wrapper"
trap - EXIT HUP INT TERM

printf '%s\n' "$wrapper"
