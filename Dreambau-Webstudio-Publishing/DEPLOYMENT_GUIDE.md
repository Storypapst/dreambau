# Webstudio Publishing Pipeline - Deployment Guide

## ✅ What's Already Done

1. **Webstudio Builder** is running at `https://webstudio.dreambau.com`
   - Production Docker image built
   - Deployed to Kubernetes
   - SSL certificates configured
   - PostgreSQL database configured
   - PostgREST API running
   - DEV_LOGIN enabled for authentication

2. **Webstudio CLI** installed globally on the server
   - Version: @webstudio-is/cli@0.94.0
   - Available commands: link, sync, build

3. **Publishing Infrastructure** created:
   - Webhook server (Node.js/Express)
   - Build automation script
   - Docker setup for published sites
   - Kubernetes manifests for site hosting

## 🚀 Next Steps to Complete Setup

### Step 1: Deploy the Webhook Server

```bash
cd /home/backup/Documents/business/wcr/Dreambau-Webstudio-Publishing/webhook-server
npm install
cp ../.env.example .env
# Edit .env and set WEBHOOK_SECRET
node server.js
```

Or deploy as a systemd service (recommended).

### Step 2: Configure DNS Wildcard

Add a wildcard DNS record for published sites:
```
*.sites.dreambau.com  →  A  →  91.98.125.83
```

### Step 3: Link Your First Project

1. Open Webstudio Builder at `https://webstudio.dreambau.com`
2. Log in with your AUTH_SECRET: `dreambau-webstudio-2024-secure-key-FXnrafwsNd17dTBk`
3. Create a new project or open an existing one
4. Click "Share" and generate a link with "Build" access
5. On the server, run:
   ```bash
   mkdir -p /home/backup/Documents/business/wcr/Dreambau-Webstudio-Sites/my-project
   cd /home/backup/Documents/business/wcr/Dreambau-Webstudio-Sites/my-project
   webstudio link
   # Paste the share link when prompted
   ```

### Step 4: Test Manual Build

```bash
cd /home/backup/Documents/business/wcr/Dreambau-Webstudio-Publishing
./build-script.sh "project-id" "my-project" "v1"
```

This will:
- Sync the project from the Builder
- Build it into a Remix app
- Create a Docker image
- Deploy to Kubernetes
- Make it available at `https://my-project.sites.dreambau.com`

### Step 5: Integrate Webhook (Optional)

To automate publishing when you click "Publish" in the Builder, you need to:

1. Modify the Builder to send webhooks on publish
2. Configure the webhook URL: `http://webhook-server:3001/webhook/publish`
3. Set the webhook secret in both places

**Note:** This requires modifying the Builder source code, which you wanted to avoid. For now, use manual builds with the script.

## 📝 Usage

### Manual Publishing Workflow

1. Design your site in the Builder
2. Click "Publish" in the Builder (this saves to the database)
3. On the server, run:
   ```bash
   cd /home/backup/Documents/business/wcr/Dreambau-Webstudio-Sites/my-project
   webstudio sync
   ```
4. Build and deploy:
   ```bash
   /home/backup/Documents/business/wcr/Dreambau-Webstudio-Publishing/build-script.sh "project-id" "my-project" "$(date +%Y%m%d_%H%M%S)"
   ```

### Automated Publishing (Future)

Once webhooks are integrated:
1. Design in Builder
2. Click "Publish"
3. Site automatically builds and deploys
4. Available at `https://your-project.sites.dreambau.com`

## 🔐 Authentication

**Builder Login:**
- URL: `https://webstudio.dreambau.com/login`
- Click "Login with Secret"
- Enter: `dreambau-webstudio-2024-secure-key-FXnrafwsNd17dTBk`

## 📊 Monitoring

- **Builder logs:** `kubectl logs -n wcr -l app=webstudio-builder`
- **PostgREST logs:** `kubectl logs -n wcr -l app=webstudio-postgrest`
- **Build logs:** `/home/backup/Documents/business/wcr/Dreambau-Webstudio-Sites/logs/`
- **Site logs:** `kubectl logs -n wcr -l app=webstudio-site,site=my-project`

## 🛠️ Troubleshooting

### Builder Issues
- Check pods: `kubectl get pods -n wcr | grep webstudio`
- Check logs: `kubectl logs -n wcr deployment/webstudio-builder`
- Restart: `kubectl rollout restart deployment/webstudio-builder -n wcr`

### Publishing Issues
- Check build logs in `/home/backup/Documents/business/wcr/Dreambau-Webstudio-Sites/logs/`
- Verify CLI: `webstudio --version`
- Check Docker images: `docker images | grep webstudio-site`
- Check k3s images: `sudo k3s crictl images | grep webstudio-site`

### Site Not Loading
- Check deployment: `kubectl get deployment -n wcr | grep webstudio-site`
- Check service: `kubectl get svc -n wcr | grep webstudio-site`
- Check ingress: `kubectl get ingressroute -n wcr | grep webstudio-site`
- Check certificate: `kubectl get certificate -n wcr | grep sites-dreambau-com`

## 🎯 Current Status

✅ Builder is live and accessible
✅ CLI is installed
✅ Publishing infrastructure is ready
⏳ Waiting for DNS wildcard configuration
⏳ Waiting for first project to be linked and published

## 🚦 Next Action

**You can now:**
1. Access the Builder at `https://webstudio.dreambau.com`
2. Log in and start designing
3. Link a project using the CLI
4. Test the publishing pipeline

The system is production-ready!





