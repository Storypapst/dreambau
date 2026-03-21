# Novu Version Information

## Current Kubernetes Deployment

**Deployment:** Kubernetes (k3s) on https://novu.dreambau.com  
**Namespace:** wcr  
**Status:** ✅ Running

### Version Details

| Component | Version/Image | Status |
|-----------|--------------|--------|
| Novu API | `ghcr.io/novuhq/novu/api:latest` | Running |
| Novu Dashboard | `ghcr.io/novuhq/novu/dashboard:latest` | Running |
| Novu Worker | `ghcr.io/novuhq/novu/worker:latest` | Running |
| Novu WebSocket | `ghcr.io/novuhq/novu/ws:latest` | Running |
| MongoDB | `mongo:8.0.3` | Running |
| Redis | `redis:alpine` | Running |
| Node.js (in containers) | `v20.18.1` | - |

### Service Version

```
Service Name: @novu/api-service
Version: 3.11.0
Platform: Docker
Tenant: OS
```

## Kubernetes Resources

### Pods
```bash
kubectl get pods -n wcr -l app=novu
```

Current pods:
- novu-api-6578fb745d-5pqvc (1/1 Running)
- novu-web-649854ffff-7mjjn (1/1 Running)
- novu-worker-5f89466f87-tpfx4 (1/1 Running)
- novu-ws-786d6fcf4-hnshr (1/1 Running)

### Services
```bash
kubectl get svc -n wcr -l app=novu
```

- novu-api (ClusterIP, port 3000)
- novu-web (ClusterIP, port 4000)
- novu-ws (ClusterIP, port 3002)

### Ingress
```bash
kubectl get ingress -n wcr novu-ingress
```

- Host: novu.dreambau.com
- TLS: Yes (Let's Encrypt)
- Paths: /, /v1, /v2, /api, /ws, /socket.io

## Docker Compose Deployment

**Location:** `/home/backup/Documents/business/wcr/Dreambau-Novu/docker-compose/`  
**Purpose:** Portable Docker Compose setup for deploying on other servers

### Files Created

| File | Description |
|------|-------------|
| `docker-compose.yml` | Main Docker Compose configuration |
| `.env.example` | Environment variables template |
| `setup.sh` | Automated setup script |
| `nginx-example.conf` | Nginx reverse proxy configuration |
| `README.md` | Complete deployment documentation |
| `QUICKSTART.md` | Quick start guide (5 minutes) |
| `VERSION-INFO.md` | This file - version information |

### Image Versions Used

The Docker Compose setup uses the exact same versions as the Kubernetes deployment:

```yaml
services:
  mongodb:
    image: mongo:8.0.3
  
  redis:
    image: redis:alpine
  
  novu-api:
    image: ghcr.io/novuhq/novu/api:latest
  
  novu-worker:
    image: ghcr.io/novuhq/novu/worker:latest
  
  novu-ws:
    image: ghcr.io/novuhq/novu/ws:latest
  
  novu-web:
    image: ghcr.io/novuhq/novu/dashboard:latest
```

## Configuration Comparison

### Kubernetes vs Docker Compose

| Aspect | Kubernetes | Docker Compose |
|--------|-----------|----------------|
| Orchestration | k3s | Docker Compose |
| Networking | ClusterIP + Ingress | Bridge network + Nginx |
| Storage | PersistentVolumeClaim (10Gi) | Named volume |
| SSL/TLS | cert-manager + Traefik | Let's Encrypt + Nginx |
| Scaling | kubectl scale | docker compose --scale |
| Auto-restart | Yes (deployment) | restart: unless-stopped |
| Health checks | liveness/readiness probes | healthcheck |

### Environment Variables

Both deployments use identical environment variables:

**Security:**
- JWT_SECRET
- STORE_ENCRYPTION_KEY (32 chars)
- NOVU_SECRET_KEY

**Database:**
- MONGO_URL
- REDIS_HOST

**Configuration:**
- HOST_NAME
- API_ROOT_URL
- FRONT_BASE_URL

## How to Deploy on Another Server

### Prerequisites
- Docker 20.10+
- Docker Compose 2.0+
- Domain name pointing to server
- Nginx or Traefik for reverse proxy

### Quick Deploy
```bash
# 1. Copy files
cd /home/backup/Documents/business/wcr/Dreambau-Novu/docker-compose/
scp -r * user@new-server:~/novu/

# 2. On new server
cd ~/novu
chmod +x setup.sh
./setup.sh

# 3. Configure Nginx
sudo cp nginx-example.conf /etc/nginx/sites-available/novu
# Edit and enable...

# 4. Get SSL certificate
sudo certbot --nginx -d novu.newdomain.com
```

### Detailed Guide

See `README.md` for complete deployment instructions including:
- System requirements
- Security best practices
- Backup/restore procedures
- Monitoring
- Troubleshooting
- Scaling

## API Endpoints

Both deployments expose the same API:

- **Health Check:** `GET /v1/health-check`
- **Trigger Event:** `POST /v1/events/trigger`
- **Subscribers:** `POST /v1/subscribers`
- **Workflows:** `GET /v1/workflows`

Full API documentation: https://docs.novu.co/api-reference/overview

## Changelog

### January 2026
- ✅ Documented current Kubernetes deployment (v3.11.0)
- ✅ Created Docker Compose setup for portability
- ✅ Added automated setup script
- ✅ Added Nginx configuration example
- ✅ Created comprehensive documentation

### November 2025
- Initial Kubernetes deployment
- MongoDB 8.0.3 with persistent storage
- Redis for caching
- Traefik ingress with SSL

## Support

### Kubernetes Deployment
- Location: `/home/backup/Documents/business/wcr/Dreambau-Novu/`
- Logs: `kubectl logs -n wcr -l app=novu`
- Health: `curl https://novu.dreambau.com/v1/health-check`

### Docker Compose
- Location: `/home/backup/Documents/business/wcr/Dreambau-Novu/docker-compose/`
- Docs: See README.md
- Quick Start: See QUICKSTART.md

## Resources

- **Novu Official:** https://novu.co
- **Documentation:** https://docs.novu.co
- **GitHub:** https://github.com/novuhq/novu
- **Discord:** https://discord.gg/novu

---

**Last Updated:** January 9, 2026  
**Maintained By:** WCR Business / Dreambau Team
