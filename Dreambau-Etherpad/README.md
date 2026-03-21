# Dreambau Etherpad Deployment

Complete Kubernetes deployment for Etherpad - a collaborative real-time text editor.

## 🎯 What is Etherpad?

Etherpad is a highly customizable open-source online editor providing collaborative editing in really real-time. It allows multiple users to edit documents simultaneously with changes appearing instantly on all screens.

## 📋 Features

- **Real-time Collaboration**: Multiple users can edit the same document simultaneously
- **Rich Text Editing**: Support for bold, italic, underline, lists, and more
- **Import/Export**: Support for various formats (HTML, PDF, DOC, ODT, etc.)
- **Time Slider**: View document history and revert to previous versions
- **Chat**: Built-in chat for collaborators
- **API Access**: RESTful API for integration with other applications
- **Plugins**: Extensible with numerous plugins

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│                   Internet                       │
└────────────────────┬────────────────────────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │   Traefik Ingress     │
         │  (SSL Termination)    │
         └───────────┬───────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │   Etherpad Service    │
         │   (Port 9001)         │
         └───────────┬───────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │   Etherpad Pod        │
         │   (etherpad/etherpad) │
         └───────────┬───────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │   PostgreSQL          │
         │   (shared-postgres)   │
         └───────────────────────┘
```

## 📦 Components

1. **Etherpad Application**: Official Docker image from etherpad/etherpad
2. **PostgreSQL Database**: Shared PostgreSQL instance for data persistence
3. **Persistent Storage**: 5GB volume for Etherpad data
4. **SSL Certificate**: Let's Encrypt certificate via cert-manager
5. **Traefik Ingress**: HTTPS access with automatic SSL

## 🚀 Quick Start

### Prerequisites

- Kubernetes cluster (k3s) running
- `kubectl` configured
- Traefik ingress controller installed
- cert-manager installed with Let's Encrypt issuer
- Shared PostgreSQL instance running in `wcr` namespace
- DNS record: `etherpad.dreambau.com` → Your server IP

### Step 1: Create Secret

```bash
cd /home/backup/Documents/business/wcr/Dreambau-Etherpad

# Copy the example secret
cp config/etherpad-secret.yaml.example config/etherpad-secret.yaml

# Generate strong passwords
echo "DB_PASS: $(openssl rand -base64 32)"
echo "ADMIN_PASSWORD: $(openssl rand -base64 24)"
echo "SESSION_KEY: $(openssl rand -hex 32)"
echo "API_KEY: $(openssl rand -hex 32)"

# Edit the secret with your credentials
nano config/etherpad-secret.yaml
```

### Step 2: Deploy Etherpad

```bash
# Make deploy script executable
chmod +x scripts/deploy-etherpad.sh

# Run deployment
./scripts/deploy-etherpad.sh
```

The script will:
1. Create the `wcr` namespace if it doesn't exist
2. Check/create the PostgreSQL database
3. Apply the secret
4. Deploy Etherpad
5. Wait for the deployment to be ready

### Step 3: Access Etherpad

Once deployed, access Etherpad at:
- **URL**: https://etherpad.dreambau.com
- **Admin Username**: admin
- **Admin Password**: (from your secret file)

## 🔧 Configuration

### Environment Variables

All configuration is managed through Kubernetes ConfigMap and Secret:

**Secret (`etherpad-secret.yaml`):**
- `DB_USER`: PostgreSQL username
- `DB_PASS`: PostgreSQL password
- `DB_NAME`: Database name
- `ADMIN_PASSWORD`: Admin user password
- `SESSION_KEY`: Session encryption key (64 chars)
- `API_KEY`: API authentication key

**ConfigMap (`etherpad-config`):**
- Contains `settings.json` with all Etherpad configuration
- Customizable title, skin, features, etc.

### Customizing Settings

Edit the ConfigMap in `config/etherpad-deployment.yaml`:

```yaml
data:
  settings.json: |
    {
      "title": "Your Custom Title",
      "skinName": "colibris",
      # ... more settings
    }
```

Then apply changes:

```bash
kubectl apply -f config/etherpad-deployment.yaml
kubectl rollout restart deployment/etherpad -n wcr
```

## 📊 Management Commands

### View Logs

```bash
# Follow logs
kubectl logs -n wcr -l app=etherpad -f

# View last 100 lines
kubectl logs -n wcr -l app=etherpad --tail=100
```

### Check Status

```bash
# View pods
kubectl get pods -n wcr -l app=etherpad

# View deployment
kubectl get deployment -n wcr etherpad

# View service
kubectl get svc -n wcr etherpad

# View ingress
kubectl get ingressroute -n wcr etherpad-ingress
```

### Restart Etherpad

```bash
kubectl rollout restart deployment/etherpad -n wcr
```

### Shell Access

```bash
kubectl exec -it -n wcr deployment/etherpad -- bash
```

### Database Access

```bash
# Get PostgreSQL pod
POSTGRES_POD=$(kubectl get pods -n wcr -l app=shared-postgres -o jsonpath='{.items[0].metadata.name}')

# Connect to database
kubectl exec -it -n wcr $POSTGRES_POD -- psql -U etherpad -d etherpad
```

## 🔌 API Usage

Etherpad provides a comprehensive HTTP API. Access it using your API key.

### Example: Create a Pad

```bash
API_KEY="your_api_key_here"
curl "https://etherpad.dreambau.com/api/1/createPad?apikey=$API_KEY&padID=test-pad&text=Hello%20World"
```

### Example: Get Pad Text

```bash
curl "https://etherpad.dreambau.com/api/1/getText?apikey=$API_KEY&padID=test-pad"
```

### API Documentation

Full API documentation: https://etherpad.org/doc/v1.9.0/#index_http_api

## 🔐 Security

### Admin Access

Access the admin panel at: `https://etherpad.dreambau.com/admin`

Login with:
- Username: `admin`
- Password: (from your secret)

### User Authentication

By default, Etherpad allows anonymous access. To require authentication:

1. Edit `settings.json` in the ConfigMap:
   ```json
   "requireAuthentication": true,
   "requireAuthorization": true
   ```

2. Add users to the `users` section:
   ```json
   "users": {
     "admin": {
       "password": "admin_password",
       "is_admin": true
     },
     "user1": {
       "password": "user1_password",
       "is_admin": false
     }
   }
   ```

3. Apply changes and restart

### SSL/TLS

- SSL certificates are automatically managed by cert-manager
- Let's Encrypt production issuer is used
- Certificates auto-renew before expiration

## 🎨 Customization

### Themes (Skins)

Etherpad comes with several built-in skins:
- `no-skin` - Classic Etherpad look
- `colibris` - Modern, clean interface (default)

Change in `settings.json`:
```json
"skinName": "colibris",
"skinVariants": "super-light-toolbar super-light-editor light-background"
```

### Plugins

Install plugins by adding them to the Etherpad container. Example:

1. Create a custom Dockerfile:
   ```dockerfile
   FROM etherpad/etherpad:latest
   RUN npm install ep_headings2 ep_markdown ep_comments_page
   ```

2. Build and deploy the custom image

Popular plugins:
- `ep_headings2` - Heading support
- `ep_markdown` - Markdown support
- `ep_comments_page` - Commenting functionality
- `ep_align` - Text alignment
- `ep_font_color` - Font colors

## 📈 Monitoring

### Health Checks

Etherpad includes liveness and readiness probes:

```yaml
livenessProbe:
  httpGet:
    path: /
    port: 9001
  initialDelaySeconds: 60
  periodSeconds: 30

readinessProbe:
  httpGet:
    path: /
    port: 9001
  initialDelaySeconds: 30
  periodSeconds: 10
```

### Resource Usage

Current resource limits:
- **Memory**: 256Mi request, 512Mi limit
- **CPU**: 200m request, 500m limit

Adjust in `etherpad-deployment.yaml` if needed.

## 🔄 Backup & Restore

### Database Backup

```bash
# Get PostgreSQL pod
POSTGRES_POD=$(kubectl get pods -n wcr -l app=shared-postgres -o jsonpath='{.items[0].metadata.name}')

# Backup database
kubectl exec -n wcr $POSTGRES_POD -- pg_dump -U etherpad etherpad | gzip > etherpad-backup-$(date +%Y%m%d).sql.gz
```

### Restore Database

```bash
# Restore from backup
gunzip -c etherpad-backup-20240101.sql.gz | kubectl exec -i -n wcr $POSTGRES_POD -- psql -U etherpad -d etherpad
```

### Data Volume Backup

```bash
# Backup persistent volume
kubectl exec -n wcr deployment/etherpad -- tar czf - /opt/etherpad-lite/var > etherpad-data-$(date +%Y%m%d).tar.gz
```

## 🐛 Troubleshooting

### Etherpad Won't Start

1. Check logs:
   ```bash
   kubectl logs -n wcr -l app=etherpad --tail=100
   ```

2. Common issues:
   - Database connection failed → Check PostgreSQL is running
   - Invalid settings.json → Check ConfigMap syntax
   - Port already in use → Check for conflicting services

### Database Connection Issues

```bash
# Test database connection
POSTGRES_POD=$(kubectl get pods -n wcr -l app=shared-postgres -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n wcr $POSTGRES_POD -- psql -U etherpad -d etherpad -c "SELECT 1;"
```

### SSL Certificate Issues

```bash
# Check certificate status
kubectl describe certificate etherpad-dreambau-com-tls -n wcr

# Check certificate secret
kubectl get secret etherpad-dreambau-com-tls -n wcr
```

### Can't Access via Domain

1. Check DNS:
   ```bash
   nslookup etherpad.dreambau.com
   ```

2. Check Ingress:
   ```bash
   kubectl get ingressroute etherpad-ingress -n wcr -o yaml
   ```

3. Check Traefik logs:
   ```bash
   kubectl logs -n kube-system -l app.kubernetes.io/name=traefik
   ```

## 📚 Additional Resources

- **Official Documentation**: https://etherpad.org/doc/latest/
- **GitHub Repository**: https://github.com/ether/etherpad-lite
- **Plugin Directory**: https://static.etherpad.org/plugins.html
- **API Documentation**: https://etherpad.org/doc/v1.9.0/#index_http_api

## 🆘 Support

For issues specific to this deployment:
1. Check logs: `kubectl logs -n wcr -l app=etherpad`
2. Check pod status: `kubectl describe pod -n wcr -l app=etherpad`
3. Review this README for common solutions

For Etherpad-specific issues:
- Community Forum: https://github.com/ether/etherpad-lite/discussions
- Issue Tracker: https://github.com/ether/etherpad-lite/issues

## 📝 License

Etherpad is licensed under the Apache License 2.0.

This deployment configuration is provided as-is for the Dreambau infrastructure.


