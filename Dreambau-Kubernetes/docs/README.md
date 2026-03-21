# WCR InvoiceNinja - Professional Kubernetes Deployment

## 📁 Project Structure

```
/home/backup/Documents/business/wcr/
├── Dreambau-Kubernetes/          # Kubernetes infrastructure
│   ├── manifests/           # K8s manifests for SSL and ingress
│   ├── scripts/             # Installation and utility scripts
│   └── docs/                # Documentation (this file)
│
├── Dreambau-Invoice/             # InvoiceNinja application
│   ├── source/              # InvoiceNinja source code (from GitHub)
│   ├── docker/              # Docker build files
│   └── config/              # Kubernetes deployment configs
│
├── Dreambau-Database/            # Database management
│   ├── mysql/               # MySQL deployment files
│   └── backups/             # Backup and restore scripts
│
└── deploy.sh                # Main deployment script
```

## 🎯 Overview

This is a **professional, production-ready** deployment of InvoiceNinja on Kubernetes k3s:

### Key Features:
- ✅ **Source-based deployment** - Built from GitHub for full customization
- ✅ **Custom Docker image** - wcr-invoiceninja with all dependencies
- ✅ **Kubernetes native** - Proper manifests, secrets, and PVCs
- ✅ **Automatic SSL** - Let's Encrypt with cert-manager
- ✅ **Production ready** - Health checks, resource limits, persistence
- ✅ **Easy maintenance** - Backup, restore, monitoring scripts

## 🚀 Quick Start

### Prerequisites
- Linux server (Ubuntu 20.04+ recommended)
- 4GB RAM, 2 CPU cores minimum
- 40GB disk space
- Domain pointing to server IP (wcrbusiness.online)
- Ports 80 and 443 open

### Installation (5 Steps)

#### 1. Install k3s
```bash
cd /home/backup/Documents/business/wcr
sudo bash Dreambau-Kubernetes/scripts/install-k3s.sh
```

#### 2. Install cert-manager
```bash
sudo bash Dreambau-Kubernetes/scripts/install-cert-manager.sh
```

#### 3. Build InvoiceNinja Custom Image
```bash
cd Dreambau-Invoice/docker
bash build.sh
bash import-to-k3s.sh
```

#### 4. Configure Secrets
```bash
# Generate APP_KEY
echo "base64:$(openssl rand -base64 32)"

# Edit configuration files
nano Dreambau-Database/mysql/mysql-secret.yaml
# Change: MYSQL_ROOT_PASSWORD, MYSQL_PASSWORD

nano Dreambau-Invoice/config/invoiceninja-secret.yaml
# Set: APP_KEY, DB_PASSWORD (match MySQL), MAIL_* settings

nano Dreambau-Kubernetes/manifests/00-letsencrypt-issuer.yaml
# Change: email address
```

#### 5. Deploy Everything
```bash
cd /home/backup/Documents/business/wcr
sudo bash deploy.sh
```

#### 6. Initialize Database
```bash
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
kubectl exec -it -n wcr deployment/invoiceninja -c invoiceninja \
  -- php artisan migrate:fresh --seed
```

### Access Application
- **URL:** https://wcrbusiness.online
- **Default Login:** admin@example.com / changeme
- **⚠️ Change password immediately!**

## 📋 Complete Workflow

### Phase 1: Infrastructure Setup
```bash
# Install Kubernetes
sudo bash Dreambau-Kubernetes/scripts/install-k3s.sh

# Install certificate manager
sudo bash Dreambau-Kubernetes/scripts/install-cert-manager.sh
```

### Phase 2: Build Custom Application
```bash
# InvoiceNinja source is already cloned from GitHub
cd Dreambau-Invoice/source
git pull  # Update to latest version

# Build custom Docker image
cd ../docker
bash build.sh

# Import to k3s
bash import-to-k3s.sh
```

### Phase 3: Configure
```bash
# Generate APP_KEY
echo "base64:$(openssl rand -base64 32)"

# Update secrets with your values
nano Dreambau-Database/mysql/mysql-secret.yaml
nano Dreambau-Invoice/config/invoiceninja-secret.yaml
nano Dreambau-Kubernetes/manifests/00-letsencrypt-issuer.yaml
```

### Phase 4: Deploy
```bash
# Run main deployment
sudo bash deploy.sh

# Initialize database
kubectl exec -it -n wcr deployment/invoiceninja -c invoiceninja \
  -- php artisan migrate:fresh --seed
```

## 🔧 Daily Operations

### Check System Status
```bash
bash Dreambau-Kubernetes/scripts/check-status.sh
```

### View Logs
```bash
# InvoiceNinja logs
kubectl logs -n wcr deployment/invoiceninja -c invoiceninja -f

# MySQL logs
kubectl logs -n wcr deployment/mysql -f

# Nginx logs
kubectl logs -n wcr deployment/invoiceninja -c nginx -f
```

### Backup Database
```bash
bash Dreambau-Database/backups/backup.sh
```

### Restore Database
```bash
bash Dreambau-Database/backups/restore.sh /path/to/backup.sql.gz
```

### Restart Application
```bash
kubectl rollout restart deployment/invoiceninja -n wcr
```

### Update InvoiceNinja
```bash
# Update source code
cd Dreambau-Invoice/source
git pull

# Rebuild image
cd ../docker
bash build.sh
bash import-to-k3s.sh

# Update deployment
kubectl rollout restart deployment/invoiceninja -n wcr
```

## 🎨 Customization

### Modify InvoiceNinja Code
```bash
# Edit source files
cd Dreambau-Invoice/source
# Make your changes...

# Rebuild and deploy
cd ../docker
bash build.sh
bash import-to-k3s.sh
kubectl rollout restart deployment/invoiceninja -n wcr
```

### Adjust Resources
```bash
# Edit deployment
nano Dreambau-Invoice/config/invoiceninja-deployment.yaml

# Update
kubectl apply -f Dreambau-Invoice/config/invoiceninja-deployment.yaml
```

### Add Custom Nginx Configuration
```bash
# Edit config
nano Dreambau-Invoice/config/invoiceninja-configmap.yaml

# Apply
kubectl apply -f Dreambau-Invoice/config/invoiceninja-configmap.yaml
kubectl rollout restart deployment/invoiceninja -n wcr
```

## 🔒 Security Checklist

- [ ] Changed all default passwords
- [ ] Generated unique APP_KEY
- [ ] Configured SMTP settings
- [ ] Updated Let's Encrypt email
- [ ] SSL certificate issued successfully
- [ ] Changed default admin password
- [ ] Enabled 2FA in InvoiceNinja
- [ ] Set up automated backups
- [ ] Tested backup restoration

## 📊 Architecture

```
Internet
    ↓
Traefik Ingress (SSL + Routing)
    ↓
InvoiceNinja Service
    ↓
InvoiceNinja Pod
    ├── Nginx Container (port 80)
    └── PHP-FPM Container (port 9000)
        └── Custom wcr-invoiceninja:latest
            └── Source from GitHub
    ↓
MySQL Service
    └── MySQL Pod (persistent storage)
```

## 🛠️ Troubleshooting

### Image Not Found
```bash
# Verify image in k3s
sudo k3s ctr images ls | grep wcr-invoiceninja

# If missing, rebuild and import
cd Dreambau-Invoice/docker
bash build.sh
bash import-to-k3s.sh
```

### Pod Not Starting
```bash
# Check pod status
kubectl get pods -n wcr

# View logs
kubectl logs -n wcr <pod-name> -c invoiceninja
kubectl describe pod -n wcr <pod-name>
```

### SSL Certificate Issues
```bash
# Check certificate
kubectl get certificate -n wcr
kubectl describe certificate wcrbusiness-online-tls -n wcr

# Check cert-manager
kubectl logs -n cert-manager deployment/cert-manager -f
```

### Database Connection Failed
```bash
# Verify MySQL is running
kubectl get pods -n wcr | grep mysql

# Test connection
kubectl exec -it -n wcr deployment/invoiceninja -c invoiceninja \
  -- nc -zv mysql.wcr.svc.cluster.local 3306

# Check passwords match
kubectl get secret mysql-secret -n wcr -o yaml
kubectl get secret invoiceninja-secret -n wcr -o yaml
```

## 📚 Documentation Files

| File | Description |
|------|-------------|
| `Dreambau-Kubernetes/docs/README.md` | This file - main documentation |
| `Dreambau-Invoice/docker/build.sh` | Build custom InvoiceNinja image |
| `deploy.sh` | Main deployment orchestration |
| `Dreambau-Database/backups/backup.sh` | Database backup script |

## 🔄 Maintenance Schedule

### Daily
- Monitor application health
- Check logs for errors

### Weekly
- Run database backup
- Review disk space
- Check for updates

### Monthly
- Update InvoiceNinja
- Rotate credentials (optional)
- Test backup restoration

## 📞 Support

- **InvoiceNinja:** https://github.com/invoiceninja/invoiceninja
- **k3s:** https://docs.k3s.io/
- **Kubernetes:** https://kubernetes.io/docs/

## 🎉 Success Criteria

Your deployment is successful when:

- [ ] All pods running: `kubectl get pods -n wcr`
- [ ] Certificate ready: `kubectl get certificate -n wcr` (READY=True)
- [ ] Application accessible at https://wcrbusiness.online
- [ ] Can login and create invoices
- [ ] Email sending works
- [ ] Backup script runs successfully

---

**Version:** 1.0.0  
**Last Updated:** November 2024  
**Project:** WCR Business - InvoiceNinja Self-Hosted

