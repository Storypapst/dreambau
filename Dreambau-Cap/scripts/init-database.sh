#!/bin/bash

###############################################################################
# Cap Database Initialization Script
# Creates cap database and user in existing MySQL server
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           Cap Database Initialization                        ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if running as root or with sudo
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}✗ This script must be run as root or with sudo${NC}"
   exit 1
fi

# Set KUBECONFIG
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}✗ kubectl not found. Please install k3s first.${NC}"
    exit 1
fi

# Check if MySQL pod is running
echo -e "${YELLOW}→ Checking MySQL pod status...${NC}"
if ! kubectl get pod -n wcr -l app=mysql &> /dev/null; then
    echo -e "${RED}✗ MySQL pod not found in wcr namespace${NC}"
    exit 1
fi

MYSQL_POD=$(kubectl get pod -n wcr -l app=mysql -o jsonpath='{.items[0].metadata.name}')
echo -e "${GREEN}✓ MySQL pod found: ${MYSQL_POD}${NC}"
echo ""

# Get MySQL root password from secret
echo -e "${YELLOW}→ Retrieving MySQL root password...${NC}"
MYSQL_ROOT_PASSWORD=$(kubectl get secret mysql-secret -n wcr -o jsonpath='{.data.MYSQL_ROOT_PASSWORD}' | base64 -d)
echo -e "${GREEN}✓ Root password retrieved${NC}"
echo ""

# Create Cap database and user
echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Creating Cap Database and User${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${YELLOW}→ Executing SQL commands...${NC}"

kubectl exec -n wcr ${MYSQL_POD} -- mysql -u root -p"${MYSQL_ROOT_PASSWORD}" -e "
CREATE DATABASE IF NOT EXISTS cap CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'cap'@'%' IDENTIFIED BY 'Cap_Pass_2024_Change_Me';
GRANT ALL PRIVILEGES ON cap.* TO 'cap'@'%';
FLUSH PRIVILEGES;
SHOW DATABASES;" 2>&1 | grep -v "Warning"

echo ""
echo -e "${GREEN}✓ Cap database and user created successfully${NC}"
echo ""

# Test connection
echo -e "${YELLOW}→ Testing Cap user connection...${NC}"
if kubectl exec -n wcr ${MYSQL_POD} -- mysql -u cap -p'Cap_Pass_2024_Change_Me' -e "SELECT 1;" cap &> /dev/null; then
    echo -e "${GREEN}✓ Connection test successful${NC}"
else
    echo -e "${RED}✗ Connection test failed${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Database Summary${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${GREEN}Database Name:${NC} cap"
echo -e "${GREEN}Database User:${NC} cap"
echo -e "${GREEN}Database Host:${NC} mysql.wcr.svc.cluster.local"
echo -e "${GREEN}Database Port:${NC} 3306"
echo ""
echo -e "${YELLOW}⚠  Password:${NC} Cap_Pass_2024_Change_Me"
echo -e "${YELLOW}   (Configured in: Dreambau-Cap/config/cap-secret.yaml)${NC}"
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         Database Initialization Complete!                    ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo -e "  1. Build Cap Docker image: ${YELLOW}./Dreambau-Cap/docker/build.sh${NC}"
echo -e "  2. Deploy Cap: ${YELLOW}./Dreambau-Cap/scripts/deploy-cap.sh${NC}"
echo ""

