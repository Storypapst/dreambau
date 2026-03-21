#!/bin/bash

###############################################################################
# Email Proxy Deployment Script
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           Email Proxy Deployment                             ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}✗ This script must be run as root or with sudo${NC}"
   exit 1
fi

# Set KUBECONFIG
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo -e "${YELLOW}→ Deploying email proxy to Kubernetes...${NC}"
echo ""

echo "  1. Creating Secret..."
kubectl apply -f "$SCRIPT_DIR/email-proxy-secret.yaml"

echo "  2. Creating Deployment & Service..."
kubectl apply -f "$SCRIPT_DIR/email-proxy-deployment.yaml"

echo ""
echo -e "${GREEN}✓ All manifests applied${NC}"
echo ""

echo -e "${YELLOW}→ Waiting for email proxy to be ready...${NC}"
kubectl wait --for=condition=available --timeout=60s deployment/email-proxy -n wcr

echo ""
echo -e "${GREEN}✓ Email proxy is ready!${NC}"
echo ""

# Show deployment status
echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Deployment Status${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
echo ""

kubectl get pods -n wcr -l app=email-proxy
echo ""
kubectl get svc -n wcr -l app=email-proxy
echo ""

echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║       Email Proxy Deployment Complete!                       ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Service URL (internal):${NC}"
echo -e "  ${GREEN}http://email-proxy.wcr.svc.cluster.local${NC}"
echo ""
echo -e "${BLUE}Useful Commands:${NC}"
echo -e "  Check logs:  ${YELLOW}kubectl logs -f deployment/email-proxy -n wcr${NC}"
echo -e "  Check pods:  ${YELLOW}kubectl get pods -n wcr -l app=email-proxy${NC}"
echo -e "  Restart:     ${YELLOW}kubectl rollout restart deployment/email-proxy -n wcr${NC}"
echo ""

