#!/bin/sh
set -eu

apply=false
case "${1:-}" in
  "") ;;
  --apply) apply=true ;;
  *) echo "Usage: $0 [--apply]" >&2; exit 2 ;;
esac

status=$(k3s secrets-encrypt status 2>&1 || true)
printf '%s\n' "$status"
printf '%s\n' "$status" | grep -q 'Encryption Status: Enabled' && exit 0

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
printf '%s\n' "$final_status" | grep -q 'Encryption Status: Enabled' || {
  echo "Secrets encryption did not reach enabled state" >&2
  exit 1
}
