#!/usr/bin/env bash
set -euo pipefail
umask 077
root=$(cd "$(dirname "$0")/../.." && pwd)
exec node "$root/dist/server/work-state/recovery-cli.js" restore-check
