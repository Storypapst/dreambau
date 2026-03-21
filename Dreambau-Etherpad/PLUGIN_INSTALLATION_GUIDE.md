# Etherpad Plugin Installation Guide

## The Problem

The admin panel plugin search shows "No plugins found" due to a browser-side network issue when fetching from `static.etherpad.org`. This is a **cosmetic UI issue** and doesn't affect Etherpad's core functionality.

## ✅ Solution 1: Direct Plugin Installation via Kubernetes (RECOMMENDED)

This is the easiest and most reliable method.

### Step 1: Choose Your Plugins

Popular plugins for Slack integration and general use:
- `ep_webhooks` - Send notifications to Slack/webhooks
- `ep_headings2` - Heading support  
- `ep_markdown` - Markdown formatting
- `ep_comments_page` - Comments functionality
- `ep_table_of_contents` - Auto table of contents
- `ep_font_color` - Font colors
- `ep_font_size` - Font sizes
- `ep_align` - Text alignment
- `ep_search` - Search through pads
- `ep_adminpads2` - Better admin pad management

### Step 2: Install Plugins Directly in the Pod

```bash
# Get the pod name
POD=$(kubectl get pods -n wcr -l app=etherpad -o jsonpath='{.items[0].metadata.name}')

# Install plugins (example: webhooks for Slack)
kubectl exec -n wcr $POD -- sh -c "cd /opt/etherpad-lite && pnpm add -w ep_webhooks ep_headings2 ep_markdown"

# Restart Etherpad to load the plugins
kubectl rollout restart deployment/etherpad -n wcr
```

### Step 3: Verify Plugins are Loaded

```bash
# Wait for pod to be ready
kubectl wait --for=condition=ready pod -l app=etherpad -n wcr --timeout=60s

# Check logs for loaded plugins
kubectl logs -n wcr -l app=etherpad | grep "Loaded.*plugins"
```

### Example: Install Webhooks Plugin for Slack

```bash
# Install webhooks plugin
POD=$(kubectl get pods -n wcr -l app=etherpad -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n wcr $POD -- sh -c "cd /opt/etherpad-lite && pnpm add -w ep_webhooks"

# Restart
kubectl rollout restart deployment/etherpad -n wcr
kubectl wait --for=condition=ready pod -l app=etherpad -n wcr --timeout=60s

# Verify
kubectl logs -n wcr -l app=etherpad --tail=50 | grep ep_webhooks
```

---

## ✅ Solution 2: Create a Custom Docker Image (For Permanent Installation)

If you want plugins to persist across pod restarts, create a custom image.

### Create Dockerfile

```dockerfile
FROM etherpad/etherpad:2.5.3

# Install your desired plugins
RUN cd /opt/etherpad-lite/node_modules && \\
    npm install --legacy-peer-deps --no-save \\
    ep_webhooks \\
    ep_headings2 \\
    ep_markdown \\
    ep_align \\
    ep_font_color

WORKDIR /opt/etherpad-lite
CMD ["node", "--require", "tsx/cjs", "node/server.ts"]
```

### Build and Deploy

```bash
cd /home/backup/Documents/business/wcr/Dreambau-Etherpad/docker

# Build
docker build -t etherpad-custom:latest -f Dockerfile.custom .

# Import to k3s
docker save etherpad-custom:latest | sudo k3s ctr images import -

# Update deployment
kubectl set image deployment/etherpad etherpad=etherpad-custom:latest -n wcr
kubectl patch deployment etherpad -n wcr -p '{"spec":{"template":{"spec":{"containers":[{"name":"etherpad","imagePullPolicy":"Never"}]}}}}'

# Restart
kubectl rollout restart deployment/etherpad -n wcr
```

---

## ✅ Solution 3: Fix the Plugin Search UI (Advanced)

The plugin search fails because of CORS/network issues. You can proxy the plugin list.

### Create a Simple Proxy

```javascript
// plugin-proxy.js
const express = require('express');
const axios = require('axios');
const app = express();

app.get('/plugins.json', async (req, res) => {
  try {
    const response = await axios.get('https://static.etherpad.org/plugins.json');
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch plugins' });
  }
});

app.listen(3002, () => console.log('Plugin proxy running on port 3002'));
```

Then configure Etherpad to use your proxy instead of `static.etherpad.org`.

---

## 🎯 Quick Start: Install Webhooks for Slack

Here's a complete script to install the webhooks plugin:

```bash
#!/bin/bash

echo "📦 Installing ep_webhooks plugin for Slack integration..."

# Get pod name
POD=$(kubectl get pods -n wcr -l app=etherpad -o jsonpath='{.items[0].metadata.name}')

# Install plugin
kubectl exec -n wcr $POD -- sh -c "cd /opt/etherpad-lite && pnpm add -w ep_webhooks"

# Restart Etherpad
kubectl rollout restart deployment/etherpad -n wcr

# Wait for ready
echo "⏳ Waiting for Etherpad to restart..."
kubectl wait --for=condition=ready pod -l app=etherpad -n wcr --timeout=90s

# Verify
echo "✅ Checking if plugin is loaded..."
kubectl logs -n wcr -l app=etherpad --tail=100 | grep -i "ep_webhooks\|Loaded.*plugins"

echo "🎉 Done! Configure webhooks in Etherpad settings.json"
```

Save as `install-webhooks.sh`, make executable, and run:

```bash
chmod +x install-webhooks.sh
./install-webhooks.sh
```

---

## 📝 Configure Webhooks for Slack

After installing `ep_webhooks`, configure it in the Etherpad ConfigMap:

```bash
kubectl edit configmap etherpad-config -n wcr
```

Add to `settings.json`:

```json
{
  "ep_webhooks": {
    "webhooks": [
      {
        "url": "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
        "events": ["padCreate", "padUpdate"],
        "format": "slack",
        "payload": {
          "username": "Etherpad Bot",
          "icon_emoji": ":memo:"
        }
      }
    ]
  }
}
```

Then restart:

```bash
kubectl rollout restart deployment/etherpad -n wcr
```

---

## 🔍 Available Plugins List

Since the UI search doesn't work, here's a curated list of useful plugins:

### Communication & Collaboration
- `ep_webhooks` - Webhook notifications (Slack, Discord, etc.)
- `ep_comments_page` - Add comments to pads
- `ep_real_time_chat` - Enhanced chat features
- `ep_cursortrace` - See other users' cursors
- `ep_author_hover` - Show author on hover

### Formatting & Editing
- `ep_headings2` - Heading support (H1, H2, H3)
- `ep_markdown` - Markdown support
- `ep_align` - Text alignment
- `ep_font_color` - Font colors
- `ep_font_size` - Font sizes
- `ep_font_family` - Different fonts
- `ep_clear_formatting` - Clear formatting button

### Content & Media
- `ep_image_upload` - Upload images
- `ep_embedmedia` - Embed videos (YouTube, Vimeo)
- `ep_table_of_contents` - Auto TOC

### Administration
- `ep_adminpads2` - Better pad management
- `ep_search` - Search through pads
- `ep_hash_auth` - Password authentication
- `ep_ldapauth` - LDAP authentication

### Export & Import
- `ep_mammoth` - Better Word document import
- `ep_convert` - Additional export formats

---

## 🚀 Recommended Plugin Set

For a full-featured Etherpad with Slack integration:

```bash
POD=$(kubectl get pods -n wcr -l app=etherpad -o jsonpath='{.items[0].metadata.name}')

kubectl exec -n wcr $POD -- sh -c "cd /opt/etherpad-lite && pnpm add -w \\
  ep_webhooks \\
  ep_headings2 \\
  ep_markdown \\
  ep_comments_page \\
  ep_table_of_contents \\
  ep_align \\
  ep_font_color \\
  ep_font_size \\
  ep_adminpads2 \\
  ep_search"

kubectl rollout restart deployment/etherpad -n wcr
```

---

## ❓ Troubleshooting

### Plugin not loading after install?

```bash
# Check if plugin was installed
POD=$(kubectl get pods -n wcr -l app=etherpad -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n wcr $POD -- ls -la /opt/etherpad-lite/node_modules | grep ep_

# Check logs for errors
kubectl logs -n wcr -l app=etherpad --tail=100 | grep -i error
```

### Plugin causes crash?

```bash
# Uninstall the problematic plugin
kubectl exec -n wcr $POD -- sh -c "cd /opt/etherpad-lite && pnpm remove ep_problematic_plugin"

# Restart
kubectl rollout restart deployment/etherpad -n wcr
```

### Plugins disappear after pod restart?

This happens because plugins installed directly in the pod are ephemeral. Use Solution 2 (Custom Docker Image) for permanent installation.

---

## 📚 More Information

- **Etherpad Plugin Directory**: https://static.etherpad.org/plugins.html
- **Plugin Development**: https://etherpad.org/doc/latest/#index_plugins
- **Webhook Documentation**: https://github.com/citizenos/ep_webhooks

---

**Note**: The plugin search UI issue is a known limitation when Etherpad is behind a reverse proxy. The solutions above bypass this limitation entirely.


