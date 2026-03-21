#!/bin/bash
set -e

export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

if [ -z "$1" ]; then
    echo "Usage: $0 <backup-file.sql.gz>"
    echo ""
    echo "Available backups:"
    ls -lh /home/backup/Documents/business/wcr/Dreambau-Database/backups/*.gz 2>/dev/null || echo "No backups found"
    exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "Error: Backup file not found: $BACKUP_FILE"
    exit 1
fi

echo "============================================"
echo "WCR InvoiceNinja - Database Restore"
echo "============================================"
echo ""
echo "⚠️  WARNING: This will overwrite the current database!"
echo "Backup file: $BACKUP_FILE"
echo ""
read -p "Are you sure you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Restore cancelled."
    exit 0
fi

# Get MySQL root password
echo ""
echo "Retrieving MySQL credentials..."
MYSQL_ROOT_PASSWORD=$(kubectl get secret mysql-secret -n wcr -o jsonpath='{.data.MYSQL_ROOT_PASSWORD}' | base64 -d)

# Decompress if needed
if [[ "$BACKUP_FILE" == *.gz ]]; then
    echo "Decompressing backup..."
    gunzip -c "$BACKUP_FILE" > /tmp/restore.sql
    SQL_FILE="/tmp/restore.sql"
else
    SQL_FILE="$BACKUP_FILE"
fi

# Restore database
echo "Restoring database..."
cat "$SQL_FILE" | kubectl exec -i -n wcr deployment/mysql -- mysql \
    -u root \
    -p"$MYSQL_ROOT_PASSWORD" \
    ninja

# Cleanup temp file
if [ -f "/tmp/restore.sql" ]; then
    rm /tmp/restore.sql
fi

echo ""
echo "✓ Database restored successfully!"
echo ""

