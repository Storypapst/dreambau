# Novu Docker Compose - Quick Start Guide

## 🎯 Current Version Running

**Novu Version:** 3.11.0  
**MongoDB Version:** 8.0.3  
**Redis Version:** Alpine (latest)  
**Node.js Version:** 20.18.1

## 🚀 Quick Deployment (5 Minutes)

### Step 1: Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker
```

### Step 2: Download Files

```bash
# Create directory
mkdir ~/novu && cd ~/novu

# Copy files from this repository
cp /path/to/Dreambau-Novu/docker-compose/* .
```

### Step 3: Run Setup Script

```bash
# Run automated setup
./setup.sh

# Or manual setup:
nano docker-compose.yml
# Change "novu.yourdomain.com" to your actual domain
# Change MongoDB password
# Generate new secrets (see below)

# Start services
docker compose up -d
```

### Step 4: Configure Nginx

```bash
# Copy nginx config
sudo cp nginx-example.conf /etc/nginx/sites-available/novu
sudo nano /etc/nginx/sites-available/novu
# Update server_name to your domain

# Enable site
sudo ln -s /etc/nginx/sites-available/novu /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Get SSL certificate
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d novu.yourdomain.com
```

### Step 5: Access Novu

Open your browser: `https://novu.yourdomain.com`

## 🔐 Security: Generate New Secrets

```bash
# JWT_SECRET (64 characters)
openssl rand -hex 32

# STORE_ENCRYPTION_KEY (32 characters - EXACTLY 32!)
openssl rand -hex 16

# NOVU_SECRET_KEY (64 characters)
openssl rand -hex 32
```

Update these in `docker-compose.yml` before starting!

## 📋 Essential Commands

```bash
# Start services
docker compose up -d

# Stop services
docker compose down

# View logs
docker compose logs -f

# Check status
docker compose ps

# Restart service
docker compose restart novu-api

# Backup MongoDB
docker compose exec mongodb mongodump \
  --uri="mongodb://novu:YOUR_PASSWORD@localhost:27017/novu-db?authSource=admin" \
  --archive --gzip > backup-$(date +%Y%m%d).archive.gz
```

## 📂 File Structure

```
novu/
├── docker-compose.yml      # Main configuration
├── .env.example            # Environment variables template
├── setup.sh               # Automated setup script
├── nginx-example.conf     # Nginx reverse proxy config
├── README.md              # Detailed documentation
└── QUICKSTART.md          # This file
```

## 🔧 Customization

### Change Ports

Edit `docker-compose.yml`:

```yaml
ports:
  - "8080:3000"  # API on port 8080
  - "8081:4000"  # Dashboard on port 8081
```

### Scale Workers

```bash
# Run 3 worker instances
docker compose up -d --scale novu-worker=3
```

### Use External Database

Edit `docker-compose.yml` and remove `mongodb` service:

```yaml
environment:
  MONGO_URL: "mongodb://user:pass@external-host:27017/novu-db?authSource=admin"
```

## 🐛 Troubleshooting

### Services won't start

```bash
# Check logs
docker compose logs

# Check if ports are in use
sudo netstat -tlnp | grep -E '3000|4000|27017'

# Restart services
docker compose restart
```

### Can't connect to API

```bash
# Test API locally
curl http://localhost:3000/v1/health-check

# Check nginx is proxying
sudo nginx -t
sudo systemctl status nginx
```

### MongoDB authentication error

```bash
# Check MongoDB password matches in all environment variables
grep -r "Mongo_Pass" docker-compose.yml

# Connect to MongoDB manually
docker compose exec mongodb mongosh -u novu -p YOUR_PASSWORD --authenticationDatabase admin
```

## 📊 Monitoring

### Health Check

```bash
# API
curl https://novu.yourdomain.com/v1/health-check

# Or local
curl http://localhost:3000/v1/health-check
```

### Resource Usage

```bash
docker stats
```

## 💾 Backup & Restore

### Create Backup

```bash
# Backup to file
docker compose exec mongodb mongodump \
  --uri="mongodb://novu:YOUR_PASSWORD@localhost:27017/novu-db?authSource=admin" \
  --archive --gzip > novu-backup.archive.gz
```

### Restore Backup

```bash
# Restore from file
docker compose exec -T mongodb mongorestore \
  --uri="mongodb://novu:YOUR_PASSWORD@localhost:27017/novu-db?authSource=admin" \
  --archive --gzip < novu-backup.archive.gz
```

## 🔗 Important URLs

After deployment, these endpoints will be available:

- **Dashboard:** https://novu.yourdomain.com
- **API:** https://novu.yourdomain.com/v1/
- **Health Check:** https://novu.yourdomain.com/v1/health-check
- **WebSocket:** wss://novu.yourdomain.com/ws

## 📚 Next Steps

1. **Create your first workflow** in the dashboard
2. **Get API key** from Settings → API Keys
3. **Set up integrations** (Email, SMS, Push providers)
4. **Test notifications** using the API
5. **Set up automated backups** (see README.md)

## 📖 Full Documentation

For detailed information, see:
- `README.md` - Complete setup guide
- Official Novu docs: https://docs.novu.co

## 🆘 Need Help?

- Check logs: `docker compose logs -f`
- Review README.md for detailed troubleshooting
- Novu Discord: https://discord.gg/novu
- GitHub Issues: https://github.com/novuhq/novu/issues

---

**Version:** 3.11.0  
**Last Updated:** January 2026



