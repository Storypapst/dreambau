# Etherpad + Slack Integration Guide

## Overview
While there's no official Slack plugin for Etherpad, you can integrate them using webhooks and the Etherpad API.

## Option 1: Webhooks Plugin (Recommended)

### Step 1: Install ep_webhooks Plugin

The `ep_webhooks` plugin can send notifications to Slack when pads are created or edited.

**Install via Admin Panel:**
1. Go to https://etherpad.dreambau.com/admin/plugins
2. Search for "ep_webhooks"
3. Click Install

**Or install manually:**
```bash
# Create a custom Dockerfile
cat > /home/backup/Documents/business/wcr/Dreambau-Etherpad/docker/Dockerfile << 'EOF'
FROM etherpad/etherpad:latest

# Install webhooks plugin
RUN npm install --no-save ep_webhooks

WORKDIR /opt/etherpad-lite
EOF

# Build custom image
cd /home/backup/Documents/business/wcr/Dreambau-Etherpad/docker
docker build -t etherpad-slack:latest .

# Import to k3s
docker save etherpad-slack:latest | sudo k3s ctr images import -

# Update deployment to use new image
kubectl set image deployment/etherpad etherpad=etherpad-slack:latest -n wcr
```

### Step 2: Configure Slack Webhook

1. Go to https://api.slack.com/apps
2. Create a new app or select existing
3. Go to "Incoming Webhooks"
4. Activate Incoming Webhooks
5. Click "Add New Webhook to Workspace"
6. Select the channel to post to
7. Copy the Webhook URL (looks like: `https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXX`)

### Step 3: Configure Etherpad Webhooks

Add to your Etherpad settings.json in ConfigMap:

```json
{
  "ep_webhooks": {
    "webhooks": [
      {
        "url": "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
        "events": ["padCreate", "padUpdate", "padRemove"],
        "format": "slack"
      }
    ]
  }
}
```

---

## Option 2: Use Etherpad API + Slack Bot

Create a simple bot that monitors Etherpad and posts to Slack.

### Create a Slack Bot

**slack-bot.js:**
```javascript
const axios = require('axios');

const ETHERPAD_URL = 'https://etherpad.dreambau.com';
const ETHERPAD_API_KEY = 'YOUR_API_KEY';
const SLACK_WEBHOOK = 'YOUR_SLACK_WEBHOOK_URL';

// Get list of pads
async function getPads() {
  const response = await axios.get(
    `${ETHERPAD_URL}/api/1/listAllPads?apikey=${ETHERPAD_API_KEY}`
  );
  return response.data.data.padIDs;
}

// Get pad text
async function getPadText(padId) {
  const response = await axios.get(
    `${ETHERPAD_URL}/api/1/getText?apikey=${ETHERPAD_API_KEY}&padID=${padId}`
  );
  return response.data.data.text;
}

// Send to Slack
async function sendToSlack(message) {
  await axios.post(SLACK_WEBHOOK, {
    text: message,
    username: 'Etherpad Bot',
    icon_emoji: ':memo:'
  });
}

// Monitor for changes
let lastPadCount = 0;
setInterval(async () => {
  const pads = await getPads();
  if (pads.length > lastPadCount) {
    const newPad = pads[pads.length - 1];
    await sendToSlack(`📝 New pad created: ${ETHERPAD_URL}/p/${newPad}`);
  }
  lastPadCount = pads.length;
}, 60000); // Check every minute
```

---

## Option 3: Zapier/Make.com Integration

Use automation platforms to connect Etherpad and Slack:

### Using Zapier:
1. Create a Zap
2. Trigger: Webhook (when Etherpad sends data)
3. Action: Send message to Slack channel
4. Configure Etherpad to send webhooks to Zapier URL

### Using Make.com (formerly Integromat):
1. Create a scenario
2. Add HTTP webhook module
3. Add Slack module
4. Connect them with your logic

---

## Option 4: Slash Commands in Slack

Create a Slack slash command to interact with Etherpad:

### Example: `/pad create meeting-notes`

**Create a simple Express server:**

```javascript
const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.urlencoded({ extended: true }));

const ETHERPAD_URL = 'https://etherpad.dreambau.com';
const ETHERPAD_API_KEY = 'YOUR_API_KEY';

app.post('/slack/pad', async (req, res) => {
  const { text, user_name } = req.body;
  const [command, padName] = text.split(' ');

  if (command === 'create') {
    // Create pad
    await axios.get(
      `${ETHERPAD_URL}/api/1/createPad?apikey=${ETHERPAD_API_KEY}&padID=${padName}`
    );
    
    res.json({
      response_type: 'in_channel',
      text: `✅ Pad created by ${user_name}: ${ETHERPAD_URL}/p/${padName}`
    });
  } else if (command === 'list') {
    // List pads
    const response = await axios.get(
      `${ETHERPAD_URL}/api/1/listAllPads?apikey=${ETHERPAD_API_KEY}`
    );
    const pads = response.data.data.padIDs.slice(0, 10);
    
    res.json({
      text: `📝 Recent pads:\n${pads.map(p => `• ${ETHERPAD_URL}/p/${p}`).join('\n')}`
    });
  }
});

app.listen(3000);
```

**Deploy to Kubernetes:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: etherpad-slack-bot
  namespace: wcr
spec:
  replicas: 1
  selector:
    matchLabels:
      app: etherpad-slack-bot
  template:
    metadata:
      labels:
        app: etherpad-slack-bot
    spec:
      containers:
      - name: bot
        image: node:18
        command: ["node", "/app/slack-bot.js"]
        volumeMounts:
        - name: bot-code
          mountPath: /app
      volumes:
      - name: bot-code
        configMap:
          name: slack-bot-code
```

---

## Option 5: Simple Notifications via API

Use Etherpad API to send pad updates to Slack:

**Bash script (run as cronjob):**
```bash
#!/bin/bash

API_KEY="YOUR_API_KEY"
SLACK_WEBHOOK="YOUR_SLACK_WEBHOOK"
ETHERPAD_URL="https://etherpad.dreambau.com"

# Get all pads
PADS=$(curl -s "${ETHERPAD_URL}/api/1/listAllPads?apikey=${API_KEY}" | jq -r '.data.padIDs[]')

# Check for new pads (compare with last run)
if [ -f /tmp/last_pads.txt ]; then
  NEW_PADS=$(comm -13 <(sort /tmp/last_pads.txt) <(echo "$PADS" | sort))
  
  if [ ! -z "$NEW_PADS" ]; then
    MESSAGE="📝 New pads created:\n$(echo "$NEW_PADS" | sed "s|^|• ${ETHERPAD_URL}/p/|")"
    
    curl -X POST "$SLACK_WEBHOOK" \
      -H 'Content-Type: application/json' \
      -d "{\"text\":\"$MESSAGE\"}"
  fi
fi

echo "$PADS" > /tmp/last_pads.txt
```

---

## Quick Setup: Webhook Notifications

The fastest way to get Slack notifications:

### 1. Get Your Etherpad API Key:
```bash
kubectl get secret etherpad-secret -n wcr -o jsonpath='{.data.API_KEY}' | base64 -d
```

### 2. Get Your Slack Webhook URL:
- Go to https://api.slack.com/apps
- Create app → Incoming Webhooks → Add webhook

### 3. Test the Integration:
```bash
# When a pad is created/updated, send to Slack
curl -X POST 'YOUR_SLACK_WEBHOOK_URL' \
  -H 'Content-Type: application/json' \
  -d '{
    "text": "📝 New pad created: https://etherpad.dreambau.com/p/test-pad",
    "username": "Etherpad Bot",
    "icon_emoji": ":memo:"
  }'
```

---

## Recommended Approach

**For your use case, I recommend:**

1. **Install `ep_webhooks` plugin** - Sends automatic notifications
2. **Configure Slack Incoming Webhook** - Receives notifications
3. **Set up pad creation/update notifications** - Team stays informed

This gives you:
- ✅ Automatic notifications when pads are created
- ✅ Updates when pads are edited
- ✅ Links directly to pads in Slack
- ✅ No additional servers needed

---

## Need Help?

Let me know which option you'd like to implement, and I'll help you set it up!


