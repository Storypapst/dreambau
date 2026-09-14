#!/usr/bin/env bash
# build-bundle.sh — build the subscribable kit bundle.
#
# Produces:
#   dist/understand-kit-<version>.tar.gz   (the bundle the Dreambau endpoint serves)
#   manifest.json                          (version, date, changelog, sha256 per file)
#
# The manifest is the subscription contract: a client compares its local
# manifest.json's `version` with the served one and only downloads when the served
# version is newer. The per-file sha256 lets a client verify what it unpacked.
#
# Version/date/changelog are edited by hand in manifest.json; this script only
# regenerates the `files` array and packs the archive. Pass --version X.Y.Z to bump
# the version and stamp today's date in one go.
#
# Idempotent, offline, macOS/BSD- and Linux-compatible. Touches no server.
# dist/ is a build artefact and is gitignored — never commit it, never install it.

set -euo pipefail

KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$KIT_DIR"

NEW_VERSION=""
while [ $# -gt 0 ]; do
  case "$1" in
    --version) NEW_VERSION="${2:?--version needs a value like 0.2.0}"; shift 2 ;;
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "build-bundle.sh: unknown argument: $1" >&2; exit 2 ;;
  esac
done

command -v python3 >/dev/null 2>&1 || { echo "build-bundle.sh: python3 is required" >&2; exit 1; }
[ -f manifest.json ] || { echo "build-bundle.sh: manifest.json not found in $KIT_DIR" >&2; exit 1; }

# Payload = everything the bundle ships. Build output and VCS metadata are excluded.
PAYLOAD=(install.sh ua-pull.sh mcp-add.sh kit-subscribe.sh kit-local.sh kit-publish.sh build-bundle.sh \
         test-access-install.sh settings.hook.json \
         .mcp.json.example README.md SECRET-SCAN.md rules skills prompts pages)

# ---------------------------------------------------------------------------
# 1. Regenerate manifest.json (version/date optionally bumped, files + sha256)
# ---------------------------------------------------------------------------
VERSION="$(python3 - "$NEW_VERSION" <<'PYEOF'
import json, os, sys, hashlib, datetime

new_version = sys.argv[1] or None
manifest = json.load(open("manifest.json"))

if new_version:
    manifest["version"] = new_version
    manifest["date"] = datetime.date.today().isoformat()

payload = ["install.sh", "ua-pull.sh", "mcp-add.sh", "kit-subscribe.sh",
           "kit-local.sh", "kit-publish.sh", "build-bundle.sh", "settings.hook.json", ".mcp.json.example",
           "README.md", "SECRET-SCAN.md", "rules", "skills", "prompts", "pages"]

files = []
for item in payload:
    if os.path.isfile(item):
        paths = [item]
    elif os.path.isdir(item):
        paths = []
        for root, dirs, names in os.walk(item):
            dirs[:] = sorted(d for d in dirs if d != ".git")
            paths.extend(os.path.join(root, n) for n in sorted(names) if n != ".DS_Store")
    else:
        continue
    for p in paths:
        with open(p, "rb") as fh:
            digest = hashlib.sha256(fh.read()).hexdigest()
        files.append({"path": p, "sha256": digest})

manifest["files"] = sorted(files, key=lambda f: f["path"])

with open("manifest.json", "w") as fh:
    json.dump(manifest, fh, indent=2, ensure_ascii=False)
    fh.write("\n")

print(manifest["version"])
PYEOF
)"

echo "build-bundle.sh: manifest.json updated (version $VERSION, $(python3 -c 'import json;print(len(json.load(open("manifest.json"))["files"]))') files)"

# ---------------------------------------------------------------------------
# 2. Pack the bundle
# ---------------------------------------------------------------------------
mkdir -p dist
ARCHIVE="dist/understand-kit-$VERSION.tar.gz"
rm -f "$ARCHIVE"

# manifest.json ships inside the bundle so an unpacked kit knows its own version.
tar -czf "$ARCHIVE" \
  --exclude='.DS_Store' \
  manifest.json "${PAYLOAD[@]}"

BYTES="$( (stat -f %z "$ARCHIVE" 2>/dev/null || stat -c %s "$ARCHIVE") )"
echo "build-bundle.sh: wrote $ARCHIVE ($BYTES bytes)"
echo "build-bundle.sh: dist/ is gitignored — serve it from the endpoint, do not commit it."
