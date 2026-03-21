#!/bin/bash

# PostgreSQL Backup Script
# Backs up all PostgreSQL databases

set -e

BACKUP_DIR="/home/backup/Documents/business/wcr/Dreambau-Backup/database"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p "$BACKUP_DIR"

echo "=================================================="
echo "Starting PostgreSQL Backup - $(date)"
echo "=================================================="

# Backup NocoDB from PostgreSQL
echo "📦 Backing up NocoDB (PostgreSQL)..."
kubectl exec -n wcr deployment/shared-postgres -- pg_dump -U nocodb nocodb \
  --no-owner --no-acl \
  > "$BACKUP_DIR/nocodb_postgres_${DATE}.sql"
gzip "$BACKUP_DIR/nocodb_postgres_${DATE}.sql"
echo "✅ NocoDB PostgreSQL database backed up"

# Calculate size
NOCODB_SIZE=$(du -h "$BACKUP_DIR/nocodb_postgres_${DATE}.sql.gz" | cut -f1)

echo ""
echo "=================================================="
echo "Backup Complete"
echo "=================================================="
echo "NocoDB backup: $NOCODB_SIZE"
echo "Location: $BACKUP_DIR"
echo ""



