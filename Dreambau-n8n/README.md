# 🤖 n8n Workflow Automation

Production-ready n8n deployment on Kubernetes with PostgreSQL and automatic HTTPS.

---

## 📋 What is n8n?

n8n is a powerful workflow automation tool that lets you connect different services and create complex workflows. Think of it as:
- **Zapier/Make alternative** (but self-hosted and free)
- **IFTTT on steroids** with advanced logic
- **Visual programming** for business automation

**Use Cases**:
- Automate InvoiceNinja tasks (create invoices, send reminders)
- Connect multiple services (email, Slack, databases, APIs)
- Data synchronization between systems
- Scheduled tasks and webhooks
- Custom business workflows

---

## ✨ Features

✅ **n8n Latest Version** - Always up-to-date workflow automation  
✅ **PostgreSQL Database** - Reliable data storage  
✅ **Automatic HTTPS** - Let's Encrypt SSL certificates  
✅ **Persistent Storage** - Workflows and data survive restarts  
✅ **Production Ready** - Health checks and resource limits  
✅ **Webhook Support** - Trigger workflows from external services  

---

## 🚀 Quick Deployment

### Prerequisites
- k3s cluster running
- cert-manager installed
- Domain `n8n.wcrbusiness.online` pointing to your server

### Step 1: Generate Secure Keys

```bash
# Generate PostgreSQL password
openssl rand -base64 32
# Save output: _______________________________

# Generate n8n encryption key (CRITICAL - never change this!)
openssl rand -base64 32
# Save output: _______________________________
```

### Step 2: Configure Secrets

```bash
cd /home/backup/Documents/business/wcr/Dreambau-n8n/config

# Edit n8n secret
nano n8n-secret.yaml
# Update:
#   - DB_POSTGRESDB_PASSWORD (from step 1)
#   - N8N_ENCRYPTION_KEY (from step 1)

# Edit PostgreSQL secret
nano postgres-secret.yaml
# Update:
#   - POSTGRES_PASSWORD (must match DB_POSTGRESDB_PASSWORD)
```

### Step 3: Deploy

```bash
cd /home/backup/Documents/business/wcr/Dreambau-n8n
chmod +x deploy-n8n.sh
sudo ./deploy-n8n.sh
```

### Step 4: Access n8n

Visit: **https://n8n.wcrbusiness.online**

**First-time Setup**:
1. Create your admin account (email + password)
2. Set up your profile
3. Start creating workflows!

---

## 📁 Project Structure

```
Dreambau-n8n/
├── README.md                      # This file
├── deploy-n8n.sh                  # Automated deployment script
├── config/
│   ├── n8n-secret.yaml            # ⚠️  n8n configuration (DO NOT COMMIT!)
│   ├── n8n-secret.yaml.example    # Template for configuration
│   ├── postgres-secret.yaml       # ⚠️  PostgreSQL passwords (DO NOT COMMIT!)
│   ├── postgres-secret.yaml.example # Template for PostgreSQL
│   ├── n8n-pvc.yaml               # Persistent storage (5GB each)
│   ├── postgres-deployment.yaml    # PostgreSQL database
│   ├── n8n-deployment.yaml        # n8n application
│   └── n8n-ingress.yaml           # HTTPS ingress configuration
└── data/                          # (Created automatically by k8s)
```

---

## ⚙️ Configuration

### Important Settings in n8n-secret.yaml

| Setting | Description | Example |
|---------|-------------|---------|
| `N8N_HOST` | Your domain | `n8n.wcrbusiness.online` |
| `WEBHOOK_URL` | Webhook base URL | `https://n8n.wcrbusiness.online` |
| `DB_POSTGRESDB_PASSWORD` | Database password | `<generated>` |
| `N8N_ENCRYPTION_KEY` | Encryption key (never change!) | `<generated>` |
| `GENERIC_TIMEZONE` | Your timezone | `America/New_York` |

### Resource Allocation

**n8n Application**:
- CPU: 250m (request) / 1000m (limit)
- Memory: 512Mi (request) / 2Gi (limit)
- Storage: 5Gi

**PostgreSQL**:
- CPU: 250m (request) / 500m (limit)
- Memory: 256Mi (request) / 512Mi (limit)
- Storage: 5Gi

---

## 🔧 Common Operations

### Check Status

```bash
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

# Check all n8n resources
kubectl get pods,svc,ingress,pvc -n wcr | grep n8n

# Check pod status
kubectl get pods -n wcr -l app=n8n

# Check PostgreSQL
kubectl get pods -n wcr -l app=n8n-postgres
```

### View Logs

```bash
# n8n application logs
kubectl logs -n wcr -l app=n8n -f

# PostgreSQL logs
kubectl logs -n wcr -l app=n8n-postgres --tail=50

# Check specific pod
kubectl logs -n wcr <pod-name>
```

### Restart Services

```bash
# Restart n8n
kubectl rollout restart deployment/n8n -n wcr

# Restart PostgreSQL
kubectl rollout restart deployment/n8n-postgres -n wcr

# Check restart status
kubectl rollout status deployment/n8n -n wcr
```

### Access Database

```bash
# Connect to PostgreSQL
kubectl exec -it -n wcr deployment/n8n-postgres -- psql -U n8n -d n8n

# PostgreSQL commands:
# \dt          - List tables
# \d+ table    - Describe table
# SELECT * FROM execution_entity LIMIT 5;  - View executions
# \q           - Quit
```

### Backup n8n Data

```bash
# Export workflows (via n8n UI)
# Settings → Import/Export → Export Workflows

# Backup PostgreSQL database
kubectl exec -n wcr deployment/n8n-postgres -- \
  pg_dump -U n8n -d n8n > n8n-backup-$(date +%Y%m%d).sql

# Backup PVC data
kubectl exec -n wcr deployment/n8n -- \
  tar czf /tmp/n8n-data-backup.tar.gz /home/node/.n8n
kubectl cp wcr/<n8n-pod-name>:/tmp/n8n-data-backup.tar.gz ./n8n-data-backup.tar.gz
```

### Restore n8n Data

```bash
# Import workflows (via n8n UI)
# Settings → Import/Export → Import Workflows

# Restore PostgreSQL database
cat n8n-backup.sql | kubectl exec -i -n wcr deployment/n8n-postgres -- \
  psql -U n8n -d n8n
```

---

## 🔗 Integration with InvoiceNinja

n8n can automate many InvoiceNinja tasks:

### Example Workflows

1. **Automatic Invoice Reminders**
   - Trigger: Schedule (daily)
   - Action: Check InvoiceNinja for overdue invoices
   - Action: Send email reminders

2. **New Client Notifications**
   - Trigger: InvoiceNinja webhook (new client)
   - Action: Send Slack notification
   - Action: Add to CRM

3. **Payment Processing**
   - Trigger: Payment received webhook
   - Action: Update accounting software
   - Action: Send thank you email

### Setting Up InvoiceNinja Node

1. In n8n, search for "InvoiceNinja" node
2. Add credentials:
   - URL: `https://invoice.wcrbusiness.online`
   - API Token: (Get from InvoiceNinja → Settings → API Tokens)
3. Start automating!

---

## 🔍 Troubleshooting

### n8n Pod Not Starting

```bash
# Check pod events
kubectl describe pod -n wcr -l app=n8n

# Check logs
kubectl logs -n wcr -l app=n8n --tail=100

# Common issues:
# 1. PostgreSQL not ready - wait a bit longer
# 2. Wrong database password - check secrets match
# 3. Missing encryption key - add to secret
```

### PostgreSQL Connection Failed

```bash
# Check PostgreSQL is running
kubectl get pods -n wcr -l app=n8n-postgres

# Test connection from n8n pod
kubectl exec -n wcr deployment/n8n -- \
  nc -zv n8n-postgres.wcr.svc.cluster.local 5432

# Verify passwords match
kubectl get secret n8n-postgres-secret -n wcr -o jsonpath='{.data.POSTGRES_PASSWORD}' | base64 -d
kubectl get secret n8n-secret -n wcr -o jsonpath='{.data.DB_POSTGRESDB_PASSWORD}' | base64 -d
# These must be identical!
```

### SSL Certificate Not Ready

```bash
# Check certificate status
kubectl get certificate -n wcr | grep n8n
kubectl describe certificate -n wcr n8n-wcrbusiness-online-tls

# Common fixes:
# 1. Wait 2-5 minutes for Let's Encrypt
# 2. Verify DNS: nslookup n8n.wcrbusiness.online
# 3. Check cert-manager logs:
kubectl logs -n cert-manager deployment/cert-manager --tail=50
```

### Workflows Not Executing

```bash
# Check execution logs in n8n UI
# Settings → Executions

# Check pod resources
kubectl top pod -n wcr -l app=n8n

# Increase resources if needed
kubectl edit deployment/n8n -n wcr
# Update memory/CPU limits
```

### Lost Encryption Key

**⚠️  CRITICAL**: If you lose the `N8N_ENCRYPTION_KEY`, you cannot decrypt saved credentials!

**Prevention**:
- Backup the key securely (password manager)
- Include in disaster recovery documentation
- Export workflows regularly (they contain encrypted credentials)

**Recovery**:
- If lost, you must recreate all workflow credentials
- Cannot recover encrypted data without the key

---

## 🔐 Security Best Practices

### Change Default Passwords
```bash
# After first deployment, update secrets:
kubectl edit secret n8n-secret -n wcr
kubectl edit secret n8n-postgres-secret -n wcr

# Restart to apply
kubectl rollout restart deployment/n8n -n wcr
kubectl rollout restart deployment/n8n-postgres -n wcr
```

### Enable Basic Auth (Optional)
Uncomment in `n8n-secret.yaml`:
```yaml
N8N_BASIC_AUTH_ACTIVE: "true"
N8N_BASIC_AUTH_USER: "admin"
N8N_BASIC_AUTH_PASSWORD: "your-password"
```

### Secure Webhooks
- Use HTTPS webhooks only
- Add webhook authentication
- Validate incoming data in workflows

### Regular Backups
```bash
# Add to crontab for daily backups
0 3 * * * /path/to/backup-n8n.sh
```

---

## 📊 Monitoring

### Health Checks

n8n provides a `/healthz` endpoint:
```bash
# Check health
kubectl exec -n wcr deployment/n8n -- curl http://localhost:5678/healthz

# Expected: {"status":"ok"}
```

### Resource Usage

```bash
# Check resource consumption
kubectl top pod -n wcr -l app=n8n
kubectl top pod -n wcr -l app=n8n-postgres

# View resource limits
kubectl describe pod -n wcr -l app=n8n | grep -A 5 "Limits:"
```

### Execution Monitoring

Monitor in n8n UI:
- Settings → Executions
- View successful/failed executions
- Check execution times
- Debug workflow errors

---

## 📚 Resources

### Official Documentation
- **n8n Docs**: https://docs.n8n.io/
- **n8n Community**: https://community.n8n.io/
- **n8n GitHub**: https://github.com/n8n-io/n8n

### Workflow Templates
- **n8n Templates**: https://n8n.io/workflows/
- Search for "InvoiceNinja" templates
- Browse by category (productivity, marketing, etc.)

### API Documentation
- **n8n API**: https://docs.n8n.io/api/
- **InvoiceNinja API**: https://invoiceninja.github.io/en/api/

---

## 🎯 Next Steps

After deployment:

1. **Create Your First Workflow**
   - Try a simple workflow (e.g., send email)
   - Test execution
   - Add error handling

2. **Connect InvoiceNinja**
   - Get API token from InvoiceNinja
   - Add InvoiceNinja credentials in n8n
   - Create an automation workflow

3. **Set Up Webhooks**
   - Configure webhook in InvoiceNinja
   - Point to: `https://n8n.wcrbusiness.online/webhook/YOUR_PATH`
   - Test webhook trigger

4. **Explore Templates**
   - Browse n8n.io/workflows
   - Import useful templates
   - Customize for your needs

5. **Regular Maintenance**
   - Export workflows weekly
   - Backup database monthly
   - Monitor execution logs

---

## 🆘 Support

**Need Help?**
- n8n Community Forum: https://community.n8n.io/
- n8n Discord: https://discord.gg/n8n
- Main README: `/home/backup/Documents/business/wcr/README.md`
- Command Reference: `/home/backup/Documents/business/wcr/COMMANDS.md`

**Common Commands**:
```bash
# Quick status
kubectl get pods -n wcr | grep n8n

# View logs
kubectl logs -n wcr -l app=n8n -f

# Restart
kubectl rollout restart deployment/n8n -n wcr
```

---

**Deployed**: ________________  
**Access URL**: https://n8n.wcrbusiness.online  
**Admin Email**: ________________  

---

*Happy Automating! 🤖*

