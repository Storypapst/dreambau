#!/bin/bash

set -e

echo "📦 Installing ep_webhooks plugin for Slack integration..."
echo ""

# Get pod name
POD=$(kubectl get pods -n wcr -l app=etherpad -o jsonpath='{.items[0].metadata.name}')

if [ -z "$POD" ]; then
    echo "❌ Error: No Etherpad pod found!"
    exit 1
fi

echo "Found pod: $POD"
echo ""

# Install plugin
echo "Installing ep_webhooks..."
kubectl exec -n wcr $POD -- sh -c "cd /opt/etherpad-lite && pnpm add -w ep_webhooks"

echo ""
echo "✅ Plugin installed! Restarting Etherpad..."
echo ""

# Restart Etherpad
kubectl rollout restart deployment/etherpad -n wcr

# Wait for ready
echo "⏳ Waiting for Etherpad to restart (this may take 30-60 seconds)..."
kubectl wait --for=condition=ready pod -l app=etherpad -n wcr --timeout=90s

echo ""
echo "✅ Checking if plugin is loaded..."
sleep 5
kubectl logs -n wcr -l app=etherpad --tail=100 | grep -i "ep_webhooks\|Loaded.*plugins" || echo "Check logs manually if needed"

echo ""
echo "🎉 Done! ep_webhooks plugin is installed!"
echo ""
echo "Next steps:"
echo "1. Get your Slack webhook URL from https://api.slack.com/apps"
echo "2. Configure it in Etherpad settings (see PLUGIN_INSTALLATION_GUIDE.md)"
echo "3. Restart Etherpad to apply the configuration"
echo ""


