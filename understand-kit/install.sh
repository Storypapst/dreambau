#!/usr/bin/env bash
# install.sh — ORISO Understand Kit installer.
#
# Idempotent: safe to re-run. macOS/BSD-compatible (no GNU-only flags).
# Never pipes a remote script into bash; only acts on files inside this kit.
#
# What it does (each step reports done/skipped/failed, summarised at the end):
#   0. Install the kit itself to ~/.oriso-dev-kit/ (a copy; the source stays wherever it
#      was unpacked or checked out). Every step below refers to that copy, so a later
#      bundle update replaces one directory and every repo follows.
#   1. Check `claude` CLI is on PATH.
#   2. Install the Understand-Anything Claude Code plugin (marketplace + plugin).
#   3. Register the two Storybook MCP servers (user scope — project scope would write the
#      secret into <repo>/.mcp.json) — only if ORISO_SB_MCP_AUTH is set or readable from
#      Infisical.
#   4. Copy ua-pull.sh to ~/.local/bin/ua-pull (chmod +x). Agent-neutral: a plain shell
#      script, used identically by Claude Code, Codex and a human shell.
#   5. Symlink <repo>/.claude/skills/oriso-graph -> ~/.oriso-dev-kit/skills/oriso-graph
#      (Claude-specific convenience; the same rule lives tool-neutrally in
#      rules/AGENTS-block.md and is not required for the kit to work).
#   6. Merge settings.hook.json's SessionStart hook into <repo>/.claude/settings.json
#      (only when run from inside a git repo checkout).
#   7. Pull the knowledge graph: via HTTPS if ORISO_UA_BASE + ORISO_UA_AUTH are
#      set, else via SSH if `ssh -G predev` resolves, else print instructions.
#
# Modes:
#   install.sh              full install (the seven steps above)
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
KIT_PAYLOAD=(install.sh ua-pull.sh mcp-add.sh kit-subscribe.sh build-bundle.sh \
             settings.hook.json .mcp.json.example manifest.json README.md \
             SECRET-SCAN.md rules skills prompts pages)

# Infisical is the credential source for both ORISO_SB_MCP_AUTH (step 3) and
# ORISO_KIT_TOKEN (subscription). Self-hosted; never the Infisical cloud.
INFISICAL_PROJECT_ID="2808af88-2c60-4023-8754-98665192cfdf"
INFISICAL_ENV="pre-dev"
INFISICAL_DOMAIN="${INFISICAL_DOMAIN:-https://secrets.dreambau.com}"

MODE="install"
while [ $# -gt 0 ]; do
  case "$1" in
    --subscribe) MODE="subscribe"; shift ;;
    -h|--help) sed -n '2,37p' "$0"; exit 0 ;;
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
# Token: ORISO_KIT_TOKEN from the environment, else Infisical at runtime. The
# value is never written to a file and never printed.
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

  token="${ORISO_KIT_TOKEN:-}"
  if [ -z "$token" ] && command -v infisical >/dev/null 2>&1; then
    token="$(infisical secrets get ORISO_KIT_TOKEN --domain "$INFISICAL_DOMAIN" \
              --projectId "$INFISICAL_PROJECT_ID" --env "$INFISICAL_ENV" --plain 2>/dev/null || true)"
  fi
  if [ -z "$token" ]; then
    echo "[kit-subscribe] skipped — ORISO_KIT_TOKEN not set and not readable from Infisical ($INFISICAL_ENV). Ask Frank for a token."
    return 1
  fi

  tmp="$(mktemp -d "${TMPDIR:-/tmp}/oriso-kit-subscribe.XXXXXX")" || return 1
  trap 'rm -rf "$tmp"' RETURN

  http_status="$(curl -sS -o "$tmp/manifest.json" -w '%{http_code}' \
    --connect-timeout 4 --max-time 8 \
    -H "Authorization: Bearer $token" "$base/manifest" 2>"$tmp/curl.err")"
  if [ "$http_status" != "200" ]; then
    case "$http_status" in
      401) echo "[kit-subscribe] failed — 401 unauthorized (token invalid, expired or revoked)" ;;
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
  http_status="$(curl -sS -o "$tmp/$filename" -w '%{http_code}' \
    --connect-timeout 4 --max-time 60 \
    -H "Authorization: Bearer $token" "$base/bundle" 2>"$tmp/curl.err")"
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
  return 0
}

if [ "$MODE" = "subscribe" ]; then
  kit_subscribe
  exit $?
fi

# ---------------------------------------------------------------------------
# 0. Install the kit to ~/.oriso-dev-kit/
#    The installed copy is the thing repos point at (skill symlink, hook, mcp-add.sh),
#    so replacing this one directory updates every repo at once.
# ---------------------------------------------------------------------------
if [ "$SRC_DIR" = "$KIT_HOME" ]; then
  note "[ok]      running from $KIT_HOME (already installed) — no copy needed"
else
  mkdir -p "$KIT_HOME"
  # Copy the kit payload, not build output. dist/ is a build artefact, never installed.
  for item in "${KIT_PAYLOAD[@]}"; do
    [ -e "$SRC_DIR/$item" ] || continue
    rm -rf "$KIT_HOME/$item"
    cp -R "$SRC_DIR/$item" "$KIT_HOME/$item"
  done
  chmod +x "$KIT_HOME"/*.sh 2>/dev/null || true
  note "[ok]      kit installed to $KIT_HOME (source: $SRC_DIR)"
fi
KIT_DIR="$KIT_HOME"

# ---------------------------------------------------------------------------
# 1. claude CLI present?
# ---------------------------------------------------------------------------
if command -v claude >/dev/null 2>&1; then
  note "[ok]      claude CLI found: $(command -v claude)"
  HAVE_CLAUDE=1
else
  note "[skipped] claude CLI not found on PATH — install Claude Code first (https://claude.com/claude-code), then re-run this script"
  HAVE_CLAUDE=0
fi

# ---------------------------------------------------------------------------
# 2. Understand-Anything plugin
# ---------------------------------------------------------------------------
if [ "$HAVE_CLAUDE" -eq 1 ]; then
  if claude plugin marketplace add Lum1104/Understand-Anything >/tmp/ua-plugin-marketplace.$$ 2>&1; then
    note "[ok]      claude plugin marketplace add Lum1104/Understand-Anything"
  else
    if grep -qi "already" /tmp/ua-plugin-marketplace.$$ 2>/dev/null; then
      note "[ok]      marketplace already registered"
    else
      note "[failed]  plugin marketplace add — see /tmp/ua-plugin-marketplace.$$"
    fi
  fi
  rm -f /tmp/ua-plugin-marketplace.$$

  if claude plugin install understand-anything@understand-anything --scope project >/tmp/ua-plugin-install.$$ 2>&1; then
    note "[ok]      claude plugin install understand-anything@understand-anything --scope project"
  else
    if grep -qi "already" /tmp/ua-plugin-install.$$ 2>/dev/null; then
      note "[ok]      plugin already installed"
    else
      note "[failed]  plugin install — see /tmp/ua-plugin-install.$$"
    fi
  fi
  rm -f /tmp/ua-plugin-install.$$
  note "[info]    skills now available: /understand-chat, /understand-diff, /understand-onboard"
else
  note "[skipped] Understand-Anything plugin install (no claude CLI)"
fi

# ---------------------------------------------------------------------------
# 3. Storybook MCP registration
#    Secret source: environment → Infisical (project "ORISO Test Access", env pre-dev) → ask Frank.
# ---------------------------------------------------------------------------
if [ -z "${ORISO_SB_MCP_AUTH:-}" ] && command -v infisical >/dev/null 2>&1; then
  ORISO_SB_MCP_AUTH="$(infisical secrets get ORISO_SB_MCP_AUTH --domain "$INFISICAL_DOMAIN" --projectId "$INFISICAL_PROJECT_ID" --env "$INFISICAL_ENV" --plain 2>/dev/null || true)"
  [ -n "$ORISO_SB_MCP_AUTH" ] && note "[ok]      ORISO_SB_MCP_AUTH loaded from Infisical ($INFISICAL_ENV)"
fi
if [ "$HAVE_CLAUDE" -eq 1 ] && [ -n "${ORISO_SB_MCP_AUTH:-}" ]; then
  if claude mcp add --transport http storybook-frontend \
      https://predev.oriso.org/storybook-frontend-mcp/mcp \
      --header "Authorization: Basic $ORISO_SB_MCP_AUTH" \
      --scope user >/tmp/sb-fe.$$ 2>&1; then
    note "[ok]      registered MCP storybook-frontend"
  else
    if grep -qi "already" /tmp/sb-fe.$$ 2>/dev/null; then
      note "[ok]      MCP storybook-frontend already registered"
    else
      note "[failed]  MCP storybook-frontend — see /tmp/sb-fe.$$"
    fi
  fi
  rm -f /tmp/sb-fe.$$

  if claude mcp add --transport http storybook-admin \
      https://predev.oriso.org/storybook-admin-mcp/mcp \
      --header "Authorization: Basic $ORISO_SB_MCP_AUTH" \
      --scope user >/tmp/sb-admin.$$ 2>&1; then
    note "[ok]      registered MCP storybook-admin"
  else
    if grep -qi "already" /tmp/sb-admin.$$ 2>/dev/null; then
      note "[ok]      MCP storybook-admin already registered"
    else
      note "[failed]  MCP storybook-admin — see /tmp/sb-admin.$$"
    fi
  fi
  rm -f /tmp/sb-admin.$$
  note "[info]    Storybook MCP tools (10.6): docs-list, docs-show, docs-show-story, stories-preview, stories-find-by-component, stories-changed, test-run"
else
  note "[skipped] Storybook MCP registration — ORISO_SB_MCP_AUTH not set and not readable from Infisical."
  note "          Either 'infisical login --domain $INFISICAL_DOMAIN' (project 'ORISO Test Access', env $INFISICAL_ENV) and re-run, or:"
  note "            export ORISO_SB_MCP_AUTH='<base64 of user:password, from Frank>'"
  note "            bash '$KIT_DIR/install.sh'"
  note "          or run '$KIT_DIR/mcp-add.sh' by hand once the variable is set."
fi

# ---------------------------------------------------------------------------
# 4. ua-pull.sh -> ~/.local/bin/ua-pull
# ---------------------------------------------------------------------------
BIN_DIR="$HOME/.local/bin"
mkdir -p "$BIN_DIR"
cp "$KIT_DIR/ua-pull.sh" "$BIN_DIR/ua-pull"
chmod +x "$BIN_DIR/ua-pull"
note "[ok]      copied ua-pull.sh -> $BIN_DIR/ua-pull"

if [ -f "$KIT_DIR/kit-subscribe.sh" ]; then
  cp "$KIT_DIR/kit-subscribe.sh" "$BIN_DIR/kit-subscribe"
  chmod +x "$BIN_DIR/kit-subscribe"
  note "[ok]      copied kit-subscribe.sh -> $BIN_DIR/kit-subscribe"
else
  note "[skipped] kit-subscribe — not present in this kit (pre-0.2.0 bundle)"
fi

case ":$PATH:" in
  *":$BIN_DIR:"*)
    note "[ok]      $BIN_DIR already on PATH"
    ;;
  *)
    note "[action]  $BIN_DIR is NOT on PATH — add to your shell profile:"
    note "            export PATH=\"\$HOME/.local/bin:\$PATH\""
    ;;
esac

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"

# ---------------------------------------------------------------------------
# 5. Symlink the oriso-graph skill into the repo (Claude Code convention:
#    <repo>/.claude/skills/<name>/SKILL.md). A symlink, not a copy, so a kit
#    update reaches every repo without touching any repository.
#    This is a Claude-specific convenience only — the same working rule lives
#    tool-neutrally in rules/AGENTS-block.md and belongs in the repo's AGENTS.md.
# ---------------------------------------------------------------------------
if [ -n "$REPO_ROOT" ] && [ -d "$KIT_DIR/skills/oriso-graph" ]; then
  SKILLS_DIR="$REPO_ROOT/.claude/skills"
  LINK="$SKILLS_DIR/oriso-graph"
  mkdir -p "$SKILLS_DIR"
  if [ -L "$LINK" ]; then
    ln -sfn "$KIT_DIR/skills/oriso-graph" "$LINK"
    note "[ok]      skill symlink refreshed: $LINK -> $KIT_DIR/skills/oriso-graph"
  elif [ -e "$LINK" ]; then
    note "[skipped] $LINK exists and is a real directory, not a symlink — remove or rename it, then re-run (not overwriting local work)"
  else
    ln -s "$KIT_DIR/skills/oriso-graph" "$LINK"
    note "[ok]      skill symlink created: $LINK -> $KIT_DIR/skills/oriso-graph"
  fi
  note "[info]    add '.claude/skills/oriso-graph' to .git/info/exclude if you do not want it in git status"
elif [ -z "$REPO_ROOT" ]; then
  note "[skipped] skill symlink — not inside a git repo checkout"
else
  note "[skipped] skill symlink — $KIT_DIR/skills/oriso-graph not found in this kit"
fi

# ---------------------------------------------------------------------------
# 6. Merge SessionStart hook into repo's .claude/settings.json
# ---------------------------------------------------------------------------
if [ -n "$REPO_ROOT" ]; then
  SETTINGS_DIR="$REPO_ROOT/.claude"
  SETTINGS_FILE="$SETTINGS_DIR/settings.json"
  mkdir -p "$SETTINGS_DIR"

  if [ -f "$SETTINGS_FILE" ]; then
    cp "$SETTINGS_FILE" "$SETTINGS_FILE.bak.$(date +%Y%m%d%H%M%S)"
    note "[ok]      backed up existing $SETTINGS_FILE"
  fi

  if command -v python3 >/dev/null 2>&1; then
    if python3 - "$SETTINGS_FILE" "$KIT_DIR/settings.hook.json" <<'PYEOF'
import json, sys, os

settings_path, hook_path = sys.argv[1], sys.argv[2]

settings = {}
if os.path.exists(settings_path):
    try:
        with open(settings_path) as fh:
            settings = json.load(fh)
    except Exception as exc:
        print(f"[failed]  could not parse existing {settings_path}: {exc}", file=sys.stderr)
        sys.exit(1)

with open(hook_path) as fh:
    hook = json.load(fh)

new_entries = hook.get("hooks", {}).get("SessionStart", [])

settings.setdefault("hooks", {})
existing = settings["hooks"].setdefault("SessionStart", [])

# Idempotent: skip entries whose hook command already appears verbatim.
existing_commands = {
    h.get("command")
    for entry in existing
    for h in entry.get("hooks", [])
}
added = 0
for entry in new_entries:
    cmds = [h.get("command") for h in entry.get("hooks", [])]
    if any(c in existing_commands for c in cmds):
        continue
    existing.append(entry)
    added += 1

with open(settings_path, "w") as fh:
    json.dump(settings, fh, indent=2)
    fh.write("\n")

print(f"[ok]      merged SessionStart hook into {settings_path} ({added} entr{'y' if added==1 else 'ies'} added)")
PYEOF
    then
      :
    else
      note "[failed]  merging settings.hook.json into $SETTINGS_FILE — merge it by hand (see understand-kit/README.md)"
    fi
  else
    note "[failed]  python3 not found — cannot merge settings.json safely; merge /settings.hook.json into $SETTINGS_FILE by hand"
  fi
else
  note "[skipped] not inside a git repo — run install.sh from inside an ORISO repo checkout to wire the SessionStart hook"
fi

# ---------------------------------------------------------------------------
# 7. Pull the knowledge graph
# ---------------------------------------------------------------------------
UA_PULL="$BIN_DIR/ua-pull"
if [ -n "${ORISO_UA_BASE:-}" ] && [ -n "${ORISO_UA_AUTH:-}" ]; then
  if [ -n "$REPO_ROOT" ]; then
    if "$UA_PULL" --via-https "$ORISO_UA_BASE" >/tmp/ua-pull-out.$$ 2>&1; then
      note "[ok]      ua-pull --via-https $ORISO_UA_BASE: $(tail -1 /tmp/ua-pull-out.$$)"
    else
      note "[failed]  ua-pull --via-https — $(tail -1 /tmp/ua-pull-out.$$)"
    fi
    rm -f /tmp/ua-pull-out.$$
  else
    note "[skipped] graph pull — not inside a git repo checkout"
  fi
elif ssh -G predev >/dev/null 2>&1; then
  if [ -n "$REPO_ROOT" ]; then
    if "$UA_PULL" --via-ssh >/tmp/ua-pull-out.$$ 2>&1; then
      note "[ok]      ua-pull --via-ssh: $(tail -1 /tmp/ua-pull-out.$$)"
    else
      note "[failed]  ua-pull --via-ssh — $(tail -1 /tmp/ua-pull-out.$$)"
    fi
    rm -f /tmp/ua-pull-out.$$
  else
    note "[skipped] graph pull — not inside a git repo checkout"
  fi
else
  note "[skipped] graph pull — neither (ORISO_UA_BASE + ORISO_UA_AUTH) nor a resolvable 'predev' SSH alias found."
  note "          Either:"
  note "            export ORISO_UA_BASE='https://<dreambau-base>'  # ask Frank"
  note "            export ORISO_UA_AUTH='user:pass'                # ask Frank"
  note "          or add an SSH alias 'predev' to ~/.ssh/config, then run: ua-pull --via-ssh"
fi

# ---------------------------------------------------------------------------
# Final summary
# ---------------------------------------------------------------------------
echo
echo "=== ORISO Dev-Kit install summary ==="
printf '%s\n' "${SUMMARY_LINES[@]}"
echo "======================================"
echo "Next: read '$KIT_DIR/README.md' for the 5-minute setup checklist and troubleshooting."
