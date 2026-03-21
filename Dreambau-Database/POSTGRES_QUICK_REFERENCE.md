# PostgreSQL Quick Reference Card

## 🚀 Quick Commands

### Check Status
```bash
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
kubectl get pods -n wcr | grep postgres
```

### Connect to Database
```bash
# As postgres superuser
kubectl exec -it deployment/shared-postgres -n wcr -- psql -U postgres

# As nocodb user
kubectl exec -it deployment/shared-postgres -n wcr -- psql -U nocodb -d nocodb
```

### View Logs
```bash
kubectl logs -n wcr deployment/shared-postgres --tail=50 --follow
```

### Backup NocoDB
```bash
# Quick backup
kubectl exec -n wcr deployment/shared-postgres -- pg_dump -U nocodb nocodb \
  > nocodb_backup_$(date +%Y%m%d).sql

# With compression
kubectl exec -n wcr deployment/shared-postgres -- pg_dump -U nocodb nocodb | gzip \
  > nocodb_backup_$(date +%Y%m%d).sql.gz

# Automated (all databases)
cd /home/backup/Documents/business/wcr/Dreambau-Database/backups
sudo ./automated-backup.sh
```

### Restore NocoDB
```bash
# From uncompressed backup
cat backup.sql | kubectl exec -i -n wcr deployment/shared-postgres -- \
  psql -U nocodb -d nocodb

# From compressed backup
gunzip -c backup.sql.gz | kubectl exec -i -n wcr deployment/shared-postgres -- \
  psql -U nocodb -d nocodb
```

## 🗄️ Database Queries

### List Databases
```bash
kubectl exec -n wcr deployment/shared-postgres -- psql -U postgres -l
```

### List Tables in NocoDB
```bash
kubectl exec -n wcr deployment/shared-postgres -- \
  psql -U nocodb -d nocodb -c '\dt'
```

### Database Size
```bash
kubectl exec -n wcr deployment/shared-postgres -- \
  psql -U postgres -c "SELECT datname, pg_size_pretty(pg_database_size(datname)) FROM pg_database;"
```

### Table Sizes
```bash
kubectl exec -n wcr deployment/shared-postgres -- \
  psql -U nocodb -d nocodb -c "SELECT tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size FROM pg_tables WHERE schemaname='public' ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC LIMIT 10;"
```

### Active Connections
```bash
kubectl exec -n wcr deployment/shared-postgres -- \
  psql -U postgres -c "SELECT datname, count(*) FROM pg_stat_activity GROUP BY datname;"
```

## 🔧 Maintenance

### Vacuum Database
```bash
kubectl exec -n wcr deployment/shared-postgres -- \
  psql -U nocodb -d nocodb -c 'VACUUM ANALYZE;'
```

### Restart PostgreSQL
```bash
kubectl rollout restart deployment/shared-postgres -n wcr
kubectl wait --for=condition=ready pod -l app=shared-postgres -n wcr --timeout=120s
```

### Scale PostgreSQL
```bash
# Stop
kubectl scale deployment shared-postgres -n wcr --replicas=0

# Start
kubectl scale deployment shared-postgres -n wcr --replicas=1
```

## 🌐 Application URLs

- **NocoDB**: https://nocodb.wcrbusiness.online
- **n8n**: https://n8n.wcrbusiness.online
- **Invoice**: https://invoice.wcrbusiness.online
- **Cap**: https://cap.wcrbusiness.online

## 📊 Resource Monitoring

### Pod Resources
```bash
kubectl top pod -n wcr -l app=shared-postgres
```

### Storage Usage
```bash
kubectl exec -n wcr deployment/shared-postgres -- df -h /var/lib/postgresql/data
```

## 🔐 Passwords (stored in secrets)

```bash
# View PostgreSQL credentials
kubectl get secret shared-postgres-secret -n wcr -o jsonpath='{.data.POSTGRES_PASSWORD}' | base64 -d

# View NocoDB database password
kubectl get secret shared-postgres-secret -n wcr -o jsonpath='{.data.NOCODB_DB_PASSWORD}' | base64 -d
```

## 🆘 Troubleshooting

### Pod Won't Start
```bash
kubectl describe pod -n wcr -l app=shared-postgres
kubectl logs -n wcr deployment/shared-postgres
kubectl get pvc -n wcr | grep postgres
```

### Connection Refused
```bash
# Check service
kubectl get svc -n wcr shared-postgres

# Test from debug pod
kubectl run -it --rm debug --image=postgres:15-alpine --restart=Never -- \
  psql -h shared-postgres.wcr.svc.cluster.local -U nocodb -d nocodb
```

### High Memory Usage
```bash
# Check current usage
kubectl top pod -n wcr -l app=shared-postgres

# Increase resources (edit deployment)
kubectl edit deployment shared-postgres -n wcr
# Update: spec.template.spec.containers[0].resources.limits.memory
```

## 📍 Important Paths

- **PostgreSQL Config**: `/home/backup/Documents/business/wcr/Dreambau-Database/postgres/`
- **Backups**: `/home/backup/Documents/business/wcr/Dreambau-Backup/database/`
- **Migration Backup**: `/home/backup/Documents/business/wcr/Dreambau-Backup/migration-20251110_184908/`
- **Deployment Scripts**: `/home/backup/Documents/business/wcr/Dreambau-Database/postgres/*.sh`

## 🔄 Connection Strings

### NocoDB → PostgreSQL
```
pg://shared-postgres.wcr.svc.cluster.local:5432?u=nocodb&p=***&d=nocodb
```

### From External Applications
```yaml
host: shared-postgres.wcr.svc.cluster.local
port: 5432
database: nocodb
user: nocodb
password: [from secret]
```

---

**Last Updated**: November 10, 2025  
**PostgreSQL Version**: 15-alpine  
**Current Database**: nocodb (11 MB, 70 tables)



