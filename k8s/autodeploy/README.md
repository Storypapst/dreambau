# Pull deploy for the Dreambau app

Merging to `main` is the deploy. Nobody has to SSH into `m4dreambau`.

1. `CI` passes on `main`.
2. `.github/workflows/image.yml` builds the `runtime` image for amd64 and arm64 and
   publishes `ghcr.io/storypapst/dreambau-testmails:main` (and `:sha-<commit>`).
3. The `testmails-autodeploy` CronJob (`wcr`, every 5 minutes) sees a new digest, pins
   `deployment/testmails` to it, waits for the rollout and checks
   `https://dreambau.com/testmails/health/ready`. If either fails it puts the previous
   image back and records the digest in `dreambau.com/autodeploy-failed-digest`, so that
   build is not retried. The next merge produces a new digest and is tried normally.

Why pull and not a self-hosted runner: the repository is public, so a fork pull request
could run its own workflow on a runner that holds Docker and kubectl. Here nothing outside
the cluster can reach in, and the job may only `get` and `patch` `deployments/testmails`.

## One-time bootstrap (on the server, from a checkout of main)

```bash
kubectl apply -k k8s/autodeploy
kubectl create job --from=cronjob/testmails-autodeploy autodeploy-first -n wcr
kubectl logs -n wcr job/autodeploy-first -f
```

Expected last line: `autodeploy: deployed — ghcr.io/storypapst/dreambau-testmails@sha256:…`.
Re-run `kubectl apply -k k8s/autodeploy` only when a file in this directory changes.

## Operating it

```bash
# what ran last
kubectl get jobs -n wcr -l app.kubernetes.io/name=testmails-autodeploy
kubectl logs -n wcr job/<job-name>
# deploy now instead of waiting up to 5 minutes
kubectl create job --from=cronjob/testmails-autodeploy autodeploy-now -n wcr
# hold deploys (e.g. while a rollback is investigated), and resume
kubectl patch cronjob testmails-autodeploy -n wcr -p '{"spec":{"suspend":true}}'
kubectl patch cronjob testmails-autodeploy -n wcr -p '{"spec":{"suspend":false}}'
```

The deployment's annotations show the state: `autodeploy-pending-digest` (patched, not
yet verified — the next run resumes the check if a job was interrupted),
`autodeploy-previous-image` and `autodeploy-previous-pull-policy` (the last verified
image, the revert target), `autodeploy-deployed-at`, `autodeploy-failed-digest`.
