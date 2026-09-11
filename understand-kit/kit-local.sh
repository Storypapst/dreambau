#!/usr/bin/env bash
# kit-local.sh — your own rules and your own adaptations of kit files, kept across updates.
#
# The problem this solves: the kit subscription replaces ~/.oriso-dev-kit/ wholesale, so a
# change you make directly in a kit file is gone after the next update and you adapt it
# again. Here you adapt once. The adaptation is stored outside the replaced area and
# re-applied automatically after every update.
#
# Layout (never touched by an update — `local` is not part of the bundle payload):
#
#   ~/.oriso-dev-kit/local/
#     rules/        your own rule files
#     prompts/      your own prompts
#     skills/       your own skills, and adapted copies of kit skills
#     overrides/    files that replace a kit file of the same relative path
#     overrides.json  which kit file each override was based on (sha256), for drift warnings
#
# Usage:
#   kit-local init                     create the layout (idempotent)
#   kit-local adapt <kit-path>         copy a kit file into overrides/ and start editing it
#                                      e.g. kit-local adapt skills/oriso-graph/SKILL.md
#   kit-local apply                    copy every override over the installed kit
#   kit-local status                   list overrides and warn where the kit file moved on
#   kit-local drop <kit-path>          remove an override, back to the kit's own version
#
# `apply` runs automatically at the end of install.sh and after a successful subscription,
# so a normal developer never types it. It prints one line per override.
#
# Nothing here touches a server, a repository or a secret.

set -uo pipefail

KIT_HOME="${ORISO_KIT_HOME:-$HOME/.oriso-dev-kit}"
LOCAL_DIR="$KIT_HOME/local"
OVERRIDES="$LOCAL_DIR/overrides"
RECORD="$LOCAL_DIR/overrides.json"

sha() { python3 -c 'import hashlib,sys; print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest())' "$1" 2>/dev/null; }

cmd_init() {
  mkdir -p "$LOCAL_DIR/rules" "$LOCAL_DIR/prompts" "$LOCAL_DIR/skills" "$OVERRIDES"
  [ -f "$RECORD" ] || echo '{}' > "$RECORD"
  if [ ! -f "$LOCAL_DIR/README.md" ] && [ -f "$KIT_HOME/rules/local/README.md" ]; then
    cp "$KIT_HOME/rules/local/README.md" "$LOCAL_DIR/README.md"
  fi
  echo "[kit-local] ready: $LOCAL_DIR"
}

cmd_adapt() {
  local rel="${1:?usage: kit-local adapt <path relative to the kit, e.g. skills/oriso-graph/SKILL.md>}"
  local src="$KIT_HOME/$rel" dst="$OVERRIDES/$rel"
  [ -f "$src" ] || { echo "[kit-local] no such kit file: $rel" >&2; return 1; }
  cmd_init >/dev/null
  if [ -f "$dst" ]; then
    echo "[kit-local] override already exists: $dst"
  else
    mkdir -p "$(dirname "$dst")"
    cp "$src" "$dst"
    echo "[kit-local] copied $rel -> $dst"
  fi
  python3 - "$RECORD" "$rel" "$(sha "$src")" <<'PY'
import json, sys
path, rel, digest = sys.argv[1], sys.argv[2], sys.argv[3]
try:
    data = json.load(open(path))
except Exception:
    data = {}
data[rel] = {"base_sha256": digest}
json.dump(data, open(path, "w"), indent=2)
open(path, "a").write("\n")
PY
  echo "[kit-local] edit it, then run: kit-local apply"
}

cmd_apply() {
  [ -d "$OVERRIDES" ] || return 0
  local count=0
  while IFS= read -r file; do
    rel="${file#"$OVERRIDES/"}"
    target="$KIT_HOME/$rel"
    # Warn when the kit's own version moved on since the override was taken: the
    # adaptation still applies, but it may now be based on an outdated original.
    if [ -f "$target" ]; then
      base="$(python3 -c 'import json,sys
try: print(json.load(open(sys.argv[1])).get(sys.argv[2],{}).get("base_sha256",""))
except Exception: print("")' "$RECORD" "$rel" 2>/dev/null)"
      now="$(sha "$target")"
      if [ -n "$base" ] && [ -n "$now" ] && [ "$base" != "$now" ]; then
        echo "[kit-local] note: the kit's own $rel changed since you adapted it — re-check your override"
      fi
    fi
    mkdir -p "$(dirname "$target")"
    cp "$file" "$target"
    count=$((count + 1))
  done < <(find "$OVERRIDES" -type f ! -name '.DS_Store' 2>/dev/null)
  [ "$count" -eq 0 ] || echo "[kit-local] applied $count local override(s) over $KIT_HOME"
}

cmd_status() {
  [ -d "$OVERRIDES" ] || { echo "[kit-local] no overrides"; return 0; }
  local any=0
  while IFS= read -r file; do
    any=1
    rel="${file#"$OVERRIDES/"}"
    base="$(python3 -c 'import json,sys
try: print(json.load(open(sys.argv[1])).get(sys.argv[2],{}).get("base_sha256","")[:12])
except Exception: print("")' "$RECORD" "$rel" 2>/dev/null)"
    now="$(sha "$KIT_HOME/$rel")"; now="${now:0:12}"
    if [ -n "$base" ] && [ "$base" != "$now" ]; then
      echo "  $rel  — kit version moved on ($base -> $now), re-check"
    else
      echo "  $rel  — current"
    fi
  done < <(find "$OVERRIDES" -type f ! -name '.DS_Store' 2>/dev/null)
  [ "$any" -eq 1 ] || echo "[kit-local] no overrides"
}

cmd_drop() {
  local rel="${1:?usage: kit-local drop <kit-path>}"
  rm -f "$OVERRIDES/$rel"
  python3 - "$RECORD" "$rel" <<'PY' 2>/dev/null
import json, sys
path, rel = sys.argv[1], sys.argv[2]
try: data = json.load(open(path))
except Exception: data = {}
data.pop(rel, None)
json.dump(data, open(path, "w"), indent=2); open(path, "a").write("\n")
PY
  echo "[kit-local] dropped $rel — the kit's own version returns with the next update or install"
}

case "${1:-}" in
  init)   shift; cmd_init "$@" ;;
  adapt)  shift; cmd_adapt "$@" ;;
  apply)  shift; cmd_apply "$@" ;;
  status) shift; cmd_status "$@" ;;
  drop)   shift; cmd_drop "$@" ;;
  -h|--help|"") sed -n '2,30p' "$0" ;;
  *) echo "kit-local: unknown command: $1" >&2; exit 2 ;;
esac
