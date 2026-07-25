#!/usr/bin/env bash
# End-to-end validation of the deployed gateway against the real MinIO bucket.
# The token is read from a 0600 file and never echoed.
set -euo pipefail

token=$(cat /root/.evidence-token-evidence-server-validation)
base="http://127.0.0.1:38100"
commit="1111111111111111111111111111111111111111"
pass=0
fail=0

kubectl -n wcr port-forward deploy/dreambau-evidence 38100:3100 >/tmp/pf.log 2>&1 &
pf=$!
trap 'kill $pf 2>/dev/null || true' EXIT
for _ in $(seq 1 30); do
  curl -sf "$base/health/live" >/dev/null 2>&1 && break
  sleep 1
done

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    printf 'PASS  %-46s %s\n' "$name" "$actual"
    pass=$((pass + 1))
  else
    printf 'FAIL  %-46s expected %s, got %s\n' "$name" "$expected" "$actual"
    fail=$((fail + 1))
  fi
}

api() {
  local method="$1" path="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -s -X "$method" "$base$path" -H "authorization: Bearer $token" \
      -H 'content-type: application/json' -d "$body"
  else
    curl -s -X "$method" "$base$path" -H "authorization: Bearer $token"
  fi
}

status() {
  local method="$1" path="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -s -o /dev/null -w '%{http_code}' -X "$method" "$base$path" \
      -H "authorization: Bearer $token" -H 'content-type: application/json' -d "$body"
  else
    curl -s -o /dev/null -w '%{http_code}' -X "$method" "$base$path" -H "authorization: Bearer $token"
  fi
}

# A real, minimal PNG carrying a tEXt chunk, so metadata stripping is observable.
python3 - <<'PY'
import struct, zlib
def chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)
png = b"\x89PNG\r\n\x1a\n"
png += chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 6, 0, 0, 0))
png += chunk(b"tEXt", b"Author\x00Frank Gerhardt")
png += chunk(b"IDAT", zlib.compress(b"\x00\x00\x00\x00\x00"))
png += chunk(b"IEND", b"")
open("/tmp/evidence-shot.png", "wb").write(png)
PY

echo "=== health ==="
check "unauthenticated create is refused" 401 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$base/api/v1/runs" -H 'content-type: application/json' -d '{}')"
check "liveness" ok "$(curl -s "$base/health/live" | python3 -c 'import json,sys; print(json.load(sys.stdin)["status"])')"
check "readiness against real MinIO" ok "$(curl -s "$base/health/ready" | python3 -c 'import json,sys; print(json.load(sys.stdin)["status"])')"

echo
echo "=== happy path: screenshot ==="
run_json=$(api POST /api/v1/runs "{\"project\":\"oriso\",\"repository\":\"Storypapst/dreambau\",\"pullRequestNumber\":30,\"commitSha\":\"$commit\",\"environment\":\"pre-dev\",\"title\":\"Server validation\",\"result\":\"PASS\",\"source\":\"manual\"}")
run_id=$(printf '%s' "$run_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
check "run created as draft" draft "$(printf '%s' "$run_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["state"])')"

size=$(stat -c %s /tmp/evidence-shot.png)
sha=$(sha256sum /tmp/evidence-shot.png | cut -d' ' -f1)
head_b64=$(head -c 4096 /tmp/evidence-shot.png | base64 -w0)
init_json=$(api POST "/api/v1/runs/$run_id/files/init" "{\"kind\":\"screenshot\",\"filename\":\"redirect.png\",\"caption\":\"Server validation screenshot\",\"contentType\":\"image/png\",\"byteSize\":$size,\"sha256\":\"$sha\",\"head\":\"$head_b64\"}")
file_id=$(printf '%s' "$init_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["file"]["id"])')
check "file initialised" 36 "${#file_id}"

check "part accepted" 200 "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$base/api/v1/runs/$run_id/files/$file_id/parts/1" -H "authorization: Bearer $token" -H 'content-type: application/octet-stream' --data-binary @/tmp/evidence-shot.png)"
complete_json=$(api POST "/api/v1/runs/$run_id/files/$file_id/complete")
check "processing succeeded" ready "$(printf '%s' "$complete_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["state"])')"
check "no public url before publish" None "$(printf '%s' "$complete_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["file"]["publicUrl"])')"

prepare_json=$(api POST "/api/v1/runs/$run_id/publish" "{\"repository\":\"Storypapst/dreambau\",\"pullRequestNumber\":30,\"commitSha\":\"$commit\",\"stage\":\"prepare\"}")
public_id=$(printf '%s' "$prepare_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["publicId"])')
check "prepare reserves a 32 char public id" 32 "${#public_id}"
check "prepare does not publish" processing "$(api GET "/api/v1/runs/$run_id" | python3 -c 'import json,sys; print(json.load(sys.stdin)["state"])')"
check "prepare shows no url on the run itself" None "$(api GET "/api/v1/runs/$run_id" | python3 -c 'import json,sys; print(json.load(sys.stdin)["files"][0]["publicUrl"])')"

commit_json=$(api POST "/api/v1/runs/$run_id/publish" "{\"repository\":\"Storypapst/dreambau\",\"pullRequestNumber\":30,\"commitSha\":\"$commit\",\"stage\":\"commit\",\"githubCommentUrl\":\"https://github.com/Storypapst/dreambau/pull/30#issuecomment-1\"}")
check "commit publishes" published "$(printf '%s' "$commit_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["state"])')"
public_url=$(printf '%s' "$commit_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["files"][0]["publicUrl"])')
echo "      public url: $public_url"
check "public url is on evidence.dreambau.com" yes "$(case "$public_url" in https://evidence.dreambau.com/e/*) echo yes;; *) echo no;; esac)"
check "republish keeps the public id" "$public_id" "$(api POST "/api/v1/runs/$run_id/publish" "{\"repository\":\"Storypapst/dreambau\",\"pullRequestNumber\":30,\"commitSha\":\"$commit\",\"stage\":\"commit\"}" | python3 -c 'import json,sys; print(json.load(sys.stdin)["publicId"])')"

echo
echo "=== refusals ==="
bad_run=$(api POST /api/v1/runs "{\"project\":\"oriso\",\"repository\":\"Storypapst/dreambau\",\"pullRequestNumber\":30,\"commitSha\":\"$commit\",\"environment\":\"pre-dev\",\"title\":\"Refusals\",\"result\":\"FAIL\",\"source\":\"manual\"}")
bad_id=$(printf '%s' "$bad_run" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')

state_b64=$(printf '{"cookies":[]}' | base64 -w0)
check "storageState.json refused by name" 422 "$(status POST "/api/v1/runs/$bad_id/files/init" "{\"kind\":\"log\",\"filename\":\"storageState.json\",\"caption\":\"\",\"contentType\":\"application/json; charset=utf-8\",\"byteSize\":14,\"sha256\":\"$(printf '{"cookies":[]}' | sha256sum | cut -d' ' -f1)\",\"head\":\"$state_b64\"}")"

printf 'setup\n-----BEGIN OPENSSH PRIVATE KEY-----\nbody\n' > /tmp/evidence-secret.log
log_size=$(stat -c %s /tmp/evidence-secret.log)
log_sha=$(sha256sum /tmp/evidence-secret.log | cut -d' ' -f1)
log_head=$(base64 -w0 /tmp/evidence-secret.log)
log_init=$(api POST "/api/v1/runs/$bad_id/files/init" "{\"kind\":\"log\",\"filename\":\"run.log\",\"caption\":\"\",\"contentType\":\"text/plain; charset=utf-8\",\"byteSize\":$log_size,\"sha256\":\"$log_sha\",\"head\":\"$log_head\"}")
log_file=$(printf '%s' "$log_init" | python3 -c 'import json,sys; print(json.load(sys.stdin)["file"]["id"])')
curl -s -o /dev/null -X PUT "$base/api/v1/runs/$bad_id/files/$log_file/parts/1" -H "authorization: Bearer $token" -H 'content-type: application/octet-stream' --data-binary @/tmp/evidence-secret.log
check "secret bearing log is quarantined" 422 "$(status POST "/api/v1/runs/$bad_id/files/$log_file/complete")"
check "quarantined run cannot publish" 409 "$(status POST "/api/v1/runs/$bad_id/publish" "{\"repository\":\"Storypapst/dreambau\",\"pullRequestNumber\":30,\"commitSha\":\"$commit\",\"stage\":\"prepare\"}")"
check "quarantined run has no public id" None "$(api GET "/api/v1/runs/$bad_id" | python3 -c 'import json,sys; print(json.load(sys.stdin)["publicId"])')"

echo
echo "=== archive ==="
check "archive succeeds" 200 "$(status POST "/api/v1/runs/$run_id/archive")"
check "archived run has no public url" None "$(api GET "/api/v1/runs/$run_id" | python3 -c 'import json,sys; print(json.load(sys.stdin)["files"][0]["publicUrl"])')"

echo
echo "=== storage ==="
echo "$run_id $file_id $public_id" > /root/.evidence-validation-ids
printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
