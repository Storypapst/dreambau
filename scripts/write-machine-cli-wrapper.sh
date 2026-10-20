#!/usr/bin/env bash
# Shared portable CLI wrapper generation for both machine clients.
set -euo pipefail
wrapper=${1:?wrapper output path required}
bundle=${2:?bundle path required}
node_binary=${DREAMBAU_NODE_BINARY:-node}
if [ "$node_binary" != node ] && { [ ! -x "$node_binary" ] || [[ "$node_binary" != /* ]]; }; then
  echo 'DREAMBAU_NODE_BINARY must name an absolute executable' >&2; exit 1
fi
node - "$wrapper" "$node_binary" "$bundle" "${DREAMBAU_CLI_PROFILE:-}" <<'NODE'
const { writeFileSync } = require("node:fs");
const [wrapper, runtime, bundle, profile] = process.argv.slice(2);
const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
let script = "#!/bin/sh\nset -eu\n";
if (runtime === "node") script += 'PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"\nexport PATH\n';
if (profile) script += `. ${quote(profile)}\n`;
script += `exec ${quote(runtime)} ${quote(bundle)} "$@"\n`;
writeFileSync(wrapper, script);
NODE
