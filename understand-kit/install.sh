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
             test-access-install.sh settings.hook.json .mcp.json.example manifest.json README.md \
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

  http_status="$(curl -sS -o "$tmp/manifest.json" -w '%{http_code}' \
    --connect-timeout 4 --max-time 8 \
    -H "Authorization: Bearer $token" "$base/manifest" 2>"$tmp/curl.err")"
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
  # The update just overwrote the kit's own files. Put the developer's adaptations back
  # on top, so an adaptation is made once and not once per release.
  [ -x "$KIT_HOME/kit-local.sh" ] && bash "$KIT_HOME/kit-local.sh" apply
  return 0
}

if [ "$MODE" = "subscribe" ]; then
  kit_subscribe
  kit_status=$?
  # The Test-Access CLI follows the same subscription: one manifest request, a
  # download only when a newer version is served. Never blocks the session.
  if [ -f "$KIT_HOME/test-access-install.sh" ]; then
    bash "$KIT_HOME/test-access-install.sh" 2>&1 | sed -n '1,3p'
  fi
  exit $kit_status
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
# 0b. Your own layer. Created once, never replaced by an update: overrides put back
#     after every update, plus room for your own rules, prompts and skills.
# ---------------------------------------------------------------------------
if [ -f "$KIT_DIR/kit-local.sh" ]; then
  bash "$KIT_DIR/kit-local.sh" init >/dev/null 2>&1
  note "[ok]      your own layer ready: $LOCAL_DIR (rules, prompts, skills, overrides)"
  note "[info]    adapt a kit file so it survives updates: kit-local adapt <path> ; kit-local apply"
fi

# ---------------------------------------------------------------------------
# 0c. Path router. Several ORISO skills resolve the project boundary from
#     ~/.config/agent-routing/paths.env. On a machine without it, those skills fall
#     through to whatever the agent guesses — so write a minimal one from what we can
#     actually observe here. An existing file is never modified.
# ---------------------------------------------------------------------------
ROUTER="$HOME/.config/agent-routing/paths.env"
if [ -f "$ROUTER" ]; then
  note "[ok]      path router present: $ROUTER"
else
  GUESS_ROOT=""
  R="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  if [ -n "$R" ] && git -C "$R" remote get-url origin 2>/dev/null | grep -qi "OpenResilienceInitiative"; then
    GUESS_ROOT="$(dirname "$R")"
  fi
  if [ -n "$GUESS_ROOT" ]; then
    mkdir -p "$(dirname "$ROUTER")"
    cat > "$ROUTER" <<ROUTEREOF
# Machine-local path resolver. Written by the ORISO dev kit on $(date +%Y-%m-%d).
# Agents source this file before resolving any project path, so nothing has to
# hardcode one person's home directory. Edit it freely; the kit never rewrites it.
PROJECT_ORISO_ROOT=$GUESS_ROOT
TEST_ACCESS_URL=https://secrets.dreambau.com
ROUTEREOF
    note "[ok]      wrote $ROUTER (PROJECT_ORISO_ROOT=$GUESS_ROOT)"
    note "[info]    check that line — it is the parent folder of your ORISO checkouts"
  else
    note "[skipped] path router — run this from inside an ORISO checkout and it writes"
    note "          $ROUTER for you, or create it with: PROJECT_ORISO_ROOT=<your ORISO folder>"
  fi
fi

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

# ---------------------------------------------------------------------------
# 4a. The Test-Access CLI: installed from the Dreambau release endpoint, never
#     from a checkout or a hand-delivered file. Re-runs update it; --subscribe
#     keeps it current afterwards.
# ---------------------------------------------------------------------------
if [ -f "$KIT_DIR/test-access-install.sh" ]; then
  cp "$KIT_DIR/test-access-install.sh" "$BIN_DIR/test-access-install"
  chmod +x "$BIN_DIR/test-access-install"
  if bash "$KIT_DIR/test-access-install.sh"; then
    note "[ok]      test-access CLI installed/current — 'test-access --version' shows the release; 'test-access-install' updates it"
  else
    note "[warn]    test-access CLI not installed — see the [test-access-install] lines above; run 'test-access-install' again once the token is in place"
  fi
fi

if [ -f "$KIT_DIR/kit-subscribe.sh" ]; then
  cp "$KIT_DIR/kit-subscribe.sh" "$BIN_DIR/kit-subscribe"
  chmod +x "$BIN_DIR/kit-subscribe"
  note "[ok]      copied kit-subscribe.sh -> $BIN_DIR/kit-subscribe"
else
  note "[skipped] kit-subscribe — not present in this kit (pre-0.2.0 bundle)"
fi

if [ -f "$KIT_DIR/kit-local.sh" ]; then
  cp "$KIT_DIR/kit-local.sh" "$BIN_DIR/kit-local"
  chmod +x "$BIN_DIR/kit-local"
  note "[ok]      copied kit-local.sh -> $BIN_DIR/kit-local"
else
  note "[skipped] kit-local — not present in this kit (pre-0.4.0 bundle)"
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
link_skill() {   # link_skill <source skill dir> <destination skills dir> <label>
  local src="$1" dest_dir="$2" label="$3" name link
  name="$(basename "$src")"
  link="$dest_dir/$name"
  mkdir -p "$dest_dir"
  if [ -L "$link" ]; then
    ln -sfn "$src" "$link"
    note "[ok]      $label skill refreshed: $name"
  elif [ -e "$link" ]; then
    note "[skipped] $link is a real directory, not a symlink — remove or rename it, then re-run (not overwriting your own work)"
  else
    ln -s "$src" "$link"
    note "[ok]      $label skill linked: $name"
  fi
}

# Kit skills first, then the developer's own from local/skills/. A local skill of the same
# name wins, because it is linked second.
SKILL_SOURCES=()
[ -d "$KIT_DIR/skills" ] && for d in "$KIT_DIR"/skills/*/; do [ -d "$d" ] && SKILL_SOURCES+=("${d%/}"); done
[ -d "$LOCAL_DIR/skills" ] && for d in "$LOCAL_DIR"/skills/*/; do [ -d "$d" ] && SKILL_SOURCES+=("${d%/}"); done

if [ "${#SKILL_SOURCES[@]}" -eq 0 ]; then
  note "[skipped] skill links — this kit ships no skills and local/skills/ is empty"
else
  # Claude Code: skills live in the repository checkout.
  if [ -n "$REPO_ROOT" ]; then
    for s in "${SKILL_SOURCES[@]}"; do link_skill "$s" "$REPO_ROOT/.claude/skills" "Claude"; done
    note "[info]    add '.claude/skills/' to .git/info/exclude if you do not want the links in git status"
  else
    note "[skipped] Claude skill links — not inside a git repo checkout"
  fi
  # Codex: skills live once per machine, not per repository.
  for s in "${SKILL_SOURCES[@]}"; do link_skill "$s" "$HOME/.codex/skills" "Codex"; done
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
# 8. Your own rules file, and your adaptations back on top.
# ---------------------------------------------------------------------------
DEV_HANDLE="${ORISO_KIT_DEV:-}"
if [ -z "$DEV_HANDLE" ] && [ -n "$REPO_ROOT" ]; then
  # gh knows the GitHub handle; git config is the fallback. Neither is fatal.
  DEV_HANDLE="$(gh api user --jq .login 2>/dev/null || true)"
fi
if [ -n "$DEV_HANDLE" ] && [ -f "$KIT_DIR/rules/devs/$DEV_HANDLE.md" ]; then
  note "[ok]      your rules: $KIT_DIR/rules/devs/$DEV_HANDLE.md"
elif [ -n "$DEV_HANDLE" ]; then
  note "[info]    no team rules file for '$DEV_HANDLE' yet — add rules/devs/$DEV_HANDLE.md and send it to Frank"
else
  note "[info]    set ORISO_KIT_DEV=<your github handle> so agents read rules/devs/<you>.md"
fi

if [ -f "$KIT_DIR/kit-local.sh" ]; then
  bash "$KIT_DIR/kit-local.sh" apply
fi

# ---------------------------------------------------------------------------
# Final summary
# ---------------------------------------------------------------------------
echo
echo "=== ORISO Dev-Kit install summary ==="
printf '%s\n' "${SUMMARY_LINES[@]}"
echo "======================================"
echo "Next: read '$KIT_DIR/README.md' for the 5-minute setup checklist and troubleshooting."
