#!/usr/bin/env bash
# oriso-sb — read the ORISO component contract from the central Dev Storybook.
#
# The Dev Storybooks (https://dev.oriso.org/storybook-frontend/ and
# /storybook-admin/) are public by design and are the one reference the team and
# every agent work against: no local Storybook, no npm ci, no secret. Storybook 11
# publishes a machine-readable manifest with each build; this script turns it into
# compact agent context.
#
# Usage:
#   oriso-sb <frontend|admin> list [filter]     one line per component: id — name
#   oriso-sb <frontend|admin> show <id>          import line, props (type, required, default,
#                                                description) and every story snippet
#   oriso-sb <frontend|admin> tokens             token sources on the dev branch: spacing and radii
#                                                as values; colours as --m3-* tokens that the
#                                                palette generator computes per tenant from seed
#                                                colours (use the token names, never raw hex)
#   oriso-sb <frontend|admin> story <story-id>   URL of the isolated story render
#   oriso-sb <frontend|admin> freshness          when the deployed build was generated (UTC)
#
# Override the host with ORISO_SB_BASE (default https://dev.oriso.org).
# A component you are changing in an unmerged branch is not on Dev yet — for that one
# use `npx storybook tools docs show --id <id>` in your checkout.

set -euo pipefail

usage() { sed -n '2,20p' "$0"; exit "${1:-0}"; }
[ $# -ge 2 ] || usage 2
case "$1" in frontend|admin) app="$1" ;; -h|--help) usage 0 ;; *) usage 2 ;; esac
cmd="$2"; shift 2
base="${ORISO_SB_BASE:-https://dev.oriso.org}/storybook-$app"

command -v curl >/dev/null 2>&1 || { echo "oriso-sb: curl is required" >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "oriso-sb: python3 is required" >&2; exit 1; }

tmp="$(mktemp -d "${TMPDIR:-/tmp}/oriso-sb.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT
# fetch <path> <file>: download one published file; Dev answers unknown paths with its
# HTML start page, so anything that is not JSON counts as "not found".
fetch() {
  curl -fsS --max-time 30 "$base/$1" -o "$2" || return 1
  python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$2" 2>/dev/null
}

case "$cmd" in
  list)
    fetch manifests/components.json "$tmp/m.json" || { echo "oriso-sb: no component manifest at $base" >&2; exit 1; }
    FILTER="${1:-}" python3 - "$tmp/m.json" <<'PY'
import json, os, signal, sys
signal.signal(signal.SIGPIPE, signal.SIG_DFL)
flt = os.environ["FILTER"].lower()
for cid, c in sorted(json.load(open(sys.argv[1]))["components"].items()):
    line = cid + " — " + c.get("name", "")
    if not flt or flt in line.lower():
        print(line)
PY
    ;;
  show)
    id="${1:?oriso-sb show needs a component id (see: oriso-sb $app list)}"
    fetch "services/core/docgen/$id.json" "$tmp/d.json" || { echo "oriso-sb: no component '$id' on $base (see: oriso-sb $app list)" >&2; exit 1; }
    incomplete=0
    fetch "services/core/story-docs/$id.json" "$tmp/s.json" || { echo '{}' > "$tmp/s.json"; incomplete=1; }
    CID="$id" python3 - "$tmp/d.json" "$tmp/s.json" <<'PY' || exit $?
import json, os, signal, sys
signal.signal(signal.SIGPIPE, signal.SIG_DFL)
cid = os.environ["CID"]
g = json.load(open(sys.argv[1]))["components"][cid]
if g.get("error"):
    err = g["error"]
    msg = (err.get("message") if isinstance(err, dict) else str(err)) or ""
    msg = msg.strip().splitlines()[0][:160] if msg.strip() else "unknown error"
    sys.stderr.write("oriso-sb: Storybook has no component contract for '%s' (%s). "
                     "If this is a docs or token page, use: oriso-sb <app> tokens\n" % (cid, msg))
    sys.exit(3)
meta = g.get("reactComponentMeta") or {}
s = (json.load(open(sys.argv[2])).get("components") or {}).get(cid, {})
print("# " + g.get("name", cid) + "  (" + cid + ")")
if s.get("import"):
    print("\n```ts\n" + s["import"] + "\n```")
if meta.get("description"):
    print("\n" + meta["description"])
props = meta.get("props") or {}
if props:
    print("\n| prop | type | required | default | description |\n|---|---|---|---|---|")
    for name, p in sorted(props.items()):
        t = p.get("type") or {}
        ty = (t.get("raw") or t.get("name") or "").replace("|", "\\|").replace("\n", " ")
        dv = p.get("defaultValue")
        dv = (dv.get("value") if isinstance(dv, dict) else dv) or ""
        desc = (p.get("description") or "").replace("\n", " ").replace("|", "\\|")
        print("| %s | `%s` | %s | %s | %s |" % (name, ty, "yes" if p.get("required") else "", dv, desc))
for sid, st in (s.get("stories") or {}).items():
    print("\n## " + st.get("name", sid) + "  (" + sid + ")\n```tsx\n" + st.get("snippet", "").strip() + "\n```")
PY
    if [ "$incomplete" -eq 1 ]; then
      echo "oriso-sb: INCOMPLETE — the story docs for '$id' could not be loaded (no import line, no snippets). Retry: oriso-sb $app show $id" >&2
      exit 4
    fi
    ;;
  tokens)
    # Token values live in code, not in a Storybook manifest: read them from the dev
    # branch, which is what the Dev Storybook is built from.
    raw="${ORISO_SB_RAW_BASE:-https://raw.githubusercontent.com/OpenResilienceInitiative}"
    if [ "$app" = frontend ]; then
      files="ORISO-Frontend/dev/src/resources/styles/settings.scss ORISO-Frontend/dev/src/resources/styles/mui-variables-mapping.scss ORISO-Frontend/dev/src/utils/theme/orisoScheme.ts"
    else
      files="ORISO-Admin/dev/src/styles/variables/_spacings.less ORISO-Admin/dev/src/styles/_muiSpacing.scss ORISO-Admin/dev/src/theme/antdM3Theme.ts ORISO-Admin/dev/src/utils/theme/orisoScheme.ts"
    fi
    echo "# Design tokens — $app (dev)"
    echo
    echo "Spacing and radii below are values. Colours are --m3-* tokens computed per tenant from"
    echo "seed colours by orisoScheme.ts: reference the token names (e.g. var(--m3-primary)), never"
    echo "hard-code a hex value. Fixed colour variables in the SCSS/LESS files are legacy fallbacks."
    echo
    for f in $files; do
      echo "## ${f#*/dev/}  (dev)"
      curl -fsS --max-time 30 "$raw/$f" -o "$tmp/t" || { echo "oriso-sb: could not load $raw/$f" >&2; exit 1; }
      echo '```'
      cat "$tmp/t"
      echo '```'
    done
    ;;
  story)
    echo "$base/iframe.html?id=${1:?oriso-sb story needs a story id}&viewMode=story"
    ;;
  freshness)
    fetch project.json "$tmp/p.json" || { echo "oriso-sb: no project.json at $base" >&2; exit 1; }
    python3 - "$tmp/p.json" <<'PY'
import json, sys, datetime
t = json.load(open(sys.argv[1])).get("generatedAt")
print(datetime.datetime.fromtimestamp(t / 1000, datetime.timezone.utc).isoformat() if t else "unknown")
PY
    ;;
  *) usage 2 ;;
esac
