#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Dreambau Iframely Deployment Script  ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check if running from correct directory
if [ ! -f "config/iframely-deployment.yaml" ]; then
    echo -e "${RED}Error: Please run this script from the Dreambau-iframely directory${NC}"
    exit 1
fi

# Check if secret exists
if [ ! -f "config/iframely-secret.yaml" ]; then
    echo -e "${RED}Error: iframely-secret.yaml not found!${NC}"
    echo "Please ensure config/iframely-secret.yaml exists"
    exit 1
fi

# Create namespace if it doesn't exist
echo -e "${YELLOW}Creating namespace...${NC}"
kubectl create namespace wcr --dry-run=client -o yaml | kubectl apply -f -

# Apply secret
echo -e "${YELLOW}Applying Iframely secret...${NC}"
kubectl apply -f config/iframely-secret.yaml

# Apply deployment
echo -e "${YELLOW}Deploying Iframely...${NC}"
kubectl apply -f config/iframely-deployment.yaml

# Wait for deployment
echo -e "${YELLOW}Waiting for Iframely to be ready...${NC}"
kubectl wait --for=condition=available --timeout=300s deployment/iframely -n wcr || {
    echo -e "${RED}Deployment failed or timed out${NC}"
    echo -e "${YELLOW}Checking pod status...${NC}"
    kubectl get pods -n wcr -l app=iframely
    echo -e "${YELLOW}Recent logs:${NC}"
    kubectl logs -n wcr -l app=iframely --tail=50
    exit 1
}

# Get API key from secret
API_KEY=$(kubectl get secret iframely-secret -n wcr -o jsonpath='{.data.API_KEY}' | base64 -d)

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Iframely Deployed Successfully! 🎉   ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  API INFORMATION${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${GREEN}API URL:${NC} https://iframely.dreambau.com"
echo -e "${GREEN}API Key:${NC} ${API_KEY}"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  USAGE EXAMPLES${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "1. oEmbed API:"
echo "   https://iframely.dreambau.com/iframely?url=YOUR_URL&api_key=${API_KEY}"
echo ""
echo "2. oEmbed API (with key in header):"
echo "   curl -H 'X-API-Key: ${API_KEY}' \\"
echo "        https://iframely.dreambau.com/iframely?url=YOUR_URL"
echo ""
echo "3. Test with a URL:"
echo "   curl 'https://iframely.dreambau.com/iframely?url=https://youtube.com/watch?v=dQw4w9WgXcQ&api_key=${API_KEY}'"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  USEFUL COMMANDS${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  View logs:    kubectl logs -n wcr -l app=iframely -f"
echo "  View pods:    kubectl get pods -n wcr -l app=iframely"
echo "  Restart:      kubectl rollout restart deployment/iframely -n wcr"
echo "  Shell access: kubectl exec -it -n wcr deployment/iframely -- sh"
echo "  Test status:  curl https://iframely.dreambau.com/api/status"
echo ""
echo -e "${YELLOW}Note: Make sure DNS record for iframely.dreambau.com points to your server!${NC}"
echo ""





