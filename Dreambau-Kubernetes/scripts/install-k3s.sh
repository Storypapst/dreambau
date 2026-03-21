#!/bin/bash
set -e

echo "============================================"
echo "Installing k3s Kubernetes with Traefik"
echo "============================================"
echo ""

# Check if k3s is already installed
if command -v k3s &> /dev/null; then
    echo "k3s is already installed"
    k3s --version
    echo ""
    read -p "Do you want to reinstall? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        echo "Installation cancelled."
        exit 0
    fi
    echo "Uninstalling existing k3s..."
    /usr/local/bin/k3s-uninstall.sh || true
fi

# Install k3s
echo "Installing k3s..."
curl -sfL https://get.k3s.io | sh -

# Wait for k3s to be ready
echo "Waiting for k3s to be ready..."
sleep 10

# Configure kubectl access
echo "Configuring kubectl access..."
sudo chmod 644 /etc/rancher/k3s/k3s.yaml
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

# Add to bashrc if not already there
if ! grep -q "KUBECONFIG=/etc/rancher/k3s/k3s.yaml" ~/.bashrc; then
    echo "export KUBECONFIG=/etc/rancher/k3s/k3s.yaml" >> ~/.bashrc
fi

# Wait for node to be ready
echo "Waiting for node to be ready..."
kubectl wait --for=condition=Ready node --all --timeout=300s

# Create wcr namespace
echo "Creating wcr namespace..."
kubectl create namespace wcr || echo "Namespace wcr already exists"

echo ""
echo "============================================"
echo "k3s Installation Complete!"
echo "============================================"
echo ""
kubectl get nodes
echo ""
echo "Traefik ingress controller is installed and running"
echo "Namespace 'wcr' created"
echo ""

