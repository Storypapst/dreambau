#!/usr/bin/env bash
set -euo pipefail

# The key is injected into the child process and streamed directly to Dreambau.
# Start with an authorized Infisical CLI session on the operator Mac.
infisical run --silent --domain https://secrets.dreambau.com \
  --projectId 3b15c82a-cfd4-49f6-a36c-6fe896b926e3 --env dev --path /oriso-ideas \
  --expand=false --include-imports=false -- bash -c '
    set -euo pipefail
    [[ ${OPENROUTER_API_KEY:-} =~ ^sk-or-v1-[[:alnum:]]+$ ]] || {
      printf "OPENROUTER_API_KEY is missing or invalid in Infisical.\n" >&2
      exit 1
    }
    printf "%s\n" "$OPENROUTER_API_KEY"
  ' | ssh -o BatchMode=yes m4dreambau 'bash -c '"'"'
    set -euo pipefail
    umask 077
    IFS= read -r key
    [[ $key =~ ^sk-or-v1-[[:alnum:]]+$ ]] || exit 1
    directory=/srv/dreambau/oriso-ideas/secrets
    temporary=$(mktemp "$directory/.openrouter.XXXXXX")
    trap "rm -f -- \"$temporary\"" EXIT
    printf "%s\n" "$key" > "$temporary"
    chown 1000:1000 "$temporary"
    mv -f "$temporary" "$directory/openrouter-key"
    printf "OpenRouter secret synchronized.\n"
  '"'"
