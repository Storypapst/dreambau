#!/bin/bash

###############################################################################
# Import Email Proxy Docker Image to k3s
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        Import Email Proxy to k3s Cluster                     ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}✗ This script must be run as root or with sudo${NC}"
   exit 1
fi

# Check if image exists
if ! docker images email-proxy:latest | grep -q email-proxy; then
    echo -e "${RED}✗ Docker image 'email-proxy:latest' not found${NC}"
    echo -e "${YELLOW}  Please build it first: ./build.sh${NC}"
    exit 1
fi

echo -e "${YELLOW}→ Saving Docker image to tar file...${NC}"
docker save email-proxy:latest -o /tmp/email-proxy.tar

echo -e "${GREEN}✓ Image saved${NC}"
echo ""

echo -e "${YELLOW}→ Importing image into k3s cluster...${NC}"
k3s ctr images import /tmp/email-proxy.tar

echo -e "${GREEN}✓ Image imported${NC}"
echo ""

echo -e "${YELLOW}→ Cleaning up...${NC}"
rm /tmp/email-proxy.tar

echo -e "${GREEN}✓ Cleanup complete${NC}"
echo ""

echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         Image Import Complete!                               ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Next step:${NC}"
echo -e "  Deploy: ${YELLOW}./deploy.sh${NC}"
echo ""

