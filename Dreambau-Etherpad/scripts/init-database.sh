#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Etherpad Database Initialization     ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check if secret exists
if [ ! -f "../config/etherpad-secret.yaml" ]; then
    echo -e "${RED}Error: etherpad-secret.yaml not found!${NC}"
    exit 1
fi

# Extract credentials from secret
DB_USER=$(grep "DB_USER:" ../config/etherpad-secret.yaml | awk '{print $2}' | tr -d '"')
DB_PASS=$(grep "DB_PASS:" ../config/etherpad-secret.yaml | awk '{print $2}' | tr -d '"')
DB_NAME=$(grep "DB_NAME:" ../config/etherpad-secret.yaml | awk '{print $2}' | tr -d '"')

echo "Database: $DB_NAME"
echo "User: $DB_USER"
echo ""

# Get PostgreSQL pod
POSTGRES_POD=$(kubectl get pods -n wcr -l app=shared-postgres -o jsonpath='{.items[0].metadata.name}')

if [ -z "$POSTGRES_POD" ]; then
    echo -e "${RED}Error: PostgreSQL pod not found!${NC}"
    exit 1
fi

echo -e "${YELLOW}Creating database and user...${NC}"

# Create user
kubectl exec -n wcr $POSTGRES_POD -- psql -U postgres -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';" 2>/dev/null || echo "User may already exist"

# Create database
kubectl exec -n wcr $POSTGRES_POD -- psql -U postgres -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" 2>/dev/null || echo "Database may already exist"

# Grant privileges
kubectl exec -n wcr $POSTGRES_POD -- psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"

echo -e "${GREEN}✓ Database initialized successfully${NC}"


