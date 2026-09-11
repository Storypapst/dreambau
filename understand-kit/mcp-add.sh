#!/usr/bin/env bash
# mcp-add.sh — register the two Storybook MCP servers with Claude Code
# (user scope — never project scope: that would write the secret into the repo's .mcp.json), the same two commands install.sh runs step 3 of.
#
# Requires ORISO_SB_MCP_AUTH in the environment (base64 of "user:password",
# given to you by Frank out-of-band). Never hardcode the value here.
#
# Usage:
#   export ORISO_SB_MCP_AUTH="<value from Frank>"
#   bash mcp-add.sh

set -euo pipefail

if ! command -v claude >/dev/null 2>&1; then
  echo "mcp-add.sh: 'claude' CLI not found on PATH — install Claude Code first" >&2
  exit 1
fi

# Secret source, in order: environment → Infisical (project "ORISO Test Access", env pre-dev) → ask Frank.
INFISICAL_PROJECT_ID="2808af88-2c60-4023-8754-98665192cfdf"
INFISICAL_ENV="pre-dev"
INFISICAL_DOMAIN="${INFISICAL_DOMAIN:-https://secrets.dreambau.com}"   # self-hosted; never the Infisical cloud
if [ -z "${ORISO_SB_MCP_AUTH:-}" ] && command -v infisical >/dev/null 2>&1; then
  ORISO_SB_MCP_AUTH="$(infisical secrets get ORISO_SB_MCP_AUTH --domain "$INFISICAL_DOMAIN" --projectId "$INFISICAL_PROJECT_ID" --env "$INFISICAL_ENV" --plain 2>/dev/null || true)"
  [ -n "$ORISO_SB_MCP_AUTH" ] && echo "mcp-add.sh: ORISO_SB_MCP_AUTH loaded from Infisical ($INFISICAL_ENV)."
fi
if [ -z "${ORISO_SB_MCP_AUTH:-}" ]; then
  echo "mcp-add.sh: ORISO_SB_MCP_AUTH is not set and could not be read from Infisical." >&2
  echo "  Either: infisical login --domain $INFISICAL_DOMAIN  (project 'ORISO Test Access', env $INFISICAL_ENV), then re-run" >&2
  echo "  or:     export ORISO_SB_MCP_AUTH='<base64 of user:password, from Frank>'" >&2
  exit 1
fi

claude mcp add --transport http storybook-frontend \
  https://predev.oriso.org/storybook-frontend-mcp/mcp \
  --header "Authorization: Basic $ORISO_SB_MCP_AUTH" \
  --scope user

claude mcp add --transport http storybook-admin \
  https://predev.oriso.org/storybook-admin-mcp/mcp \
  --header "Authorization: Basic $ORISO_SB_MCP_AUTH" \
  --scope user

echo "mcp-add.sh: registered storybook-frontend and storybook-admin (user scope — never project scope: that would write the secret into the repo's .mcp.json)."
echo "Tools (Storybook 10.6): docs-list, docs-show, docs-show-story, stories-preview, stories-find-by-component, stories-changed, test-run."
