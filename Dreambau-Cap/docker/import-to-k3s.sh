#!/bin/bash

###############################################################################
# Import Cap Docker Image to k3s
# Imports the built Docker image into k3s cluster's registry
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        Import Cap Image to k3s Cluster                       ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if running as root or with sudo
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}✗ This script must be run as root or with sudo${NC}"
   exit 1
fi

# Check if Docker image exists
if ! docker images cap-web:latest | grep -q cap-web; then
    echo -e "${RED}✗ Docker image 'cap-web:latest' not found${NC}"
    echo -e "${YELLOW}  Please build it first: ./docker/build.sh${NC}"
    exit 1
fi

echo -e "${YELLOW}→ Saving Docker image to tar file...${NC}"
docker save cap-web:latest -o /tmp/cap-web.tar

echo -e "${GREEN}✓ Image saved to /tmp/cap-web.tar${NC}"
echo ""

echo -e "${YELLOW}→ Importing image into k3s cluster...${NC}"
k3s ctr images import /tmp/cap-web.tar

echo -e "${GREEN}✓ Image imported successfully${NC}"
echo ""

echo -e "${YELLOW}→ Cleaning up temporary file...${NC}"
rm /tmp/cap-web.tar

echo -e "${GREEN}✓ Cleanup complete${NC}"
echo ""

# Verify import
echo -e "${BLUE}Verifying imported images:${NC}"
k3s ctr images ls | grep cap-web
echo ""

echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         Image Import Complete!                               ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Next step:${NC}"
echo -e "  Deploy Cap: ${YELLOW}./scripts/deploy-cap.sh${NC}"
echo ""

