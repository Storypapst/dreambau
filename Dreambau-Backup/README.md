# 💾 WCR-Backup - Automated Backup System

Centralized backup directory for all WCR applications.

---

## 📂 Directory Structure

```
WCR-Backup/
├── database/               # Database backups (compressed .sql.gz)
│   ├── invoiceninja_YYYYMMDD_HHMMSS.sql.gz
│   ├── nocodb_YYYYMMDD_HHMMSS.sql.gz
│   └── n8n_YYYYMMDD_HHMMSS.sql.gz
│
├── files/                  # Application files (compressed .tar.gz)
│   └── invoiceninja_files_YYYYMMDD_HHMMSS.tar.gz
│
├── config/                 # Configuration backups (.yaml)
│   ├── invoiceninja-secret_YYYYMMDD_HHMMSS.yaml
│   ├── mysql-secret_YYYYMMDD_HHMMSS.yaml
│   ├── nocodb-secret_YYYYMMDD_HHMMSS.yaml
│   ├── n8n-secret_YYYYMMDD_HHMMSS.yaml
│   └── n8n-postgres-secret_YYYYMMDD_HHMMSS.yaml
│
└── backup.log              # Backup execution logs
```

---

## 🔄 Backup Schedule

**Automated Daily Backups:**
- **Time**: 2:00 AM daily
- **Retention**: 30 days
- **Script**: `../WCR-Database/backups/automated-backup.sh`
- **Cron**: `0 2 * * * /path/to/automated-backup.sh`

---

## 📊 What Gets Backed Up

### Databases
- ✅ **InvoiceNinja** - MySQL `ninja` database
- ✅ **NocoDB** - MySQL `nocodb` database
- ✅ **n8n** - PostgreSQL `n8n` database

### Files
- ✅ InvoiceNinja uploaded files and storage
- ✅ Application configurations (secrets)

### Configurations
- ✅ All Kubernetes secrets
- ✅ Application configurations

---

## 🔧 Manual Backup

```bash
# Run backup manually
/home/backup/Documents/business/wcr/WCR-Database/backups/automated-backup.sh

# View backup log
tail -f /home/backup/Documents/business/wcr/WCR-Backup/backup.log

# List all backups
ls -lh /home/backup/Documents/business/wcr/WCR-Backup/database/
```

---

## 📈 Check Backup Status

```bash
# Check backup size
du -sh /home/backup/Documents/business/wcr/WCR-Backup/

# List recent backups
ls -lt /home/backup/Documents/business/wcr/WCR-Backup/database/ | head -10

# Check cron job
crontab -l
```

---

## 🔄 Restore from Backup

### Restore InvoiceNinja Database

```bash
gunzip -c WCR-Backup/database/invoiceninja_YYYYMMDD_HHMMSS.sql.gz | \
  kubectl exec -i -n wcr deployment/mysql -- \
  mysql -u ninja -p'PASSWORD' ninja
```

### Restore NocoDB Database

```bash
gunzip -c WCR-Backup/database/nocodb_YYYYMMDD_HHMMSS.sql.gz | \
  kubectl exec -i -n wcr deployment/mysql -- \
  mysql -u nocodb -p'PASSWORD' nocodb
```

### Restore n8n Database

```bash
gunzip -c WCR-Backup/database/n8n_YYYYMMDD_HHMMSS.sql.gz | \
  kubectl exec -i -n wcr deployment/n8n-postgres -- \
  psql -U n8n n8n
```

### Restore InvoiceNinja Files

```bash
kubectl exec -n wcr deployment/invoiceninja -c invoiceninja -- \
  tar xzf - -C / < WCR-Backup/files/invoiceninja_files_YYYYMMDD_HHMMSS.tar.gz
```

---

## 🔒 Security Notes

- ⚠️ This directory contains **sensitive data** (passwords, databases)
- ✅ Excluded from git via `.gitignore`
- ✅ Only accessible to `backup` user and root
- 🔐 Consider encrypting backups for production
- 💾 Recommend off-site backup copies

---

## 📤 Off-Site Backup (Recommended)

### To Remote Server

```bash
# Daily sync to remote backup server
rsync -avz --delete \
  /home/backup/Documents/business/wcr/WCR-Backup/ \
  user@backup-server:/backups/wcr/
```

### To Cloud Storage

```bash
# Using rclone to AWS S3, Google Drive, etc.
rclone sync /home/backup/Documents/business/wcr/WCR-Backup/ \
  remote:wcr-backups/
```

---

## 🧹 Maintenance

### Cleanup Old Backups Manually

```bash
# Delete backups older than 30 days
find /home/backup/Documents/business/wcr/WCR-Backup/database/ \
  -name "*.sql.gz" -mtime +30 -delete

find /home/backup/Documents/business/wcr/WCR-Backup/files/ \
  -name "*.tar.gz" -mtime +30 -delete

find /home/backup/Documents/business/wcr/WCR-Backup/config/ \
  -name "*-secret_*.yaml" -mtime +30 -delete
```

### Check Disk Space

```bash
# Check available space
df -h /home/backup/Documents/business/

# Check backup directory size
du -sh /home/backup/Documents/business/wcr/WCR-Backup/*
```

---

## 📊 Backup Statistics

| Type | Frequency | Retention | Compression |
|------|-----------|-----------|-------------|
| Databases | Daily | 30 days | gzip |
| Files | Daily | 30 days | tar.gz |
| Configs | Daily | 30 days | none |

---

## 🆘 Troubleshooting

### Backup Failed

```bash
# Check backup log
tail -100 /home/backup/Documents/business/wcr/WCR-Backup/backup.log

# Check disk space
df -h

# Test backup script manually
bash -x /home/backup/Documents/business/wcr/WCR-Database/backups/automated-backup.sh
```

### Missing Backups

```bash
# Check if cron is running
systemctl status cron

# Check crontab
crontab -l

# Verify script permissions
ls -l /home/backup/Documents/business/wcr/WCR-Database/backups/automated-backup.sh
```

---

## 📝 Notes

- Backups run automatically via cron
- No manual intervention required
- Logs available in `backup.log`
- Old backups automatically deleted after 30 days
- All applications included in single backup system

---

**Last Updated**: November 8, 2025  
**Backup Location**: `/home/backup/Documents/business/wcr/WCR-Backup/`  
**Backup Schedule**: Daily at 2:00 AM  
**Retention Period**: 30 days

