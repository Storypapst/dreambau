#!/usr/bin/env bash
set -euo pipefail
revision=${1:?supply the final public 40-hex commit}
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || { echo 'Immutable 40-hex commit required' >&2; exit 2; }
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
temporary=$(mktemp)
trap 'rm -f "$temporary"' EXIT HUP INT TERM
git -C "$root" show "$revision:scripts/bootstrap-agent-environment.sh" > "$temporary"
if command -v sha256sum >/dev/null; then checksum=$(sha256sum "$temporary" | cut -d ' ' -f 1); else checksum=$(shasum -a256 "$temporary" | cut -d ' ' -f 1); fi
cat <<LOADER
set -eu
bootstrap=\$(mktemp)
trap 'rm -f "\$bootstrap"' EXIT HUP INT TERM
curl --disable --fail --silent --show-error --proto '=https' --max-time 90 --output "\$bootstrap" 'https://raw.githubusercontent.com/Storypapst/dreambau/$revision/scripts/bootstrap-agent-environment.sh'
if command -v sha256sum >/dev/null; then actual=\$(sha256sum "\$bootstrap" | cut -d ' ' -f 1); else actual=\$(shasum -a256 "\$bootstrap" | cut -d ' ' -f 1); fi
[ "\$actual" = '$checksum' ] || { echo 'Bootstrap checksum mismatch' >&2; exit 1; }
bash "\$bootstrap" --revision '$revision' --auth-mode network-proxy
LOADER
