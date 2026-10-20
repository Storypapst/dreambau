set -eu
bootstrap=$(mktemp)
trap 'rm -f "$bootstrap"' EXIT HUP INT TERM
curl --disable --fail --silent --show-error --proto '=https' --max-time 90 --output "$bootstrap" 'https://raw.githubusercontent.com/Storypapst/dreambau/9c61606a396d2522fb6abf3ff17badfd32f48ebb/scripts/bootstrap-agent-environment.sh'
if command -v sha256sum >/dev/null; then actual=$(sha256sum "$bootstrap" | cut -d ' ' -f 1); else actual=$(shasum -a256 "$bootstrap" | cut -d ' ' -f 1); fi
[ "$actual" = 'fe58e19b259e94940f513bca09f5ab94c413b83f21ad7e5623bacfb87758cf4a' ] || { echo 'Bootstrap checksum mismatch' >&2; exit 1; }
bash "$bootstrap" --revision '9c61606a396d2522fb6abf3ff17badfd32f48ebb' --auth-mode network-proxy
