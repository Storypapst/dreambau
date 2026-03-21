## 🗄️ NocoDB - No-Code Database Platform

Professional deployment of NocoDB on Kubernetes, integrated with existing MySQL infrastructure.

---

## 📋 What is NocoDB?

NocoDB transforms your relational databases into smart spreadsheets with:
- **Spreadsheet Interface** - Excel/Airtable-like UI for databases
- **Automatic APIs** - REST & GraphQL APIs generated automatically
- **Collaboration** - Multi-user access with permissions
- **No-Code** - Build applications without writing code
- **Self-Hosted** - Full data ownership and privacy

---

## ✨ Features

✅ **Production-Ready Deployment** - Health checks, resource limits, monitoring  
✅ **MySQL Integration** - Uses existing MySQL server (shared with InvoiceNinja)  
✅ **Automatic HTTPS** - Let's Encrypt SSL certificates  
✅ **Persistent Storage** - 10GB for attachments and cache  
✅ **Automated Backups** - Integrated with centralized backup system  
✅ **Professional Architecture** - Follows established patterns  

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│              k3s Cluster                        │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌──────────────┐         ┌─────────────────┐  │
│  │   NocoDB     │────────→│     MySQL       │  │
│  │ (Interface)  │         │                 │  │
│  │              │         │  Databases:     │  │
│  │ Port: 8080   │         │  • ninja        │  │
│  └──────┬───────┘         │  • n8n          │  │
│         │                 │  • nocodb  ←────┤  │
│         │                 └─────────────────┘  │
│         │                                       │
│  ┌──────▼───────┐                              │
│  │   Ingress    │                              │
│  │   (Traefik)  │                              │
│  │              │                              │
│  │ HTTPS + SSL  │                              │
│  └──────────────┘                              │
│         │                                       │
└─────────┼───────────────────────────────────────┘
          │
          ▼
   https://nocodb.wcrbusiness.online
```

---

## 📁 Project Structure

```
Dreambau-NocoDB/
├── README.md                          # This file
├── scripts/
│   ├── init-database.sh               # Creates nocodb database in MySQL
│   └── deploy-nocodb.sh               # Deploys NocoDB to k8s
├── config/
│   ├── nocodb-secret.yaml             # ⚠️  Configuration (DO NOT COMMIT!)
│   ├── nocodb-secret.yaml.example     # Template for new servers
│   ├── nocodb-pvc.yaml                # Persistent storage (10GB)
│   ├── nocodb-deployment.yaml         # NocoDB deployment & service
│   └── nocodb-ingress.yaml            # HTTPS ingress configuration
└── docs/
    └── (additional documentation)
```

---

## 🚀 Deployment

### Prerequisites
- k3s cluster running
- MySQL deployed in `wcr` namespace
- cert-manager installed
- Domain `nocodb.wcrbusiness.online` configured

### Step 1: Generate Secure Credentials

```bash
# Generate JWT secret
openssl rand -base64 32
# Save output: _______________________________

# Database password already set to: NocoDB_Pass_2024_Change_Me
# (or generate new one if preferred)
```

### Step 2: Update Configuration

```bash
cd /home/backup/Documents/business/wcr/Dreambau-NocoDB

# Edit secret file
nano config/nocodb-secret.yaml

# Update:
#  - NC_AUTH_JWT_SECRET (from step 1)
#  - NC_ADMIN_EMAIL (your email)
#  - NC_ADMIN_PASSWORD (secure password)
#  - DB_PASSWORD (if changed)
```

### Step 3: Initialize Database

```bash
# Create nocodb database and user in MySQL
chmod +x scripts/init-database.sh
sudo ./scripts/init-database.sh
```

**What this does:**
- Creates `nocodb` database in existing MySQL
- Creates `nocodb` user with appropriate privileges
- Tests database connection

### Step 4: Deploy NocoDB

```bash
# Deploy NocoDB application
chmod +x scripts/deploy-nocodb.sh
sudo ./scripts/deploy-nocodb.sh
```

**Deployment includes:**
- Secret configuration
- Persistent volume (10GB)
- NocoDB deployment
- ClusterIP service
- HTTPS ingress
- SSL certificate

### Step 5: Access NocoDB

Visit: **https://nocodb.wcrbusiness.online**

**First Login:**
- Email: (from `NC_ADMIN_EMAIL`)
- Password: (from `NC_ADMIN_PASSWORD`)

**⚠️  IMPORTANT: Change admin password immediately after first login!**

---

## ⚙️ Configuration

### Database Connection

NocoDB connects to your existing MySQL server:

```
Host: mysql.wcr.svc.cluster.local
Port: 3306
Database: nocodb
User: nocodb
Password: (configured in secret)
```

**Same MySQL server** used by:
- InvoiceNinja (`ninja` database)
- NocoDB (`nocodb` database)

### Resource Allocation

**NocoDB Application:**
- CPU: 250m (request) / 1000m (limit)
- Memory: 512Mi (request) / 2Gi (limit)
- Storage: 10Gi (PVC for attachments/cache)

**MySQL Database:**
- Shared with existing applications
- `nocodb` database for NocoDB metadata and user data

---

## 🔧 Common Operations

### Check Status

```bash
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

# Check pod status
kubectl get pods -n wcr -l app=nocodb

# Check all NocoDB resources
kubectl get pods,svc,ingress,pvc,certificate -n wcr -l app=nocodb

# Check database
kubectl exec -n wcr deployment/mysql -- mysql -u nocodb -p'NocoDB_Pass_2024_Change_Me' nocodb -e "SHOW TABLES;"
```

### View Logs

```bash
# Application logs
kubectl logs -n wcr -l app=nocodb -f

# Previous logs (if pod crashed)
kubectl logs -n wcr -l app=nocodb --previous

# Check specific pod
kubectl logs -n wcr <pod-name>
```

### Restart Service

```bash
# Restart NocoDB
kubectl rollout restart deployment/nocodb -n wcr

# Check restart status
kubectl rollout status deployment/nocodb -n wcr

# Force delete and recreate pod
kubectl delete pod -n wcr -l app=nocodb
```

### Access Database Directly

```bash
# MySQL shell access
kubectl exec -it -n wcr deployment/mysql -- mysql -u nocodb -p'NocoDB_Pass_2024_Change_Me' nocodb

# Check NocoDB tables
SHOW TABLES;

# Check projects (bases)
SELECT * FROM nc_projects;

# Check users
SELECT * FROM nc_users;

# Exit
\q
```

### Backup & Restore

NocoDB is automatically included in centralized backups:

```bash
# Manual backup (includes NocoDB)
/home/backup/Documents/business/wcr/Dreambau-Database/backups/automated-backup.sh

# List backups
ls -lh /home/backup/Documents/business/wcr-backups/database/nocodb_*

# Restore NocoDB database
gunzip -c wcr-backups/database/nocodb_20251108_*.sql.gz | \
  kubectl exec -i -n wcr deployment/mysql -- \
  mysql -u nocodb -p'NocoDB_Pass_2024_Change_Me' nocodb
```

---

## 🔗 Integration

### With InvoiceNinja

Use NocoDB to manage:
- Custom client data
- Extended invoice metadata
- Business analytics tables
- Custom workflows data

**Connect via API:**
```javascript
// In n8n or custom scripts
const nocodb = 'https://nocodb.wcrbusiness.online/api/v1'
const token = 'your-api-token'
```

### With n8n

NocoDB has official n8n integration:

1. In n8n, add "NocoDB" node
2. Add credentials:
   - URL: `https://nocodb.wcrbusiness.online`
   - API Token: (get from NocoDB Settings → Tokens)
3. Automate:
   - Data synchronization
   - Form submissions
   - Workflow triggers
   - Report generation

---

## 🔍 Troubleshooting

### Pod Not Starting

```bash
# Check pod events
kubectl describe pod -n wcr -l app=nocodb

# Check logs
kubectl logs -n wcr -l app=nocodb --tail=100

# Common issues:
# 1. Database not created - run init-database.sh
# 2. Wrong password - check secret matches database
# 3. MySQL not ready - wait for MySQL pod
```

### Database Connection Failed

```bash
# Test MySQL connectivity
kubectl exec -n wcr deployment/nocodb -- \
  nc -zv mysql.wcr.svc.cluster.local 3306

# Test database login
kubectl exec -n wcr deployment/mysql -- \
  mysql -u nocodb -p'NocoDB_Pass_2024_Change_Me' -e "SELECT 1;" nocodb

# Check if database exists
kubectl exec -n wcr deployment/mysql -- \
  mysql -u root -p'WCR_Root_Pass_2024_Change_Me' -e "SHOW DATABASES;" | grep nocodb
```

### SSL Certificate Not Ready

```bash
# Check certificate status
kubectl get certificate -n wcr | grep nocodb
kubectl describe certificate -n wcr nocodb-wcrbusiness-online-tls

# Check cert-manager logs
kubectl logs -n cert-manager deployment/cert-manager --tail=50

# Delete and recreate certificate
kubectl delete certificate -n wcr nocodb-wcrbusiness-online-tls
kubectl apply -f config/nocodb-ingress.yaml
```

### Can't Login / Forgot Password

```bash
# Reset admin password via database
kubectl exec -n wcr deployment/mysql -- mysql -u nocodb -p'NocoDB_Pass_2024_Change_Me' nocodb <<EOF
-- Reset admin password (use bcrypt hash)
-- This is just for emergency access
UPDATE nc_users SET password = 'reset_via_email' WHERE email = 'admin@wcrbusiness.online';
EOF

# Or update secret and restart
kubectl edit secret nocodb-secret -n wcr
# Update NC_ADMIN_PASSWORD
kubectl rollout restart deployment/nocodb -n wcr
```

---

## 🔐 Security Best Practices

### Change Default Credentials

**After first login:**
1. Change admin password in UI (Settings → Profile)
2. Update email if needed
3. Enable 2FA (if available)
4. Create team member accounts (don't share admin)

### Update Secrets

```bash
# Edit secrets
kubectl edit secret nocodb-secret -n wcr

# Update these values (base64 encoded):
#  - NC_ADMIN_PASSWORD
#  - NC_AUTH_JWT_SECRET
#  - DB_PASSWORD (if changed in MySQL too)

# Restart to apply
kubectl rollout restart deployment/nocodb -n wcr
```

### API Token Management

- Generate separate API tokens for each integration
- Use tokens with minimal required permissions
- Rotate tokens regularly
- Delete unused tokens

### Database Security

- ✅ NocoDB user has access ONLY to `nocodb` database
- ✅ No access to `ninja` or `n8n` databases
- ✅ Use strong passwords
- ✅ Regular backups (automated daily)

---

## 📊 Monitoring

### Health Checks

NocoDB provides `/api/v1/health` endpoint:

```bash
# Check health
kubectl exec -n wcr deployment/nocodb -- \
  wget -qO- http://localhost:8080/api/v1/health

# Expected: {"message":"OK"}
```

### Resource Usage

```bash
# Check resource consumption
kubectl top pod -n wcr -l app=nocodb

# Check database size
kubectl exec -n wcr deployment/mysql -- mysql -u nocodb -p'NocoDB_Pass_2024_Change_Me' nocodb <<EOF
SELECT 
  table_schema AS 'Database',
  ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS 'Size (MB)'
FROM information_schema.tables 
WHERE table_schema = 'nocodb'
GROUP BY table_schema;
EOF
```

### Usage Statistics

Monitor in NocoDB UI:
- Settings → Audit Logs
- View user activity
- Track API usage
- Monitor base access

---

## 📚 Resources

### Official Documentation
- **NocoDB Docs**: https://docs.nocodb.com/
- **NocoDB Community**: https://community.nocodb.com/
- **NocoDB GitHub**: https://github.com/nocodb/nocodb

### API Documentation
- **REST API**: https://docs.nocodb.com/developer-resources/rest-apis
- **SDK**: https://github.com/nocodb/nocodb-sdk

### Integration Guides
- **n8n Integration**: https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.nocodb/
- **Webhooks**: https://docs.nocodb.com/automation/webhook/

---

## 🎯 Use Cases

### For openresilience.cc

Use NocoDB to manage:
- **Topics & Content**: Home, hero, mission, roadmap data
- **Organizations**: Supporters, grants, vendors, users
- **Roadmaps**: ORI, ORISO, PRIMO items with status
- **Feedback**: Collect and manage community feedback
- **Voting System**: Track votes and participation

### For WCR Business

- **Client Database**: Extended client information
- **Project Tracking**: Custom project management
- **Inventory**: Product/service catalog
- **Analytics**: Custom business metrics
- **Forms**: Data collection workflows

---

## 🔄 Updates

### Update NocoDB

```bash
# Pull latest image
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

# Update deployment (pulls latest)
kubectl set image deployment/nocodb -n wcr nocodb=nocodb/nocodb:latest

# Or edit deployment
kubectl edit deployment/nocodb -n wcr

# Check rollout
kubectl rollout status deployment/nocodb -n wcr
```

### Database Migrations

NocoDB handles migrations automatically:
- Runs on startup
- Adds new tables/columns as needed
- Safe to update anytime

---

## 🆘 Support

**Need Help?**
- NocoDB Forum: https://community.nocodb.com/
- NocoDB Discord: https://discord.gg/5RgZmkW
- GitHub Issues: https://github.com/nocodb/nocodb/issues

**Internal Documentation:**
- Main README: `/home/backup/Documents/business/wcr/README.md`
- Commands: `/home/backup/Documents/business/wcr/COMMANDS.md`
- Database Info: `/home/backup/Documents/business/wcr/Dreambau-Database/README.md`

---

**Deployed**: ________________  
**Access URL**: https://nocodb.wcrbusiness.online  
**Database**: nocodb (on shared MySQL server)  
**Admin Email**: ________________  

---

*Professional. Integrated. Production-Ready.* 🚀

