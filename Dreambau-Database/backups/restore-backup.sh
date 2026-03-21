#!/bin/bash

# InvoiceNinja Restore Script
# Restores from a specific backup

set -e

BACKUP_DIR="/home/backup/Documents/business/wcr-backups"

# Check if backup file is provided
if [ -z "$1" ]; then
    echo "Usage: $0 <backup_date>"
    echo ""
    echo "Example: $0 20251108_210023"
    echo ""
    echo "Available backups:"
    ls -lh "$BACKUP_DIR/database/" | grep ".sql.gz"
    exit 1
fi

BACKUP_DATE=$1

echo "=================================================="
echo "InvoiceNinja Restore"
echo "=================================================="
echo "⚠️  WARNING: This will overwrite current data!"
echo "Backup date: $BACKUP_DATE"
echo ""
read -p "Are you sure you want to continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Restore cancelled."
    exit 0
fi

# 1. Restore Database
echo ""
echo "📦 Restoring MySQL database..."
if [ ! -f "$BACKUP_DIR/database/invoiceninja_${BACKUP_DATE}.sql.gz" ]; then
    echo "❌ Database backup not found: invoiceninja_${BACKUP_DATE}.sql.gz"
    exit 1
fi

gunzip -c "$BACKUP_DIR/database/invoiceninja_${BACKUP_DATE}.sql.gz" | \
kubectl exec -i -n wcr deployment/mysql -- mysql \
  -u ninja \
  -pWCR_Ninja_Pass_2024_Change_Me \
  ninja

echo "✅ Database restored successfully"

# 2. Restore Files
echo ""
echo "📂 Restoring InvoiceNinja files..."
if [ ! -f "$BACKUP_DIR/files/invoiceninja_files_${BACKUP_DATE}.tar.gz" ]; then
    echo "❌ Files backup not found: invoiceninja_files_${BACKUP_DATE}.tar.gz"
    exit 1
fi

cat "$BACKUP_DIR/files/invoiceninja_files_${BACKUP_DATE}.tar.gz" | \
kubectl exec -i -n wcr deployment/invoiceninja -c invoiceninja -- \
  tar xzf - -C /

echo "✅ Files restored successfully"

# 3. Restart InvoiceNinja
echo ""
echo "🔄 Restarting InvoiceNinja..."
kubectl rollout restart deployment/invoiceninja -n wcr

echo ""
echo "=================================================="
echo "✅ Restore completed successfully!"
echo "=================================================="
echo "InvoiceNinja will be available in a few moments."

