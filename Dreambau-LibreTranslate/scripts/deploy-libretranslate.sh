#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

kubectl apply -f "${ROOT_DIR}/config/libretranslate-deployment.yaml"
kubectl apply -f "${ROOT_DIR}/config/libretranslate-ingress.yaml"

kubectl -n wcr rollout status deploy/libretranslate --timeout=10m
kubectl -n wcr get pods -l app=libretranslate
kubectl -n wcr get svc libretranslate
kubectl -n wcr get ingress libretranslate-ingress




