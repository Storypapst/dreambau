#!/bin/bash

# ===========================================
# Novu Docker Compose Setup Script
# ===========================================

set -e

echo "============================================"
echo "Novu Docker Compose Setup"
echo "============================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed!${NC}"
    echo "Please install Docker first: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker Compose is installed
if ! docker compose version &> /dev/null; then
    echo -e "${RED}Error: Docker Compose is not installed!${NC}"
    echo "Please install Docker Compose first"
    exit 1
fi

echo -e "${GREEN}✓ Docker and Docker Compose are installed${NC}"
echo ""

# Check if docker-compose.yml exists
if [ ! -f "docker-compose.yml" ]; then
    echo -e "${RED}Error: docker-compose.yml not found in current directory!${NC}"
    exit 1
fi

echo -e "${GREEN}✓ docker-compose.yml found${NC}"
echo ""

# Ask for domain name
echo -e "${YELLOW}Configuration Setup${NC}"
echo ""
read -p "Enter your domain name (e.g., novu.example.com): " DOMAIN_NAME

if [ -z "$DOMAIN_NAME" ]; then
    echo -e "${RED}Error: Domain name is required!${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Do you want to generate new security secrets?${NC}"
echo "Recommended for production deployments"
read -p "Generate new secrets? (y/N): " GENERATE_SECRETS

# Generate secrets if requested
if [[ $GENERATE_SECRETS =~ ^[Yy]$ ]]; then
    echo ""
    echo "Generating security secrets..."
    JWT_SECRET=$(openssl rand -hex 32)
    STORE_KEY=$(openssl rand -hex 16)
    NOVU_SECRET=$(openssl rand -hex 32)
    
    echo -e "${GREEN}✓ Secrets generated${NC}"
    echo ""
    echo "Copy these secrets for your records:"
    echo "-----------------------------------"
    echo "JWT_SECRET=$JWT_SECRET"
    echo "STORE_ENCRYPTION_KEY=$STORE_KEY"
    echo "NOVU_SECRET_KEY=$NOVU_SECRET"
    echo "-----------------------------------"
    echo ""
    read -p "Press Enter to continue..."
fi

# Update docker-compose.yml
echo ""
echo "Updating docker-compose.yml with your domain..."
sed -i.bak "s|novu.yourdomain.com|$DOMAIN_NAME|g" docker-compose.yml

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Domain updated in docker-compose.yml${NC}"
    echo "  (Original file backed up as docker-compose.yml.bak)"
else
    echo -e "${RED}Error: Failed to update docker-compose.yml${NC}"
    exit 1
fi

# Update secrets if generated
if [[ $GENERATE_SECRETS =~ ^[Yy]$ ]]; then
    echo "Updating secrets in docker-compose.yml..."
    sed -i "s|JWT_SECRET: \".*\"|JWT_SECRET: \"$JWT_SECRET\"|g" docker-compose.yml
    sed -i "s|STORE_ENCRYPTION_KEY: \".*\"|STORE_ENCRYPTION_KEY: \"$STORE_KEY\"|g" docker-compose.yml
    sed -i "s|NOVU_SECRET_KEY: \".*\"|NOVU_SECRET_KEY: \"$NOVU_SECRET\"|g" docker-compose.yml
    echo -e "${GREEN}✓ Secrets updated in docker-compose.yml${NC}"
fi

echo ""
echo -e "${YELLOW}MongoDB Configuration${NC}"
read -p "Enter MongoDB password (or press Enter to use default): " MONGO_PASS

if [ ! -z "$MONGO_PASS" ]; then
    echo "Updating MongoDB password..."
    sed -i "s|Novu_Mongo_Pass_2024_Change_Me|$MONGO_PASS|g" docker-compose.yml
    echo -e "${GREEN}✓ MongoDB password updated${NC}"
fi

echo ""
echo -e "${GREEN}Configuration complete!${NC}"
echo ""
echo "============================================"
echo "Starting Novu Services"
echo "============================================"
echo ""

# Pull images
echo "Pulling Docker images..."
docker compose pull

# Start services
echo ""
echo "Starting services..."
docker compose up -d

# Wait a bit
echo ""
echo "Waiting for services to start..."
sleep 10

# Check status
echo ""
echo "============================================"
echo "Service Status"
echo "============================================"
docker compose ps

echo ""
echo "============================================"
echo "Setup Complete!"
echo "============================================"
echo ""
echo "Next steps:"
echo "1. Configure your DNS to point $DOMAIN_NAME to this server"
echo "2. Set up reverse proxy (Nginx, Traefik, Caddy, etc.)"
echo "3. Configure SSL certificate (Let's Encrypt recommended)"
echo "4. Access the dashboard at https://$DOMAIN_NAME"
echo ""
echo "Useful commands:"
echo "  View logs:          docker compose logs -f"
echo "  Check status:       docker compose ps"
echo "  Stop services:      docker compose down"
echo "  Restart services:   docker compose restart"
echo ""
echo "For detailed setup guide, see README.md"
echo ""



