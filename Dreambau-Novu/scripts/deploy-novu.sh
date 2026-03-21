#!/bin/bash

set -euo pipefail

echo "🚀 Deploying Novu to Kubernetes..."
echo ""

# Ensure we are in the correct directory
cd "$(dirname "$0")/.."

# Step 1: Deploy MongoDB
echo "📦 Step 1/5: Deploying MongoDB..."
kubectl apply -f config/mongodb-deployment.yaml -n wcr
echo "✅ MongoDB deployment created"
echo ""

# Step 2: Deploy Redis
echo "📦 Step 2/5: Deploying Redis..."
kubectl apply -f config/redis-deployment.yaml -n wcr
echo "✅ Redis deployment created"
echo ""

# Wait for MongoDB and Redis to be ready
echo "⏳ Waiting for MongoDB to be ready..."
kubectl rollout status deployment/mongodb -n wcr --timeout=5m

echo "⏳ Waiting for Redis to be ready..."
kubectl rollout status deployment/redis -n wcr --timeout=5m
echo ""

# Step 3: Apply Novu secrets
echo "🔐 Step 3/5: Applying Novu secrets..."
kubectl apply -f config/novu-secret.yaml -n wcr
echo "✅ Novu secrets applied"
echo ""

# Step 4: Deploy Novu applications
echo "📦 Step 4/5: Deploying Novu applications..."
kubectl apply -f config/novu-deployment.yaml -n wcr
echo "✅ Novu applications deployed"
echo ""

# Wait for Novu API to be ready
echo "⏳ Waiting for Novu API to be ready..."
kubectl rollout status deployment/novu-api -n wcr --timeout=5m
echo ""

# Step 5: Apply Ingress
echo "🌐 Step 5/5: Applying Ingress..."
kubectl apply -f config/novu-ingress.yaml -n wcr
echo "✅ Ingress applied"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Novu deployment completed successfully!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🌐 Access Novu at: https://novu.dreambau.com"
echo ""
echo "⏳ Please allow 1-2 minutes for:"
echo "   • SSL certificate provisioning"
echo "   • All services to fully initialize"
echo ""
echo "📋 DNS Configuration Required:"
echo "   Add an A record: novu.dreambau.com → Your server IP"
echo ""
echo "📊 Check deployment status:"
echo "   kubectl get pods -n wcr -l app=novu"
echo ""
echo "📝 View logs:"
echo "   kubectl logs -n wcr -l app=novu,component=api --tail=50 -f"
echo ""



