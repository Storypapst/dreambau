# ORISO work-state operations

This is the repository-owned operations contract. Shared inventory, approvals,
receipts and pilot progress live in the routed ORISO Core execution journal.
A local passing test is not evidence of production operation.

## Activation gates

1. Merge the reviewed A → B → C → D → E stack through a human reviewer.
2. The ORISO organization administrator installs a dedicated GitHub App on the
   explicitly approved repositories. Do not copy a personal Mac token to Dreambau.
   The collector requires repository metadata, pull requests, checks and commit
   statuses with read permissions. Enable pull_request, pull_request_review,
   pull_request_review_thread, check_run, check_suite and status events.
   Webhook URL: `https://dreambau.com/testmails/api/work-state/webhook`.
3. The operator confirms a dedicated directory within the deployed `/data` mount,
   a protected config/secret mount, and a different database from Test Access.
   Suggested container database: `/data/work-state/work-state.sqlite`.
   Create its parent directory before startup; the application does not provision
   OS directories or credentials. Apply restrictive ownership and permissions.
4. The backup owner confirms an independent Google Drive folder, an age recipient,
   an offline recovery identity and a separately configured rclone Drive remote.
   A named rclone remote alone does not prove independence: verify its actual
   backend/account/folder with the owner. Never use a local alias as off-server proof.
5. Verify the installation token against every selected repository, PR/check/status/
   review reads and a real signed delivery before enabling the pilot. Local `gh`
   access proves only the Mac identity. Record installation ID, allowed repo IDs,
   scope coverage, secret rotation owner and verified capture time, without secrets.

The real deployment uses Docker Compose, not the legacy k8s directory. Inventory
its current image, mount source, port and routes before preparing an image-only
rollout. Do not replace the running Compose file with an older repository example.
Back up the existing database with the running revision's SQLite backup API before
any new binary can apply additive migrations. Record the previous immutable image.

## Configuration and lifecycle

Set `WORK_STATE_CONFIG_PATH` to a protected JSON file mounted read-only. The runtime
initializes one shared store for HTTP and the collector. No configuration means no
collector. Invalid enabled configuration fails startup with a sanitized error.
Private key, webhook secret, token values and machine identity grants never go in Git.

**For operators — configuration shape (IDs are examples, not approved scope):**
```json
{
  "appId": "123",
  "installationId": "456",
  "databasePath": "/data/work-state/work-state.sqlite",
  "privateKeyFile": "/run/secrets/work-state/app.pem",
  "webhookSecretFile": "/run/secrets/work-state/webhook",
  "mode": "normal",
  "repositories": [
    {"id": "789", "project": "oriso", "fullName": "OpenResilienceInitiative/REPLACE_WITH_APPROVED_REPO", "integrationBranch": "dev", "active": true}
  ]
}
```

Registry entries need actual numeric GitHub repository IDs. Removed entries become
inactive; saved history stays. Repository grants remain explicit and cumulative;
configuration never grants humans or machines access. Provision a dedicated
`dreambau-work-state` identity through the existing operator mechanism.

Normal mode reconciles hourly and marks source data stale after 75 minutes.
`polling_pilot` schedules every five minutes and uses the 15-minute stale threshold.
Both keep durable queue generations, cancellation and rate-limit parking. Service
signals stop admission, abort the collector and close the SQLite store.
Authenticated `GET /testmails/api/work-state/operations` returns authorized repository
coverage, oldest successful sync, queue state and confirmed backup time. The restore
field is the current database’s restore provenance; isolated drill receipts remain
external and are not imported into the live database yet.
Jobs migrated from an older schema have unknown queue age until drained; retries
retain the original enqueue time. Public liveness remains independent and does not disclose repository contents.

## Backup and isolated recovery

Install Node 20, matching native dependencies, age and rclone on the dedicated
backup runner. Build this repository; shell entrypoints use its compiled recovery
CLI. The example systemd service is a template, not an installed timer. Adapt its
UID, mount/path allow-list and Node PATH to the confirmed deployment; mount only the
work-state directory, not unrelated account databases. Set the rclone config path
explicitly for that UID. Its encryption identity is needed only by a restore runner.

**For operators — protected EnvironmentFile keys (no secret values in source):**
```text
WORK_STATE_DATABASE_PATH=/var/lib/dreambau-work-state/work-state.sqlite
WORK_STATE_BACKUP_REMOTE=<confirmed-drive-remote>:<approved-folder>
WORK_STATE_BACKUP_RECIPIENT=<age-public-recipient>
RCLONE_CONFIG=<protected-config-path>
# Isolated recovery only:
WORK_STATE_BACKUP_OBJECT=<remote-from-successful-backup-receipt>
WORK_STATE_RESTORE_TARGET=<new-isolated-directory>/work-state.sqlite
WORK_STATE_BACKUP_IDENTITY_FILE=<offline-identity-path>
WORK_STATE_BACKUP_SHA256=<hash-from-successful-backup-receipt>
```

Each run generates a unique timestamp/UUID object inside the configured remote directory. Keep the successful JSON
receipt in protected operations storage; the SHA is required for recovery. A SQLite
online backup includes WAL writes consistently; no raw copy of a live file is used.
The temporary directory is private and removed after success or failure. Encrypt
before upload, download again, compare encrypted SHA-256, then record success.
Failed upload/readback never advances the confirmed backup time. Recovery downloads,
checks the receipt hash, decrypts, checks SQLite integrity, foreign keys and required
work-state tables, then atomically creates a new file without replacing an existing
one. Restore never swaps the live database. Record recovery success in the restored
copy and retain the external receipt for the operations journal.

Run daily with the supplied timer after the owner confirms the target. Measure RPO
from the captured snapshot time to the incident, and RTO from the start of recovery
until the restored service and saved checkpoint/pending queue are verified. Targets:
24 hours and 2 hours. An isolated local transport test cannot satisfy off-server RPO.

## Pilot, rollout and rollback

Observe Frontend, Admin and UserService for 24 hours after live prerequisites pass.
Record controlled test-PR merge/close/reopen/failing check, duplicate delivery, GitHub
outage, restart, revoked scope and isolated restore. Do not mutate a colleague's PR
for the test. Measure signed-event→stored result (target two minutes), stored API
P95 (<500ms), first list (<2s), and stale thresholds in the selected mode.

Roll out only to explicitly approved active repositories. Compare configured IDs,
installation IDs and successful facet coverage; a three-repo pilot is not full ORISO
coverage. Record ten identical questions before/after with request counts, elapsed
time, bytes and model calls. Only claim token savings when actual metadata exists.
Prove the service keeps collecting with the Mac closed and a new session can resume.

Migrations are additive. For rollback stop the new worker, retain the new DB and
receipts, return to the recorded image and test compatibility on an isolated backup
first. Do not delete new tables or replace a live database automatically. Merged,
built, deployed and accepted remain separate facts; no automatic PR merge or product
deployment is introduced by this service.

Primary authentication contracts: [installation tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app)
and [signed JWTs](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app).
