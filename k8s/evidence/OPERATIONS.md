# Running the evidence gateway

## What is measured

`GET /metrics` on the gateway, in Prometheus format, scraped by SigNoz. Counts
and durations only — **no run, repository, file or caption ever appears as a
label**, so the endpoint stays safe to expose inside the cluster.

| Metric | Meaning |
|---|---|
| `evidence_upload_total{outcome}` | files completed, `ready` or `quarantined` |
| `evidence_upload_bytes_total` | bytes accepted into storage |
| `evidence_processing_duration_seconds{kind}` | histogram, per evidence kind |
| `evidence_quarantine_total{family}` | quarantines by rule family (`secret`, `archive`, `preflight`, …) |
| `evidence_publish_failures_total{reason}` | publication attempts that did not complete |
| `evidence_storage_bytes` | bytes currently held |
| `evidence_public_link_probe_failures_total` | published links that failed their probe |

## Alerts worth having

| Condition | Why |
|---|---|
| `increase(evidence_quarantine_total[1h]) > 5` | either something is leaking secrets into evidence, or a rule is too eager. Both need a human. |
| `increase(evidence_publish_failures_total[1h]) > 3` | evidence is being produced but not landing on pull requests |
| `evidence_public_link_probe_failures_total > 0` | a link already sitting in a PR comment has stopped working — the failure a reader notices first and an operator notices last |
| CronJob `dreambau-evidence-maintenance` failed | an integrity finding or an unreachable link; the job exits non-zero on purpose |

**The probe fails while `evidence.dreambau.com` has no DNS record.** That is a true finding, not noise: published links really are unreachable. It goes green the moment the record lands. Until then, read a maintenance failure as "check whether it is only the probe" — the job prints the retention and integrity lines before it exits.
| free space `< 40 GiB` | warning |
| free space `< 25 GiB` | hard stop: halt uploads before the disk decides for you |
| gateway or MinIO not ready | `/health/ready` covers both, since readiness authenticates against the bucket |

## Retention

The asymmetry is the point.

| Class | Policy |
|---|---|
| Drafts and unpublished raw runs | deleted after 60 days, objects and rows |
| A video's *original* upload | deleted 7 days after a normalised copy became the served one |
| Quarantined runs | **never** deleted on a schedule |
| Published PR evidence | **never** deleted on a schedule |
| Archived runs | public reachability withdrawn; bytes stay |

Archiving is not deletion. Removing the bytes of something that was published
is a separate, explicit admin step, because a scheduled job that *can* delete
evidence is a scheduled job that will eventually delete the evidence someone
needed.

The sweep runs as a CronJob at 03:10 UTC:

The CronJob pins its own image tag, so a release has to patch it alongside the
Deployment — otherwise maintenance quietly keeps running the previous code.

```bash
kubectl apply -f k8s/evidence/cronjob.yaml
kubectl -n wcr create job --from=cronjob/dreambau-evidence-maintenance evidence-maintenance-now
```

`node dist/evidence/server/maintenance.js <retention|integrity|probe|all>`. It
refuses to run against in-memory storage, so a misconfigured environment cannot
"succeed" at maintaining nothing.

`--verify-digests` re-hashes served objects that are still the uploaded bytes.
That is the deep check; the daily run does the cheap one.

## Backup

```bash
EVIDENCE_BACKUP_RECIPIENT=age1… bash ops/evidence/backup.sh
```

- The database is copied with SQLite's `VACUUM INTO`, not `cp`, so a concurrent
  write cannot produce a torn file.
- The copy is encrypted with `age` before it leaves the node.
- A manifest records every object's key, size and etag, so drift between two
  days is visible without reading a single object.
- The script fails when free space is below the hard stop.
- No caption, repository name or run content is ever logged.

A backup nobody has restored is a hope, not a backup:

```bash
EVIDENCE_BACKUP_IDENTITY=~/.age/evidence.key bash ops/evidence/restore-test.sh
```

It decrypts the newest backup, runs `integrity_check`, and reports the schema
version and run counts. The live database is only ever read.

MinIO versioning is enabled on the bucket, so an overwritten object can still be
recovered even between backups.

## Rollback

1. Keep the previous image. Deployments are tagged `dreambau-evidence:<version>`
   and stay in the k3s image store.
2. `kubectl -n wcr rollout undo deployment/dreambau-evidence`
3. **On a suspected security incident, do the ingress and the tokens first:**
   ```bash
   kubectl -n wcr delete ingress dreambau-evidence          # public access off
   kubectl -n wcr patch secret evidence-identities …        # revoke upload tokens
   ```
   Withdrawing reachability is instant; rolling back an image is not.
4. **Never** delete the bucket, the PVC or the PR comments during a rollback. A
   comment that points at a run which no longer exists is recoverable; a deleted
   run is not.
5. Afterwards, re-check a public link and one existing PR comment:
   ```bash
   bash ops/evidence/validate-deployment.sh
   bash ops/evidence/validate-storage.sh
   ```

Migrations are forward-only and additive, so an older image runs against a newer
database. That is what makes step 2 safe — but it also means a rollback does not
undo a migration, and none of them so far need undoing.
