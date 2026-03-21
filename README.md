# 🚀 InvoiceNinja Professional Kubernetes Deployment

Complete production-ready setup for **InvoiceNinja v5** with **React UI** on **Kubernetes k3s**, featuring automatic SSL certificates, automated backups, and persistent storage.

**Live Demo**: `https://invoice.wcrbusiness.online`

---

## 📋 Table of Contents

- [Features](#-features)
- [Prerequisites](#-prerequisites)
- [Quick Start](#-quick-start-new-server)
- [Project Structure](#-project-structure)
- [Configuration](#️-pre-deployment-configuration)
- [Deployment Methods](#-deployment-methods)
- [Post-Deployment Setup](#-post-deployment-setup)
- [Backup & Restore](#-backup--restore)
- [Common Operations](#-common-operations)
- [Troubleshooting](#-troubleshooting)
- [Security Best Practices](#-security-best-practices)

---

## ✨ Features

✅ **Complete InvoiceNinja v5 with React UI**  
✅ **Kubernetes k3s** - Lightweight production-ready cluster  
✅ **Automatic HTTPS** - Let's Encrypt SSL certificates via cert-manager  
✅ **Persistent Storage** - 25GB total (MySQL + Files + Assets)  
✅ **Automated Backups** - Daily backups with 30-day retention  
✅ **Professional Setup** - Built from source for full customization  
✅ **Production Ready** - Resource limits, health checks, monitoring  
✅ **Scheduled Tasks** - Cron jobs for recurring invoices & reminders  

---

## 📦 Prerequisites

### Server Requirements

- **OS**: Ubuntu 20.04+ or Debian 11+
- **CPU**: 2+ cores (4+ recommended)
- **RAM**: 4GB minimum (8GB+ recommended)
- **Disk**: 50GB+ available space
- **Ports**: 80, 443, 6443 (must be open)
- **Access**: Root or sudo privileges

### Required Before Starting

1. **Domain Name** pointing to your server IP
   ```bash
   # Verify DNS is working
   ping invoice.yourdomain.com
   ```

2. **Server Access**
   ```bash
   ssh user@your-server-ip
   ```

3. **Git installed**
   ```bash
   sudo apt update && sudo apt install -y git
   ```

---

## 🚀 Quick Start (New Server)

### Option 1: Automated Setup (Recommended)

```bash
# 1. Clone repository
cd /home/backup/Documents/business
git clone <your-repo-url> wcr
cd wcr

# 2. Configure (see Configuration section below)
# Edit these files with your domain and passwords:
nano Dreambau-Invoice/config/invoiceninja-secret.yaml
nano Dreambau-Invoice/config/invoiceninja-ingress.yaml
nano Dreambau-Database/mysql/mysql-secret.yaml
nano Dreambau-Kubernetes/manifests/00-letsencrypt-issuer.yaml

# 3. Run automated deployment
chmod +x deploy.sh
sudo ./deploy.sh

# 4. Wait for completion (5-10 minutes)
# The script will output the URL when ready
```

### Option 2: Manual Step-by-Step

See [Deployment Methods](#-deployment-methods) section below.

---

## 📁 Project Structure

```
wcr/
├── README.md                           # This file
├── .gitignore                          # Git ignore rules (DO NOT commit secrets!)
├── BACKUP_INFO.md                      # Backup documentation
│
├── Dreambau-Kubernetes/                     # Kubernetes Infrastructure
│   ├── scripts/
│   │   ├── install-k3s.sh             # k3s installation
│   │   ├── install-cert-manager.sh    # SSL certificate manager
│   │   └── check-status.sh            # System health check
│   └── manifests/
│       ├── 00-letsencrypt-issuer.yaml # SSL certificate issuer
│       └── 01-https-redirect-middleware.yaml # Force HTTPS
│
├── Dreambau-Invoice/                        # InvoiceNinja Application
│   ├── source/                         # InvoiceNinja v5 source code (from GitHub)
│   ├── react-ui/                       # React UI v2 source (from GitHub)
│   ├── docker/
│   │   ├── Dockerfile                  # Custom build with React UI
│   │   ├── build.sh                    # Build Docker image
│   │   └── import-to-k3s.sh           # Import to k3s registry
│   └── config/
│       ├── invoiceninja-deployment.yaml    # Main application deployment
│       ├── invoiceninja-service.yaml       # Kubernetes service
│       ├── invoiceninja-ingress.yaml       # HTTPS ingress
│       ├── invoiceninja-secret.yaml        # ⚠️  Secrets (DO NOT COMMIT!)
│       ├── invoiceninja-pvc.yaml           # Persistent storage
│       ├── invoiceninja-configmap.yaml     # Nginx configuration
│       └── invoiceninja-cronjob.yaml       # Scheduled tasks
│
└── Dreambau-Database/                       # MySQL Database
    ├── mysql/
    │   ├── mysql-deployment.yaml       # Database deployment
    │   ├── mysql-service.yaml          # Database service
    │   ├── mysql-pvc.yaml              # Database storage
    │   └── mysql-secret.yaml           # ⚠️  Database passwords (DO NOT COMMIT!)
    └── backups/
        ├── automated-backup.sh         # Automated backup script
        └── restore-backup.sh           # Restore from backup
```

---

## ⚙️ Pre-Deployment Configuration

**⚠️  CRITICAL: Update these files BEFORE deployment!**

### 1. Generate Secure Keys & Passwords

```bash
# Generate APP_KEY for InvoiceNinja
echo "base64:$(openssl rand -base64 32)"
# Example output: base64:6+cLglUenjzujq5sVx4WaTPpd5MPr5tiyVdeFKxtLE4=

# Generate MySQL passwords
openssl rand -base64 32
# Example output: Dreambau_Ninja_Pass_2024_Change_Me

# Generate MySQL root password
openssl rand -base64 32
# Example output: SuperSecureRootPass2024
```

### 2. Update InvoiceNinja Configuration

**File**: `Dreambau-Invoice/config/invoiceninja-secret.yaml`

```yaml
# REQUIRED CHANGES:
APP_KEY: "base64:YOUR_GENERATED_KEY_HERE"
APP_URL: "https://invoice.yourdomain.com"     # ← Change domain
DB_PASSWORD: "YOUR_GENERATED_PASSWORD_HERE"    # ← Must match MySQL secret

# OPTIONAL (Configure later via web interface):
MAIL_HOST: "smtp.gmail.com"
MAIL_USERNAME: "your-email@gmail.com"
MAIL_PASSWORD: "your-app-password"
```

### 3. Update MySQL Configuration

**File**: `Dreambau-Database/mysql/mysql-secret.yaml`

```yaml
# REQUIRED CHANGES:
MYSQL_ROOT_PASSWORD: "YOUR_ROOT_PASSWORD_HERE"
MYSQL_PASSWORD: "YOUR_GENERATED_PASSWORD_HERE"  # ← Must match InvoiceNinja secret
```

### 4. Update Domain Names

**File**: `Dreambau-Invoice/config/invoiceninja-ingress.yaml`

```yaml
spec:
  tls:
    - hosts:
        - invoice.yourdomain.com  # ← Change to your domain
      secretName: wcrbusiness-online-tls
  rules:
    - host: invoice.yourdomain.com  # ← Change to your domain
```

### 5. Update SSL Certificate Email

**File**: `Dreambau-Kubernetes/manifests/00-letsencrypt-issuer.yaml`

```yaml
spec:
  acme:
    email: your-email@domain.com  # ← Change to your email
```

---

## 🔧 Deployment Methods

### Method 1: Automated Deployment (Recommended)

```bash
cd /home/backup/Documents/business/wcr
sudo ./deploy.sh
```

The script will:
1. ✅ Install k3s Kubernetes cluster
2. ✅ Install cert-manager for SSL
3. ✅ Create namespace `wcr`
4. ✅ Deploy MySQL database
5. ✅ Build InvoiceNinja with React UI
6. ✅ Configure ingress with HTTPS
7. ✅ Set up automated backups
8. ✅ Configure cron jobs

**Estimated time**: 5-10 minutes

### Method 2: Manual Step-by-Step

```bash
# 1. Install k3s
cd Dreambau-Kubernetes/scripts
chmod +x install-k3s.sh
sudo ./install-k3s.sh

# 2. Set kubectl access
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
# Add to ~/.bashrc for permanent:
echo 'export KUBECONFIG=/etc/rancher/k3s/k3s.yaml' >> ~/.bashrc

# 3. Install cert-manager
chmod +x install-cert-manager.sh
./install-cert-manager.sh

# Wait for cert-manager to be ready
kubectl wait --for=condition=ready pod -l app.kubernetes.io/instance=cert-manager -n cert-manager --timeout=120s

# 4. Create namespace
kubectl create namespace wcr

# 5. Apply Let's Encrypt issuer
kubectl apply -f ../manifests/00-letsencrypt-issuer.yaml

# 6. Apply HTTPS redirect
kubectl apply -f ../manifests/01-https-redirect-middleware.yaml

# 7. Deploy MySQL
cd ../../Dreambau-Database/mysql
kubectl apply -f mysql-secret.yaml
kubectl apply -f mysql-pvc.yaml
kubectl apply -f mysql-deployment.yaml
kubectl apply -f mysql-service.yaml

# Wait for MySQL to be ready
kubectl wait --for=condition=ready pod -l app=mysql -n wcr --timeout=120s

# 8. Build InvoiceNinja with React UI
cd ../../Dreambau-Invoice/docker
chmod +x build.sh import-to-k3s.sh
sudo ./build.sh
sudo ./import-to-k3s.sh

# 9. Deploy InvoiceNinja
cd ../config
kubectl apply -f invoiceninja-secret.yaml
kubectl apply -f invoiceninja-pvc.yaml
kubectl apply -f invoiceninja-configmap.yaml
kubectl apply -f invoiceninja-deployment.yaml
kubectl apply -f invoiceninja-service.yaml
kubectl apply -f invoiceninja-ingress.yaml
kubectl apply -f invoiceninja-cronjob.yaml

# 10. Wait for deployment
kubectl wait --for=condition=ready pod -l app=invoiceninja -n wcr --timeout=180s

# 11. Set up automated backups
cd ../../Dreambau-Database/backups
chmod +x automated-backup.sh restore-backup.sh

# Add to crontab for daily 2 AM backups
(crontab -l 2>/dev/null; echo "0 2 * * * /home/backup/Documents/business/wcr/Dreambau-Database/backups/automated-backup.sh >> /home/backup/Documents/business/wcr-backups/backup.log 2>&1") | crontab -

# 12. Check deployment status
cd ../../Dreambau-Kubernetes/scripts
./check-status.sh
```

---

## 🎯 Post-Deployment Setup

### 1. Verify Deployment

```bash
# Check all pods are running
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
kubectl get pods -n wcr

# Expected output:
# NAME                            READY   STATUS    RESTARTS   AGE
# invoiceninja-xxxxxxxxxx-xxxxx   2/2     Running   0          2m
# mysql-xxxxxxxxxx-xxxxx          1/1     Running   0          3m

# Check SSL certificate
kubectl get certificate -n wcr

# Expected: READY = True
```

### 2. Complete InvoiceNinja Setup

1. **Visit**: `https://invoice.yourdomain.com/setup`

2. **Create Admin Account**:
   - Email: your-admin@domain.com
   - Password: (choose a strong password)
   - First Name / Last Name

3. **Complete Setup Wizard**:
   - Company Name: Your Company Name
   - Currency: USD (or your preferred currency)
   - Language: English (or your language)
   - Date Format: MM/DD/YYYY (or your preference)

4. **Configure Email** (Optional - can be done later):
   - Settings → Email Settings
   - Use credentials from `invoiceninja-secret.yaml`

### 3. Access Your InvoiceNinja

**Main Application**: `https://invoice.yourdomain.com`  
**Client Portal**: `https://invoice.yourdomain.com/client/login`  
**Admin Panel**: Settings → User Management

### 4. Verify Cron Jobs

```bash
# Check Kubernetes cron job
kubectl get cronjobs -n wcr

# Check local backup cron
crontab -l

# Test backup manually
/home/backup/Documents/business/wcr/Dreambau-Database/backups/automated-backup.sh
```

---

## 💾 Backup & Restore

### Automated Backups

**Schedule**: Daily at 2:00 AM  
**Retention**: 30 days  
**Location**: `/home/backup/Documents/business/wcr-backups/`

**What's Backed Up**:
- ✅ MySQL database (compressed .sql.gz)
- ✅ Uploaded files & documents (.tar.gz)
- ✅ Configuration secrets (.yaml)

### Manual Backup

```bash
cd /home/backup/Documents/business/wcr/Dreambau-Database/backups
./automated-backup.sh
```

### List Available Backups

```bash
ls -lht /home/backup/Documents/business/wcr-backups/database/
```

Example output:
```
invoiceninja_20251108_210023.sql.gz
invoiceninja_20251107_020000.sql.gz
invoiceninja_20251106_020000.sql.gz
```

### Restore from Backup

```bash
cd /home/backup/Documents/business/wcr/Dreambau-Database/backups
./restore-backup.sh 20251108_210023

# Follow the prompts - type 'yes' to confirm
```

### Backup Storage Details

| Type | Size | Retention |
|------|------|-----------|
| Database | ~75KB (empty) → grows with data | 30 days |
| Files | ~352KB + uploads | 30 days |
| Config | ~10KB | 30 days |

**Persistent Volumes** (Always Protected):
- MySQL: 10GB
- InvoiceNinja Files: 10GB
- Public Assets: 5GB

---

## 🔧 Common Operations

### Check System Status

```bash
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

# Quick status check
cd Dreambau-Kubernetes/scripts
./check-status.sh

# Detailed pod info
kubectl get pods -n wcr -o wide

# Check all resources
kubectl get all -n wcr
```

### View Logs

```bash
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

# InvoiceNinja application logs
kubectl logs -n wcr deployment/invoiceninja -c invoiceninja --tail=100 -f

# Nginx logs
kubectl logs -n wcr deployment/invoiceninja -c nginx --tail=50

# MySQL logs
kubectl logs -n wcr deployment/mysql --tail=50

# Cron job logs
kubectl logs -n wcr job/invoiceninja-scheduler-xxxxx
```

### Restart Services

```bash
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

# Restart InvoiceNinja (zero downtime)
kubectl rollout restart deployment/invoiceninja -n wcr

# Restart MySQL
kubectl rollout restart deployment/mysql -n wcr

# Check restart status
kubectl rollout status deployment/invoiceninja -n wcr
```

### Access Database

```bash
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

# MySQL shell access
kubectl exec -it -n wcr deployment/mysql -- mysql -u ninja -p ninja
# Enter password from mysql-secret.yaml

# Export database
kubectl exec -n wcr deployment/mysql -- mysqldump -u ninja -p'YOUR_PASSWORD' ninja > backup.sql

# Import database
cat backup.sql | kubectl exec -i -n wcr deployment/mysql -- mysql -u ninja -p'YOUR_PASSWORD' ninja
```

### Update InvoiceNinja

```bash
# 1. Pull latest changes
cd /home/backup/Documents/business/wcr/Dreambau-Invoice

# 2. Rebuild Docker image
cd docker
sudo ./build.sh

# 3. Import to k3s
sudo ./import-to-k3s.sh

# 4. Restart deployment
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
kubectl rollout restart deployment/invoiceninja -n wcr

# 5. Run migrations if needed
kubectl exec -n wcr deployment/invoiceninja -c invoiceninja -- php artisan migrate --force

# 6. Clear cache
kubectl exec -n wcr deployment/invoiceninja -c invoiceninja -- php artisan cache:clear
kubectl exec -n wcr deployment/invoiceninja -c invoiceninja -- php artisan config:clear
```

### Scale Application

```bash
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

# Scale to 2 replicas
kubectl scale deployment/invoiceninja -n wcr --replicas=2

# Scale back to 1
kubectl scale deployment/invoiceninja -n wcr --replicas=1

# Check scaling status
kubectl get pods -n wcr
```

---

## 🔍 Troubleshooting

### 1. Pods Not Starting

**Symptoms**: Pods stuck in `Pending`, `CrashLoopBackOff`, or `Error`

```bash
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

# Check pod status
kubectl get pods -n wcr

# Describe pod for events
kubectl describe pod -n wcr <pod-name>

# Check logs
kubectl logs -n wcr <pod-name> -c <container-name>

# Common fixes:
# - Check image exists: sudo k3s ctr images ls | grep invoiceninja
# - Check secrets exist: kubectl get secrets -n wcr
# - Check PVC bound: kubectl get pvc -n wcr
```

### 2. SSL Certificate Not Ready

**Symptoms**: Certificate shows `Ready=False` or site shows "Not Secure"

```bash
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

# Check certificate status
kubectl describe certificate -n wcr

# Check cert-manager logs
kubectl logs -n cert-manager deployment/cert-manager --tail=50

# Common fixes:
# - Verify DNS points to server: nslookup invoice.yourdomain.com
# - Check ports 80/443 open: sudo ufw status
# - Delete and recreate: kubectl delete certificate -n wcr <cert-name>
```

### 3. 500 Internal Server Error

**Symptoms**: Application returns 500 error

```bash
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

# Check application logs
kubectl logs -n wcr deployment/invoiceninja -c invoiceninja --tail=100

# Common causes and fixes:

# 1. APP_KEY not set or invalid
kubectl exec -n wcr deployment/invoiceninja -c invoiceninja -- php artisan key:generate
# Then update invoiceninja-secret.yaml with new key

# 2. Database connection failed
kubectl exec -n wcr deployment/invoiceninja -c invoiceninja -- php artisan migrate:status

# 3. Cache issues
kubectl exec -n wcr deployment/invoiceninja -c invoiceninja -- php artisan cache:clear
kubectl exec -n wcr deployment/invoiceninja -c invoiceninja -- php artisan config:clear

# 4. Permission issues
kubectl exec -n wcr deployment/invoiceninja -c invoiceninja -- chown -R www-data:www-data /var/www/app/storage
```

### 4. React UI Shows White Screen

**Symptoms**: After login, white/dark screen with no content

```bash
# Check if CSS/JS files exist
kubectl exec -n wcr deployment/invoiceninja -c invoiceninja -- ls -la /var/www/app/public/react/

# Check browser console for errors (F12)
# Common issue: CSS files missing

# Solution: Rebuild with React UI
cd /home/backup/Documents/business/wcr/Dreambau-Invoice/docker
sudo ./build.sh
sudo ./import-to-k3s.sh
kubectl rollout restart deployment/invoiceninja -n wcr
```

### 5. Database Connection Failed

**Symptoms**: Can't connect to database, migration errors

```bash
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

# Check MySQL is running
kubectl get pods -n wcr -l app=mysql

# Test connection from InvoiceNinja
kubectl exec -n wcr deployment/invoiceninja -c invoiceninja -- \
  mysql -h mysql.wcr.svc.cluster.local -u ninja -p'YOUR_PASSWORD' -e "SELECT 1"

# Verify credentials match
kubectl get secret mysql-secret -n wcr -o jsonpath='{.data.MYSQL_PASSWORD}' | base64 -d
kubectl get secret invoiceninja-secret -n wcr -o jsonpath='{.data.DB_PASSWORD}' | base64 -d
# These should match!
```

### 6. Backup Failed

**Symptoms**: Backup script errors, missing files

```bash
# Check backup logs
tail -50 /home/backup/Documents/business/wcr-backups/backup.log

# Test backup manually
cd /home/backup/Documents/business/wcr/Dreambau-Database/backups
./automated-backup.sh

# Check disk space
df -h /home/backup/Documents/business/

# Verify cron is running
crontab -l
sudo systemctl status cron
```

---

## 🔐 Security Best Practices

### After Deployment

1. **Change Default Passwords**
   - MySQL root password
   - MySQL user password
   - InvoiceNinja admin password (via web UI)

2. **Update Secrets**
```bash
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

# Edit secrets
kubectl edit secret mysql-secret -n wcr
kubectl edit secret invoiceninja-secret -n wcr

# Restart after changes
kubectl rollout restart deployment/mysql -n wcr
kubectl rollout restart deployment/invoiceninja -n wcr
```

3. **Configure Firewall**
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 6443/tcp  # Kubernetes API
sudo ufw enable
```

4. **Enable Automatic Updates**
```bash
sudo apt install unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

5. **Regular Maintenance**
- ✅ Monitor backup logs weekly
- ✅ Test restore procedures monthly
- ✅ Update InvoiceNinja quarterly
- ✅ Review access logs monthly
- ✅ Audit user accounts monthly

### Backup Strategy

**Primary**: Daily automated backups (30 days)  
**Secondary**: Weekly off-site backups  
**Tertiary**: Monthly full system snapshot

```bash
# Off-site backup example (to remote server)
rsync -avz --delete /home/backup/Documents/business/wcr-backups/ \
  user@remote-server:/backups/wcr/
```

---

## 📞 Support & Resources

### Documentation

- **InvoiceNinja**: https://invoiceninja.github.io/
- **InvoiceNinja Forum**: https://forum.invoiceninja.com/
- **k3s**: https://docs.k3s.io/
- **cert-manager**: https://cert-manager.io/docs/
- **Traefik**: https://doc.traefik.io/traefik/

### GitHub Repositories

- **InvoiceNinja**: https://github.com/invoiceninja/invoiceninja
- **React UI**: https://github.com/invoiceninja/ui
- **k3s**: https://github.com/k3s-io/k3s

### Quick Command Reference

```bash
# Set kubectl config (run in each new terminal)
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

# Check everything
kubectl get all -n wcr

# Shell into pod
kubectl exec -it -n wcr deployment/invoiceninja -c invoiceninja -- bash

# Port forward for debugging
kubectl port-forward -n wcr svc/invoiceninja 8080:80

# View events
kubectl get events -n wcr --sort-by='.lastTimestamp'

# Check resource usage
kubectl top pods -n wcr
kubectl top nodes

# Force delete stuck pod
kubectl delete pod -n wcr <pod-name> --force --grace-period=0
```

---

## 📝 Configuration Files Reference

### Must Update Before Deployment

| File | What to Change | Example |
|------|----------------|---------|
| `Dreambau-Invoice/config/invoiceninja-secret.yaml` | APP_KEY, APP_URL, DB_PASSWORD | `base64:...`, `https://invoice.yourdomain.com` |
| `Dreambau-Invoice/config/invoiceninja-ingress.yaml` | Domain name (2 places) | `invoice.yourdomain.com` |
| `Dreambau-Database/mysql/mysql-secret.yaml` | MYSQL_ROOT_PASSWORD, MYSQL_PASSWORD | Match invoiceninja-secret |
| `Dreambau-Kubernetes/manifests/00-letsencrypt-issuer.yaml` | Email for SSL | `admin@yourdomain.com` |

### Optional Updates

| File | Purpose | Default |
|------|---------|---------|
| `Dreambau-Invoice/config/invoiceninja-pvc.yaml` | App storage size | 10Gi |
| `Dreambau-Database/mysql/mysql-pvc.yaml` | Database size | 10Gi |
| `Dreambau-Invoice/config/invoiceninja-deployment.yaml` | CPU/Memory limits | 500m/1Gi |

---

## ✅ Deployment Checklist

**Before Deployment:**
- [ ] Server meets requirements (CPU, RAM, Disk, Ports)
- [ ] Domain DNS configured and verified
- [ ] Generated new APP_KEY with `openssl rand -base64 32`
- [ ] Generated new database passwords
- [ ] Updated `invoiceninja-secret.yaml` with APP_KEY, domain, passwords
- [ ] Updated `mysql-secret.yaml` with matching passwords
- [ ] Updated `invoiceninja-ingress.yaml` with domain
- [ ] Updated `letsencrypt-issuer.yaml` with email
- [ ] Reviewed `.gitignore` (never commit secrets!)

**During Deployment:**
- [ ] k3s installed successfully
- [ ] cert-manager installed and ready
- [ ] Namespace `wcr` created
- [ ] MySQL deployed and running
- [ ] InvoiceNinja image built from source
- [ ] InvoiceNinja deployed and running
- [ ] Ingress created with HTTPS

**After Deployment:**
- [ ] All pods show `Running` status: `kubectl get pods -n wcr`
- [ ] SSL certificate shows `Ready=True`: `kubectl get certificate -n wcr`
- [ ] Website accessible via HTTPS
- [ ] Completed InvoiceNinja setup wizard
- [ ] Admin account created
- [ ] Cron jobs configured (Kubernetes + local)
- [ ] Automated backups tested
- [ ] Backup cron added to crontab
- [ ] Firewall configured
- [ ] Passwords changed from defaults
- [ ] Email settings configured (optional)

**Production Readiness:**
- [ ] Test backup and restore procedure
- [ ] Document server details (IP, domain, admin email)
- [ ] Set up monitoring/alerts (optional)
- [ ] Configure off-site backups (recommended)
- [ ] Review security settings
- [ ] Create user accounts for team

---

## 📊 Deployment Information

**Date Deployed**: ________________  
**Server IP**: ________________  
**Domain**: ________________  
**Administrator**: ________________  
**Admin Email**: ________________  

**MySQL Details**:
- Database: `ninja`
- Username: `ninja`
- Password: *(stored in mysql-secret)*
- Port: `3306`
- Service: `mysql.wcr.svc.cluster.local`

**Backup Location**: `/home/backup/Documents/business/wcr-backups/`  
**Backup Schedule**: Daily at 2:00 AM  
**Backup Retention**: 30 days  

---

## 📜 License

- **This deployment**: Provided as-is for production use
- **InvoiceNinja**: Elastic License 2.0
- **k3s**: Apache License 2.0
- **cert-manager**: Apache License 2.0

---

## 🎯 Success Criteria

Your deployment is successful when:

✅ Website loads at `https://yourdomain.com` with valid SSL  
✅ Login works and React UI displays properly  
✅ Can create invoices, clients, and payments  
✅ Automated backups run daily  
✅ All pods stay in `Running` state  
✅ Cron jobs execute on schedule  

**Congratulations! You now have a production-ready InvoiceNinja deployment!** 🎉

---

*For issues not covered here, check the Troubleshooting section or visit the InvoiceNinja forum.*
