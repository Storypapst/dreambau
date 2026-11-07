# Encrypted application backups on a Storage Box

This is an operator template. It does not identify a private host, install credentials,
change storage, enable a timer, stop services, or move the primary Evidence backend.
Keep the actual host configuration, coverage ledger and verification receipts in the
private operational Core. The monthly Drive copy is deferred.

## What this backs up

`scripts/ops/storage-box-backup.py` sends explicit application/configuration files,
online SQLite snapshots, optional PostgreSQL/MariaDB logical dump streams and optional
logical S3 object replicas to an encrypted restic repository over SFTP **port 22**.
It does not mount the box. Active SQLite and MinIO stay on their existing storage;
Evidence gateway URLs stay unchanged.

This is **not full-system acceptance**. The JSON configuration and every receipt name
included and omitted datasets. Mail, MongoDB, Redis, unconfigured databases, other
buckets and full OS recovery remain omitted until separately configured and restore-tested.
Provider server backups complement these application backups; they do not replace them.

The earlier cold-snapshot workflow stops/restarts applications and copies entire
volumes. Do not invoke it as a pre-step: that can require substantial extra local space
and create unapproved downtime. Reuse its inventory to identify coverage, not its cold
stop procedure. Existing snapshot archives remain untouched and are excluded from the
normal job. Importing those is a separate operation; no retention, `forget`, `prune`,
source deletion, repository initialization on failure or primary-storage cutover runs
implicitly.

## Bootstrap and configuration

1. Independently verify the Storage Box SSH host-key fingerprint against Hetzner's
   [published fingerprints](https://docs.hetzner.com/storage/storage-box/general/).
   A fresh `ssh-keyscan` alone is not verification. Pin the verified key in a dedicated
   `known_hosts` file. Keep strict checking; never use `accept-new` or disable checking.
2. Use a dedicated box sub-account/key limited to its backup directory. On port 22,
   Hetzner requires the client public key in RFC4716 format. An existing box needs
   an already-authorized key or a one-time password bootstrap to append the new key.
   Do not overwrite existing `authorized_keys`. SSH port 23 is optional and is not
   needed for restic/SFTP22. See [Hetzner's key procedure](https://docs.hetzner.com/storage/storage-box/ssh-keys/add-ssh-keys/).
3. Supply the SSH private key and a distinct restic repository password through
   regular owner-only files. No symlinks, group/world permissions, inline secrets,
   copied machine tokens, shell `set -x` or credentials in command arguments.
   Escrow the restic password outside the server and this repository: losing it
   makes the encrypted backup unrecoverable.
4. Adapt `storage-box-backup.example.json`, mode `0600`, using absolute reviewed
   binary/source paths. The example reserves **4 GiB** and caps plaintext staging at
   **2 GiB**. This cap covers SQLite snapshots, an optional logical S3 replica and
   temporary restore checks, not a second full-system copy. SQL dump streams avoid
   large staging files. Configure all live DB data directories in `liveDatabasePaths`
   and all local backup archives in `excludedPaths`; never include `/` or the job's
   own state. The process uses a clean environment and does not inherit cloud keys,
   SSH agents, proxy settings or restic password overrides.
5. Review `plan`, explicitly initialize the intended repository once, then run a
   bounded initial backup. Do not enable scheduling before the acceptance checks below.

For operators — replace paths with your private reviewed installation:

```sh
python3 /usr/local/lib/storage-box-backup/storage-box-backup.py plan --config /etc/storage-box-backup/backup.json
python3 /usr/local/lib/storage-box-backup/storage-box-backup.py init --config /etc/storage-box-backup/backup.json
python3 /usr/local/lib/storage-box-backup/storage-box-backup.py backup --config /etc/storage-box-backup/backup.json
python3 /usr/local/lib/storage-box-backup/storage-box-backup.py check-health --config /etc/storage-box-backup/backup.json --max-age-hours 30
```

### SQL database streams

Add a `databaseDumps` item only after checking the database type and an appropriate
backup user. Its `dataPath` must also be in `liveDatabasePaths`.

For operators — configuration shape, with references only:

```json
{
  "name": "application-postgres",
  "engine": "postgres",
  "container": "application-postgres-1",
  "database": "application",
  "user": "backup",
  "passwordFile": "/etc/storage-box-backup/private/postgres-password",
  "dataPath": "/srv/application/postgres-data",
  "transactionalOnly": true
}
```

`postgres` uses `pg_dump --format=custom --no-password`; `mariadb` uses
`mariadb-dump --single-transaction --quick --routines --events --triggers --hex-blob`.
MariaDB tables must be transactional. Avoid schema migrations during either dump.
Credentials are forwarded through the one child environment variable required by the
dump client, never a value in argv. A failing producer invalidates the backup even
if restic already stored a partial component. Every successful dump is streamed back
and its SHA256 compared without buffering the whole database in memory. A real
isolated database restore is still required for database-level acceptance.

### Evidence logical object replica

Use a dedicated private MinIO-client configuration directory and an existing authorized
S3 alias. The configuration contains credentials and remains owner-only. The job reads
logical objects with `mc ls`/`mc cat`, not the MinIO data directory.

For operators — configuration shape:

```json
{
  "name": "evidence",
  "mcConfigDirectory": "/etc/storage-box-backup/private/mc",
  "alias": "evidence-source",
  "bucket": "evidence-bucket",
  "minObjects": 1
}
```

The job rejects traversal keys, empty/unexpected inventories and copies exceeding the
staging limit. It records object byte counts and SHA256 values in the encrypted source
manifest, and checks that the object inventory did not change during copying. Pair the
replica with the online Evidence SQLite snapshot and serialize the job with maintenance
and cold-backup work. Published artifacts should remain immutable throughout the copy.
In-flight multipart uploads are not exported as logical objects: their resumability is
not part of this backup's acceptance. Do not claim that a replica test migrated primary
Evidence storage.

## Acceptance, monitoring and restore

A backup is healthy only after all components succeed, a random canary is restored,
every SQLite snapshot is restored and passes `integrity_check`, logical dump hashes
match on readback, and `restic check` completes. The configured data verification
percentage is explicit (the initial example reads **100%**). Restic exit 3 (files changed
or unreadable) is a failure, not a successful backup.

The last step creates an encrypted `verification.json` snapshot tagged
`storage-box-accepted`, listing the component snapshot IDs and coverage. It is restored
and compared before the local atomic `health.json` becomes healthy. A component snapshot
without this accepted manifest may belong to a failed attempt: never restore a generic
`latest` snapshot and assume it is a complete backup set. For recovery, find the accepted
manifest, read its coverage and component IDs privately, restore to an isolated target,
and verify files/database/application behavior before replacing live data.

The `.service.example` and `.timer.example` files are review templates, not an installer.
Install the companion `storage-box-backup-failure@.service` and hourly health service/timer,
reconcile schedules with retention/cold jobs, and verify that the service can read each configured
source and write only its private state plus the exact shared lock file. Install
`storage-box-backup.tmpfiles.example` as `/etc/tmpfiles.d/storage-box-backup.conf` and
run `systemd-tmpfiles --create /etc/tmpfiles.d/storage-box-backup.conf` before validating
or starting the service. The unit orders itself after boot-time tmpfiles setup and
refuses to start if the lock is missing. Its `ReadWritePaths` grants only that file,
never the whole `/run/lock` directory. Do not unlink or replace the lock while a job
is running; tmpfiles type `f` preserves the existing lock inode. Monitor both the systemd exit result and
`check-health` freshness. Test the failure handler through systemd before enabling the timers.
The provided handler records an error in journald and leaves the failing service visible in
`systemctl --failed`; the hourly health job also detects stale accepted backups. It sends no
e-mail or Slack messages. An external notification channel is a separate, explicit connection.
Do not manually run an extra Evidence retention pass while changing its schedule.

An outage fails closed: no mounted-directory fallback, new empty repository, source
cleanup or healthy receipt. Investigate the fixed error code privately; raw subprocess
errors, SQL bodies, object contents, passwords and keys are not emitted by this script.
Storage Box snapshots are additional rollback points on the same box, not an independent
backup. Verify restores and capacity before any separately approved local archive cleanup.

## Repairing an existing Evidence maintenance unit

If an existing timer calls `compose run maintenance` but its current Compose file only
has the running gateway service, the schedule is broken: it does not need a new image
or a second service. The companion `storage-box-evidence-maintenance.service.example`
uses `compose exec -T` on the existing service so it reuses its configured credentials.
Install the same local failure handler and supply only these non-secret variables in
an owner-only environment file:

```text
EVIDENCE_COMPOSE_FILE=/absolute/reviewed/evidence/compose.yaml
EVIDENCE_COMPOSE_SERVICE=evidence
EVIDENCE_DATA_LOCK=/run/lock/dreambau-evidence-data.lock
```

Verify that `dist/evidence/server/maintenance.js` exists in the running image, validate
the rendered unit and reload systemd. Preserve the existing timer and retention policy;
do not start an extra manual retention pass. Monitor the next scheduled result. Set
the same absolute `EVIDENCE_DATA_LOCK` path in the backup's `coordinationLocks`; the
maintenance unit waits on it with `flock`. This holds retention outside the whole
SQLite-snapshot/object-copy interval, so a referenced object cannot be pruned between
those stages. Coordinate any remaining cold jobs through their existing lock as well;
do not enable overlapping schedules that bypass the lock.
