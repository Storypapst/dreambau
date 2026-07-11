#!/usr/bin/env bash
set -euo pipefail
image="${1:-dreambau-testmails:0.2.3}"
archive="$(mktemp -t dreambau-testmails-image.XXXXXX.tar)"
trap 'rm -f "$archive"' EXIT
docker save "$image" -o "$archive"
sudo k3s ctr images import "$archive"
