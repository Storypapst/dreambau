#!/usr/bin/env bash
# ua-pull.sh — pull the Understand-Anything knowledge graph for the current
# repo (and the ORISO-Platform cross-service graph) from predev, without
# letting the understand-anything Claude Code plugin try to rebuild it.
#
# macOS/BSD-compatible: no `readlink -f`, no GNU-only flags, no `stat -c`.
#
# Usage:
#   ua-pull.sh [--via-ssh | --via-https <base-url>] [--verify] [--unlock] [--platform-only]
#
#   --via-ssh          (default) pull via `ssh predev` / `rsync -e ssh`.
#                       Assumes an ssh config alias "predev" is set up.
#   --via-https <url>  pull via curl/https from <url>/<Repo>/knowledge-graph.json
#                       etc. Needs ORISO_UA_AUTH="user:pass" in the environment.
#   --verify            do not pull; report freshness of what's on disk and
#                       exit 0 (fresh, <=24h) or 1 (stale/missing).
#   --unlock            git update-index --no-skip-worktree the files this
#                       script manages, so `git pull` / `git status` behave
#                       normally again. Run this before pulling upstream.
#   --platform-only     only fetch platform-graph.json (ORISO-Platform), skip
#                       the per-repo graph files.
#
# Files written under <repo>/.understand-anything/:
#   knowledge-graph.json, meta.json, fingerprints.json  (per-repo graph)
#   platform-graph.json                                  (cross-service graph, if available)
#   config.json           = {"autoUpdate": false}  (prevents the plugin's
#                            SessionStart/PostToolUse hooks from trying an
#                            LLM rebuild against a commit hash that never
#                            matches a pulled snapshot)
#
# For any of the above files that are git-tracked in this repo, ua-pull marks
# them `git update-index --skip-worktree` after writing, so `git status` stays
# clean and a stray `git commit` never re-commits a pulled snapshot. Run
# `ua-pull --unlock` before `git pull` if upstream also touched those files —
# skip-worktree can make git refuse to fast-forward over a locally "clean but
# skip-worktree'd" file that diverged upstream.

set -euo pipefail

# ---------------------------------------------------------------------------
# Config / constants
# ---------------------------------------------------------------------------

SSH_ALIAS="${ORISO_UA_SSH_ALIAS:-predev}"
REMOTE_BASE="/opt/oriso-understand"
PLATFORM_REPO="ORISO-Platform"
GRAPH_FILES=(knowledge-graph.json meta.json fingerprints.json)
STALE_HOURS=24

MODE="via-ssh"
HTTPS_BASE=""
DO_VERIFY=0
DO_UNLOCK=0
PLATFORM_ONLY=0

# ---------------------------------------------------------------------------
# Arg parsing
# ---------------------------------------------------------------------------

while [ $# -gt 0 ]; do
  case "$1" in
    --via-ssh)
      MODE="via-ssh"
      shift
      ;;
    --via-https)
      MODE="via-https"
      # optional base URL; default (https://predev.oriso.org/ua) is applied later
      if [ -n "${2:-}" ] && [ "${2#--}" = "$2" ]; then
        HTTPS_BASE="$2"; shift 2
      else
        HTTPS_BASE=""; shift
      fi
      ;;
    --verify)
      DO_VERIFY=1
      shift
      ;;
    --unlock)
      DO_UNLOCK=1
      shift
      ;;
    --platform-only)
      PLATFORM_ONLY=1
      shift
      ;;
    -h|--help)
      sed -n '2,40p' "$0"
      exit 0
      ;;
    *)
      echo "ua-pull: unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

die() { echo "ua-pull: $*" >&2; exit 1; }

# Portable "now in epoch seconds" and "mtime in epoch seconds" (BSD + GNU).
epoch_now() { date +%s; }
epoch_mtime() {
  # $1 = file path
  if stat -f %m "$1" >/dev/null 2>&1; then
    stat -f %m "$1"          # BSD/macOS
  else
    stat -c %Y "$1"          # GNU/Linux
  fi
}

# Resolve the repo root without `readlink -f` (not on macOS /usr/bin).
REPO_ROOT="$(cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)" && pwd)"
[ -d "$REPO_ROOT/.git" ] || [ -f "$REPO_ROOT/.git" ] || die "not inside a git repo (run from a repo checkout)"

UA_DIR="$REPO_ROOT/.understand-anything"
mkdir -p "$UA_DIR"

# Derive the ORISO repo name from `git remote get-url origin`.
# Handles both:
#   https://github.com/OpenResilienceInitiative/ORISO-Frontend.git
#   git@github.com:OpenResilienceInitiative/ORISO-Frontend.git
origin_url="$(git -C "$REPO_ROOT" remote get-url origin 2>/dev/null || true)"
[ -n "$origin_url" ] || die "no 'origin' remote found in $REPO_ROOT"

REPO_NAME="$(printf '%s' "$origin_url" \
  | sed -E 's#\.git$##' \
  | sed -E 's#.*OpenResilienceInitiative[/:]##')"
[ -n "$REPO_NAME" ] || die "could not derive repo name from origin URL: $origin_url"

# ---------------------------------------------------------------------------
# skip-worktree bookkeeping
# ---------------------------------------------------------------------------

# Is $1 (relative to repo root) tracked by git?
is_tracked() {
  git -C "$REPO_ROOT" ls-files --error-unmatch "$1" >/dev/null 2>&1
}

mark_skip_worktree() {
  # $1 = path relative to repo root
  if is_tracked "$1"; then
    git -C "$REPO_ROOT" update-index --skip-worktree "$1"
  else
    # untracked pulled file: keep `git status` clean via .git/info/exclude (idempotent)
    local excl="$REPO_ROOT/.git/info/exclude"
    mkdir -p "$(dirname "$excl")"
    grep -qxF "$1" "$excl" 2>/dev/null || printf '%s\n' "$1" >> "$excl"
  fi
}

mark_no_skip_worktree() {
  if is_tracked "$1"; then
    git -C "$REPO_ROOT" update-index --no-skip-worktree "$1" 2>/dev/null || true
  fi
}

MANAGED_FILES=(
  ".understand-anything/knowledge-graph.json"
  ".understand-anything/meta.json"
  ".understand-anything/fingerprints.json"
  ".understand-anything/platform-graph.json"
  ".understand-anything/config.json"
  ".understand-anything/depth.json"
)

if [ "$DO_UNLOCK" -eq 1 ]; then
  for f in "${MANAGED_FILES[@]}"; do
    if [ -e "$REPO_ROOT/$f" ]; then
      mark_no_skip_worktree "$f"
      echo "ua-pull --unlock: $f -> no-skip-worktree (safe to 'git pull' now; if upstream also changed it, git may still ask you to resolve/stash first)"
    fi
  done
  exit 0
fi

# ---------------------------------------------------------------------------
# --verify mode
# ---------------------------------------------------------------------------

json_num() {
  # $1 = file, $2 = dotted-ish simple key (top-level only), portable via python3/node
  local file="$1" key="$2"
  if command -v python3 >/dev/null 2>&1; then
    python3 -c "
import json,sys
try:
    d=json.load(open(sys.argv[1]))
    v=d.get(sys.argv[2])
    print(v if v is not None else '')
except Exception:
    print('')
" "$file" "$key"
  elif command -v node >/dev/null 2>&1; then
    node -e "
try {
  const d = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
  const v = d[process.argv[2]];
  console.log(v === undefined ? '' : v);
} catch (e) { console.log(''); }
" "$file" "$key"
  else
    echo ""
  fi
}

node_count() {
  # $1 = knowledge-graph.json path; counts entries in .nodes if array/object
  local file="$1"
  if command -v python3 >/dev/null 2>&1; then
    python3 -c "
import json,sys
try:
    d=json.load(open(sys.argv[1]))
    n=d.get('nodes')
    if isinstance(n, list):
        print(len(n))
    elif isinstance(n, dict):
        print(len(n))
    else:
        print('?')
except Exception:
    print('?')
" "$file"
  elif command -v node >/dev/null 2>&1; then
    node -e "
try {
  const d = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
  const n = d.nodes;
  console.log(Array.isArray(n) || (n && typeof n === 'object') ? Object.keys(n).length || n.length : '?');
} catch (e) { console.log('?'); }
" "$file"
  else
    echo "?"
  fi
}

file_bytes() {
  if stat -f %z "$1" >/dev/null 2>&1; then
    stat -f %z "$1"
  else
    stat -c %s "$1"
  fi
}

if [ "$DO_VERIFY" -eq 1 ]; then
  echo "repo:   $REPO_NAME"
  branch="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
  local_head="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo '?')"
  echo "branch: $branch"

  meta="$UA_DIR/meta.json"
  graph="$UA_DIR/knowledge-graph.json"

  if [ ! -f "$meta" ] || [ ! -f "$graph" ]; then
    echo "graph:  MISSING ($UA_DIR/knowledge-graph.json or meta.json not found)"
    echo "status: STALE (missing) — run: ua-pull.sh"
    exit 1
  fi

  graph_commit="$(json_num "$meta" gitCommitHash)"
  analyzed_at="$(json_num "$meta" lastAnalyzedAt)"
  [ -n "$analyzed_at" ] || analyzed_at="$(json_num "$meta" analyzedAt)"

  now="$(epoch_now)"
  mtime="$(epoch_mtime "$graph")"
  age_seconds=$(( now - mtime ))
  age_hours=$(( age_seconds / 3600 ))

  bytes="$(file_bytes "$graph")"
  nodes="$(node_count "$graph")"

  depth_date=""
  platform_depth=""
  if [ -f "$UA_DIR/depth.json" ]; then
    depth_date="$(json_num "$UA_DIR/depth.json" depthAt)"
    platform_depth="$(json_num "$UA_DIR/depth.json" platformDepthAt)"
  fi

  echo "graph commit: $graph_commit"
  echo "local HEAD:   $local_head"
  echo "analyzed at:  $analyzed_at"
  echo "age:          ${age_hours}h"
  echo "bytes:        $bytes"
  echo "nodes:        $nodes"
  [ -n "$depth_date" ] && echo "depth (Tiefe): $depth_date (concepts/flows/tour of this repo; platform newest: ${platform_depth:-n/a})"

  if [ "$age_hours" -gt "$STALE_HOURS" ]; then
    echo "status: STALE (>${STALE_HOURS}h old) — run: ua-pull.sh"
    exit 1
  fi
  if [ "$graph_commit" != "$local_head" ]; then
    echo "status: FRESH-BUT-BEHIND-HEAD (graph commit != local HEAD; not necessarily stale — the graph tracks the branch commit it was built from, not your uncommitted work)"
    exit 0
  fi
  echo "status: FRESH"
  exit 0
fi

# ---------------------------------------------------------------------------
# Pull implementations
# ---------------------------------------------------------------------------

pull_via_ssh() {
  # $1 = remote repo dir name, $2 = local dest dir, $3.. = filenames
  local remote_repo="$1" dest="$2"
  shift 2
  local remote_dir="$REMOTE_BASE/$remote_repo/.understand-anything"
  local f
  for f in "$@"; do
    if ssh -o BatchMode=yes -o ConnectTimeout=10 "$SSH_ALIAS" "test -f '$remote_dir/$f'" 2>/dev/null; then
      rsync -e ssh -az "$SSH_ALIAS:$remote_dir/$f" "$dest/$f"
    else
      echo "ua-pull: note: $remote_repo/$f not found on $SSH_ALIAS, skipping" >&2
    fi
  done
}

# Auto-select HTTPS when a base is configured; pull ORISO_UA_AUTH from Infisical if not in env.
INFISICAL_DOMAIN="${INFISICAL_DOMAIN:-https://secrets.dreambau.com}"
INFISICAL_PROJECT_ID="${INFISICAL_PROJECT_ID:-2808af88-2c60-4023-8754-98665192cfdf}"
INFISICAL_ENV="${INFISICAL_ENV:-pre-dev}"
if [ "$MODE" = "via-ssh" ] && [ -z "$HTTPS_BASE" ] && [ -n "${ORISO_UA_BASE:-}" ] && ! ssh -G predev >/dev/null 2>&1; then
  MODE="via-https"; HTTPS_BASE="$ORISO_UA_BASE"
fi
# The /ua ingress on predev reuses the Storybook-MCP basic-auth secret: derive user:pass from
# ORISO_SB_MCP_AUTH (base64 of user:pass) when ORISO_UA_AUTH is not set.
if [ "$MODE" = "via-https" ] && [ -z "${ORISO_UA_AUTH:-}" ]; then
  if [ -z "${ORISO_SB_MCP_AUTH:-}" ] && command -v infisical >/dev/null 2>&1; then
    ORISO_SB_MCP_AUTH="$(infisical secrets get ORISO_SB_MCP_AUTH --domain "$INFISICAL_DOMAIN" --projectId "$INFISICAL_PROJECT_ID" --env "$INFISICAL_ENV" --plain 2>/dev/null || true)"
  fi
  if [ -n "${ORISO_SB_MCP_AUTH:-}" ]; then
    ORISO_UA_AUTH="$(printf '%s' "$ORISO_SB_MCP_AUTH" | base64 -d 2>/dev/null || true)"
    [ -n "$ORISO_UA_AUTH" ] && echo "ua-pull: ORISO_UA_AUTH derived from ORISO_SB_MCP_AUTH" >&2
  fi
fi
if [ "$MODE" = "via-https" ] && [ -z "$HTTPS_BASE" ]; then HTTPS_BASE="https://predev.oriso.org/ua"; fi
if [ "$MODE" = "via-https" ] && [ -z "${ORISO_UA_AUTH:-}" ] && command -v infisical >/dev/null 2>&1; then
  ORISO_UA_AUTH="$(infisical secrets get ORISO_UA_AUTH --domain "$INFISICAL_DOMAIN" --projectId "$INFISICAL_PROJECT_ID" --env "$INFISICAL_ENV" --plain 2>/dev/null || true)"
  [ -n "$ORISO_UA_AUTH" ] && echo "ua-pull: ORISO_UA_AUTH loaded from Infisical ($INFISICAL_ENV)" >&2
fi
if [ "$MODE" = "via-https" ] && [ -z "$HTTPS_BASE" ] && command -v infisical >/dev/null 2>&1; then
  HTTPS_BASE="$(infisical secrets get ORISO_UA_BASE --domain "$INFISICAL_DOMAIN" --projectId "$INFISICAL_PROJECT_ID" --env "$INFISICAL_ENV" --plain 2>/dev/null || true)"
fi

pull_via_https() {
  local remote_repo="$1" dest="$2"
  shift 2
  local f
  local auth_opt=()
  if [ -n "${ORISO_UA_AUTH:-}" ]; then
    auth_opt=(-u "$ORISO_UA_AUTH")
  fi
  for f in "$@"; do
    local url="$HTTPS_BASE/$remote_repo/$f"
    if curl -fsS ${auth_opt[@]+"${auth_opt[@]}"} -o "$dest/$f.tmp" "$url" 2>/dev/null; then
      mv "$dest/$f.tmp" "$dest/$f"
    else
      rm -f "$dest/$f.tmp"
      echo "ua-pull: note: $url not reachable, skipping" >&2
    fi
  done
}

# ---------------------------------------------------------------------------
# Main pull
# ---------------------------------------------------------------------------

pulled_any=0

if [ "$PLATFORM_ONLY" -eq 0 ]; then
  case "$MODE" in
    via-ssh)  pull_via_ssh "$REPO_NAME" "$UA_DIR" "${GRAPH_FILES[@]}" ;;
    via-https) pull_via_https "$REPO_NAME" "$UA_DIR" "${GRAPH_FILES[@]}" ;;
  esac
  [ -f "$UA_DIR/knowledge-graph.json" ] && pulled_any=1
  for f in "${GRAPH_FILES[@]}"; do
    mark_skip_worktree ".understand-anything/$f"
  done
fi

# Cross-service platform graph — handle absence gracefully (may not exist
# yet). The generic pull_via_ssh/pull_via_https helpers above copy files 1:1
# by name, so for the platform graph (source name knowledge-graph.json,
# destination name platform-graph.json) we do a small dedicated fetch.
fetch_platform_graph() {
  local dest="$UA_DIR/platform-graph.json"
  case "$MODE" in
    via-ssh)
      local remote="$REMOTE_BASE/$PLATFORM_REPO/.understand-anything/knowledge-graph.json"
      if ssh -o BatchMode=yes -o ConnectTimeout=10 "$SSH_ALIAS" "test -f '$remote'" 2>/dev/null; then
        rsync -e ssh -az "$SSH_ALIAS:$remote" "$dest"
        mark_skip_worktree ".understand-anything/platform-graph.json"
      else
        echo "ua-pull: note: ORISO-Platform graph missing on $SSH_ALIAS (ua-refresh not run since the platform step was added?), skipping platform-graph.json" >&2
      fi
      ;;
    via-https)
      local url="$HTTPS_BASE/$PLATFORM_REPO/knowledge-graph.json"
      local auth_opt=()
      if [ -n "${ORISO_UA_AUTH:-}" ]; then
        auth_opt=(-u "$ORISO_UA_AUTH")
      fi
      if curl -fsS "${auth_opt[@]}" -o "$dest.tmp" "$url" 2>/dev/null; then
        mv "$dest.tmp" "$dest"
        mark_skip_worktree ".understand-anything/platform-graph.json"
      else
        rm -f "$dest.tmp"
        echo "ua-pull: note: ORISO-Platform graph not available yet at $url, skipping platform-graph.json" >&2
      fi
      ;;
  esac
}
fetch_platform_graph

# depth.json: written per repo by ua-refresh.sh on predev (depthAt = date of the
# repo's enrich-*.json, platformDepthAt = newest across repos). Best-effort pull.
case "$MODE" in
  via-ssh)
    remote_depth="$REMOTE_BASE/$REPO_NAME/.understand-anything/depth.json"
    if ssh -o BatchMode=yes -o ConnectTimeout=10 "$SSH_ALIAS" "test -f '$remote_depth'" 2>/dev/null; then
      rsync -e ssh -az "$SSH_ALIAS:$remote_depth" "$UA_DIR/depth.json"
    fi
    ;;
  via-https)
    if [ -n "${ORISO_UA_AUTH:-}" ]; then
      curl -fsS -u "$ORISO_UA_AUTH" -o "$UA_DIR/depth.json.tmp" "$HTTPS_BASE/$REPO_NAME/depth.json" 2>/dev/null \
        && mv "$UA_DIR/depth.json.tmp" "$UA_DIR/depth.json" \
        || rm -f "$UA_DIR/depth.json.tmp"
    fi
    ;;
esac
[ -f "$UA_DIR/depth.json" ] && mark_skip_worktree ".understand-anything/depth.json"

# Always write config.json = {"autoUpdate": false} so the plugin's
# SessionStart/PostToolUse hooks never try an LLM rebuild against a pulled
# snapshot (its gitCommitHash will legitimately differ from a dev's HEAD).
printf '{\n  "autoUpdate": false\n}\n' > "$UA_DIR/config.json"
mark_skip_worktree ".understand-anything/config.json"

# ---------------------------------------------------------------------------
# One-line summary
# ---------------------------------------------------------------------------

if [ "$PLATFORM_ONLY" -eq 1 ]; then
  if [ -f "$UA_DIR/platform-graph.json" ]; then
    pbytes="$(file_bytes "$UA_DIR/platform-graph.json")"
    echo "ua-pull: $REPO_NAME: platform-graph.json pulled (${pbytes} bytes)"
  else
    echo "ua-pull: $REPO_NAME: platform-graph.json not available"
  fi
  exit 0
fi

if [ "$pulled_any" -eq 1 ]; then
  gbytes="$(file_bytes "$UA_DIR/knowledge-graph.json")"
  gcommit="$(json_num "$UA_DIR/meta.json" gitCommitHash)"
  echo "ua-pull: $REPO_NAME: knowledge-graph.json pulled (${gbytes} bytes, commit ${gcommit:0:12})"
else
  echo "ua-pull: $REPO_NAME: no graph pulled — check that $REPO_NAME exists under $REMOTE_BASE on $SSH_ALIAS"
  exit 1
fi
