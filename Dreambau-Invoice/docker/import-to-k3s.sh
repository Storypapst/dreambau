#!/bin/bash
set -e

IMAGE_NAME="wcr-invoiceninja"
IMAGE_TAG="latest"

echo "============================================"
echo "Importing Docker Image to k3s"
echo "============================================"
echo ""

if ! docker image inspect "$IMAGE_NAME:$IMAGE_TAG" &> /dev/null; then
    echo "Error: Image $IMAGE_NAME:$IMAGE_TAG not found!"
    echo "Please build the image first: bash build.sh"
    exit 1
fi

echo "Exporting Docker image..."
docker save "$IMAGE_NAME:$IMAGE_TAG" -o /tmp/wcr-invoiceninja.tar

echo "Importing to k3s..."
sudo k3s ctr images import /tmp/wcr-invoiceninja.tar

echo "Cleaning up..."
rm /tmp/wcr-invoiceninja.tar

echo ""
echo "✓ Image imported successfully!"
echo ""
echo "Verify import:"
echo "  sudo k3s ctr images ls | grep wcr-invoiceninja"
echo ""

