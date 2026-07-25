#!/usr/bin/env bash
# Proves the real request path — Traefik → Service → pod, through the
# NetworkPolicy — without waiting for DNS. A temporary plain-HTTP Ingress is
# used so cert-manager is never asked for a certificate it cannot obtain.
set -uo pipefail

pass=0
fail=0
check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    printf 'PASS  %-52s %s\n' "$name" "$actual"; pass=$((pass + 1))
  else
    printf 'FAIL  %-52s expected %s, got %s\n' "$name" "$expected" "$actual"; fail=$((fail + 1))
  fi
}

echo "=== NetworkPolicy: only Traefik may reach the gateway ==="
from_traefik=$(kubectl -n traefik run np-allow-$RANDOM --rm -i --restart=Never --quiet \
  --image=curlimages/curl:8.11.1 --command -- \
  curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
  http://dreambau-evidence.wcr.svc.cluster.local/health/live 2>/dev/null | tr -d '\r')
check "pod in the traefik namespace is allowed" 200 "$from_traefik"

from_default=$(kubectl -n default run np-deny-$RANDOM --rm -i --restart=Never --quiet \
  --image=curlimages/curl:8.11.1 --command -- \
  curl -s -o /dev/null -w '%{http_code}' --max-time 8 \
  http://dreambau-evidence.wcr.svc.cluster.local/health/live 2>/dev/null | tr -d '\r')
# Expected 000 if a network policy controller is running. On this cluster it
# is not, so this reports the true state rather than asserting a guarantee that
# does not hold — see k8s/evidence/README.md.
printf 'INFO  %-52s %s\n' "pod in another namespace (000 = policy enforced)" "${from_default:-000}"

echo
echo "=== the Ingress host actually routes to the gateway ==="
cat <<'YAML' | kubectl apply -f - >/dev/null
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: dreambau-evidence-routecheck
  namespace: wcr
spec:
  ingressClassName: traefik
  rules:
    - host: evidence-routecheck.invalid
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: dreambau-evidence
                port: { name: http }
YAML
sleep 5
check "Traefik routes the host to the gateway" 200 \
  "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -H 'Host: evidence-routecheck.invalid' http://127.0.0.1/health/live)"
check "an unknown host does not reach it" 404 \
  "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -H 'Host: nothing-here.invalid' http://127.0.0.1/health/live)"
check "the API still refuses an unauthenticated call through Traefik" 401 \
  "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -H 'Host: evidence-routecheck.invalid' -H 'content-type: application/json' -d '{}' http://127.0.0.1/api/v1/runs)"

kubectl -n wcr delete ingress dreambau-evidence-routecheck >/dev/null
echo "      temporary ingress removed"

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
