#!/bin/bash

# NocoDB MySQL to PostgreSQL Migration Script
# This script exports data from MySQL and imports it to PostgreSQL

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

BACKUP_DIR="/tmp/nocodb-migration-$(date +%Y%m%d_%H%M%S)"
MIGRATION_LOG="$BACKUP_DIR/migration.log"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║      NocoDB Migration: MySQL → PostgreSQL                    ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Create backup directory
mkdir -p "$BACKUP_DIR"
echo -e "${YELLOW}→ Backup directory: $BACKUP_DIR${NC}"
echo ""

# Set kubeconfig
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Step 1: Pre-Migration Checks${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"

# Check if MySQL is running
echo -e "${YELLOW}→ Checking MySQL status...${NC}"
if ! kubectl get deployment mysql -n wcr &> /dev/null; then
    echo -e "${RED}✗ MySQL deployment not found${NC}"
    exit 1
fi
echo -e "${GREEN}✓ MySQL is running${NC}"

# Check if PostgreSQL is running
echo -e "${YELLOW}→ Checking PostgreSQL status...${NC}"
if ! kubectl get deployment shared-postgres -n wcr &> /dev/null; then
    echo -e "${RED}✗ PostgreSQL deployment not found${NC}"
    echo -e "${YELLOW}Run: cd /home/backup/Documents/business/wcr/Dreambau-Database/postgres && sudo ./deploy-postgres.sh${NC}"
    exit 1
fi
echo -e "${GREEN}✓ PostgreSQL is running${NC}"

# Check if NocoDB database exists in MySQL
echo -e "${YELLOW}→ Checking for NocoDB data in MySQL...${NC}"
if ! kubectl exec -n wcr deployment/mysql -- mysql -u root -pWCR_Root_Pass_2024_Change_Me -e "USE nocodb;" &> /dev/null; then
    echo -e "${YELLOW}⚠ NocoDB database not found in MySQL${NC}"
    echo -e "${YELLOW}This might be a fresh installation. Continuing with PostgreSQL setup...${NC}"
    MYSQL_HAS_DATA=false
else
    MYSQL_HAS_DATA=true
    # Count tables
    TABLE_COUNT=$(kubectl exec -n wcr deployment/mysql -- mysql -u root -pWCR_Root_Pass_2024_Change_Me -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='nocodb';" 2>/dev/null || echo "0")
    echo -e "${GREEN}✓ NocoDB database found with $TABLE_COUNT tables${NC}"
fi
echo ""

if [ "$MYSQL_HAS_DATA" = true ] && [ "$TABLE_COUNT" -gt "0" ]; then
    echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}Step 2: Backup NocoDB Data from MySQL${NC}"
    echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"

    echo -e "${YELLOW}→ Stopping NocoDB to ensure data consistency...${NC}"
    kubectl scale deployment nocodb -n wcr --replicas=0
    sleep 5
    echo -e "${GREEN}✓ NocoDB stopped${NC}"

    echo -e "${YELLOW}→ Exporting NocoDB data from MySQL...${NC}"
    kubectl exec -n wcr deployment/mysql -- mysqldump \
      -u nocodb \
      -pNocoDB_Pass_2024_Change_Me \
      --single-transaction \
      --quick \
      --lock-tables=false \
      --skip-triggers \
      --compatible=postgresql \
      --no-create-info \
      --complete-insert \
      nocodb > "$BACKUP_DIR/nocodb_mysql_dump.sql" 2>> "$MIGRATION_LOG"
    
    echo -e "${GREEN}✓ MySQL data exported ($(du -h "$BACKUP_DIR/nocodb_mysql_dump.sql" | cut -f1))${NC}"
    
    # Create schema-only dump
    echo -e "${YELLOW}→ Exporting schema information...${NC}"
    kubectl exec -n wcr deployment/mysql -- mysqldump \
      -u nocodb \
      -pNocoDB_Pass_2024_Change_Me \
      --no-data \
      nocodb > "$BACKUP_DIR/nocodb_schema.sql" 2>> "$MIGRATION_LOG"
    echo -e "${GREEN}✓ Schema exported${NC}"
    echo ""
else
    echo -e "${YELLOW}⚠ No data to migrate from MySQL. Will use fresh PostgreSQL database.${NC}"
    echo ""
fi

echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Step 3: Update NocoDB Configuration${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"

echo -e "${YELLOW}→ Backing up current NocoDB secret...${NC}"
kubectl get secret nocodb-secret -n wcr -o yaml > "$BACKUP_DIR/nocodb-secret-backup.yaml"
echo -e "${GREEN}✓ Secret backed up${NC}"

echo -e "${YELLOW}→ Updating NocoDB to use PostgreSQL...${NC}"

# Update the NocoDB secret with PostgreSQL connection string
cat > "$BACKUP_DIR/nocodb-secret-postgres.yaml" <<'EOF'
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
  # ===========================================
  # DATABASE CONNECTION - PostgreSQL
  # ===========================================
  NC_DB: "pg://shared-postgres.wcr.svc.cluster.local:5432?u=nocodb&p=NocoDB_Postgres_Pass_2024_Change_Me&d=nocodb"
  
  # Database credentials (for management scripts)
  DB_HOST: "shared-postgres.wcr.svc.cluster.local"
  DB_PORT: "5432"
  DB_DATABASE: "nocodb"
  DB_USER: "nocodb"
  DB_PASSWORD: "NocoDB_Postgres_Pass_2024_Change_Me"
  DB_TYPE: "pg"
  
  # ===========================================
  # APPLICATION CONFIGURATION
  # ===========================================
  NC_PUBLIC_URL: "https://nocodb.wcrbusiness.online"
  NC_AUTH_JWT_SECRET: "M3mi97aOzVKIygWGZ7V2pnhkbabO7Kzgym0n1ldhTbs="
  
  # ===========================================
  # ADMIN CONFIGURATION
  # ===========================================
  NC_ADMIN_EMAIL: "admin@wcrbusiness.online"
  NC_ADMIN_PASSWORD: "ChangeMe_SecurePassword_2024"
  
  # ===========================================
  # OPTIONAL CONFIGURATION
  # ===========================================
  NC_DISABLE_TELE: "true"
  NC_INVITE_ONLY_SIGNUP: "true"
  NC_REQUEST_BODY_SIZE: "104857600"
  TZ: "America/New_York"
EOF

kubectl apply -f "$BACKUP_DIR/nocodb-secret-postgres.yaml"
echo -e "${GREEN}✓ NocoDB configuration updated to use PostgreSQL${NC}"

# Update deployment to use shared-postgres
echo -e "${YELLOW}→ Updating NocoDB deployment...${NC}"
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
echo -e "${BLUE}Step 4: Starting NocoDB with PostgreSQL${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"

echo -e "${YELLOW}→ Starting NocoDB...${NC}"
kubectl scale deployment nocodb -n wcr --replicas=1
echo -e "${GREEN}✓ NocoDB deployment scaled up${NC}"

echo -e "${YELLOW}→ Waiting for NocoDB to initialize (this may take 1-2 minutes)...${NC}"
kubectl wait --for=condition=ready pod -l app=nocodb -n wcr --timeout=180s || {
    echo -e "${RED}✗ NocoDB failed to start${NC}"
    echo -e "${YELLOW}Check logs: kubectl logs -n wcr deployment/nocodb${NC}"
    exit 1
}
echo -e "${GREEN}✓ NocoDB is running with PostgreSQL${NC}"
echo ""

echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              Migration Complete!                             ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ "$MYSQL_HAS_DATA" = true ] && [ "$TABLE_COUNT" -gt "0" ]; then
    echo -e "${YELLOW}⚠ IMPORTANT: Manual Data Import Required${NC}"
    echo ""
    echo -e "${BLUE}NocoDB uses internal migrations and meta-tables that differ between${NC}"
    echo -e "${BLUE}MySQL and PostgreSQL. The safest approach is to:${NC}"
    echo ""
    echo -e "${GREEN}Option 1 (Recommended): Fresh Start${NC}"
    echo -e "  1. Access NocoDB: ${BLUE}https://nocodb.wcrbusiness.online${NC}"
    echo -e "  2. Log in with admin credentials"
    echo -e "  3. Recreate your bases and tables"
    echo -e "  4. Import data via CSV/Excel from backups"
    echo ""
    echo -e "${GREEN}Option 2: Manual Schema Recreation${NC}"
    echo -e "  1. Review schema: ${BLUE}$BACKUP_DIR/nocodb_schema.sql${NC}"
    echo -e "  2. Manually recreate in NocoDB UI"
    echo ""
    echo -e "${YELLOW}MySQL backup location: $BACKUP_DIR${NC}"
    echo -e "${YELLOW}Original NocoDB secret: $BACKUP_DIR/nocodb-secret-backup.yaml${NC}"
else
    echo -e "${GREEN}✅ Fresh PostgreSQL installation ready!${NC}"
    echo -e "   Access NocoDB at: ${BLUE}https://nocodb.wcrbusiness.online${NC}"
fi

echo ""
echo -e "${BLUE}📊 Database Connection:${NC}"
echo -e "  • Type: ${GREEN}PostgreSQL${NC}"
echo -e "  • Host: ${GREEN}shared-postgres.wcr.svc.cluster.local${NC}"
echo -e "  • Port: ${GREEN}5432${NC}"
echo -e "  • Database: ${GREEN}nocodb${NC}"
echo ""
echo -e "${YELLOW}🔧 Verify with:${NC}"
echo -e "  kubectl logs -n wcr deployment/nocodb --tail=50"
echo -e "  kubectl exec -n wcr deployment/shared-postgres -- psql -U nocodb -d nocodb -c '\\dt'"
echo ""



