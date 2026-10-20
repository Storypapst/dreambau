#!/usr/bin/env bash
# Secret-free setup. Authentication checks belong to dreambau-cloud-doctor.
set -euo pipefail
revision=''; source_dir=''; node_dir=''; auth_mode=network-proxy; system_deps=auto
while [ "$#" -gt 0 ]; do
  case "$1" in
    --revision) revision=${2:?revision required}; shift 2 ;;
    --source-dir) source_dir=${2:?source directory required}; shift 2 ;;
    --node-dir) node_dir=${2:?Node directory required}; shift 2 ;;
    --auth-mode) auth_mode=${2:?auth mode required}; shift 2 ;;
    --skip-system-deps) system_deps=skip; shift ;;
    --help|-h) printf '%s\n' 'bootstrap-agent-environment.sh --revision <40-hex commit> [--auth-mode network-proxy|machine-token] [--source-dir <committed checkout>] [--node-dir <verified Node20.20.2 directory>] [--skip-system-deps]'; exit 0 ;;
    *) echo 'Unknown bootstrap option' >&2; exit 2 ;;
  esac
done
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || { echo 'An immutable 40-hex source revision is required' >&2; exit 2; }
case "$auth_mode" in machine-token|network-proxy) ;; *) echo 'Invalid auth mode' >&2; exit 2 ;; esac
case "$(uname -s)/$(uname -m)" in
  Linux/x86_64) platform=linux-x64; extension=tar.xz; node_sha=df770b2a6f130ed8627c9782c988fda9669fa23898329a61a871e32f965e007d ;;
  Darwin/arm64) platform=darwin-arm64; extension=tar.gz; node_sha=466e05f3477c20dfb723054dfebffe55bc74660ee77f612166fca121dacb65b6 ;;
  Darwin/x86_64) platform=darwin-x64; extension=tar.gz; node_sha=8be6f5e4bb128c82774f8a0b8d7a1cc1365a7977d9657cece0ca647b3fe04e61 ;;
  *) echo 'Supported: Ubuntu24.04 x86_64 and macOS arm64/x86_64' >&2; exit 1 ;;
esac
if [ "$platform" = linux-x64 ] && [ "$system_deps" = auto ]; then
  if [ "$(id -u)" = 0 ]; then privilege=(); elif command -v sudo >/dev/null; then privilege=(sudo); else
    echo 'Install system prerequisites as administrator, then use --skip-system-deps (see public guide)' >&2; exit 1
  fi
  "${privilege[@]}" apt-get update -qq
  DEBIAN_FRONTEND=noninteractive "${privilege[@]}" apt-get install -y -qq ca-certificates curl git xz-utils python3 make g++ gh
fi
for command in curl git tar; do command -v "$command" >/dev/null || { echo "Missing prerequisite: $command" >&2; exit 1; }; done
# Validate local proof input before any installations. Archive the commit, never
# copy a checkout's .git, local files, credentials or uncommitted changes.
if [ -n "$source_dir" ]; then
  [ "$(git -C "$source_dir" rev-parse HEAD)" = "$revision" ] || { echo 'Local source revision mismatch' >&2; exit 1; }
fi
cloud_root=${XDG_DATA_HOME:-"$HOME/.local/share"}/dreambau-cloud
bin_dir=${XDG_BIN_HOME:-"$HOME/.local/bin"}
project_dir=${CLAUDE_PROJECT_DIR:-"$PWD"}
mkdir -p "$cloud_root" "$bin_dir"
chmod 700 "$cloud_root"
temporary=$(mktemp -d "$cloud_root/.setup.XXXXXXXX")
trap 'rm -rf "$temporary"' EXIT HUP INT TERM
checksum() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d ' ' -f 1; else shasum -a 256 "$1" | cut -d ' ' -f 1; fi; }
download() { curl --disable --fail --silent --show-error --proto '=https' --max-time 180 --retry 2 --output "$2" "$1"; }
if [ -z "$node_dir" ]; then
  node_dir="$cloud_root/runtimes/node-v20.20.2-$platform"
  if [ ! -x "$node_dir/bin/node" ]; then
    archive="node-v20.20.2-$platform.$extension"
    download "https://nodejs.org/dist/v20.20.2/$archive" "$temporary/node.archive"
    [ "$(checksum "$temporary/node.archive")" = "$node_sha" ] || { echo 'Node archive checksum mismatch' >&2; exit 1; }
    mkdir -p "$cloud_root/runtimes"
    tar -xf "$temporary/node.archive" -C "$temporary"
    mv "$temporary/node-v20.20.2-$platform" "$node_dir"
  fi
fi
[ -x "$node_dir/bin/node" ] && [ "$("$node_dir/bin/node" --version)" = v20.20.2 ] || { echo 'Node20.20.2 is required' >&2; exit 1; }
node_dir=$(CDPATH= cd -- "$node_dir" && pwd)
export PATH="$node_dir/bin:$PATH"
source_cache="$cloud_root/sources/$revision"
if [ ! -d "$source_cache" ]; then
  mkdir -p "$temporary/source" "$cloud_root/sources"
  if [ -n "$source_dir" ]; then git -C "$source_dir" archive "$revision" | tar -xf - -C "$temporary/source"; else
    download "https://codeload.github.com/Storypapst/dreambau/tar.gz/$revision" "$temporary/source.tar.gz"
    tar -xzf "$temporary/source.tar.gz" --strip-components=1 -C "$temporary/source"
  fi
  mv "$temporary/source" "$source_cache"
fi
# Do not use a user's npmrc, install a fresh package version or contact a gateway.
export NPM_CONFIG_USERCONFIG=/dev/null
# Reconcile the complete dependency tree on each rerun; npm's cache stores
# public package bytes, while package-lock remains the only dependency authority.
(cd "$source_cache" && npm ci --no-audit --no-fund)
export PLAYWRIGHT_BROWSERS_PATH="$cloud_root/browsers"
if [ "$platform" = linux-x64 ] && [ "$system_deps" = auto ]; then
  "$source_cache/node_modules/.bin/playwright" install --with-deps chromium
else
  "$source_cache/node_modules/.bin/playwright" install chromium
fi
export DREAMBAU_NODE_BINARY="$node_dir/bin/node"
export DREAMBAU_CLI_PROFILE="$cloud_root/profile.sh"
export XDG_BIN_HOME="$bin_dir"
export XDG_DATA_HOME=${XDG_DATA_HOME:-"$HOME/.local/share"}
bash "$source_cache/scripts/install-test-access-cli.sh"
bash "$source_cache/scripts/install-evidence-cli.sh"
bash "$source_cache/scripts/cloud/build-doctor.sh" "$cloud_root/doctor.mjs"
ln -sfn "$source_cache/node_modules" "$cloud_root/node_modules"
"$node_dir/bin/node" "$source_cache/scripts/cloud/configure.mjs" "$cloud_root" "$bin_dir" "$node_dir/bin/node" "$revision" "$auth_mode" "$project_dir"
printf '%s\n' "Installed immutable source $revision with Node20.20.2." 'No authenticated checks ran; no gateway credentials were read or written.' "Next: $bin_dir/dreambau-cloud-doctor --browser"
