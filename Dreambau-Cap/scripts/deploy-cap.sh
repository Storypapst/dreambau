#!/bin/bash

###############################################################################
# Cap Deployment Script
# Deploys Cap to Kubernetes cluster
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                 Cap Deployment                               ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if running as root or with sudo
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}✗ This script must be run as root or with sudo${NC}"
   exit 1
fi

# Set KUBECONFIG
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CONFIG_DIR="$PROJECT_ROOT/config"

echo -e "${BLUE}Configuration Directory: ${YELLOW}${CONFIG_DIR}${NC}"
echo ""

# Check if secret needs to be updated
if grep -q "REPLACE_WITH_GENERATED_SECRET" "$CONFIG_DIR/cap-secret.yaml"; then
    echo -e "${YELLOW}→ Generating NEXTAUTH_SECRET...${NC}"
    NEXTAUTH_SECRET=$(openssl rand -base64 32)
    
    # Update the secret file
    sed -i "s|NEXTAUTH_SECRET: \"REPLACE_WITH_GENERATED_SECRET\"|NEXTAUTH_SECRET: \"${NEXTAUTH_SECRET}\"|g" "$CONFIG_DIR/cap-secret.yaml"
    
    echo -e "${GREEN}✓ NEXTAUTH_SECRET generated and updated${NC}"
    echo ""
fi

# Deploy Cap
echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Deploying Cap to Kubernetes${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${YELLOW}→ Applying Kubernetes manifests...${NC}"
echo ""

echo "  1. Creating Secret..."
kubectl apply -f "$CONFIG_DIR/cap-secret.yaml"

echo "  2. Creating PVC..."
kubectl apply -f "$CONFIG_DIR/cap-pvc.yaml"

echo "  3. Creating Deployment & Service..."
kubectl apply -f "$CONFIG_DIR/cap-deployment.yaml"

echo "  4. Creating Ingress..."
kubectl apply -f "$CONFIG_DIR/cap-ingress.yaml"

echo ""
echo -e "${GREEN}✓ All manifests applied${NC}"
echo ""

# Wait for deployment
echo -e "${YELLOW}→ Waiting for Cap deployment to be ready...${NC}"
echo -e "${BLUE}   (This may take 2-3 minutes)${NC}"
echo ""

kubectl wait --for=condition=available --timeout=300s deployment/cap -n wcr

echo ""
echo -e "${GREEN}✓ Cap is ready!${NC}"
echo ""

# Show deployment status
echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Deployment Status${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
echo ""

kubectl get pods -n wcr -l app=cap
echo ""
kubectl get svc -n wcr -l app=cap
echo ""
kubectl get ingress -n wcr cap-ingress
echo ""

# Get certificate status
echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}SSL Certificate Status${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
echo ""

if kubectl get certificate cap-wcrbusiness-online-tls -n wcr &> /dev/null; then
    kubectl get certificate cap-wcrbusiness-online-tls -n wcr
    echo ""
    echo -e "${YELLOW}Note: Certificate provisioning may take 2-5 minutes${NC}"
else
    echo -e "${YELLOW}Certificate not yet created. It will be provisioned automatically.${NC}"
fi

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         Cap Deployment Complete!                             ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Access Cap at:${NC}"
echo -e "  🌐 ${GREEN}https://cap.wcrbusiness.online${NC}"
echo ""
echo -e "${BLUE}Useful Commands:${NC}"
echo -e "  Check logs:    ${YELLOW}kubectl logs -f deployment/cap -n wcr${NC}"
echo -e "  Check pods:    ${YELLOW}kubectl get pods -n wcr -l app=cap${NC}"
echo -e "  Restart:       ${YELLOW}kubectl rollout restart deployment/cap -n wcr${NC}"
echo -e "  Shell access:  ${YELLOW}kubectl exec -it deployment/cap -n wcr -- sh${NC}"
echo ""

