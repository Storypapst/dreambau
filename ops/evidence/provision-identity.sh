#!/usr/bin/env bash
# Creates the evidence machine identity secret. The Kubernetes Secret holds a
# SHA-256 hash only. The token value itself is written once to a 0600 file that
# the caller is expected to move into a Keychain and then delete.
set -euo pipefail

namespace="wcr"
identity="${1:?identity name required}"
projects="${2:-\"oriso\"}"
environments="${3:-\"local\",\"pre-dev\",\"dev\"}"
out="/root/.evidence-token-${identity}"

token=$(openssl rand -base64 48 | tr -d '\n/+=' | cut -c1-48)
hash=$(printf '%s' "$token" | openssl dgst -sha256 -r | cut -d' ' -f1)

umask 077
printf '%s' "$token" > "$out"
unset token

existing='[]'
if kubectl -n "$namespace" get secret evidence-identities >/dev/null 2>&1; then
  existing=$(kubectl -n "$namespace" get secret evidence-identities \
    -o jsonpath='{.data.machine-identities\.json}' | base64 -d)
fi

payload=$(mktemp)
trap 'rm -f "$payload"' EXIT
EXISTING="$existing" IDENTITY="$identity" HASH="$hash" \
PROJECTS="$projects" ENVIRONMENTS="$environments" \
python3 - > "$payload" <<'PY'
import json, os
existing = json.loads(os.environ["EXISTING"])
identity = os.environ["IDENTITY"]
entry = {
    "id": identity,
    "tokenHash": os.environ["HASH"],
    "projects": json.loads("[" + os.environ["PROJECTS"] + "]"),
    "environments": json.loads("[" + os.environ["ENVIRONMENTS"] + "]"),
    "actions": ["evidence:upload", "evidence:publish", "evidence:read", "evidence:archive"],
    "expiresAt": "2027-07-25T00:00:00.000Z",
    "revokedAt": None,
}
kept = [item for item in existing if item.get("id") != identity]
print(json.dumps(kept + [entry], indent=2))
PY

kubectl -n "$namespace" delete secret evidence-identities --ignore-not-found >/dev/null
kubectl -n "$namespace" create secret generic evidence-identities \
  --from-file=machine-identities.json="$payload" >/dev/null

echo "identity registered: $identity"
echo "identities in secret: $(python3 -c 'import json,sys; print(len(json.load(open(sys.argv[1]))))' "$payload")"
echo "token written to $out (mode 0600) — move it into a Keychain and delete the file"
