#!/usr/bin/env bash
set -euo pipefail
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
"$root/node_modules/.bin/esbuild" "$root/src/server/cloud-doctor.ts" --bundle --platform=node --format=esm --external:@playwright/test --target=node20 --log-level=error --outfile="${1:?output required}"
