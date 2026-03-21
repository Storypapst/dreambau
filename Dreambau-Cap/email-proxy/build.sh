#!/bin/bash

###############################################################################
# Email Proxy Docker Build Script
# Builds the custom Resend-to-SMTP bridge service
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        Email Proxy (Resend to SMTP) Builder                 ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

cd "$SCRIPT_DIR"

echo -e "${YELLOW}→ Building email-proxy Docker image...${NC}"
echo ""

# Build the image
docker build -t email-proxy:latest .

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✓ Docker image built successfully: email-proxy:latest${NC}"
    echo ""
    
    # Show image details
    echo -e "${BLUE}Image Details:${NC}"
    docker images email-proxy:latest
    echo ""
    
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║           Docker Build Complete!                            ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${BLUE}Next step:${NC}"
    echo -e "  Import to k3s: ${YELLOW}./import-to-k3s.sh${NC}"
    echo ""
else
    echo ""
    echo -e "${RED}✗ Docker build failed${NC}"
    exit 1
fi

