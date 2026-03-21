# Novu on dev-01 - Quick Reference Card

## 🌐 Access URLs

**Dashboard:** http://72.144.25.104:4001  
**API:** http://72.144.25.104:3001  
**Health Check:** http://72.144.25.104:3001/v1/health-check  
**WebSocket:** ws://72.144.25.104:3002

## 📊 Version & Status

**Novu Version:** 3.12.0  
**Status:** ✅ Running  
**Deployed:** January 9, 2026

## 🔌 Ports

- **API:** 3001
- **Dashboard:** 4001
- **WebSocket:** 3002
- **MongoDB:** 27018 (localhost only)
- **Redis:** 6381 (localhost only)

## 🔐 Quick Access

```bash
# SSH to server
ssh -i ~/Desktop/H/dev-01.pem azureuser@72.144.25.104

# Navigate to Novu
cd ~/novu

# Check status
docker compose ps

# View logs
docker compose logs -f novu-api

# Restart
docker compose restart
```

## ⚡ Essential Commands

```bash
# Start
docker compose up -d

# Stop
docker compose down

# Restart specific service
docker compose restart novu-api

# View all logs
docker compose logs -f

# Health check
curl http://localhost:3001/v1/health-check

# Update to latest
docker compose pull && docker compose up -d
```

## 💾 Quick Backup

```bash
cd ~/novu
docker compose exec mongodb mongodump \
  --uri="mongodb://novu:Novu_Dev01_Pass_2026_Secure@localhost:27017/novu-db?authSource=admin" \
  --archive --gzip > ~/novu-backup-$(date +%Y%m%d).archive.gz
```

## 🆘 Troubleshooting

**Service not responding?**
```bash
docker compose restart novu-api
docker compose logs novu-api
```

**Check all services:**
```bash
docker compose ps
```

**Resource issues:**
```bash
docker stats
free -h
df -h
```

---

For complete documentation, see: `DEPLOYMENT-SUMMARY.md`



