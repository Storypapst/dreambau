#!/usr/bin/env bash
# kit-publish.sh — mirror the kit's skills into the server's shared library.
#
# The problem: a skill could be authored in two places — here, and in
# /srv/dreambau/agent-skills/custom/ on dreambau.com. Two authoring places drift, and the
# drift is silent because both look canonical.
#
# The rule: **the kit is the source, the server library is a mirror.** A skill that belongs
# to everyone is edited here, the version is bumped, and this script pushes it. Each mirrored
# skill gets a `.mirrored-from-kit` marker naming the kit version, so nobody edits the copy
# by mistake.
#
# A skill that exists only in the library (not in the kit) is left completely alone — that is
# still a valid place to draft one before it is ready for everyone.
#
# Usage:
#   kit-publish.sh            show what would change (default — nothing is written)
#   kit-publish.sh --apply    push the kit's skills to the library
#   kit-publish.sh --host X   target host alias (default m4dreambau)
#
# Needs write access to the library: membership in the `agent-skills` group, or root.

set -euo pipefail

KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST="${ORISO_KIT_PUBLISH_HOST:-m4dreambau}"
LIB="/srv/dreambau/agent-skills/custom"
APPLY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1; shift ;;
    --host) HOST="${2:?--host needs a value}"; shift 2 ;;
    -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
    *) echo "kit-publish.sh: unknown argument: $1" >&2; exit 2 ;;
  esac
done

[ -d "$KIT_DIR/skills" ] || { echo "kit-publish.sh: no skills/ in $KIT_DIR" >&2; exit 1; }
VERSION="$(python3 -c 'import json;print(json.load(open("manifest.json"))["version"])' 2>/dev/null || echo unknown)"

echo "kit $VERSION -> $HOST:$LIB"
[ "$APPLY" -eq 1 ] || echo "(dry run — pass --apply to write)"
echo

for dir in "$KIT_DIR"/skills/*/; do
  name="$(basename "$dir")"
  # Compare content before touching anything, so a no-op run says so.
  # The two sides run different tools (shasum vs sha256sum) with different output
  # spacing, so normalise: sort the paths first, hash each file in that order, keep
  # only the hashes. Same bytes on both sides for identical content.
  local_sum="$(cd "$dir" && find . -type f ! -name '.DS_Store' ! -name '.mirrored-from-kit' \
    | LC_ALL=C sort | while IFS= read -r f; do shasum -a 256 "$f" | cut -d' ' -f1; done \
    | shasum -a 256 | cut -d' ' -f1)"
  remote_sum="$(ssh "$HOST" "cd $LIB/$name 2>/dev/null && find . -type f ! -name '.DS_Store' ! -name '.mirrored-from-kit' \
    | LC_ALL=C sort | while IFS= read -r f; do sha256sum \"\$f\" | cut -d' ' -f1; done \
    | sha256sum | cut -d' ' -f1" 2>/dev/null || echo "")"

  if [ -z "$remote_sum" ]; then
    echo "  + $name — not in the library yet"
  elif [ "$local_sum" = "$remote_sum" ]; then
    echo "  = $name — already current"
    continue
  else
    echo "  ~ $name — differs, the kit version wins"
  fi

  [ "$APPLY" -eq 1 ] || continue

  ssh "$HOST" "mkdir -p $LIB/$name"
  # --no-owner/--no-group: the local uid means nothing on the server. Ownership is set
  # below, to root:agent-skills — a mirror has no individual owner to edit it.
  rsync -rlt --delete --no-owner --no-group \
    --exclude '.DS_Store' --exclude '.mirrored-from-kit' "$dir" "$HOST:$LIB/$name/"
  ssh "$HOST" "cat > $LIB/$name/.mirrored-from-kit <<EOF
Mirrored from the ORISO Understand Kit, version $VERSION, on \$(date -u +%Y-%m-%dT%H:%M:%SZ).

Do not edit this copy — the next kit publish overwrites it. Edit the kit
(understand-kit/skills/$name/), bump the version, and run kit-publish.sh --apply.

A personal variant belongs in ~/.oriso-dev-kit/local/ via 'kit-local adapt'.
EOF
chown -R root:agent-skills $LIB/$name 2>/dev/null || chgrp -R agent-skills $LIB/$name 2>/dev/null || true
chmod -R g+rwX $LIB/$name 2>/dev/null || true"
  echo "    pushed"
done

echo
if [ "$APPLY" -eq 1 ]; then
  echo "Done. Skills only present in the library were not touched."
else
  echo "Nothing written. Re-run with --apply."
fi
