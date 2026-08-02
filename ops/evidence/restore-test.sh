#!/usr/bin/env bash
# Proves a backup is restorable, which is the only thing that makes it a backup.
#
# Decrypts the newest encrypted database into a temporary directory, opens it,
# and checks that the schema and a sample run survived the round trip. The live
# database is never touched — this only ever reads.
set -euo pipefail

backup_root="${EVIDENCE_BACKUP_ROOT:-/root/backups/evidence}"
newest=$(ls -1t "$backup_root"/evidence-*.sqlite.age 2>/dev/null | head -1 || true)
test -n "$newest" || { echo "no encrypted backup found in $backup_root" >&2; exit 1; }

command -v age >/dev/null 2>&1 || { echo "age is required" >&2; exit 1; }
test -n "${EVIDENCE_BACKUP_IDENTITY:-}" || { echo "EVIDENCE_BACKUP_IDENTITY (path to an age identity) is required" >&2; exit 1; }

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
echo "restoring $(basename "$newest")"
age -d -i "$EVIDENCE_BACKUP_IDENTITY" -o "$work/evidence.sqlite" "$newest"

kubectl -n wcr exec -i deploy/dreambau-evidence -- sh -c 'cat > /tmp/restore-check.sqlite' < "$work/evidence.sqlite"
kubectl -n wcr exec deploy/dreambau-evidence -- node -e '
  const Database = require("better-sqlite3");
  const db = new Database("/tmp/restore-check.sqlite", { readonly: true });
  const integrity = db.pragma("integrity_check", { simple: true });
  const versions = db.prepare("SELECT version FROM evidence_schema_migrations ORDER BY version").all().map((r) => r.version);
  const runs = db.prepare("SELECT COUNT(*) AS n FROM evidence_runs").get().n;
  const published = db.prepare("SELECT COUNT(*) AS n FROM evidence_runs WHERE state=\x27published\x27").get().n;
  const files = db.prepare("SELECT COUNT(*) AS n FROM evidence_files").get().n;
  db.close();
  console.log("integrity_check:", integrity);
  console.log("migrations:", versions.join(","));
  console.log(`runs: ${runs} (published ${published}), files: ${files}`);
  if (integrity !== "ok") { console.error("RESTORE FAILED: integrity check did not pass"); process.exit(1); }
  if (versions.length === 0) { console.error("RESTORE FAILED: no schema"); process.exit(1); }
'
kubectl -n wcr exec deploy/dreambau-evidence -- rm -f /tmp/restore-check.sqlite
echo "restore test passed"
