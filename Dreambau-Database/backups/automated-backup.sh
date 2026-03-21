#!/bin/bash

# InvoiceNinja Automated Backup Script
# Backs up MySQL database and uploaded files

set -e

BACKUP_DIR="/home/backup/Documents/business/wcr/Dreambau-Backup"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

# Create backup directories
mkdir -p "$BACKUP_DIR/database"
mkdir -p "$BACKUP_DIR/files"
mkdir -p "$BACKUP_DIR/config"

echo "=================================================="
echo "Starting Backup - $(date)"
echo "=================================================="

# 1. Backup MySQL Databases
echo "📦 Backing up MySQL databases..."

# Backup InvoiceNinja database
echo "  → Backing up InvoiceNinja database..."
kubectl exec -n wcr deployment/mysql -- mysqldump \
  -u ninja \
  -pWCR_Ninja_Pass_2024_Change_Me \
  --single-transaction \
  --quick \
  --lock-tables=false \
  ninja > "$BACKUP_DIR/database/invoiceninja_${DATE}.sql"
gzip "$BACKUP_DIR/database/invoiceninja_${DATE}.sql"
echo "  ✅ InvoiceNinja database backed up"

# Backup NocoDB database from PostgreSQL (if exists)
if kubectl exec -n wcr deployment/shared-postgres -- psql -U postgres -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw nocodb; then
  echo "  → Backing up NocoDB PostgreSQL database..."
  kubectl exec -n wcr deployment/shared-postgres -- pg_dump -U nocodb nocodb --no-owner --no-acl \
    > "$BACKUP_DIR/database/nocodb_postgres_${DATE}.sql"
  gzip "$BACKUP_DIR/database/nocodb_postgres_${DATE}.sql"
  echo "  ✅ NocoDB database backed up"
fi

# Backup NocoDB from MySQL (legacy - if still exists)
if kubectl exec -n wcr deployment/mysql -- mysql -u root -pWCR_Root_Pass_2024_Change_Me -e "USE nocodb;" &> /dev/null 2>&1; then
  echo "  → Backing up NocoDB MySQL database (legacy)..."
  kubectl exec -n wcr deployment/mysql -- mysqldump \
    -u nocodb \
    -pNocoDB_Pass_2024_Change_Me \
    --single-transaction \
    --quick \
    --lock-tables=false \
    nocodb > "$BACKUP_DIR/database/nocodb_mysql_${DATE}.sql"
  gzip "$BACKUP_DIR/database/nocodb_mysql_${DATE}.sql"
  echo "  ✅ NocoDB MySQL database backed up"
fi

# Backup n8n database (if exists)
if kubectl exec -n wcr deployment/n8n-postgres -- psql -U n8n -d n8n -c '\q' &> /dev/null; then
  echo "  → Backing up n8n PostgreSQL database..."
  kubectl exec -n wcr deployment/n8n-postgres -- pg_dump -U n8n n8n \
    > "$BACKUP_DIR/database/n8n_${DATE}.sql"
  gzip "$BACKUP_DIR/database/n8n_${DATE}.sql"
  echo "  ✅ n8n database backed up"
fi

# Backup Cap database (if exists)
if kubectl exec -n wcr deployment/mysql -- mysql -u root -pWCR_Root_Pass_2024_Change_Me -e "USE cap;" &> /dev/null; then
  echo "  → Backing up Cap database..."
  kubectl exec -n wcr deployment/mysql -- mysqldump \
    -u cap \
    -pCap_Pass_2024_Change_Me \
    --single-transaction \
    --quick \
    --lock-tables=false \
    cap > "$BACKUP_DIR/database/cap_${DATE}.sql"
  gzip "$BACKUP_DIR/database/cap_${DATE}.sql"
  echo "  ✅ Cap database backed up"
fi

# Backup Novu MongoDB database (if exists)
if kubectl get deployment mongodb -n wcr &> /dev/null; then
  echo "  → Backing up Novu MongoDB database..."
  kubectl exec -n wcr deployment/mongodb -- mongodump \
    --uri="mongodb://novu:Novu_Mongo_Pass_2024_Change_Me@localhost:27017/novu-db?authSource=admin" \
    --archive > "$BACKUP_DIR/database/novu_mongodb_${DATE}.archive"
  gzip "$BACKUP_DIR/database/novu_mongodb_${DATE}.archive"
  echo "  ✅ Novu MongoDB database backed up"
fi

echo "✅ All databases backed up successfully"

# 2. Backup Application Files
echo "📂 Backing up application files..."

# InvoiceNinja files
echo "  → Backing up InvoiceNinja files..."
kubectl exec -n wcr deployment/invoiceninja -c invoiceninja -- \
  tar czf - /var/www/app/storage /var/www/app/public/storage \
  > "$BACKUP_DIR/files/invoiceninja_files_${DATE}.tar.gz"
echo "  ✅ InvoiceNinja files backed up"

# Cap files (if exists)
if kubectl get deployment cap -n wcr &> /dev/null; then
  echo "  → Backing up Cap files..."
  kubectl exec -n wcr deployment/cap -- \
    tar czf - /app/storage \
    > "$BACKUP_DIR/files/cap_files_${DATE}.tar.gz"
  echo "  ✅ Cap files backed up"
fi

echo "✅ All files backed up successfully"

# 3. Backup Application Configurations
echo "⚙️  Backing up configurations..."
kubectl get secret invoiceninja-secret -n wcr -o yaml > "$BACKUP_DIR/config/invoiceninja-secret_${DATE}.yaml"
kubectl get secret mysql-secret -n wcr -o yaml > "$BACKUP_DIR/config/mysql-secret_${DATE}.yaml"

# Backup NocoDB config (if exists)
if kubectl get secret nocodb-secret -n wcr &> /dev/null; then
  kubectl get secret nocodb-secret -n wcr -o yaml > "$BACKUP_DIR/config/nocodb-secret_${DATE}.yaml"
fi

# Backup n8n config (if exists)
if kubectl get secret n8n-secret -n wcr &> /dev/null; then
  kubectl get secret n8n-secret -n wcr -o yaml > "$BACKUP_DIR/config/n8n-secret_${DATE}.yaml"
  kubectl get secret n8n-postgres-secret -n wcr -o yaml > "$BACKUP_DIR/config/n8n-postgres-secret_${DATE}.yaml"
fi

# Backup Cap config (if exists)
if kubectl get secret cap-secret -n wcr &> /dev/null; then
  kubectl get secret cap-secret -n wcr -o yaml > "$BACKUP_DIR/config/cap-secret_${DATE}.yaml"
fi

echo "✅ Configuration backups completed"

# 4. Calculate sizes
DB_SIZE=$(du -h "$BACKUP_DIR/database/invoiceninja_${DATE}.sql.gz" | cut -f1)
FILES_SIZE=$(du -h "$BACKUP_DIR/files/invoiceninja_files_${DATE}.tar.gz" | cut -f1)

echo ""
echo "=================================================="
echo "Backup Summary"
echo "=================================================="
echo "Database backup: $DB_SIZE"
echo "Files backup: $FILES_SIZE"
echo "Location: $BACKUP_DIR"
echo ""

# 5. Remove old backups (keep last 30 days)
echo "🧹 Cleaning up old backups (keeping last $RETENTION_DAYS days)..."
find "$BACKUP_DIR/database" -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR/files" -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR/config" -name "*-secret_*.yaml" -mtime +$RETENTION_DAYS -delete

# 6. List recent backups
echo ""
echo "Recent backups:"
echo "Database:"
ls -lh "$BACKUP_DIR/database" | tail -5
echo ""
echo "Files:"
ls -lh "$BACKUP_DIR/files" | tail -5

echo ""
echo "=================================================="
echo "✅ Backup completed successfully - $(date)"
echo "=================================================="

