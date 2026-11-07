#!/usr/bin/env bash
# install.sh — ORISO Understand Kit installer.
#
# Idempotent: safe to re-run. macOS/BSD-compatible (no GNU-only flags).
# Never pipes a remote script into bash; only acts on files inside this kit.
#
# What it does (each step reports done/skipped/failed, summarised at the end):
#   0.  Install the kit itself to ~/.oriso-dev-kit/ (a copy; the source stays wherever it
#       was unpacked or checked out). Every step below refers to that copy, so a later
#       bundle update replaces one directory and every repo follows.
#   0b. Create ~/.oriso-dev-kit/local/ — your own rules, prompts, skills and overrides.
#       Outside the bundle payload, so no update touches it. See kit-local.sh.
#   0c. Write a minimal ~/.config/agent-routing/paths.env when the machine has none.
#       Several ORISO skills resolve the project boundary from it; without it they fall
#       through to a guess. An existing file is never modified.
#   1.  Check `claude` CLI is on PATH.
#   2.  Install the Understand-Anything Claude Code plugin (marketplace + plugin).
#   3.  Register the two Storybook MCP servers (user scope — project scope would write the
#       secret into <repo>/.mcp.json) — only if ORISO_SB_MCP_AUTH is set or readable from
#       Infisical.
#   4.  Copy ua-pull.sh, kit-subscribe.sh and kit-local.sh to ~/.local/bin/. Agent-neutral:
#       plain shell scripts, used identically by Claude Code, Codex and a human shell.
#   5.  Link every kit skill and every local skill into <repo>/.claude/skills/ (Claude Code)
#       and ~/.codex/skills/ (Codex). Symlinks, so a kit update reaches every repository
#       without touching it. A local skill of the same name wins.
#   6.  Merge settings.hook.json's SessionStart hook into <repo>/.claude/settings.json
#       (only when run from inside a git repo checkout).
#   7.  Pull the knowledge graph: via HTTPS if ORISO_UA_BASE + ORISO_UA_AUTH are
#       set, else via SSH if `ssh -G predev` resolves, else print instructions.
#   8.  Report your own rules file (rules/devs/<handle>.md) and re-apply your local
#       overrides on top of the installed kit.
#
# Modes:
#   install.sh              full install (the steps above)
#   install.sh --subscribe  subscription check only: ask the Dreambau bundle endpoint
#                           for the manifest, compare its version with the installed
#                           ~/.oriso-dev-kit/manifest.json, and download + verify +
#                           unpack the bundle only when the served version is newer.
#                           Prints one line and never installs plugins, MCP servers or
#                           hooks. kit-subscribe.sh is a thin wrapper around this mode.
#
# Nothing here touches servers, installs system packages, or runs `curl | bash`.

set -uo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KIT_HOME="${ORISO_KIT_HOME:-$HOME/.oriso-dev-kit}"

# The kit payload: what a bundle ships and what an update replaces. Kept in sync
# with build-bundle.sh's PAYLOAD. dist/ is a build artefact and never installed.
KIT_PAYLOAD=(install.sh ua-pull.sh mcp-add.sh kit-subscribe.sh kit-local.sh kit-publish.sh build-bundle.sh \
             settings.hook.json .mcp.json.example manifest.json README.md \
             SECRET-SCAN.md rules skills prompts pages)

# Everything personal lives here and is deliberately NOT in KIT_PAYLOAD: an update
# replaces the payload item by item and never sees this directory.
LOCAL_DIR="$KIT_HOME/local"

# Infisical is the credential source for both ORISO_SB_MCP_AUTH (step 3) and
# ORISO_KIT_TOKEN (subscription). Self-hosted; never the Infisical cloud.
INFISICAL_PROJECT_ID="2808af88-2c60-4023-8754-98665192cfdf"
INFISICAL_ENV="pre-dev"
INFISICAL_DOMAIN="${INFISICAL_DOMAIN:-https://secrets.dreambau.com}"

MODE="install"
while [ $# -gt 0 ]; do
  case "$1" in
    --subscribe) MODE="subscribe"; shift ;;
    -h|--help) sed -n '2,55p' "$0"; exit 0 ;;
    *) echo "install.sh: unknown argument: $1" >&2; exit 2 ;;
  esac
done

# ---------------------------------------------------------------------------
# Result bookkeeping for the final summary table
# ---------------------------------------------------------------------------
SUMMARY_LINES=()
note() { SUMMARY_LINES+=("$1"); echo "$1"; }

# ---------------------------------------------------------------------------
# Subscription: fetch manifest → compare version → download + verify + unpack.
#
# Base URL: the Dreambau app's top-level kit endpoint. ORISO_KIT_BASE overrides
# it for a local server or a future host change.
# Token: your personal Test-Access machine token — ORISO_KIT_TOKEN, else the macOS
# Keychain, else the credential file, else the legacy shared Infisical key. The value
# is never written to a file and never printed.
#
# Every failure is non-fatal by design — the session hook calls this and a dead
# endpoint must never block a developer from starting work.
# ---------------------------------------------------------------------------
kit_subscribe() {
  local base token tmp remote_version local_version filename http_status decision

  base="${ORISO_KIT_BASE:-https://dreambau.com/understand/api/v1/kit}"

  command -v curl >/dev/null 2>&1 || { echo "[kit-subscribe] skipped — curl not found"; return 1; }
  command -v python3 >/dev/null 2>&1 || { echo "[kit-subscribe] skipped — python3 not found"; return 1; }
  command -v tar >/dev/null 2>&1 || { echo "[kit-subscribe] skipped — tar not found"; return 1; }

  # Token resolution. The kit endpoint accepts any valid Test-Access machine token, and
  # every developer already has a personal one — so there is no shared kit secret to
  # distribute, and revoking one person revokes only that person.
  #
  #   1. ORISO_KIT_TOKEN            explicit override, for CI or a one-off shell
  #   2. macOS Keychain             service "dreambau-test-access", account = identity
  #   3. ~/.config/dreambau-test-access/identities/<identity>.token   (the file fallback)
  #   4. Infisical                  legacy shared key, kept for machines without either
  #
  # The value is never printed and never written to a file.
  token="${ORISO_KIT_TOKEN:-}"

  identity="${ORISO_TEST_ACCESS_IDENTITY:-}"

  # Auto-detect the identity when it was not named. Two sources, in this order.
  if [ -z "$identity" ]; then
    # (a) the credential-file fallback, when exactly one ORISO identity is present.
    for f in "$HOME/.config/dreambau-test-access/identities/"*oriso*.token; do
      [ -f "$f" ] || continue
      if [ -n "$identity" ]; then identity=""; break; fi   # more than one: do not guess
      identity="$(basename "$f" .token)"
    done
  fi
  if [ -z "$identity" ] && command -v security >/dev/null 2>&1; then
    # (b) the Keychain, which is the normal store and has no file to glob. `security`
    #     returns one arbitrary account for the service — often the wrong project
    #     (…-dreambau, …-orimo). So: take it only if it is already the ORISO one,
    #     otherwise reuse its machine prefix and check whether <prefix>-oriso exists.
    #     Only account names are read here; no secret is fetched by this probe.
    any="$(security find-generic-password -s dreambau-test-access 2>/dev/null \
           | sed -n 's/.*"acct"<blob>="\(.*\)"/\1/p' | head -1)"
    case "$any" in
      *-oriso) identity="$any" ;;
      ?*) candidate="${any%-*}-oriso"
          security find-generic-password -s dreambau-test-access -a "$candidate" >/dev/null 2>&1 \
            && identity="$candidate" ;;
    esac
  fi

  if [ -z "$token" ] && [ -n "$identity" ] && command -v security >/dev/null 2>&1; then
    token="$(security find-generic-password -s dreambau-test-access -a "$identity" -w 2>/dev/null || true)"
  fi

  if [ -z "$token" ] && [ -n "$identity" ]; then
    cred="$HOME/.config/dreambau-test-access/identities/$identity.token"
    [ -f "$cred" ] && token="$(cat "$cred" 2>/dev/null || true)"
  fi

  if [ -z "$token" ] && command -v infisical >/dev/null 2>&1; then
    token="$(infisical secrets get ORISO_KIT_TOKEN --domain "$INFISICAL_DOMAIN" \
              --projectId "$INFISICAL_PROJECT_ID" --env "$INFISICAL_ENV" --plain 2>/dev/null || true)"
  fi

  if [ -z "$token" ]; then
    echo "[kit-subscribe] skipped — no Test-Access token found. Your personal one lives in the"
    echo "                macOS Keychain (service 'dreambau-test-access', account e.g."
    echo "                'shazia-mbp-oriso'). Set ORISO_TEST_ACCESS_IDENTITY=<your identity>,"
    echo "                or ORISO_KIT_TOKEN=<token> for a one-off. Ask Frank if you have none."
    return 1
  fi
  token="$(printf '%s' "$token" | tr -d '\r\n')"
  # Say which identity was used — never the value. Silent credential magic is how
  # people end up debugging the wrong account.
  [ -n "$identity" ] && echo "[kit-subscribe] identity: $identity"

  tmp="$(mktemp -d "${TMPDIR:-/tmp}/oriso-kit-subscribe.XXXXXX")" || return 1
  trap 'rm -rf "$tmp"' RETURN

  # Read the header from stdin: process arguments are observable by other tools.
  http_status="$(printf 'Authorization: Bearer %s\n' "$token" | curl -sS -o "$tmp/manifest.json" -w '%{http_code}' \
    --connect-timeout 4 --max-time 8 \
    -H @- "$base/manifest" 2>"$tmp/curl.err")"
  if [ "$http_status" != "200" ]; then
    case "$http_status" in
      401) echo "[kit-subscribe] failed — 401 unauthorized (token invalid, expired or revoked)" ;;
      301|302|404) echo "[kit-subscribe] failed — HTTP $http_status: the host answers but has no kit endpoint." ;
                   echo "                Either the /understand ingress path is not applied yet, or ORISO_KIT_BASE points somewhere else." ;;
      503) echo "[kit-subscribe] failed — 503: the endpoint is up but its bundle is not built" ;;
      000) echo "[kit-subscribe] failed — $base unreachable: $(tail -1 "$tmp/curl.err" 2>/dev/null)" ;;
      *)   echo "[kit-subscribe] failed — manifest request returned HTTP $http_status" ;;
    esac
    return 1
  fi

  remote_version="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("version",""))' "$tmp/manifest.json" 2>/dev/null)"
  [ -n "$remote_version" ] || { echo "[kit-subscribe] failed — served manifest has no version"; return 1; }

  local_version=""
  if [ -f "$KIT_HOME/manifest.json" ]; then
    local_version="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("version",""))' "$KIT_HOME/manifest.json" 2>/dev/null)"
  fi

  # "newer" = a higher dotted-numeric version. Equal or older means: do nothing.
  decision="$(python3 - "$remote_version" "$local_version" <<'PYEOF'
import sys


def key(value):
    parts = []
    for chunk in (value or "0").split("."):
        digits = "".join(c for c in chunk if c.isdigit())
        parts.append(int(digits) if digits else 0)
    return tuple(parts + [0] * (4 - len(parts)))


remote, local = sys.argv[1], sys.argv[2]
print("update" if not local or key(remote) > key(local) else "current")
PYEOF
)"
  if [ "$decision" != "update" ]; then
    echo "[kit-subscribe] kit current (version $local_version)"
    return 0
  fi

  filename="understand-kit-$remote_version.tar.gz"
  http_status="$(printf 'Authorization: Bearer %s\n' "$token" | curl -sS -o "$tmp/$filename" -w '%{http_code}' \
    --connect-timeout 4 --max-time 60 \
    -H @- "$base/bundle" 2>"$tmp/curl.err")"
  if [ "$http_status" != "200" ]; then
    if [ "$http_status" = "503" ]; then
      echo "[kit-subscribe] failed — endpoint says the bundle is not built yet (503)"
    else
      echo "[kit-subscribe] failed — bundle request returned HTTP $http_status"
    fi
    return 1
  fi

  mkdir -p "$tmp/unpacked"
  if ! tar -xzf "$tmp/$filename" -C "$tmp/unpacked" 2>"$tmp/tar.err"; then
    echo "[kit-subscribe] failed — could not unpack $filename: $(tail -1 "$tmp/tar.err" 2>/dev/null)"
    return 1
  fi

  # Verify every file the manifest lists against its sha256 before anything is
  # installed. A bundle that does not match its own manifest is not installed.
  if ! python3 - "$tmp/unpacked" "$tmp/manifest.json" <<'PYEOF'
import hashlib, json, os, sys

root, manifest_path = sys.argv[1], sys.argv[2]
manifest = json.load(open(manifest_path))
problems = []
for entry in manifest.get("files", []):
    target = os.path.join(root, entry["path"])
    if not os.path.isfile(target):
        problems.append(f"missing: {entry['path']}")
        continue
    with open(target, "rb") as fh:
        digest = hashlib.sha256(fh.read()).hexdigest()
    if digest != entry["sha256"]:
        problems.append(f"sha256 mismatch: {entry['path']}")
if problems:
    print("; ".join(problems[:5]), file=sys.stderr)
    sys.exit(1)
PYEOF
  then
    echo "[kit-subscribe] failed — bundle does not match its manifest, nothing installed"
    return 1
  fi

  # Replace wholesale, item by item: the client never merges (README, "Abo-Mechanik").
  mkdir -p "$KIT_HOME"
  for item in "${KIT_PAYLOAD[@]}"; do
    [ -e "$tmp/unpacked/$item" ] || continue
    rm -rf "$KIT_HOME/$item"
    cp -R "$tmp/unpacked/$item" "$KIT_HOME/$item"
  done
  chmod +x "$KIT_HOME"/*.sh 2>/dev/null || true
  echo "[kit-subscribe] updated ${local_version:-none} -> $remote_version in $KIT_HOME"
  # The update just overwrote the kit's own files. Put the developer's adaptations back
  # on top, so an adaptation is made once and not once per release.
  [ -x "$KIT_HOME/kit-local.sh" ] && bash "$KIT_HOME/kit-local.sh" apply
  return 0
}

if [ "$MODE" = "subscribe" ]; then
  kit_subscribe
  exit $?
fi
