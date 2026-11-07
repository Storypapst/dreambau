#!/usr/bin/env bash
# test-access-install.sh — install or update the Test-Access CLI from the Dreambau
# release endpoint. One command, no source checkout, no hand-delivered files.
#
#   test-access-install            install when missing, update when a newer version is served
#   test-access-install --check    only report installed vs served version (exit 0 = current)
#   test-access-install --force    reinstall the served version even when equal
#
# What it does:
#   1. GET $ORISO_KIT_BASE_CLI/manifest with your personal Test-Access token
#      (ORISO_KIT_TOKEN, else macOS Keychain service 'dreambau-test-access', else the
#      credential file — exactly the rule kit-subscribe uses; the value is never printed
#      and never passed on a command line).
#   2. Compare the served version with ~/.local/share/dreambau-agent-tools/test-access/manifest.json.
#   3. Download the bundle, verify its sha256 against the manifest, swap it in atomically
#      with a backup, write the `test-access` wrapper to ~/.local/bin.
#   4. Make sure Playwright (the only external runtime) is present next to the bundle in
#      the version the manifest names; installs it with npm when missing or different.
#
# Environment:
#   ORISO_KIT_BASE_CLI   default https://dreambau.com/understand/api/v1/cli
#   ORISO_KIT_TOKEN, ORISO_TEST_ACCESS_IDENTITY   token resolution, see above
#   TEST_ACCESS_CREDENTIAL_PROVIDER              auto (default) or file
#   DREAMBAU_CLI_PROFILE                         optional local wrapper profile
#   XDG_BIN_HOME, XDG_DATA_HOME                    install locations
#
# Exit codes: 0 current or installed, 1 could not install, 2 usage.
set -uo pipefail

MODE="install"
while [ $# -gt 0 ]; do
  case "$1" in
    --check) MODE="check"; shift ;;
    --force) MODE="force"; shift ;;
    -h|--help) sed -n '2,26p' "$0"; exit 0 ;;
    *) echo "test-access-install: unknown argument: $1" >&2; exit 2 ;;
  esac
done

base="${ORISO_KIT_BASE_CLI:-https://dreambau.com/understand/api/v1/cli}"
bin_dir="${XDG_BIN_HOME:-$HOME/.local/bin}"
data_dir="${XDG_DATA_HOME:-$HOME/.local/share}/dreambau-agent-tools/test-access"

command -v node >/dev/null 2>&1 || { echo "[test-access-install] failed — node not found (Node 20+ is required to run test-access)"; exit 1; }

# --- token: same order as install.sh --subscribe -----------------------------
token="${ORISO_KIT_TOKEN:-}"
identity="${ORISO_TEST_ACCESS_IDENTITY:-}"
credential_provider="${TEST_ACCESS_CREDENTIAL_PROVIDER:-${ORISO_TEST_ACCESS_CREDENTIAL_PROVIDER:-auto}}"
case "$credential_provider" in
  auto|file) ;;
  *) echo "[test-access-install] failed — invalid credential provider (use auto or file)"; exit 1 ;;
esac
if [ -z "$identity" ]; then
  for f in "$HOME/.config/dreambau-test-access/identities/"*oriso*.token; do
    [ -f "$f" ] || continue
    if [ -n "$identity" ]; then identity=""; break; fi
    identity="$(basename "$f" .token)"
  done
fi
if [ "$credential_provider" = "auto" ] && [ -z "$identity" ] && command -v security >/dev/null 2>&1; then
  any="$(security find-generic-password -s dreambau-test-access 2>/dev/null | sed -n 's/.*"acct"<blob>="\(.*\)"/\1/p' | head -1)"
  case "$any" in
    *-oriso) identity="$any" ;;
    ?*) candidate="${any%-*}-oriso"
        security find-generic-password -s dreambau-test-access -a "$candidate" >/dev/null 2>&1 && identity="$candidate" ;;
  esac
fi
if [ "$credential_provider" = "auto" ] && [ -z "$token" ] && [ -n "$identity" ] && command -v security >/dev/null 2>&1; then
  token="$(security find-generic-password -s dreambau-test-access -a "$identity" -w 2>/dev/null || true)"
fi
if [ -z "$token" ] && [ -n "$identity" ] && [ -f "$HOME/.config/dreambau-test-access/identities/$identity.token" ]; then
  if ! token="$(node - "$HOME" "$identity" <<'NODE_CREDENTIAL'
const { lstatSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const [home, identity] = process.argv.slice(2);
try {
  if (!/^[A-Za-z0-9._-]+$/.test(identity)) throw new Error("invalid machine identity");
  const file = join(home, ".config", "dreambau-test-access", "identities", identity + ".token");
  const metadata = lstatSync(file);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("credential must be a regular file");
  if (typeof process.getuid === "function" && metadata.uid !== process.getuid()) throw new Error("credential must belong to this user");
  if ((metadata.mode & 0o077) !== 0) throw new Error("credential must have private permissions");
  const token = readFileSync(file, "utf8").trim();
  if (!token) throw new Error("credential is empty");
  if (!/^[\x21-\x7e]+$/.test(token)) throw new Error("credential must be a single header-safe token");
  process.stdout.write(token);
} catch (error) {
  console.error("[test-access-install] failed — " + error.message);
  process.exitCode = 1;
}
NODE_CREDENTIAL
)"; then
    exit 1
  fi
fi
if [ -z "$token" ]; then
  echo "[test-access-install] failed — no Test-Access token found (ORISO_KIT_TOKEN, Keychain 'dreambau-test-access' or ~/.config/dreambau-test-access/identities/<identity>.token)"
  exit 1
fi
[ -n "$identity" ] && echo "[test-access-install] identity: $identity"

tmp="$(mktemp -d "${TMPDIR:-/tmp}/test-access-install.XXXXXX")" || exit 1
trap 'rm -rf "$tmp"' EXIT HUP INT TERM

local_version=""
[ -f "$data_dir/manifest.json" ] && local_version="$(node -p 'try{require(process.argv[1]).version||""}catch{""}' "$data_dir/manifest.json" 2>/dev/null)"
[ -f "$data_dir/test-access.mjs" ] || local_version=""

# --- manifest + bundle: fetched and verified by node ----------------------------
# The token travels in the environment, never in argv. Output: one status line
# ("update"/"current"/"error ...") and, on update, the verified files in $tmp.
decision="$(TEST_ACCESS_INSTALL_TOKEN="$token" node - "$base" "$tmp" "$local_version" "$MODE" <<'NODE'
const { createHash } = require("node:crypto");
const { writeFileSync } = require("node:fs");
const path = require("node:path");

const [base, tmp, localVersion, mode] = process.argv.slice(2);
const credential = (process.env.TEST_ACCESS_INSTALL_TOKEN ?? "").trim();
if (!/^[\x21-\x7e]+$/.test(credential)) {
  console.log("error machine credential must be a single header-safe token");
  process.exit(0);
}
const headers = { authorization: `Bearer ${credential}` };
const key = (value) => (value || "0").split(".").map((chunk) => parseInt(chunk.replace(/\D/g, ""), 10) || 0).concat([0, 0, 0, 0]).slice(0, 4);
const newer = (a, b) => { const x = key(a), y = key(b); for (let i = 0; i < 4; i += 1) if (x[i] !== y[i]) return x[i] > y[i]; return false; };

async function get(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try { return await fetch(url, { headers, signal: controller.signal, redirect: "manual" }); }
  finally { clearTimeout(timer); }
}

(async () => {
  let manifestResponse;
  try { manifestResponse = await get(`${base}/manifest`); }
  catch (error) { console.log(`error ${base} unreachable: ${error.cause?.message ?? error.message}`); return; }
  if (manifestResponse.status !== 200) {
    const why = { 401: "401 unauthorized (token invalid, expired or revoked)", 503: "503: the server has no built CLI bundle yet" }[manifestResponse.status]
      ?? `manifest request returned HTTP ${manifestResponse.status}`;
    console.log(`error ${why}`); return;
  }
  const manifestText = await manifestResponse.text();
  let manifest;
  try { manifest = JSON.parse(manifestText); } catch { console.log("error served manifest is not JSON"); return; }
  const file = (manifest.files ?? []).find((entry) => entry.path === "test-access.mjs");
  if (typeof manifest.version !== "string" || !manifest.version || !file?.sha256) { console.log("error served manifest is incomplete"); return; }
  const meta = `${manifest.version}\t${manifest.gitSha ?? ""}\t${manifest.playwrightVersion ?? ""}`;
  if (mode === "check") { console.log(`check\t${meta}`); return; }
  if (mode !== "force" && localVersion && !newer(manifest.version, localVersion)) { console.log(`current\t${meta}`); return; }

  let bundleResponse;
  try { bundleResponse = await get(`${base}/bundle`); }
  catch (error) { console.log(`error bundle download failed: ${error.cause?.message ?? error.message}`); return; }
  if (bundleResponse.status !== 200) { console.log(`error bundle request returned HTTP ${bundleResponse.status}`); return; }
  const bundle = Buffer.from(await bundleResponse.arrayBuffer());
  if (createHash("sha256").update(bundle).digest("hex") !== file.sha256) { console.log("error bundle sha256 does not match the manifest, nothing installed"); return; }
  writeFileSync(path.join(tmp, "test-access.mjs"), bundle, { mode: 0o600 });
  writeFileSync(path.join(tmp, "manifest.json"), manifestText);
  console.log(`update\t${meta}`);
})().catch((error) => console.log(`error ${error.message}`));
NODE
)"

status="${decision%%[[:space:]]*}"
rest="${decision#*[[:space:]]}"
IFS=$'\t' read -r remote_version remote_sha remote_playwright <<EOF
$rest
EOF

case "$status" in
  error)
    echo "[test-access-install] failed — $rest"
    exit 1 ;;
  check)
    echo "[test-access-install] installed: ${local_version:-none}, served: $remote_version ($remote_sha)"
    [ "$local_version" = "$remote_version" ] && exit 0 || exit 1 ;;
  current)
    echo "[test-access-install] current (version $local_version)" ;;
  update)
    install -d -m 0755 "$bin_dir"
    install -d -m 0700 "$data_dir"
    if [ -f "$data_dir/test-access.mjs" ]; then
      cp "$data_dir/test-access.mjs" "$data_dir/test-access.mjs.backup.${local_version:-unknown}"
    fi
    mv "$tmp/test-access.mjs" "$data_dir/test-access.mjs"
    cp "$tmp/manifest.json" "$data_dir/manifest.json"

    wrapper_tmp="$bin_dir/test-access.tmp.$$"
    printf '%s\n' \
      '#!/bin/sh' \
      'set -eu' \
      'PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"' \
      'export PATH' \
      'exec node "${XDG_DATA_HOME:-$HOME/.local/share}/dreambau-agent-tools/test-access/test-access.mjs" "$@"' \
      > "$wrapper_tmp"
    if [ -n "${DREAMBAU_CLI_PROFILE:-}" ]; then
      node - "$wrapper_tmp" "$DREAMBAU_CLI_PROFILE" <<'NODE_PROFILE'
const { readFileSync, writeFileSync } = require("node:fs");
const [wrapper, profile] = process.argv.slice(2);
const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
const script = readFileSync(wrapper, "utf8");
writeFileSync(wrapper, script.replace("exec node ", `. ${quote(profile)}\nexec node `));
NODE_PROFILE
    fi
    chmod 0755 "$wrapper_tmp"
    mv "$wrapper_tmp" "$bin_dir/test-access"
    echo "[test-access-install] installed ${local_version:-none} -> $remote_version ($remote_sha) in $data_dir" ;;
  *)
    echo "[test-access-install] failed — unexpected installer state: $decision"
    exit 1 ;;
esac

# --- Playwright runtime next to the bundle ---------------------------------------
if [ -n "${remote_playwright:-}" ]; then
  have="$(node -p 'try{require(process.argv[1]).version}catch{""}' "$data_dir/node_modules/playwright/package.json" 2>/dev/null || true)"
  if [ "$have" != "$remote_playwright" ]; then
    if command -v npm >/dev/null 2>&1; then
      echo "[test-access-install] installing playwright@$remote_playwright next to the CLI (was: ${have:-none})"
      if ! npm install --silent --no-audit --no-fund --no-save --prefix "$data_dir" "playwright@$remote_playwright" "@playwright/test@$remote_playwright" >/dev/null 2>"$tmp/npm.err"; then
        echo "[test-access-install] warning — Playwright install failed: $(tail -1 "$tmp/npm.err" 2>/dev/null). 'test-access playwright-login' needs it; other commands work."
      else
        echo "[test-access-install] browsers: run 'npx --prefix \"$data_dir\" playwright install chromium' once if Chromium is missing"
      fi
    else
      echo "[test-access-install] warning — npm not found; Playwright ${remote_playwright} could not be installed next to the CLI"
    fi
  fi
fi

"$bin_dir/test-access" --version 2>/dev/null || true
exit 0
