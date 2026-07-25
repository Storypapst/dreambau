#!/usr/bin/env bash
set -euo pipefail

read -r run_id file_id public_id < /root/.evidence-validation-ids
alias_name="wcrcheck"
bucket="dreambau-pr-evidence"
pass=0
fail=0

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    printf 'PASS  %-52s %s\n' "$name" "$actual"; pass=$((pass + 1))
  else
    printf 'FAIL  %-52s expected %s, got %s\n' "$name" "$expected" "$actual"; fail=$((fail + 1))
  fi
}

root_user=$(kubectl -n wcr-storage get secret wcr-minio-secret -o jsonpath='{.data.rootUser}' | base64 -d)
root_password=$(kubectl -n wcr-storage get secret wcr-minio-secret -o jsonpath='{.data.rootPassword}' | base64 -d)
mc alias set "$alias_name" "http://127.0.0.1:31900" "$root_user" "$root_password" >/dev/null
unset root_password
trap 'mc alias remove "$alias_name" >/dev/null 2>&1 || true' EXIT

echo "=== objects written by the run ==="
mc ls --recursive "$alias_name/$bucket/runs/$run_id/" | sed 's/^/      /'

original="$alias_name/$bucket/runs/$run_id/$file_id/original"
public="$alias_name/$bucket/runs/$run_id/$file_id/public"

check "original object exists" 0 "$(mc stat "$original" >/dev/null 2>&1; echo $?)"
check "processed public object exists" 0 "$(mc stat "$public" >/dev/null 2>&1; echo $?)"

mc cat "$original" > /tmp/check-original.png 2>/dev/null
mc cat "$public" > /tmp/check-public.png 2>/dev/null
check "upload arrived byte-identical" yes "$(cmp -s /tmp/check-original.png /tmp/evidence-shot.png && echo yes || echo no)"
check "original still carries its tEXt chunk" yes "$(grep -qa tEXt /tmp/check-original.png && echo yes || echo no)"
check "served copy has the tEXt chunk removed" yes "$(grep -qa tEXt /tmp/check-public.png && echo no || echo yes)"
check "served copy has no author name" yes "$(grep -qa 'Frank Gerhardt' /tmp/check-public.png && echo no || echo yes)"
check "served copy is still a valid PNG" yes "$(head -c8 /tmp/check-public.png | od -An -tx1 | tr -d ' \n' | grep -q '^89504e470d0a1a0a$' && echo yes || echo no)"

echo
echo "=== the bucket must not be reachable without credentials ==="
key="runs/$run_id/$file_id/public"
check "anonymous object read over the MinIO ingress" 403 "$(curl -s -o /dev/null -w '%{http_code}' "https://wcr-s3.wcr.is/$bucket/$key")"
check "anonymous bucket listing over the ingress" 403 "$(curl -s -o /dev/null -w '%{http_code}' "https://wcr-s3.wcr.is/$bucket/")"
check "anonymous object read on the node port" 403 "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:31900/$bucket/$key")"

echo
echo "=== the gateway user must not be able to widen its own access ==="
gateway_key=$(kubectl -n wcr get secret evidence-minio -o jsonpath='{.data.access-key-id}' | base64 -d)
gateway_secret=$(kubectl -n wcr get secret evidence-minio -o jsonpath='{.data.secret-access-key}' | base64 -d)
mc alias set evidencecheck "http://127.0.0.1:31900" "$gateway_key" "$gateway_secret" >/dev/null
unset gateway_secret
check "gateway can read its own bucket" 0 "$(mc ls "evidencecheck/$bucket" >/dev/null 2>&1; echo $?)"
check "gateway cannot create another bucket" 1 "$(mc mb evidencecheck/should-not-exist >/dev/null 2>&1; echo $?)"
check "gateway cannot read the cap bucket" 1 "$(mc ls evidencecheck/cap-recordings >/dev/null 2>&1; echo $?)"
check "gateway has no admin rights" 1 "$(mc admin info evidencecheck >/dev/null 2>&1; echo $?)"
mc alias remove evidencecheck >/dev/null 2>&1 || true

rm -f /tmp/check-original.png /tmp/check-public.png
printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
