#!/bin/bash

###############################################################################
# N8N Deployment Script for Kubernetes
# This script deploys n8n workflow automation to the wcr namespace
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                  N8N Deployment Script                       ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if running as root or with sudo
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}✗ This script must be run as root or with sudo${NC}"
   exit 1
fi

# Set KUBECONFIG
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}✗ kubectl not found. Please install k3s first.${NC}"
    exit 1
fi

# Check if namespace exists
if ! kubectl get namespace wcr &> /dev/null; then
    echo -e "${YELLOW}⚠ Namespace 'wcr' not found. Creating...${NC}"
    kubectl create namespace wcr
    echo -e "${GREEN}✓ Namespace 'wcr' created${NC}"
fi

echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Step 1: Deploying PostgreSQL Database${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"

# Apply PostgreSQL secret
echo -e "${YELLOW}→ Applying PostgreSQL secret...${NC}"
kubectl apply -f config/postgres-secret.yaml
echo -e "${GREEN}✓ PostgreSQL secret applied${NC}"

# Apply PVCs
echo -e "${YELLOW}→ Creating Persistent Volume Claims...${NC}"
kubectl apply -f config/n8n-pvc.yaml
echo -e "${GREEN}✓ PVCs created${NC}"

# Deploy PostgreSQL
echo -e "${YELLOW}→ Deploying PostgreSQL...${NC}"
kubectl apply -f config/postgres-deployment.yaml
echo -e "${GREEN}✓ PostgreSQL deployment created${NC}"

# Wait for PostgreSQL to be ready
echo -e "${YELLOW}→ Waiting for PostgreSQL to be ready...${NC}"
kubectl wait --for=condition=ready pod -l app=n8n-postgres -n wcr --timeout=120s || {
    echo -e "${RED}✗ PostgreSQL pod failed to become ready${NC}"
    echo -e "${YELLOW}Check status with: kubectl get pods -n wcr -l app=n8n-postgres${NC}"
    exit 1
}
echo -e "${GREEN}✓ PostgreSQL is ready${NC}"
echo ""

echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Step 2: Deploying n8n Application${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"

# Apply n8n secret
echo -e "${YELLOW}→ Applying n8n secret...${NC}"
kubectl apply -f config/n8n-secret.yaml
echo -e "${GREEN}✓ n8n secret applied${NC}"

# Deploy n8n
echo -e "${YELLOW}→ Deploying n8n...${NC}"
kubectl apply -f config/n8n-deployment.yaml
echo -e "${GREEN}✓ n8n deployment created${NC}"

# Wait for n8n to be ready
echo -e "${YELLOW}→ Waiting for n8n to be ready (this may take 1-2 minutes)...${NC}"
kubectl wait --for=condition=ready pod -l app=n8n -n wcr --timeout=180s || {
    echo -e "${RED}✗ n8n pod failed to become ready${NC}"
    echo -e "${YELLOW}Check status with: kubectl get pods -n wcr -l app=n8n${NC}"
    echo -e "${YELLOW}Check logs with: kubectl logs -n wcr -l app=n8n --tail=50${NC}"
    exit 1
}
echo -e "${GREEN}✓ n8n is ready${NC}"
echo ""

echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Step 3: Configuring Ingress (HTTPS)${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"

# Apply ingress
echo -e "${YELLOW}→ Creating ingress with HTTPS...${NC}"
kubectl apply -f config/n8n-ingress.yaml
echo -e "${GREEN}✓ Ingress created${NC}"
echo ""

echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Step 4: Verifying Deployment${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"

echo ""
echo -e "${YELLOW}→ Current deployment status:${NC}"
echo ""
kubectl get pods -n wcr -l app=n8n -o wide
echo ""
kubectl get pods -n wcr -l app=n8n-postgres -o wide
echo ""

echo -e "${YELLOW}→ Services:${NC}"
kubectl get svc -n wcr | grep n8n
echo ""

echo -e "${YELLOW}→ Ingress:${NC}"
kubectl get ingress -n wcr | grep n8n
echo ""

echo -e "${YELLOW}→ SSL Certificate status (may take 2-5 minutes):${NC}"
kubectl get certificate -n wcr | grep n8n || echo "Certificate being provisioned..."
echo ""

echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              N8N DEPLOYMENT COMPLETED!                       ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}📊 Access Information:${NC}"
echo -e "   URL: ${GREEN}https://n8n.wcrbusiness.online${NC}"
echo ""
echo -e "${YELLOW}⏳ Note: SSL certificate may take 2-5 minutes to provision.${NC}"
echo -e "   You can check certificate status with:"
echo -e "   ${BLUE}kubectl get certificate -n wcr${NC}"
echo ""
echo -e "${BLUE}🔍 Useful Commands:${NC}"
echo -e "   View n8n logs:       ${BLUE}kubectl logs -n wcr -l app=n8n -f${NC}"
echo -e "   View PostgreSQL logs: ${BLUE}kubectl logs -n wcr -l app=n8n-postgres${NC}"
echo -e "   Check pod status:    ${BLUE}kubectl get pods -n wcr${NC}"
echo -e "   Restart n8n:         ${BLUE}kubectl rollout restart deployment/n8n -n wcr${NC}"
echo ""
echo -e "${GREEN}✓ Setup complete! Visit https://n8n.wcrbusiness.online to get started.${NC}"
echo ""

