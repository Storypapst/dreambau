# Shared PostgreSQL Database

This directory contains the shared PostgreSQL instance used by multiple applications in the WCR cluster.

## 📦 What's Deployed

- **PostgreSQL 15 (Alpine)**: Lightweight, secure, and performant
- **Storage**: 10Gi persistent volume
- **Service**: `shared-postgres.wcr.svc.cluster.local:5432`

## 🗄️ Databases

| Database | User | Application | Status |
|----------|------|-------------|--------|
| `nocodb` | `nocodb` | NocoDB | ✅ Active |

## 📁 Files

```
postgres/
├── README.md                           # This file
├── postgres-secret.yaml                # ⚠️  Credentials (DO NOT COMMIT!)
├── postgres-secret.yaml.example        # Template for credentials
├── postgres-pvc.yaml                   # 10Gi persistent storage
├── postgres-init-configmap.yaml        # Database initialization script
├── postgres-deployment.yaml            # PostgreSQL deployment & service
├── deploy-postgres.sh                  # Automated deployment script
├── migrate-nocodb-simple.sh            # NocoDB MySQL→PostgreSQL migration
└── init-databases.sh                   # Manual init script (reference)
```

## 🚀 Deployment

### Initial Setup

```bash
cd /home/backup/Documents/business/wcr/Dreambau-Database/postgres
chmod +x *.sh
sudo ./deploy-postgres.sh
```

### Add New Database

1. Edit `postgres-secret.yaml`:
```yaml
# Add new database credentials
NEWAPP_DB_NAME: "newapp"
NEWAPP_DB_USER: "newapp"
NEWAPP_DB_PASSWORD: "CHANGE_ME_NewApp_Pass_2024"
```

2. Edit `postgres-init-configmap.yaml` to add initialization:
```yaml
# Add new database creation block
if [ ! -z "$NEWAPP_DB_NAME" ] && [ ! -z "$NEWAPP_DB_USER" ] && [ ! -z "$NEWAPP_DB_PASSWORD" ]; then
    echo "Creating NewApp database..."
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
        CREATE USER $NEWAPP_DB_USER WITH PASSWORD '$NEWAPP_DB_PASSWORD';
        CREATE DATABASE $NEWAPP_DB_NAME OWNER $NEWAPP_DB_USER;
        GRANT ALL PRIVILEGES ON DATABASE $NEWAPP_DB_NAME TO $NEWAPP_DB_USER;
EOSQL
    echo "NewApp database created"
fi
```

3. Apply changes:
```bash
kubectl apply -f postgres-secret.yaml
kubectl apply -f postgres-init-configmap.yaml
kubectl rollout restart deployment/shared-postgres -n wcr
```

## 🔧 Common Operations

### Check Status
```bash
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

# Check PostgreSQL pod
kubectl get pods -n wcr -l app=shared-postgres

# Check logs
kubectl logs -n wcr deployment/shared-postgres --tail=50

# Check all databases
kubectl exec -n wcr deployment/shared-postgres -- psql -U postgres -l
```

### Connect to PostgreSQL
```bash
# As postgres superuser
kubectl exec -it deployment/shared-postgres -n wcr -- psql -U postgres

# As specific database user
kubectl exec -it deployment/shared-postgres -n wcr -- psql -U nocodb -d nocodb
```

### Backup Database
```bash
# Single database backup
kubectl exec -n wcr deployment/shared-postgres -- pg_dump -U nocodb nocodb \
  --no-owner --no-acl > nocodb_backup_$(date +%Y%m%d).sql

# All databases (automated)
cd /home/backup/Documents/business/wcr/Dreambau-Database/backups
sudo ./automated-backup.sh
```

### Restore Database
```bash
# Restore from backup
kubectl exec -i -n wcr deployment/shared-postgres -- psql -U nocodb -d nocodb < backup.sql
```

## 🛠️ Troubleshooting

### Pod Won't Start
```bash
# Check events
kubectl describe pod -n wcr -l app=shared-postgres

# Check PVC
kubectl get pvc -n wcr shared-postgres-pvc

# Check logs
kubectl logs -n wcr deployment/shared-postgres
```

### Connection Issues
```bash
# Test from another pod
kubectl run -it --rm debug --image=postgres:15-alpine --restart=Never -- \
  psql -h shared-postgres.wcr.svc.cluster.local -U nocodb -d nocodb

# Verify service
kubectl get svc -n wcr shared-postgres
```

### Performance Issues
```bash
# Check resource usage
kubectl top pod -n wcr -l app=shared-postgres

# Increase resources if needed (edit postgres-deployment.yaml):
resources:
  limits:
    memory: "4Gi"
    cpu: "2000m"
```

## 🔐 Security Notes

- **Never commit** `postgres-secret.yaml` to version control
- **Change default passwords** in production
- Use strong passwords (minimum 32 characters)
- Regularly backup databases
- Monitor logs for unauthorized access attempts

## 📊 Resource Allocation

**Current Allocation**:
- CPU: 250m (request) / 1000m (limit)
- Memory: 512Mi (request) / 2Gi (limit)
- Storage: 10Gi

**Recommended for Production**:
- CPU: 500m (request) / 2000m (limit)
- Memory: 1Gi (request) / 4Gi (limit)
- Storage: 50Gi+

## 🔄 Migration History

### NocoDB: MySQL → PostgreSQL (Nov 10, 2025)

**Reason**: PostgreSQL provides better support for NocoDB's features and scalability.

**Migration Steps**:
1. Deployed shared PostgreSQL instance
2. Created `nocodb` database
3. Backed up MySQL data
4. Updated NocoDB configuration
5. Restarted NocoDB with PostgreSQL

**Result**: ✅ Successfully migrated with 70 tables created

**Backup Location**: `/home/backup/Documents/business/wcr/Dreambau-Backup/migration-20251110_184908/`

## 📚 Additional Resources

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Kubernetes PostgreSQL Best Practices](https://kubernetes.io/docs/tasks/run-application/run-single-instance-stateful-application/)
- [NocoDB PostgreSQL Setup](https://docs.nocodb.com/)

---

**Last Updated**: November 10, 2025
**PostgreSQL Version**: 15-alpine
**Kubernetes**: k3s



