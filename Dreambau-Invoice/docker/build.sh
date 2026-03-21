#!/bin/bash
set -e

echo "============================================"
echo "Building Custom InvoiceNinja Docker Image"
echo "============================================"
echo ""

# Configuration
IMAGE_NAME="wcr-invoiceninja"
IMAGE_TAG="latest"
BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ')

# Get InvoiceNinja version from source
cd ../source
NINJA_VERSION=$(git describe --tags --abbrev=0 2>/dev/null || echo "v5-stable")
cd ../docker

echo "InvoiceNinja Version: $NINJA_VERSION"
echo "Image: $IMAGE_NAME:$IMAGE_TAG"
echo "Build Date: $BUILD_DATE"
echo ""

# Build Docker image
echo "Building Docker image..."
cd ..  # Go to Dreambau-Invoice directory
docker build \
    --build-arg BUILD_DATE="$BUILD_DATE" \
    --build-arg VERSION="$NINJA_VERSION" \
    -t "$IMAGE_NAME:$IMAGE_TAG" \
    -t "$IMAGE_NAME:$NINJA_VERSION" \
    -f docker/Dockerfile \
    .
cd docker  # Return to docker directory

echo ""
echo "============================================"
echo "Build Complete!"
echo "============================================"
echo ""
echo "Image built: $IMAGE_NAME:$IMAGE_TAG"
echo "Also tagged: $IMAGE_NAME:$NINJA_VERSION"
echo ""
echo "Next steps:"
echo "1. Test the image: docker run --rm $IMAGE_NAME:$IMAGE_TAG php -v"
echo "2. Import to k3s: docker save $IMAGE_NAME:$IMAGE_TAG | sudo k3s ctr images import -"
echo "3. Deploy to Kubernetes"
echo ""

