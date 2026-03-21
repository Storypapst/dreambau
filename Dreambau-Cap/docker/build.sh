#!/bin/bash

###############################################################################
# Cap Docker Build Script
# Builds the custom Cap Docker image from GitHub source
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║              Cap Docker Image Builder                        ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
WCR_ROOT="$(dirname "$PROJECT_ROOT")"
SOURCE_DIR="$PROJECT_ROOT/source"

echo -e "${BLUE}Directory Structure:${NC}"
echo -e "  Script Dir:  ${YELLOW}${SCRIPT_DIR}${NC}"
echo -e "  Project Root: ${YELLOW}${PROJECT_ROOT}${NC}"
echo -e "  Source Dir:   ${YELLOW}${SOURCE_DIR}${NC}"
echo ""

# Check if source directory exists
if [ ! -d "$SOURCE_DIR" ]; then
    echo -e "${YELLOW}→ Cap source code not found. Cloning from GitHub...${NC}"
    echo ""
    
    # Clone Cap repository
    git clone https://github.com/CapSoftware/Cap.git "$SOURCE_DIR"
    
    echo ""
    echo -e "${GREEN}✓ Cap source code cloned successfully${NC}"
    echo ""
fi

# Navigate to project root for Docker build context
cd "$PROJECT_ROOT"

echo -e "${YELLOW}→ Building Cap Docker image...${NC}"
echo -e "${BLUE}   This may take 10-15 minutes on first build${NC}"
echo ""

# Build the image
docker build \
  -t cap-web:latest \
  -f docker/Dockerfile \
  source/

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✓ Docker image built successfully: cap-web:latest${NC}"
    echo ""
    
    # Show image details
    echo -e "${BLUE}Image Details:${NC}"
    docker images cap-web:latest
    echo ""
    
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║           Docker Build Complete!                            ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${BLUE}Next steps:${NC}"
    echo -e "  1. Import to k3s: ${YELLOW}./docker/import-to-k3s.sh${NC}"
    echo -e "  2. Deploy Cap:    ${YELLOW}./scripts/deploy-cap.sh${NC}"
    echo ""
else
    echo ""
    echo -e "${RED}✗ Docker build failed${NC}"
    exit 1
fi

