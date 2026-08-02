#!/usr/bin/env bash
# Daily backup of the evidence metadata database, plus a checksum manifest of
# what the bucket holds.
#
# The database is copied with SQLite's own backup API rather than `cp`, so a
# concurrent write cannot produce a torn file. The copy is encrypted with age
# before it leaves the node; the passphrase is read from stdin and never
# appears in a file, a log or an argument.
#
# Nothing here prints a caption, a repository name or any run content. A backup
# log is not a place to reproduce evidence.
set -euo pipefail

namespace="wcr"
bucket="dreambau-pr-evidence"
backup_root="${EVIDENCE_BACKUP_ROOT:-/root/backups/evidence}"
keep_days="${EVIDENCE_BACKUP_KEEP_DAYS:-30}"
stamp=$(date -u +%Y%m%dT%H%M%SZ)

command -v age >/dev/null 2>&1 || { echo "age is required for encrypted backups" >&2; exit 1; }
test -n "${EVIDENCE_BACKUP_RECIPIENT:-}" || { echo "EVIDENCE_BACKUP_RECIPIENT (an age public key) is required" >&2; exit 1; }

install -d -m 0700 "$backup_root"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

echo "== database =="
# VACUUM INTO gives a consistent copy of a live database without stopping it.
kubectl -n "$namespace" exec deploy/dreambau-evidence -- \
  node -e '
    const Database = require("better-sqlite3");
    const db = new Database("/data/evidence.sqlite", { readonly: true });
    db.exec("VACUUM INTO \x27/tmp/evidence-backup.sqlite\x27");
    db.close();
  '
kubectl -n "$namespace" exec deploy/dreambau-evidence -- cat /tmp/evidence-backup.sqlite > "$work/evidence.sqlite"
kubectl -n "$namespace" exec deploy/dreambau-evidence -- rm -f /tmp/evidence-backup.sqlite
echo "copied $(stat -c %s "$work/evidence.sqlite") bytes"

age -r "$EVIDENCE_BACKUP_RECIPIENT" -o "$backup_root/evidence-$stamp.sqlite.age" "$work/evidence.sqlite"
chmod 0600 "$backup_root/evidence-$stamp.sqlite.age"
echo "encrypted -> evidence-$stamp.sqlite.age"

echo "== object manifest =="
# Checksums of what the bucket holds, so drift between two days is visible
# without reading a single object's content.
root_user=$(kubectl -n wcr-storage get secret wcr-minio-secret -o jsonpath='{.data.rootUser}' | base64 -d)
root_password=$(kubectl -n wcr-storage get secret wcr-minio-secret -o jsonpath='{.data.rootPassword}' | base64 -d)
mc alias set evidencebackup "http://127.0.0.1:31900" "$root_user" "$root_password" >/dev/null
unset root_password
trap 'mc alias remove evidencebackup >/dev/null 2>&1 || true; rm -rf "$work"' EXIT

mc ls --recursive --json "evidencebackup/$bucket" \
  | python3 -c '
import json, sys
rows = []
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    entry = json.loads(line)
    rows.append({"key": entry.get("key"), "size": entry.get("size"), "etag": entry.get("etag")})
rows.sort(key=lambda row: row["key"] or "")
print(json.dumps(rows, indent=2))
' > "$work/manifest.json"

objects=$(python3 -c 'import json,sys;print(len(json.load(open(sys.argv[1]))))' "$work/manifest.json")
bytes=$(python3 -c 'import json,sys;print(sum(r["size"] or 0 for r in json.load(open(sys.argv[1]))))' "$work/manifest.json")
sha256sum "$work/manifest.json" | cut -d" " -f1 > "$work/manifest.sha256"
cp "$work/manifest.json" "$backup_root/manifest-$stamp.json"
cp "$work/manifest.sha256" "$backup_root/manifest-$stamp.sha256"
chmod 0600 "$backup_root/manifest-$stamp.json" "$backup_root/manifest-$stamp.sha256"
echo "manifest: $objects object(s), $bytes bytes, sha256 $(cat "$work/manifest.sha256")"

echo "== retention of the backups themselves =="
find "$backup_root" -type f -mtime "+$keep_days" -print -delete | sed 's/^/removed /' || true

echo "== free space =="
avail=$(df -BG --output=avail / | tail -1 | tr -dc '0-9')
echo "${avail} GiB available"
if [ "$avail" -lt 25 ]; then
  echo "FREE SPACE BELOW THE HARD STOP (25 GiB): uploads should be halted" >&2
  exit 1
fi
if [ "$avail" -lt 40 ]; then
  echo "free space below the warning threshold (40 GiB)" >&2
fi
echo "done"
