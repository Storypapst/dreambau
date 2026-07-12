#!/bin/sh
set -eu

recipients_file=/etc/dreambau/test-access-age-recipients
output=/var/backups/test-access/test-access.enc.json

[ -r "$recipients_file" ] || { echo "Recovery recipient file is missing" >&2; exit 1; }
recipients=$(awk 'NF { print $1 }' "$recipients_file" | sort -u)
[ "$(printf '%s\n' "$recipients" | grep -c '^age1')" -eq 2 ] || {
  echo "Exactly two distinct age recipients are required" >&2
  exit 1
}

install -d -m 0700 "$(dirname "$output")"
kubectl get secret testmails-accounts -n wcr -o jsonpath='{.data.accounts\.json}' \
  | base64 -d \
  | TESTMAILS_ACCOUNTS_PATH=- \
    TEST_ACCESS_AGE_RECIPIENTS="$(printf '%s' "$recipients" | paste -sd, -)" \
    TEST_ACCESS_RECOVERY_OUTPUT="$output" \
    node /root/testmails-app/dist/server/recovery-export.js
