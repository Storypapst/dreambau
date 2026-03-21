#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Dreambau Etherpad Deployment Script  ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check if running from correct directory
if [ ! -f "config/etherpad-deployment.yaml" ]; then
    echo -e "${RED}Error: Please run this script from the Dreambau-Etherpad directory${NC}"
    exit 1
fi

# Check if secret exists
if [ ! -f "config/etherpad-secret.yaml" ]; then
    echo -e "${YELLOW}Warning: etherpad-secret.yaml not found!${NC}"
    echo -e "${YELLOW}Please create it from etherpad-secret.yaml.example${NC}"
    echo ""
    echo "Steps:"
    echo "1. cp config/etherpad-secret.yaml.example config/etherpad-secret.yaml"
    echo "2. Edit config/etherpad-secret.yaml with your credentials"
    echo "3. Generate strong passwords:"
    echo "   - DB_PASS: openssl rand -base64 32"
    echo "   - ADMIN_PASSWORD: openssl rand -base64 24"
    echo "   - SESSION_KEY: openssl rand -hex 32"
    echo "   - API_KEY: openssl rand -hex 32"
    exit 1
fi

# Function to check if database exists
check_database() {
    echo -e "${YELLOW}Checking if Etherpad database exists...${NC}"
    
    DB_USER=$(grep "DB_USER:" config/etherpad-secret.yaml | awk '{print $2}' | tr -d '"')
    DB_PASS=$(grep "DB_PASS:" config/etherpad-secret.yaml | awk '{print $2}' | tr -d '"')
    DB_NAME=$(grep "DB_NAME:" config/etherpad-secret.yaml | awk '{print $2}' | tr -d '"')
    
    # Get PostgreSQL pod
    POSTGRES_POD=$(kubectl get pods -n wcr -l app=shared-postgres -o jsonpath='{.items[0].metadata.name}')
    
    if [ -z "$POSTGRES_POD" ]; then
        echo -e "${RED}Error: PostgreSQL pod not found!${NC}"
        echo "Please ensure shared-postgres is running in the wcr namespace"
        exit 1
    fi
    
    # Check if database exists
    DB_EXISTS=$(kubectl exec -n wcr $POSTGRES_POD -- psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" 2>/dev/null || echo "")
    
    if [ "$DB_EXISTS" != "1" ]; then
        echo -e "${YELLOW}Database '$DB_NAME' does not exist. Creating...${NC}"
        
        # Create user
        kubectl exec -n wcr $POSTGRES_POD -- psql -U postgres -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';" 2>/dev/null || echo "User may already exist"
        
        # Create database
        kubectl exec -n wcr $POSTGRES_POD -- psql -U postgres -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
        
        # Grant privileges
        kubectl exec -n wcr $POSTGRES_POD -- psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
        
        echo -e "${GREEN}✓ Database created successfully${NC}"
    else
        echo -e "${GREEN}✓ Database already exists${NC}"
    fi
}

# Create namespace if it doesn't exist
echo -e "${YELLOW}Creating namespace...${NC}"
kubectl create namespace wcr --dry-run=client -o yaml | kubectl apply -f -

# Check and create database
check_database

# Apply secret
echo -e "${YELLOW}Applying Etherpad secret...${NC}"
kubectl apply -f config/etherpad-secret.yaml

# Apply deployment
echo -e "${YELLOW}Deploying Etherpad...${NC}"
kubectl apply -f config/etherpad-deployment.yaml

# Wait for deployment
echo -e "${YELLOW}Waiting for Etherpad to be ready...${NC}"
kubectl wait --for=condition=available --timeout=300s deployment/etherpad -n wcr || {
    echo -e "${RED}Deployment failed or timed out${NC}"
    echo -e "${YELLOW}Checking pod status...${NC}"
    kubectl get pods -n wcr -l app=etherpad
    echo -e "${YELLOW}Recent logs:${NC}"
    kubectl logs -n wcr -l app=etherpad --tail=50
    exit 1
}

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Etherpad Deployed Successfully! 🎉   ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Access Etherpad at: https://etherpad.dreambau.com"
echo ""
echo "Admin credentials:"
echo "  Username: admin"
echo "  Password: (check your etherpad-secret.yaml)"
echo ""
echo "Useful commands:"
echo "  View logs:    kubectl logs -n wcr -l app=etherpad -f"
echo "  View pods:    kubectl get pods -n wcr -l app=etherpad"
echo "  Restart:      kubectl rollout restart deployment/etherpad -n wcr"
echo "  Shell access: kubectl exec -it -n wcr deployment/etherpad -- bash"
echo ""
echo -e "${YELLOW}Note: Make sure DNS record for etherpad.dreambau.com points to your server!${NC}"


