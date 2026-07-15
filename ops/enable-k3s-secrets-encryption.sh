#!/bin/sh
set -eu

apply=false
case "${1:-}" in
  "") ;;
  --apply) apply=true ;;
  *) echo "Usage: $0 [--apply]" >&2; exit 2 ;;
esac

encryption_complete() {
  candidate=$1
  printf '%s\n' "$candidate" | grep -q 'Encryption Status: Enabled' || return 1
  printf '%s\n' "$candidate" | grep -q 'Current Rotation Stage: reencrypt_finished' || return 1
  if printf '%s\n' "$candidate" | grep -q 'Server Encryption Hashes:'; then
    printf '%s\n' "$candidate" | grep -q 'All hashes match' || return 1
  fi
}

status=$(k3s secrets-encrypt status 2>&1 || true)
printf '%s\n' "$status"
encryption_complete "$status" && exit 0

if [ "$apply" != true ]; then
  echo "Dry run only; use --apply during an approved maintenance window." >&2
  exit 2
fi

[ "$(id -u)" -eq 0 ] || { echo "Root is required" >&2; exit 1; }
test -d /var/lib/rancher/k3s/server/db/etcd || {
  echo "Embedded etcd was not detected; refusing an unverified backup strategy." >&2
  exit 1
}

exec 9>/run/lock/dreambau-k3s-secrets-encryption.lock
flock -n 9 || { echo "Another encryption operation is active" >&2; exit 1; }

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
k3s etcd-snapshot save --name "before-secrets-encryption-$timestamp"
k3s secrets-encrypt enable
systemctl restart k3s

attempt=0
until kubectl get --raw=/readyz >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 60 ] || { echo "K3s did not become ready" >&2; exit 1; }
  sleep 2
done

k3s secrets-encrypt reencrypt
final_status=$(k3s secrets-encrypt status)
printf '%s\n' "$final_status"
encryption_complete "$final_status" || {
  echo "Secrets encryption did not reach a fully reencrypted consistent state" >&2
  exit 1
}
