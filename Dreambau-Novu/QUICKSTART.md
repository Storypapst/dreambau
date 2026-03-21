# Novu Quick Start Guide

## 🚀 Access

**URL:** https://novu.dreambau.com

## 🔑 First-Time Setup

1. **Navigate to Novu:**
   ```
   https://novu.dreambau.com
   ```

2. **Create Admin Account:**
   - Click "Sign Up"
   - Enter your email and password
   - You'll be logged in automatically (no email verification needed for self-hosted)

3. **Create Your First Workflow:**
   - Go to "Workflows" in the sidebar
   - Click "Create Workflow"
   - Choose a trigger event
   - Add notification steps (Email, SMS, In-App, etc.)
   - Save and activate

## 📡 API Integration

### Get Your API Key

1. Go to Settings → API Keys
2. Click "Create API Key"
3. Copy the key (starts with `api_`)

### Send a Notification

```bash
curl -X POST https://novu.dreambau.com/v1/events/trigger \
  -H "Authorization: ApiKey YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "workflow-trigger-id",
    "to": {
      "subscriberId": "user-123",
      "email": "user@example.com"
    },
    "payload": {
      "customData": "value"
    }
  }'
```

## 🔧 Common Tasks

### View Logs

```bash
# API logs
kubectl logs -n wcr deployment/novu-api --tail=100 -f

# Worker logs
kubectl logs -n wcr deployment/novu-worker --tail=100 -f

# All Novu logs
kubectl logs -n wcr -l app=novu --tail=50 -f
```

### Restart Services

```bash
# Restart API
kubectl rollout restart deployment/novu-api -n wcr

# Restart all Novu services
kubectl rollout restart deployment -n wcr -l app=novu
```

### Check Status

```bash
# All Novu pods
kubectl get pods -n wcr -l app=novu

# Check ingress
kubectl get ingress -n wcr novu-ingress

# Check certificate
kubectl get certificate -n wcr novu-dreambau-com-tls
```

## 💾 Backup

Backups are automated via the centralized backup script:
```bash
/home/backup/Documents/business/wcr/Dreambau-Database/backups/automated-backup.sh
```

Manual MongoDB backup:
```bash
kubectl exec -n wcr deployment/mongodb -- mongodump \
  --uri="mongodb://novu:Novu_Mongo_Pass_2024_Change_Me@localhost:27017/novu-db?authSource=admin" \
  --archive > novu-backup-$(date +%Y%m%d).archive
```

## 🔌 Notification Providers

### Configure Email Provider

1. Go to **Integrations** → **Email**
2. Choose a provider (SendGrid, Mailgun, SMTP, etc.)
3. Enter credentials
4. Test the connection

### Configure SMS Provider

1. Go to **Integrations** → **SMS**
2. Choose a provider (Twilio, SNS, etc.)
3. Enter credentials
4. Test the connection

## 📚 Resources

- **Official Docs:** https://docs.novu.co
- **API Reference:** https://docs.novu.co/api-reference/overview
- **GitHub:** https://github.com/novuhq/novu
- **Discord Community:** https://discord.gg/novu

## 🆘 Troubleshooting

### Dashboard Not Loading

```bash
# Check web pod
kubectl get pods -n wcr -l component=web

# Check logs
kubectl logs -n wcr deployment/novu-web --tail=50
```

### API Not Responding

```bash
# Check API pod
kubectl get pods -n wcr -l component=api

# Check logs
kubectl logs -n wcr deployment/novu-api --tail=50

# Test health check
curl https://novu.dreambau.com/v1/health-check
```

### MongoDB Connection Issues

```bash
# Test MongoDB connection
kubectl exec -n wcr deployment/mongodb -- mongosh \
  --username novu \
  --password Novu_Mongo_Pass_2024_Change_Me \
  --authenticationDatabase admin \
  --eval "db.adminCommand('ping')"
```

## 🎯 Next Steps

1. ✅ Create your admin account
2. ✅ Set up notification providers (Email, SMS, etc.)
3. ✅ Create your first workflow
4. ✅ Test with a trigger event
5. ✅ Integrate with your application via API
6. ✅ Monitor activity feed for delivery status

---

**Need Help?** Check the full README at `/home/backup/Documents/business/wcr/Dreambau-Novu/README.md`



