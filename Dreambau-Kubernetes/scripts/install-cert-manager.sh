#!/bin/bash
set -e

export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

echo "============================================"
echo "Installing cert-manager"
echo "============================================"
echo ""

# Check if cert-manager is already installed
if kubectl get namespace cert-manager &> /dev/null; then
    echo "cert-manager namespace already exists"
    read -p "Do you want to reinstall? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        echo "Installation cancelled."
        exit 0
    fi
    echo "Uninstalling existing cert-manager..."
    kubectl delete namespace cert-manager
    sleep 5
fi

# Install cert-manager
echo "Installing cert-manager..."
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.2/cert-manager.yaml

# Wait for cert-manager to be ready
echo "Waiting for cert-manager to be ready..."
sleep 20
kubectl wait --for=condition=Available --timeout=300s deployment/cert-manager -n cert-manager
kubectl wait --for=condition=Available --timeout=300s deployment/cert-manager-webhook -n cert-manager
kubectl wait --for=condition=Available --timeout=300s deployment/cert-manager-cainjector -n cert-manager

echo ""
echo "============================================"
echo "cert-manager Installation Complete!"
echo "============================================"
echo ""
kubectl get pods -n cert-manager
echo ""

