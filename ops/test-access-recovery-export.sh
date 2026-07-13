#!/usr/bin/env bash
set -euo pipefail

recipients_file=/etc/dreambau/test-access-age-recipients
output=/var/backups/test-access/test-access.enc.json

[ -r "$recipients_file" ] || { echo "Recovery recipient file is missing" >&2; exit 1; }
recipients=$(awk 'NF { print $1 }' "$recipients_file" | sort -u)
[ "$(printf '%s\n' "$recipients" | grep -c '^age1')" -eq 2 ] || {
  echo "Exactly two distinct age recipients are required" >&2
  exit 1
}

install -d -m 0700 "$(dirname "$output")"
temporary="$output.tmp.$$"
trap 'rm -f "$temporary"' EXIT HUP INT TERM
kubectl exec -n wcr deployment/testmails -- \
  env TEST_ACCESS_RECOVERY_STREAM=1 node /app/dist/server/infisical-recovery-source.js \
  | sops encrypt \
      --age "$(printf '%s' "$recipients" | paste -sd, -)" \
      --input-type json \
      --output-type json \
      /dev/stdin \
      > "$temporary"
test -s "$temporary"
chmod 0600 "$temporary"
mv "$temporary" "$output"
trap - EXIT HUP INT TERM
