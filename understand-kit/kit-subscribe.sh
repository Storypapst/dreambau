#!/usr/bin/env bash
# kit-subscribe.sh — check the Dreambau bundle endpoint and update ~/.oriso-dev-kit/
# when a newer kit version is served.
#
# A thin wrapper around `install.sh --subscribe`, which holds the actual logic
# (manifest → version compare → download → sha256 verify → unpack). It exists so the
# session hook and a human shell have one short command that cannot run the full
# installer by accident, and so the wall-clock limit lives in one place.
#
# Usage:
#   kit-subscribe                    check and update if newer
#   kit-subscribe --max-seconds 10   same, but give up after 10 s (what the hook uses)
#
# Environment:
#   ORISO_KIT_BASE   default https://dreambau.com/understand/api/v1/kit
#   ORISO_KIT_TOKEN  bearer token; falls back to Infisical (project "ORISO Test Access",
#                    env pre-dev, key ORISO_KIT_TOKEN) when the CLI is logged in.
#   ORISO_KIT_HOME   install target, default ~/.oriso-dev-kit
#
# Exit codes: 0 = current or updated, non-zero = could not check. Callers treat a
# non-zero exit as "carry on" — a kit check must never block starting work.
# Prints one line.

set -uo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

MAX_SECONDS=""
while [ $# -gt 0 ]; do
  case "$1" in
    --max-seconds) MAX_SECONDS="${2:?--max-seconds needs a number}"; shift 2 ;;
    -h|--help) sed -n '2,23p' "$0"; exit 0 ;;
    *) echo "kit-subscribe: unknown argument: $1" >&2; exit 2 ;;
  esac
done

# Prefer the installed kit's install.sh over the one next to this script: the
# installed copy is what the subscription keeps current, so a fix to --subscribe
# reaches every caller after the first update.
KIT_HOME="${ORISO_KIT_HOME:-$HOME/.oriso-dev-kit}"
if [ -f "$KIT_HOME/install.sh" ]; then
  INSTALLER="$KIT_HOME/install.sh"
elif [ -f "$SRC_DIR/install.sh" ]; then
  INSTALLER="$SRC_DIR/install.sh"
else
  echo "[kit-subscribe] failed — install.sh not found in $KIT_HOME or $SRC_DIR"
  exit 1
fi

if [ -z "$MAX_SECONDS" ]; then
  exec bash "$INSTALLER" --subscribe
fi

# GNU coreutils' timeout is not on a stock macOS, so fall back to a watchdog.
if command -v timeout >/dev/null 2>&1; then
  exec timeout "$MAX_SECONDS" bash "$INSTALLER" --subscribe
fi
if command -v gtimeout >/dev/null 2>&1; then
  exec gtimeout "$MAX_SECONDS" bash "$INSTALLER" --subscribe
fi

bash "$INSTALLER" --subscribe &
worker=$!
( sleep "$MAX_SECONDS"; kill "$worker" 2>/dev/null ) &
watchdog=$!
wait "$worker"
status=$?
kill "$watchdog" 2>/dev/null
wait "$watchdog" 2>/dev/null
[ "$status" -eq 0 ] || echo "[kit-subscribe] gave up after ${MAX_SECONDS}s or failed (exit $status) — continuing"
exit "$status"
