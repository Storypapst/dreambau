#!/bin/bash

###############################################################################
# Reapply Traefik Middlewares and Ingresses
###############################################################################

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CONFIG_ROOT="$(dirname "$PROJECT_ROOT")"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║      Reapplying Traefik Middlewares & Ingresses              ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"

echo ""

echo -e "${YELLOW}→ Applying shared middleware manifest...${NC}"
kubectl apply -f "$PROJECT_ROOT/manifests/01-https-redirect-middleware.yaml"

echo ""

# Reapply application ingresses (which include middleware defs)
APPS=(
  "Dreambau-NocoDB/config/nocodb-ingress.yaml"
  "Dreambau-n8n/config/n8n-ingress.yaml"
  "Dreambau-Cap/config/cap-ingress.yaml"
  "Dreambau-Invoice/config/invoiceninja-ingress.yaml"
)

for APP_PATH in "${APPS[@]}"; do
  FULL_PATH="$CONFIG_ROOT/$APP_PATH"
  if [ -f "$FULL_PATH" ]; then
    echo -e "${YELLOW}→ Applying ${APP_PATH}...${NC}"
    kubectl apply -f "$FULL_PATH"
    echo ""
  else
    echo -e "${YELLOW}⚠ Skipping missing file: ${APP_PATH}${NC}"
  fi
  sleep 2
fi

# Display current middlewares
echo -e "${BLUE}Current middlewares in namespace wcr:${NC}"
kubectl get middleware.traefik.io -n wcr

echo ""

echo -e "${GREEN}✅ Middlewares and ingresses reapplied.${NC}"
