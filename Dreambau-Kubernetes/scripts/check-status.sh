#!/bin/bash

export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

echo "============================================"
echo "WCR InvoiceNinja - System Status"
echo "============================================"
echo ""

echo "📦 Namespace: wcr"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
kubectl get all -n wcr
echo ""

echo "🔐 SSL Certificates"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
kubectl get certificate -n wcr
echo ""

echo "🌐 Ingress Status"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
kubectl get ingress -n wcr
echo ""

echo "💾 Persistent Volumes"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
kubectl get pvc -n wcr
echo ""

echo "🔍 Pod Details"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
kubectl get pods -n wcr -o wide
echo ""

echo "📊 Resource Usage"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
kubectl top pods -n wcr 2>/dev/null || echo "Metrics server not available (optional)"
echo ""

echo "🔍 Certificate Details"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if kubectl get certificate wcrbusiness-online-tls -n wcr &> /dev/null; then
    kubectl describe certificate wcrbusiness-online-tls -n wcr | grep -A 10 "Status:"
else
    echo "Certificate not yet created"
fi
echo ""

echo "============================================"
echo "Quick Commands"
echo "============================================"
echo "View InvoiceNinja logs:  kubectl logs -n wcr deployment/invoiceninja -c invoiceninja -f"
echo "View MySQL logs:         kubectl logs -n wcr deployment/mysql -f"
echo "View Nginx logs:         kubectl logs -n wcr deployment/invoiceninja -c nginx -f"
echo "Restart InvoiceNinja:    kubectl rollout restart deployment/invoiceninja -n wcr"
echo "Access MySQL:            kubectl exec -it -n wcr deployment/mysql -- mysql -u ninja -p"
echo ""

