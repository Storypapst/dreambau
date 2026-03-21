#!/bin/bash

# Webstudio Publishing Build Script
# Usage: ./build-script.sh <project-id> <project-name> <build-id>

set -e

PROJECT_ID="$1"
PROJECT_NAME="$2"
BUILD_ID="$3"

if [ -z "$PROJECT_ID" ] || [ -z "$PROJECT_NAME" ]; then
  echo "Error: PROJECT_ID and PROJECT_NAME are required"
  exit 1
fi

echo "========================================="
echo "Building Webstudio Project"
echo "Project ID: $PROJECT_ID"
echo "Project Name: $PROJECT_NAME"
echo "Build ID: $BUILD_ID"
echo "========================================="

# Configuration
BUILDS_DIR="/home/backup/Documents/business/wcr/Dreambau-Webstudio-Sites"
PROJECT_DIR="$BUILDS_DIR/$PROJECT_NAME"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BUILD_LOG="$BUILDS_DIR/logs/${PROJECT_NAME}_${TIMESTAMP}.log"

# Create directories
mkdir -p "$BUILDS_DIR/logs"
mkdir -p "$PROJECT_DIR"

cd "$PROJECT_DIR"

# Log function
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$BUILD_LOG"
}

log "Starting build process..."

# Step 1: Link project (if not already linked)
if [ ! -f ".webstudio/project.json" ]; then
  log "Project not linked. Please link manually first with: webstudio link"
  exit 1
fi

# Step 2: Sync from cloud
log "Syncing project from cloud..."
if ! webstudio sync >> "$BUILD_LOG" 2>&1; then
  log "ERROR: Sync failed"
  exit 1
fi

# Step 3: Build the project
log "Building project..."
if ! webstudio build --template remix >> "$BUILD_LOG" 2>&1; then
  log "ERROR: Build failed"
  exit 1
fi

# Step 4: Install dependencies
log "Installing dependencies..."
if ! npm install >> "$BUILD_LOG" 2>&1; then
  log "ERROR: npm install failed"
  exit 1
fi

# Step 5: Build production bundle
log "Building production bundle..."
if ! npm run build >> "$BUILD_LOG" 2>&1; then
  log "ERROR: Production build failed"
  exit 1
fi

# Step 6: Build Docker image
log "Building Docker image..."
DOCKER_IMAGE="webstudio-site-${PROJECT_NAME}:${BUILD_ID}"

if ! docker build -t "$DOCKER_IMAGE" -f ../docker/Dockerfile.site . >> "$BUILD_LOG" 2>&1; then
  log "ERROR: Docker build failed"
  exit 1
fi

# Step 7: Import to k3s
log "Importing image to k3s..."
if ! docker save "$DOCKER_IMAGE" | sudo k3s ctr images import - >> "$BUILD_LOG" 2>&1; then
  log "ERROR: k3s import failed"
  exit 1
fi

# Step 8: Deploy to Kubernetes
log "Deploying to Kubernetes..."
cat > "$PROJECT_DIR/k8s-deployment.yaml" <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: webstudio-site-${PROJECT_NAME}
  namespace: wcr
  labels:
    app: webstudio-site
    site: ${PROJECT_NAME}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: webstudio-site
      site: ${PROJECT_NAME}
  template:
    metadata:
      labels:
        app: webstudio-site
        site: ${PROJECT_NAME}
    spec:
      containers:
      - name: site
        image: ${DOCKER_IMAGE}
        imagePullPolicy: Never
        ports:
        - containerPort: 3000
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: webstudio-site-${PROJECT_NAME}
  namespace: wcr
spec:
  selector:
    app: webstudio-site
    site: ${PROJECT_NAME}
  ports:
  - port: 3000
    targetPort: 3000
---
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: ${PROJECT_NAME}-sites-dreambau-com-tls
  namespace: wcr
spec:
  secretName: ${PROJECT_NAME}-sites-dreambau-com-tls
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  dnsNames:
    - ${PROJECT_NAME}.sites.dreambau.com
---
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: webstudio-site-${PROJECT_NAME}
  namespace: wcr
spec:
  entryPoints:
    - websecure
  routes:
    - match: Host(\`${PROJECT_NAME}.sites.dreambau.com\`)
      kind: Rule
      services:
        - name: webstudio-site-${PROJECT_NAME}
          port: 3000
  tls:
    secretName: ${PROJECT_NAME}-sites-dreambau-com-tls
EOF

if ! kubectl apply -f "$PROJECT_DIR/k8s-deployment.yaml" >> "$BUILD_LOG" 2>&1; then
  log "ERROR: Kubernetes deployment failed"
  exit 1
fi

log "========================================="
log "Build completed successfully!"
log "Site URL: https://${PROJECT_NAME}.sites.dreambau.com"
log "Log file: $BUILD_LOG"
log "========================================="

# Cleanup old builds (keep last 5)
log "Cleaning up old builds..."
cd "$BUILDS_DIR/logs"
ls -t | tail -n +6 | xargs -r rm --

exit 0





