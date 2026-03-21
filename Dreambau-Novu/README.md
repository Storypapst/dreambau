# Dreambau-Novu

Open-source notification infrastructure platform for managing multi-channel notifications.

## 🌐 Access

- **URL:** https://novu.dreambau.com
- **Version:** 2.3.0

## 📋 Overview

Novu is a complete notification infrastructure that provides:

- **Multi-Channel Notifications:** Email, SMS, Push, In-App, Chat
- **Workflow Engine:** Visual workflow builder for notification logic
- **Template Management:** Centralized notification templates
- **Provider Management:** Support for multiple notification providers
- **Subscriber Management:** Manage notification recipients
- **Activity Feed:** Track notification delivery and engagement
- **API & SDKs:** Comprehensive API and SDKs for integration

## 🏗️ Architecture

### Services

1. **MongoDB** - Primary database for Novu data
2. **Redis** - Caching and queue management
3. **Novu API** - REST API backend (port 3000)
4. **Novu Worker** - Background job processor
5. **Novu WebSocket** - Real-time notifications (port 3002)
6. **Novu Web** - Dashboard UI (port 4200)

### Kubernetes Resources

```
Namespace: wcr

Deployments:
- mongodb          (1 replica)
- redis            (1 replica)
- novu-api         (1 replica)
- novu-worker      (1 replica)
- novu-ws          (1 replica)
- novu-web         (1 replica)

Services:
- mongodb          (ClusterIP, port 27017)
- redis            (ClusterIP, port 6379)
- novu-api         (ClusterIP, port 3000)
- novu-ws          (ClusterIP, port 3002)
- novu-web         (ClusterIP, port 4200)

Storage:
- mongodb-pvc      (10Gi)

Ingress:
- novu-ingress     (novu.dreambau.com)
```

## 🚀 Deployment

### Prerequisites

- Kubernetes cluster (k3s) running
- `kubectl` configured
- DNS record: `novu.dreambau.com` → Server IP

### Deploy

```bash
cd /home/backup/Documents/business/wcr/Dreambau-Novu
./scripts/deploy-novu.sh
```

The script will:
1. Deploy MongoDB with persistent storage
2. Deploy Redis for caching
3. Apply Novu secrets
4. Deploy Novu services (API, Worker, WebSocket, Web)
5. Configure Ingress with SSL

### Verify Deployment

```bash
# Check all pods
kubectl get pods -n wcr -l app=novu

# Check services
kubectl get svc -n wcr -l app=novu

# Check ingress
kubectl get ingress -n wcr novu-ingress

# View API logs
kubectl logs -n wcr -l app=novu,component=api --tail=50 -f

# View worker logs
kubectl logs -n wcr -l app=novu,component=worker --tail=50 -f
```

## 🔐 Security

### Secrets

All sensitive data is stored in `config/novu-secret.yaml`:

- `JWT_SECRET` - JWT token signing
- `STORE_ENCRYPTION_KEY` - Provider credential encryption (32 chars)
- `NOVU_SECRET_KEY` - General secret key
- MongoDB credentials
- Redis configuration

**⚠️ IMPORTANT:** The secret file contains production credentials and is excluded from Git.

### MongoDB Credentials

- **Username:** `novu`
- **Password:** `Novu_Mongo_Pass_2024_Change_Me`
- **Database:** `novu-db`
- **Connection:** `mongodb://novu:Novu_Mongo_Pass_2024_Change_Me@mongodb.wcr.svc.cluster.local:27017/novu-db?authSource=admin`

## 📊 Monitoring

### Health Checks

```bash
# API health check
curl https://novu.dreambau.com/v1/health-check

# Check pod status
kubectl get pods -n wcr -l app=novu -w

# Check resource usage
kubectl top pods -n wcr -l app=novu
```

### Logs

```bash
# API logs
kubectl logs -n wcr deployment/novu-api --tail=100 -f

# Worker logs
kubectl logs -n wcr deployment/novu-worker --tail=100 -f

# WebSocket logs
kubectl logs -n wcr deployment/novu-ws --tail=100 -f

# Web dashboard logs
kubectl logs -n wcr deployment/novu-web --tail=100 -f

# MongoDB logs
kubectl logs -n wcr deployment/mongodb --tail=100 -f

# Redis logs
kubectl logs -n wcr deployment/redis --tail=100 -f
```

## 🔧 Management

### Restart Services

```bash
# Restart API
kubectl rollout restart deployment/novu-api -n wcr

# Restart worker
kubectl rollout restart deployment/novu-worker -n wcr

# Restart all Novu services
kubectl rollout restart deployment -n wcr -l app=novu
```

### Update Configuration

```bash
# Edit secrets
kubectl edit secret novu-secret -n wcr

# Apply changes (will trigger pod restart)
kubectl apply -f config/novu-secret.yaml -n wcr

# Restart affected services
kubectl rollout restart deployment/novu-api -n wcr
kubectl rollout restart deployment/novu-worker -n wcr
```

### Scale Services

```bash
# Scale API
kubectl scale deployment/novu-api -n wcr --replicas=2

# Scale worker
kubectl scale deployment/novu-worker -n wcr --replicas=3
```

## 💾 Backup

### MongoDB Backup

```bash
# Manual backup
kubectl exec -n wcr deployment/mongodb -- mongodump \
  --uri="mongodb://novu:Novu_Mongo_Pass_2024_Change_Me@localhost:27017/novu-db?authSource=admin" \
  --archive > novu-backup-$(date +%Y%m%d-%H%M%S).archive

# Restore from backup
kubectl exec -i -n wcr deployment/mongodb -- mongorestore \
  --uri="mongodb://novu:Novu_Mongo_Pass_2024_Change_Me@localhost:27017/novu-db?authSource=admin" \
  --archive < novu-backup-YYYYMMDD-HHMMSS.archive
```

### Integration with Automated Backup

The MongoDB backup should be integrated into the centralized backup system at:
`/home/backup/Documents/business/wcr/Dreambau-Database/backups/automated-backup.sh`

## 🔌 API Usage

### Authentication

Novu uses API keys for authentication. Create an API key in the dashboard:

1. Go to https://novu.dreambau.com
2. Navigate to Settings → API Keys
3. Create a new API key

### Example API Call

```bash
# Trigger a notification
curl -X POST https://novu.dreambau.com/v1/events/trigger \
  -H "Authorization: ApiKey YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "welcome-email",
    "to": {
      "subscriberId": "user-123",
      "email": "user@example.com"
    },
    "payload": {
      "name": "John Doe"
    }
  }'
```

## 🐛 Troubleshooting

### Pods Not Starting

```bash
# Check pod status
kubectl describe pod -n wcr -l app=novu,component=api

# Check events
kubectl get events -n wcr --sort-by='.lastTimestamp'
```

### MongoDB Connection Issues

```bash
# Test MongoDB connection
kubectl exec -n wcr deployment/mongodb -- mongosh \
  --username novu \
  --password Novu_Mongo_Pass_2024_Change_Me \
  --authenticationDatabase admin \
  --eval "db.adminCommand('ping')"
```

### Redis Connection Issues

```bash
# Test Redis connection
kubectl exec -n wcr deployment/redis -- redis-cli ping
```

### SSL Certificate Issues

```bash
# Check certificate status
kubectl describe certificate novu-dreambau-com-tls -n wcr

# Check cert-manager logs
kubectl logs -n cert-manager deployment/cert-manager --tail=50
```

## 📚 Resources

- **Official Documentation:** https://docs.novu.co
- **GitHub Repository:** https://github.com/novuhq/novu
- **API Reference:** https://docs.novu.co/api-reference/overview
- **Community:** https://discord.gg/novu

## 📝 Notes

- Novu uses MongoDB for data storage (10GB PVC)
- Redis is used for caching and queue management
- The dashboard is accessible at the root path `/`
- API endpoints are available at `/v1` and `/api`
- WebSocket connections use `/ws` path
- SSL certificates are automatically provisioned by cert-manager
- All services run in the `wcr` namespace

## 🔄 Updates

To update Novu to a newer version:

1. Update image tags in `config/novu-deployment.yaml`
2. Apply the changes: `kubectl apply -f config/novu-deployment.yaml -n wcr`
3. Monitor the rollout: `kubectl rollout status deployment/novu-api -n wcr`

## 🗑️ Uninstall

```bash
# Delete all Novu resources
kubectl delete -f config/novu-ingress.yaml -n wcr
kubectl delete -f config/novu-deployment.yaml -n wcr
kubectl delete -f config/novu-secret.yaml -n wcr
kubectl delete -f config/redis-deployment.yaml -n wcr
kubectl delete -f config/mongodb-deployment.yaml -n wcr

# Delete persistent data (WARNING: This will delete all data!)
kubectl delete pvc mongodb-pvc -n wcr
```



