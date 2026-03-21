# Novu Docker Compose Setup Guide

Complete guide for deploying Novu v3.11.0 using Docker Compose on any server.

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Reverse Proxy Setup](#reverse-proxy-setup)
- [Monitoring](#monitoring)
- [Backup & Restore](#backup--restore)
- [Troubleshooting](#troubleshooting)

## 🎯 Prerequisites

### System Requirements

- **OS:** Ubuntu 20.04+ / Debian 11+ / CentOS 8+
- **CPU:** 2+ cores recommended
- **RAM:** 4GB minimum, 8GB recommended
- **Storage:** 20GB minimum
- **Docker:** 20.10+ 
- **Docker Compose:** 2.0+

### Install Docker & Docker Compose

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add your user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Install Docker Compose (if not already included)
sudo apt install docker-compose-plugin -y

# Verify installation
docker --version
docker compose version
```

## 🚀 Quick Start

### 1. Create Project Directory

```bash
# Create directory structure
mkdir -p ~/novu-docker
cd ~/novu-docker

# Download docker-compose.yml
wget https://raw.githubusercontent.com/yourusername/novu-docker/main/docker-compose.yml

# Or copy from this repository
cp /path/to/Dreambau-Novu/docker-compose/docker-compose.yml .
cp /path/to/Dreambau-Novu/docker-compose/.env.example .env
```

### 2. Configure Environment

```bash
# Edit the .env file or docker-compose.yml directly
nano docker-compose.yml

# IMPORTANT: Change these values:
# - All instances of "novu.yourdomain.com" to your actual domain
# - MongoDB password (MONGO_INITDB_ROOT_PASSWORD)
# - JWT secrets (generate new ones for security)
```

### 3. Generate Security Secrets

```bash
# Generate JWT_SECRET (64 characters)
openssl rand -hex 32

# Generate STORE_ENCRYPTION_KEY (32 characters - EXACTLY 32!)
openssl rand -hex 16

# Generate NOVU_SECRET_KEY (64 characters)
openssl rand -hex 32

# Update these values in docker-compose.yml
```

### 4. Start Novu

```bash
# Pull latest images
docker compose pull

# Start services in detached mode
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f
```

## ⚙️ Configuration

### Domain Configuration

Replace all instances of `novu.yourdomain.com` with your actual domain:

```yaml
environment:
  HOST_NAME: "https://novu.yourdomain.com"
  API_ROOT_URL: "https://novu.yourdomain.com"
  FRONT_BASE_URL: "https://novu.yourdomain.com"
  VITE_API_HOSTNAME: "https://novu.yourdomain.com"
  VITE_WEBSOCKET_HOSTNAME: "https://novu.yourdomain.com"
```

### Security Configuration

**⚠️ CRITICAL:** Always change default passwords and secrets in production!

1. **MongoDB Password:** Change `Novu_Mongo_Pass_2024_Change_Me` to a strong password
2. **JWT_SECRET:** Use a random 64-character hex string
3. **STORE_ENCRYPTION_KEY:** Use a random 32-character hex string (EXACTLY 32 chars!)
4. **NOVU_SECRET_KEY:** Use a random 64-character hex string

### Port Mapping

Default ports:
- **MongoDB:** 27017
- **Redis:** 6379
- **API:** 3000
- **WebSocket:** 3002
- **Dashboard:** 4000

To change ports, modify the `ports` section in docker-compose.yml:

```yaml
ports:
  - "YOUR_PORT:3000"  # API
  - "YOUR_PORT:4000"  # Dashboard
```

## 🌐 Reverse Proxy Setup

### Option 1: Nginx

Create `/etc/nginx/sites-available/novu`:

```nginx
upstream novu-api {
    server localhost:3000;
}

upstream novu-ws {
    server localhost:3002;
}

upstream novu-web {
    server localhost:4000;
}

server {
    listen 80;
    listen [::]:80;
    server_name novu.yourdomain.com;
    
    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name novu.yourdomain.com;

    # SSL Configuration (Use certbot to generate)
    ssl_certificate /etc/letsencrypt/live/novu.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/novu.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # API endpoints
    location ~ ^/(v1|v2|api)/ {
        proxy_pass http://novu-api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket endpoints
    location ~ ^/(ws|socket.io)/ {
        proxy_pass http://novu-ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Web dashboard
    location / {
        proxy_pass http://novu-web;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Increase body size for file uploads
    client_max_body_size 100M;
}
```

Enable and restart Nginx:

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/novu /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx

# Get SSL certificate
sudo certbot --nginx -d novu.yourdomain.com
```

### Option 2: Traefik

Create `docker-compose.traefik.yml`:

```yaml
version: '3.8'

services:
  traefik:
    image: traefik:v2.10
    container_name: traefik
    restart: unless-stopped
    command:
      - "--api.insecure=true"
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.tlschallenge=true"
      - "--certificatesresolvers.letsencrypt.acme.email=your-email@example.com"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
    ports:
      - "80:80"
      - "443:443"
      - "8080:8080"
    volumes:
      - "/var/run/docker.sock:/var/run/docker.sock:ro"
      - "./letsencrypt:/letsencrypt"
    networks:
      - novu-network

  novu-web:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.novu.rule=Host(`novu.yourdomain.com`)"
      - "traefik.http.routers.novu.entrypoints=websecure"
      - "traefik.http.routers.novu.tls.certresolver=letsencrypt"
      - "traefik.http.services.novu.loadbalancer.server.port=4000"
```

## 📊 Monitoring

### Check Service Status

```bash
# View all services
docker compose ps

# Check logs
docker compose logs -f

# Check specific service
docker compose logs -f novu-api
docker compose logs -f novu-worker
docker compose logs -f mongodb

# Check resource usage
docker stats
```

### Health Checks

```bash
# API health check
curl http://localhost:3000/v1/health-check

# Or via domain (if configured)
curl https://novu.yourdomain.com/v1/health-check
```

### Access MongoDB

```bash
# Connect to MongoDB
docker compose exec mongodb mongosh -u novu -p Novu_Mongo_Pass_2024_Change_Me --authenticationDatabase admin

# Check databases
show dbs
use novu-db
show collections
```

### Access Redis

```bash
# Connect to Redis
docker compose exec redis redis-cli

# Test connection
ping
# Response: PONG

# Check keys
keys *
```

## 💾 Backup & Restore

### MongoDB Backup

```bash
# Create backup directory
mkdir -p ~/novu-backups

# Backup MongoDB
docker compose exec mongodb mongodump \
  --uri="mongodb://novu:Novu_Mongo_Pass_2024_Change_Me@localhost:27017/novu-db?authSource=admin" \
  --archive > ~/novu-backups/novu-backup-$(date +%Y%m%d-%H%M%S).archive

# Backup with gzip compression
docker compose exec mongodb mongodump \
  --uri="mongodb://novu:Novu_Mongo_Pass_2024_Change_Me@localhost:27017/novu-db?authSource=admin" \
  --archive --gzip > ~/novu-backups/novu-backup-$(date +%Y%m%d-%H%M%S).archive.gz
```

### MongoDB Restore

```bash
# Restore from backup
docker compose exec -T mongodb mongorestore \
  --uri="mongodb://novu:Novu_Mongo_Pass_2024_Change_Me@localhost:27017/novu-db?authSource=admin" \
  --archive < ~/novu-backups/novu-backup-YYYYMMDD-HHMMSS.archive

# Restore from gzipped backup
docker compose exec -T mongodb mongorestore \
  --uri="mongodb://novu:Novu_Mongo_Pass_2024_Change_Me@localhost:27017/novu-db?authSource=admin" \
  --archive --gzip < ~/novu-backups/novu-backup-YYYYMMDD-HHMMSS.archive.gz
```

### Automated Backup Script

Create `backup.sh`:

```bash
#!/bin/bash

# Configuration
BACKUP_DIR="$HOME/novu-backups"
RETENTION_DAYS=30

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup filename
BACKUP_FILE="$BACKUP_DIR/novu-backup-$(date +%Y%m%d-%H%M%S).archive.gz"

# Create backup
echo "Creating backup: $BACKUP_FILE"
docker compose exec -T mongodb mongodump \
  --uri="mongodb://novu:Novu_Mongo_Pass_2024_Change_Me@localhost:27017/novu-db?authSource=admin" \
  --archive --gzip > "$BACKUP_FILE"

# Check if backup was successful
if [ $? -eq 0 ]; then
    echo "Backup completed successfully: $BACKUP_FILE"
    
    # Delete backups older than retention period
    echo "Removing backups older than $RETENTION_DAYS days..."
    find "$BACKUP_DIR" -name "novu-backup-*.archive.gz" -mtime +$RETENTION_DAYS -delete
else
    echo "Backup failed!"
    exit 1
fi
```

Make it executable and add to crontab:

```bash
# Make executable
chmod +x backup.sh

# Add to crontab (daily at 2 AM)
crontab -e
# Add line:
0 2 * * * /path/to/backup.sh >> /path/to/backup.log 2>&1
```

## 🔧 Management Commands

### Start/Stop Services

```bash
# Start all services
docker compose up -d

# Stop all services
docker compose down

# Restart specific service
docker compose restart novu-api
docker compose restart novu-worker

# Stop without removing containers
docker compose stop

# Start stopped containers
docker compose start
```

### Update Novu

```bash
# Pull latest images
docker compose pull

# Recreate containers with new images
docker compose up -d

# Or force recreate
docker compose up -d --force-recreate
```

### Scale Services

```bash
# Scale worker to 3 instances
docker compose up -d --scale novu-worker=3

# Scale API to 2 instances
docker compose up -d --scale novu-api=2
```

### Clean Up

```bash
# Remove stopped containers
docker compose rm

# Remove volumes (WARNING: Deletes all data!)
docker compose down -v

# Remove images
docker compose down --rmi all
```

## 🐛 Troubleshooting

### Pods Not Starting

```bash
# Check container status
docker compose ps

# View logs
docker compose logs novu-api
docker compose logs novu-worker

# Check container resource usage
docker stats

# Inspect container
docker compose exec novu-api sh
```

### MongoDB Connection Issues

```bash
# Test MongoDB connection
docker compose exec mongodb mongosh -u novu -p Novu_Mongo_Pass_2024_Change_Me --authenticationDatabase admin --eval "db.adminCommand('ping')"

# Check MongoDB logs
docker compose logs mongodb

# Verify MongoDB is listening
docker compose exec mongodb netstat -tlnp | grep 27017
```

### Redis Connection Issues

```bash
# Test Redis
docker compose exec redis redis-cli ping

# Check Redis logs
docker compose logs redis
```

### API Not Responding

```bash
# Check API logs
docker compose logs novu-api --tail=100

# Check if API is listening
curl http://localhost:3000/v1/health-check

# Check container status
docker compose ps novu-api

# Restart API
docker compose restart novu-api
```

### High Memory Usage

```bash
# Check resource usage
docker stats

# Adjust limits in docker-compose.yml
# Add or modify:
deploy:
  resources:
    limits:
      memory: 512M
    reservations:
      memory: 256M
```

### Network Issues

```bash
# Check network
docker network ls
docker network inspect novu-docker_novu-network

# Recreate network
docker compose down
docker compose up -d
```

### View Container Logs in Real-Time

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f novu-api

# Last 100 lines
docker compose logs --tail=100 novu-api
```

## 📚 Additional Resources

- **Novu Documentation:** https://docs.novu.co
- **GitHub Repository:** https://github.com/novuhq/novu
- **API Reference:** https://docs.novu.co/api-reference/overview
- **Community Discord:** https://discord.gg/novu

## 🔐 Security Best Practices

1. **Change all default passwords** before deploying to production
2. **Use strong, randomly generated secrets** for JWT and encryption keys
3. **Enable firewall** and only expose necessary ports
4. **Use SSL/TLS** for all external connections
5. **Regular backups** of MongoDB data
6. **Keep Docker images updated** regularly
7. **Monitor logs** for suspicious activity
8. **Limit resource usage** to prevent DoS

## 📝 Version Information

- **Novu Version:** 3.11.0 (latest)
- **MongoDB Version:** 8.0.3
- **Redis Version:** Alpine (latest)
- **Node.js Version:** 20.18.1 (in Novu containers)
- **Docker Compose Version:** 3.8

## 📧 Support

For issues specific to this setup, please refer to:
- Novu official documentation
- Docker documentation
- Your server administrator

---

**Created:** January 2026  
**Last Updated:** January 2026  
**Maintained By:** WCR Business / Dreambau Team



