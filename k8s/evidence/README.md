# Evidence gateway deployment

Namespace `wcr`, alongside `testmails`. MinIO lives in `wcr-storage` and stays
private; the gateway is the only workload holding its credentials.

## One-time provisioning

The bucket and the gateway's MinIO user are created once. Neither the MinIO root
password nor the generated secret key is ever written to a file, a log or a
shell literal — the provisioning script pipes the generated value straight into
the Kubernetes Secret.

- Bucket `dreambau-pr-evidence`: versioning enabled, anonymous policy `private`,
  no directory listing.
- MinIO user `evidence-gateway` with policy `evidence-gateway-rw`, scoped to
  that one bucket. It deliberately holds no admin, no bucket-creation and no
  policy rights.
- Secret `wcr/evidence-minio` with `access-key-id` and `secret-access-key`.
- Secret `wcr/evidence-identities` with `machine-identities.json`, holding
  SHA-256 token hashes only — never a token value.

Machine identities follow the same file format as Test Access and reuse the
same code, so an identity is revoked by removing it from that one file.

## Apply order

```bash
kubectl apply -f k8s/evidence/pvc.yaml
kubectl apply -f k8s/evidence/network-policy.yaml
kubectl apply -f k8s/evidence/deployment.yaml
kubectl apply -f k8s/evidence/service.yaml
kubectl apply -f k8s/evidence/pod-disruption-budget.yaml
```

`ingress.yaml` is applied **last and only after** `evidence.dreambau.com`
resolves to `46.225.160.119`. Applying it earlier makes cert-manager retry an
ACME challenge it cannot win, which counts against the Let's Encrypt rate limit.

## Image

Built on the server from `Dockerfile.evidence` and imported into k3s, the same
way `testmails` is handled:

```bash
docker build -f Dockerfile.evidence -t dreambau-evidence:<version> .
docker save dreambau-evidence:<version> -o /tmp/evidence.tar
k3s ctr images import /tmp/evidence.tar
kubectl -n wcr set image deployment/dreambau-evidence evidence=dreambau-evidence:<version>
```

The runtime image carries ffmpeg, which is what normalises video and extracts
posters.

## NetworkPolicy is declared but not enforced

Verified on 2026-07-26: a pod in the `default` namespace reaches this gateway,
and reaches the pre-existing `testmails` service too, despite either policy.
The node carries no `KUBE-ROUTER`/`KUBE-NWPLCY` iptables chains and the k3s
journal never mentions network policy, so the controller is not running.

That is a cluster-wide condition, not something this deployment introduced. The
policy stays in the repository because it is correct and takes effect the moment
a controller is enabled; today it documents intent. What actually bounds the
gateway is the machine-identity check on every API route and a MinIO credential
scoped to one bucket — both verified by `ops/evidence/validate-storage.sh`.

Turning enforcement on would change behaviour for every workload in the cluster,
several of which have no policy declared at all, so it is left as an operator
decision rather than done as a side effect of this deployment.

## Not deployed yet, on purpose

- **No worker Deployment.** Processing happens synchronously in the request that
  completes an upload; there is no queue for a worker to drain. A deployment
  that does nothing would only look like capacity that is not there. It arrives
  if and when processing moves off the request path.
- **No retention CronJob.** The retention and integrity commands are Task 10.
  A CronJob calling a command that does not exist would fail on a schedule.
