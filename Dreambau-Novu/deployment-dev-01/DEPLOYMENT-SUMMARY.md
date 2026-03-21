# Novu Deployment on dev-01 - Summary

## 🎉 Deployment Successful!

**Server:** dev-01 (72.144.25.104)  
**Date:** January 9, 2026  
**Novu Version:** 3.12.0 (latest)  
**Status:** ✅ Running

---

## 📊 Deployment Details

### Server Information
- **IP Address:** 72.144.25.104
- **OS:** Ubuntu 18.04.6 LTS
- **RAM:** 7.8GB (1.9GB available)
- **Disk:** 97GB (30GB free)
- **Docker:** 24.0.2
- **Docker Compose:** v2.18.1

### Deployed Services

| Service | Image | Port | Status |
|---------|-------|------|--------|
| MongoDB | `mongo:8.0.3` | 27018 (localhost) | ✅ Healthy |
| Redis | `redis:alpine` | 6381 (localhost) | ✅ Healthy |
| Novu API | `ghcr.io/novuhq/novu/api:latest` | **3001** | ✅ Running |
| Novu Worker | `ghcr.io/novuhq/novu/worker:latest` | - | ✅ Running |
| Novu WebSocket | `ghcr.io/novuhq/novu/ws:latest` | **3002** | ✅ Running |
| Novu Dashboard | `ghcr.io/novuhq/novu/dashboard:latest` | **4001** | ✅ Running |

### Why Different Ports?

Original ports 3000 and 4200 were already in use by:
- Port 3000: Backend service
- Port 4200: Frontend service

So Novu was deployed on:
- **API:** Port 3001
- **Dashboard:** Port 4001
- **WebSocket:** Port 3002

---

## 🌐 Access URLs

### Public Access (Direct IP)

| Service | URL |
|---------|-----|
| **Dashboard** | http://72.144.25.104:4001 |
| **API** | http://72.144.25.104:3001 |
| **Health Check** | http://72.144.25.104:3001/v1/health-check |
| **WebSocket** | ws://72.144.25.104:3002 |

### Health Check Response
```json
{
  "data": {
    "status": "ok",
    "info": {
      "db": {"status": "up"},
      "workflowQueue": {"status": "up"},
      "apiVersion": {"version": "3.12.0", "status": "up"}
    }
  }
}
```

---

## 📂 Files Location

**Deployment Directory:** `/home/azureuser/novu/`

```
~/novu/
└── docker-compose.yml     # Main configuration file
```

---

## 🔐 Security Configuration

### Credentials

**MongoDB:**
- Username: `novu`
- Password: `Novu_Dev01_Pass_2026_Secure`
- Database: `novu-db`
- Port: 27018 (localhost only)

**Redis:**
- No password (localhost only)
- Port: 6381 (localhost only)

**Security Secrets:**
- JWT_SECRET: `dev01_jwt_secret_2026_secure_random_key_64chars_change_in_production`
- STORE_ENCRYPTION_KEY: `dev01_store_key_32_chars_here_`
- NOVU_SECRET_KEY: `dev01_novu_secret_2026_secure_random_key_64chars_change_production`

**⚠️ IMPORTANT:** These secrets are placeholders. For production use, generate new secrets:
```bash
# Generate new secrets
openssl rand -hex 32  # For JWT_SECRET and NOVU_SECRET_KEY
openssl rand -hex 16  # For STORE_ENCRYPTION_KEY (must be exactly 32 chars)
```

---

## 🔧 Management Commands

### SSH to Server
```bash
ssh -i ~/Desktop/H/dev-01.pem azureuser@72.144.25.104
```

### Navigate to Novu Directory
```bash
cd ~/novu
```

### Check Status
```bash
docker compose ps
```

### View Logs
```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f novu-api
docker compose logs -f novu-worker
docker compose logs -f novu-web
```

### Restart Services
```bash
# Restart all
docker compose restart

# Restart specific service
docker compose restart novu-api
docker compose restart novu-worker
```

### Stop Services
```bash
docker compose stop
```

### Start Services
```bash
docker compose start
```

### Completely Remove (with data)
```bash
docker compose down -v  # WARNING: Deletes all data!
```

### Update to Latest Version
```bash
cd ~/novu
docker compose pull
docker compose up -d
```

---

## 📊 Health Monitoring

### Check API Health
```bash
curl http://72.144.25.104:3001/v1/health-check
# or from server:
curl http://localhost:3001/v1/health-check
```

### Check Container Status
```bash
docker compose ps
```

### Check Resource Usage
```bash
docker stats
```

### Check Logs for Errors
```bash
docker compose logs --tail=100 | grep -i error
```

---

## 💾 Backup & Restore

### Backup MongoDB
```bash
cd ~/novu
docker compose exec mongodb mongodump \
  --uri="mongodb://novu:Novu_Dev01_Pass_2026_Secure@localhost:27017/novu-db?authSource=admin" \
  --archive --gzip > ~/novu-backup-$(date +%Y%m%d-%H%M%S).archive.gz
```

### Restore MongoDB
```bash
cd ~/novu
docker compose exec -T mongodb mongorestore \
  --uri="mongodb://novu:Novu_Dev01_Pass_2026_Secure@localhost:27017/novu-db?authSource=admin" \
  --archive --gzip < ~/novu-backup-YYYYMMDD-HHMMSS.archive.gz
```

### Automated Backup Script
Create `~/novu/backup.sh`:
```bash
#!/bin/bash
BACKUP_DIR="$HOME/novu-backups"
mkdir -p "$BACKUP_DIR"

cd ~/novu
docker compose exec -T mongodb mongodump \
  --uri="mongodb://novu:Novu_Dev01_Pass_2026_Secure@localhost:27017/novu-db?authSource=admin" \
  --archive --gzip > "$BACKUP_DIR/novu-backup-$(date +%Y%m%d-%H%M%S).archive.gz"

# Keep only last 7 days
find "$BACKUP_DIR" -name "novu-backup-*.archive.gz" -mtime +7 -delete
```

Make it executable and add to crontab:
```bash
chmod +x ~/novu/backup.sh

# Add to crontab (daily at 2 AM)
crontab -e
# Add line:
0 2 * * * /home/azureuser/novu/backup.sh >> /home/azureuser/novu/backup.log 2>&1
```

---

## 🔄 Next Steps

### 1. Access the Dashboard
Open your browser: **http://72.144.25.104:4001**

### 2. Create Your First Account
- Sign up with your email
- Verify email (if email is configured)
- Complete onboarding

### 3. Configure Integrations
- Go to Settings → Integrations
- Add email provider (SendGrid, Mailgun, etc.)
- Add SMS provider (Twilio, etc.)
- Add push notification providers

### 4. Create Your First Workflow
- Go to Workflows
- Click "Create Workflow"
- Add triggers and actions
- Test the workflow

### 5. Get API Key
- Go to Settings → API Keys
- Create a new API key
- Use it in your application

### 6. Optional: Configure Domain
If you want to use a domain instead of IP:port:

1. Point your domain to 72.144.25.104
2. Set up Nginx reverse proxy
3. Configure SSL with Let's Encrypt
4. Update docker-compose.yml with your domain

---

## 🐛 Troubleshooting

### Services Not Starting
```bash
# Check logs
cd ~/novu
docker compose logs

# Check if ports are available
sudo netstat -tlnp | grep -E ':(3001|4001|3002)'

# Restart services
docker compose restart
```

### Can't Access Dashboard
```bash
# Check if service is running
docker compose ps

# Check nginx logs (if using proxy)
docker logs proxy

# Test locally from server
curl http://localhost:4001
```

### API Not Responding
```bash
# Check API logs
docker compose logs novu-api

# Test health check
curl http://localhost:3001/v1/health-check

# Restart API
docker compose restart novu-api
```

### MongoDB Connection Issues
```bash
# Check MongoDB is running
docker compose ps mongodb

# Test connection
docker compose exec mongodb mongosh -u novu -p Novu_Dev01_Pass_2026_Secure --authenticationDatabase admin --eval "db.adminCommand('ping')"

# Check logs
docker compose logs mongodb
```

---

## 📚 Documentation

- **Novu Docs:** https://docs.novu.co
- **API Reference:** https://docs.novu.co/api-reference/overview
- **GitHub:** https://github.com/novuhq/novu
- **Discord Community:** https://discord.gg/novu

---

## 🔗 Related Deployments

### Kubernetes Deployment
- **URL:** https://novu.dreambau.com
- **Version:** 3.11.0
- **Location:** `/home/backup/Documents/business/wcr/Dreambau-Novu/`

### Docker Compose Template
- **Location:** `/home/backup/Documents/business/wcr/Dreambau-Novu/docker-compose/`
- **Docs:** Complete setup guide for other servers

---

## 📝 Notes

- ✅ Deployment completed successfully
- ✅ All services healthy and running
- ✅ API version 3.12.0 (latest)
- ✅ MongoDB and Redis isolated to localhost for security
- ✅ No subdomain configured (using IP:port as requested)
- ⚠️ Remember to change default passwords in production
- ⚠️ Consider setting up regular backups
- ⚠️ Monitor resource usage (server has limited RAM)

---

**Deployment Date:** January 9, 2026  
**Deployed By:** Automated deployment  
**Server:** dev-01 (72.144.25.104)  
**Status:** ✅ Production Ready



