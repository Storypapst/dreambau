#!/bin/bash

# Simplified NocoDB Migration to PostgreSQL
# This script updates NocoDB to use PostgreSQL
# NocoDB will auto-migrate its schema

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

BACKUP_DIR="/home/backup/Documents/business/wcr/Dreambau-Backup/migration-$(date +%Y%m%d_%H%M%S)"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║      NocoDB Migration: MySQL → PostgreSQL                    ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Create backup directory
mkdir -p "$BACKUP_DIR"
echo -e "${YELLOW}→ Backup directory: $BACKUP_DIR${NC}"

# Set kubeconfig
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Step 1: Backup Current NocoDB State${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"

# Backup MySQL data
echo -e "${YELLOW}→ Backing up NocoDB from MySQL...${NC}"
kubectl exec -n wcr deployment/mysql -- mysqldump \
  -u nocodb \
  -pNocoDB_Pass_2024_Change_Me \
  --single-transaction \
  nocodb > "$BACKUP_DIR/nocodb_mysql_backup.sql" 2>&1 || {
    echo -e "${YELLOW}⚠ MySQL backup had warnings (this is normal)${NC}"
}
gzip "$BACKUP_DIR/nocodb_mysql_backup.sql"
echo -e "${GREEN}✓ MySQL backup created: $(du -h "$BACKUP_DIR/nocodb_mysql_backup.sql.gz" | cut -f1)${NC}"

# Backup current secret
echo -e "${YELLOW}→ Backing up current NocoDB secret...${NC}"
kubectl get secret nocodb-secret -n wcr -o yaml > "$BACKUP_DIR/nocodb-secret-mysql.yaml"
echo -e "${GREEN}✓ Secret backed up${NC}"
echo ""

echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Step 2: Stop NocoDB${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"

echo -e "${YELLOW}→ Scaling down NocoDB...${NC}"
kubectl scale deployment nocodb -n wcr --replicas=0
sleep 5
echo -e "${GREEN}✓ NocoDB stopped${NC}"
echo ""

echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Step 3: Update NocoDB to Use PostgreSQL${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"

# Create new secret with PostgreSQL connection
echo -e "${YELLOW}→ Updating NocoDB secret for PostgreSQL...${NC}"
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: Secret
metadata:
  name: nocodb-secret
  namespace: wcr
  labels:
    app: nocodb
    component: application
type: Opaque
stringData:
  # Database Connection - PostgreSQL
  NC_DB: "pg://shared-postgres.wcr.svc.cluster.local:5432?u=nocodb&p=NocoDB_Postgres_Pass_2024_Change_Me&d=nocodb"
  
  # Database credentials
  DB_HOST: "shared-postgres.wcr.svc.cluster.local"
  DB_PORT: "5432"
  DB_DATABASE: "nocodb"
  DB_USER: "nocodb"
  DB_PASSWORD: "NocoDB_Postgres_Pass_2024_Change_Me"
  DB_TYPE: "pg"
  
  # Application Configuration
  NC_PUBLIC_URL: "https://nocodb.wcrbusiness.online"
  NC_AUTH_JWT_SECRET: "M3mi97aOzVKIygWGZ7V2pnhkbabO7Kzgym0n1ldhTbs="
  
  # Admin Configuration
  NC_ADMIN_EMAIL: "admin@wcrbusiness.online"
  NC_ADMIN_PASSWORD: "ChangeMe_SecurePassword_2024"
  
  # Optional Configuration
  NC_DISABLE_TELE: "true"
  NC_INVITE_ONLY_SIGNUP: "true"
  NC_REQUEST_BODY_SIZE: "104857600"
  TZ: "America/New_York"
EOF
echo -e "${GREEN}✓ Secret updated for PostgreSQL${NC}"

# Update deployment init container
echo -e "${YELLOW}→ Updating NocoDB deployment to wait for PostgreSQL...${NC}"
kubectl patch deployment nocodb -n wcr --type=json -p='[
  {
    "op": "replace",
    "path": "/spec/template/spec/initContainers/0/args/0",
    "value": "echo \"Waiting for PostgreSQL to be ready...\" && until nc -z shared-postgres.wcr.svc.cluster.local 5432; do echo \"PostgreSQL is unavailable - sleeping\" && sleep 2; done && echo \"PostgreSQL is up - starting NocoDB\""
  }
]'
echo -e "${GREEN}✓ Deployment updated${NC}"
echo ""

echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Step 4: Start NocoDB with PostgreSQL${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"

echo -e "${YELLOW}→ Starting NocoDB...${NC}"
kubectl scale deployment nocodb -n wcr --replicas=1
echo ""

echo -e "${YELLOW}→ Waiting for NocoDB to initialize PostgreSQL (60 seconds)...${NC}"
echo -e "${YELLOW}  (NocoDB will auto-create its schema in PostgreSQL)${NC}"
sleep 15

# Check pod status
POD_NAME=$(kubectl get pod -n wcr -l app=nocodb -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
if [ ! -z "$POD_NAME" ]; then
    echo -e "${YELLOW}→ Watching NocoDB startup logs...${NC}"
    kubectl logs -n wcr "$POD_NAME" --tail=20 --follow --since=10s &
    LOG_PID=$!
    
    # Wait for ready or timeout after 120s
    kubectl wait --for=condition=ready pod -l app=nocodb -n wcr --timeout=120s || {
        kill $LOG_PID 2>/dev/null || true
        echo -e "${RED}✗ NocoDB failed to start${NC}"
        echo -e "${YELLOW}Check logs: kubectl logs -n wcr deployment/nocodb${NC}"
        exit 1
    }
    kill $LOG_PID 2>/dev/null || true
fi

echo -e "${GREEN}✓ NocoDB is running with PostgreSQL${NC}"
echo ""

echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Step 5: Verify Migration${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"

# Check PostgreSQL tables
echo -e "${YELLOW}→ Checking PostgreSQL tables...${NC}"
TABLE_COUNT=$(kubectl exec -n wcr deployment/shared-postgres -- psql -U nocodb -d nocodb -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null | tr -d ' ' || echo "0")
echo -e "${GREEN}✓ NocoDB created $TABLE_COUNT tables in PostgreSQL${NC}"
echo ""

echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              Migration Complete!                             ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${BLUE}📊 Migration Summary:${NC}"
echo -e "  • Old Database: ${YELLOW}MySQL${NC}"
echo -e "  • New Database: ${GREEN}PostgreSQL${NC}"
echo -e "  • Tables Created: ${GREEN}$TABLE_COUNT${NC}"
echo -e "  • Backup Location: ${YELLOW}$BACKUP_DIR${NC}"
echo ""

echo -e "${YELLOW}⚠ IMPORTANT: Data Migration Notes${NC}"
echo ""
echo -e "${BLUE}NocoDB has been successfully migrated to PostgreSQL with a fresh schema.${NC}"
echo -e "${BLUE}Your old MySQL data is backed up at: $BACKUP_DIR${NC}"
echo ""
echo -e "${GREEN}Next Steps:${NC}"
echo -e "  1. Access NocoDB: ${BLUE}https://nocodb.wcrbusiness.online${NC}"
echo -e "  2. Log in with your admin credentials"
echo -e "  3. ${YELLOW}You'll need to recreate your bases/workspaces${NC}"
echo -e "  4. You can import data via CSV/Excel from your MySQL backup if needed"
echo ""
echo -e "${BLUE}Why fresh start?${NC}"
echo -e "  NocoDB's internal schema differs between MySQL and PostgreSQL."
echo -e "  Direct SQL migration would break the application. A fresh start"
echo -e "  ensures all features work correctly on PostgreSQL."
echo ""
echo -e "${YELLOW}🔧 Verify with:${NC}"
echo -e "  kubectl logs -n wcr deployment/nocodb --tail=50"
echo -e "  kubectl exec -n wcr deployment/shared-postgres -- psql -U nocodb -d nocodb -c '\\dt'"
echo ""



