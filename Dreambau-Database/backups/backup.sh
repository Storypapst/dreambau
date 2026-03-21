#!/bin/bash
set -e

export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

BACKUP_DIR="/home/backup/Documents/business/wcr/Dreambau-Database/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/invoiceninja_$TIMESTAMP.sql"

echo "============================================"
echo "WCR InvoiceNinja - Database Backup"
echo "============================================"
echo ""

# Check if MySQL pod is running
if ! kubectl get pod -n wcr -l app=mysql | grep -q Running; then
    echo "Error: MySQL pod is not running!"
    exit 1
fi

# Get MySQL root password
echo "Retrieving MySQL credentials..."
MYSQL_ROOT_PASSWORD=$(kubectl get secret mysql-secret -n wcr -o jsonpath='{.data.MYSQL_ROOT_PASSWORD}' | base64 -d)

# Create backup
echo "Creating database backup..."
kubectl exec -n wcr deployment/mysql -- mysqldump \
    -u root \
    -p"$MYSQL_ROOT_PASSWORD" \
    --single-transaction \
    --routines \
    --triggers \
    --events \
    ninja > "$BACKUP_FILE"

# Compress backup
echo "Compressing backup..."
gzip "$BACKUP_FILE"

BACKUP_SIZE=$(du -h "${BACKUP_FILE}.gz" | cut -f1)

echo ""
echo "✓ Backup completed successfully!"
echo ""
echo "File: ${BACKUP_FILE}.gz"
echo "Size: $BACKUP_SIZE"
echo ""

# Cleanup old backups (keep last 7 days)
echo "Cleaning up old backups (keeping last 7 days)..."
find "$BACKUP_DIR" -name "invoiceninja_*.sql.gz" -mtime +7 -delete
echo "✓ Cleanup complete"
echo ""

