# 🚀 Novu Docker Compose - Start Here

## What is This?

This is a **complete Docker Compose setup** for deploying Novu v3.11.0 on any server. It matches the exact configuration running on your Kubernetes cluster at https://novu.dreambau.com.

## 📊 Current Kubernetes Deployment

**Version:** Novu 3.11.0  
**Location:** https://novu.dreambau.com  
**Status:** ✅ Running (Kubernetes/k3s)

Components:
- ✅ API (ghcr.io/novuhq/novu/api:latest)
- ✅ Dashboard (ghcr.io/novuhq/novu/dashboard:latest)
- ✅ Worker (ghcr.io/novuhq/novu/worker:latest)
- ✅ WebSocket (ghcr.io/novuhq/novu/ws:latest)
- ✅ MongoDB 8.0.3
- ✅ Redis (Alpine)

## 📦 What's Included

| File | Purpose | Lines |
|------|---------|-------|
| `docker-compose.yml` | Main Docker configuration | 240 |
| `QUICKSTART.md` | **5-minute quick start** ⭐ | 257 |
| `README.md` | Complete documentation | 620 |
| `setup.sh` | Automated setup script | 161 |
| `nginx-example.conf` | Nginx reverse proxy config | 192 |
| `.env.example` | Environment variables template | 56 |
| `VERSION-INFO.md` | Version details & comparison | 220 |
| `00-START-HERE.md` | This file | - |

## 🎯 Quick Deploy (Choose Your Path)

### Option A: Automated Setup (Recommended)
```bash
cd /path/to/this/directory
chmod +x setup.sh
./setup.sh
```
The script will:
- ✅ Check prerequisites
- ✅ Ask for your domain
- ✅ Generate security secrets
- ✅ Update configuration
- ✅ Pull Docker images
- ✅ Start all services

### Option B: Manual Setup (5 minutes)
```bash
# 1. Copy docker-compose.yml
cp docker-compose.yml ~/novu/ && cd ~/novu/

# 2. Edit configuration
nano docker-compose.yml
# Change: novu.yourdomain.com → your.domain.com
# Change: MongoDB password
# Generate new secrets (see below)

# 3. Start services
docker compose up -d

# 4. Check status
docker compose ps
docker compose logs -f
```

### Option C: Read the Docs First
👉 **Start with:** `QUICKSTART.md` (5-minute guide)  
📚 **Then read:** `README.md` (complete guide)

## 🔐 Security Checklist

Before deploying to production:

- [ ] Change MongoDB password from default
- [ ] Generate new JWT_SECRET (run: `openssl rand -hex 32`)
- [ ] Generate new STORE_ENCRYPTION_KEY (run: `openssl rand -hex 16`)
- [ ] Generate new NOVU_SECRET_KEY (run: `openssl rand -hex 32`)
- [ ] Update domain name to your actual domain
- [ ] Configure SSL certificate (Let's Encrypt)
- [ ] Set up firewall rules
- [ ] Configure backups

## 📋 Prerequisites

Before you start, ensure you have:

✅ **Server:**
- Ubuntu 20.04+ / Debian 11+ / CentOS 8+
- 2+ CPU cores
- 4GB+ RAM (8GB recommended)
- 20GB+ storage

✅ **Software:**
- Docker 20.10+ (`curl -fsSL https://get.docker.com | sh`)
- Docker Compose 2.0+ (included with Docker)

✅ **Network:**
- Domain name pointing to your server
- Ports 80, 443 available (or custom ports)
- Reverse proxy (Nginx/Traefik/Caddy)

## 🌐 After Deployment

Once deployed, you'll have:

| Service | URL |
|---------|-----|
| Dashboard | `https://your.domain.com` |
| API | `https://your.domain.com/v1/` |
| Health Check | `https://your.domain.com/v1/health-check` |
| WebSocket | `wss://your.domain.com/ws` |

## 📖 Documentation Map

1. **Quick Start** → `QUICKSTART.md`
   - Fast deployment
   - Essential commands
   - Troubleshooting basics

2. **Complete Guide** → `README.md`
   - Detailed installation
   - Configuration options
   - Reverse proxy setup
   - Backup & restore
   - Advanced topics

3. **Version Info** → `VERSION-INFO.md`
   - Current versions
   - Kubernetes vs Docker comparison
   - Migration guide

4. **Nginx Config** → `nginx-example.conf`
   - Ready-to-use Nginx configuration
   - SSL setup included
   - WebSocket support

## 🔧 Common Commands

```bash
# Start services
docker compose up -d

# Stop services
docker compose down

# View logs (all services)
docker compose logs -f

# View specific service logs
docker compose logs -f novu-api

# Check status
docker compose ps

# Restart service
docker compose restart novu-api

# Update to latest version
docker compose pull
docker compose up -d

# Backup database
docker compose exec mongodb mongodump \
  --uri="mongodb://novu:PASSWORD@localhost:27017/novu-db?authSource=admin" \
  --archive --gzip > backup.archive.gz
```

## ❓ FAQ

### Q: What's different from the Kubernetes deployment?
A: This Docker Compose setup has the same features but is simpler to deploy. It's perfect for single-server deployments.

### Q: Can I migrate from Kubernetes to Docker Compose?
A: Yes! Just backup your MongoDB from Kubernetes and restore it to the Docker Compose MongoDB. See VERSION-INFO.md for details.

### Q: What if I already have MongoDB/Redis?
A: You can use external databases. Edit docker-compose.yml and remove the mongodb/redis services, then update the connection strings.

### Q: How do I scale the worker?
A: Run: `docker compose up -d --scale novu-worker=3`

### Q: Can I change the ports?
A: Yes! Edit the `ports:` section in docker-compose.yml. Default ports are 3000 (API), 4000 (Dashboard), 3002 (WebSocket).

### Q: Is this production-ready?
A: Yes, but make sure to:
- Change all default passwords
- Generate new secrets
- Set up SSL/TLS
- Configure backups
- Monitor resources

## 🆘 Need Help?

1. **Check logs:** `docker compose logs -f`
2. **Read:** `QUICKSTART.md` for basic troubleshooting
3. **Read:** `README.md` for detailed troubleshooting
4. **Novu Discord:** https://discord.gg/novu
5. **Documentation:** https://docs.novu.co

## 🎬 What's Next?

1. **Deploy:** Follow QUICKSTART.md
2. **Configure:** Set up domain and SSL
3. **Access:** Open your domain in browser
4. **Create:** Build your first notification workflow
5. **Integrate:** Connect to your application

## 📝 Version History

- **January 9, 2026:** Docker Compose setup created
  - Novu v3.11.0
  - MongoDB 8.0.3
  - Complete documentation
  - Automated setup script

---

**Ready to deploy?** → Start with `QUICKSTART.md`  
**Want details?** → Read `README.md`  
**Need specifics?** → Check `VERSION-INFO.md`

**Questions?** Check the FAQ section above or join the Novu Discord community.

✨ **Happy deploying!** ✨
