#!/bin/bash

# Shared PostgreSQL Deployment Script
# Deploys a shared PostgreSQL instance for multiple applications

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         Shared PostgreSQL Deployment for WCR                ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Set kubeconfig
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

# Check if namespace exists
if ! kubectl get namespace wcr &> /dev/null; then
    echo -e "${YELLOW}→ Creating namespace 'wcr'...${NC}"
    kubectl create namespace wcr
    echo -e "${GREEN}✓ Namespace created${NC}"
fi

echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Step 1: Deploying PostgreSQL Configuration${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"

# Apply PostgreSQL secret
echo -e "${YELLOW}→ Applying PostgreSQL secret...${NC}"
kubectl apply -f postgres-secret.yaml
echo -e "${GREEN}✓ PostgreSQL secret applied${NC}"

# Apply init script ConfigMap
echo -e "${YELLOW}→ Applying init script ConfigMap...${NC}"
kubectl apply -f postgres-init-configmap.yaml
echo -e "${GREEN}✓ Init script ConfigMap applied${NC}"

# Apply PVC
echo -e "${YELLOW}→ Creating Persistent Volume Claim (10Gi)...${NC}"
kubectl apply -f postgres-pvc.yaml
echo -e "${GREEN}✓ PVC created${NC}"
echo ""

echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Step 2: Deploying PostgreSQL Server${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"

# Deploy PostgreSQL
echo -e "${YELLOW}→ Deploying PostgreSQL...${NC}"
kubectl apply -f postgres-deployment.yaml
echo -e "${GREEN}✓ PostgreSQL deployment created${NC}"

# Wait for PostgreSQL to be ready
echo -e "${YELLOW}→ Waiting for PostgreSQL to be ready (this may take 1-2 minutes)...${NC}"
kubectl wait --for=condition=ready pod -l app=shared-postgres -n wcr --timeout=180s || {
    echo -e "${RED}✗ PostgreSQL pod failed to become ready${NC}"
    echo -e "${YELLOW}Check status with: kubectl get pods -n wcr -l app=shared-postgres${NC}"
    echo -e "${YELLOW}Check logs with: kubectl logs -n wcr -l app=shared-postgres${NC}"
    exit 1
}
echo -e "${GREEN}✓ PostgreSQL is ready${NC}"
echo ""

echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Step 3: Verifying Database Creation${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"

# Give init script time to complete
echo -e "${YELLOW}→ Waiting for database initialization (10 seconds)...${NC}"
sleep 10

# Check if NocoDB database was created
echo -e "${YELLOW}→ Verifying NocoDB database...${NC}"
if kubectl exec -n wcr deployment/shared-postgres -- psql -U postgres -lqt | cut -d \| -f 1 | grep -qw nocodb; then
    echo -e "${GREEN}✓ NocoDB database created successfully${NC}"
else
    echo -e "${RED}✗ NocoDB database not found${NC}"
    echo -e "${YELLOW}Check logs: kubectl logs -n wcr deployment/shared-postgres${NC}"
fi
echo ""

echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              PostgreSQL Deployment Complete!                 ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}📊 Deployment Summary:${NC}"
echo -e "  • PostgreSQL Version: ${GREEN}15-alpine${NC}"
echo -e "  • Storage: ${GREEN}10Gi${NC}"
echo -e "  • Service: ${GREEN}shared-postgres.wcr.svc.cluster.local:5432${NC}"
echo -e "  • Databases: ${GREEN}nocodb${NC}"
echo ""
echo -e "${YELLOW}🔧 Useful Commands:${NC}"
echo -e "  ${BLUE}# Check PostgreSQL status${NC}"
echo -e "  kubectl get pods -n wcr -l app=shared-postgres"
echo ""
echo -e "  ${BLUE}# View PostgreSQL logs${NC}"
echo -e "  kubectl logs -n wcr deployment/shared-postgres"
echo ""
echo -e "  ${BLUE}# Connect to PostgreSQL${NC}"
echo -e "  kubectl exec -it deployment/shared-postgres -n wcr -- psql -U postgres"
echo ""
echo -e "  ${BLUE}# List all databases${NC}"
echo -e "  kubectl exec -n wcr deployment/shared-postgres -- psql -U postgres -c '\\l'"
echo ""
echo -e "${GREEN}✅ Ready to migrate NocoDB to PostgreSQL!${NC}"
echo ""



