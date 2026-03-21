#!/bin/bash

###############################################################################
# NocoDB Deployment Script for Kubernetes
# Deploys NocoDB application to the wcr namespace
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                NocoDB Deployment Script                      ║${NC}"
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

# Check if nocodb database exists in MySQL
echo -e "${YELLOW}→ Verifying NocoDB database exists...${NC}"
MYSQL_POD=$(kubectl get pod -n wcr -l app=mysql -o jsonpath='{.items[0].metadata.name}')
MYSQL_ROOT_PASSWORD=$(kubectl get secret mysql-secret -n wcr -o jsonpath='{.data.MYSQL_ROOT_PASSWORD}' | base64 -d)

if kubectl exec -n wcr ${MYSQL_POD} -- mysql -u root -p"${MYSQL_ROOT_PASSWORD}" -e "USE nocodb;" &> /dev/null; then
    echo -e "${GREEN}✓ NocoDB database exists${NC}"
else
    echo -e "${RED}✗ NocoDB database not found!${NC}"
    echo -e "${YELLOW}  Please run: ./Dreambau-NocoDB/scripts/init-database.sh${NC}"
    exit 1
fi
echo ""

echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Step 1: Applying Configuration${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"

# Apply NocoDB secret
echo -e "${YELLOW}→ Applying NocoDB secret...${NC}"
kubectl apply -f config/nocodb-secret.yaml
echo -e "${GREEN}✓ NocoDB secret applied${NC}"

# Apply PVC
echo -e "${YELLOW}→ Creating Persistent Volume Claim...${NC}"
kubectl apply -f config/nocodb-pvc.yaml
echo -e "${GREEN}✓ PVC created${NC}"
echo ""

echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Step 2: Deploying NocoDB Application${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"

# Deploy NocoDB
echo -e "${YELLOW}→ Deploying NocoDB...${NC}"
kubectl apply -f config/nocodb-deployment.yaml
echo -e "${GREEN}✓ NocoDB deployment created${NC}"

# Wait for NocoDB to be ready
echo -e "${YELLOW}→ Waiting for NocoDB to be ready (this may take 1-2 minutes)...${NC}"
kubectl wait --for=condition=ready pod -l app=nocodb -n wcr --timeout=180s || {
    echo -e "${RED}✗ NocoDB pod failed to become ready${NC}"
    echo -e "${YELLOW}Check status with: kubectl get pods -n wcr -l app=nocodb${NC}"
    echo -e "${YELLOW}Check logs with: kubectl logs -n wcr -l app=nocodb --tail=50${NC}"
    exit 1
}
echo -e "${GREEN}✓ NocoDB is ready${NC}"
echo ""

echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Step 3: Configuring Ingress (HTTPS)${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"

# Apply ingress
echo -e "${YELLOW}→ Creating ingress with HTTPS...${NC}"
kubectl apply -f config/nocodb-ingress.yaml
echo -e "${GREEN}✓ Ingress created${NC}"
echo ""

echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Step 4: Verifying Deployment${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"

echo ""
echo -e "${YELLOW}→ Current deployment status:${NC}"
echo ""
kubectl get pods -n wcr -l app=nocodb -o wide
echo ""

echo -e "${YELLOW}→ Services:${NC}"
kubectl get svc -n wcr | grep nocodb || true
echo ""

echo -e "${YELLOW}→ Ingress:${NC}"
kubectl get ingress -n wcr | grep nocodb || true
echo ""

echo -e "${YELLOW}→ SSL Certificate status (may take 2-5 minutes):${NC}"
kubectl get certificate -n wcr | grep nocodb || echo "Certificate being provisioned..."
echo ""

echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              NocoDB DEPLOYMENT COMPLETED!                    ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}📊 Access Information:${NC}"
echo -e "   URL: ${GREEN}https://nocodb.wcrbusiness.online${NC}"
echo ""
echo -e "   ${YELLOW}Default Admin Credentials:${NC}"
echo -e "   Email: ${GREEN}admin@wcrbusiness.online${NC}"
echo -e "   Password: ${GREEN}ChangeMe_SecurePassword_2024${NC}"
echo -e "   ${RED}⚠  CHANGE THESE IMMEDIATELY AFTER FIRST LOGIN!${NC}"
echo ""
echo -e "${YELLOW}⏳ Note: SSL certificate may take 2-5 minutes to provision.${NC}"
echo -e "   You can check certificate status with:"
echo -e "   ${BLUE}kubectl get certificate -n wcr${NC}"
echo ""
echo -e "${BLUE}🔍 Useful Commands:${NC}"
echo -e "   View NocoDB logs:       ${BLUE}kubectl logs -n wcr -l app=nocodb -f${NC}"
echo -e "   Check pod status:       ${BLUE}kubectl get pods -n wcr${NC}"
echo -e "   Restart NocoDB:         ${BLUE}kubectl rollout restart deployment/nocodb -n wcr${NC}"
echo -e "   Check database:         ${BLUE}kubectl exec -n wcr deployment/mysql -- mysql -u nocodb -p nocodb${NC}"
echo ""
echo -e "${GREEN}✓ Setup complete! Visit https://nocodb.wcrbusiness.online to get started.${NC}"
echo ""

