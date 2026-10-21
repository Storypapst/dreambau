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

## Board and delivery source adapters (Package I)

Opt in through `sources` in the protected runtime configuration. Board reads use
one fixed paginated query for explicitly linked issues: an authorized work item
must link the issue and PR. No title matching, cross-repository permission shortcut
or copying of board fields into internal task state is performed. Both priorities
stay visible. Org Issue Priority is authoritative; the empty project mirror is not.
A missing source remains unknown and a failed attempt retains the last verified
value with incomplete coverage. Older responses cannot replace newer observations.

**For operators — optional source configuration:**
```json
{
  "board": true,
  "receiptDirectory": "/run/work-state-receipts",
  "policies": [{
    "producer": "approved-dev-verifier",
    "publicKey": "REPLACE_WITH_APPROVED_ED25519_PUBLIC_PEM",
    "repositoryIds": ["REPLACE_WITH_APPROVED_REPOSITORY_ID"],
    "environments": ["dev"]
  }]
}
```

The optional Board token additionally requests Issues read and organization
Projects read. The sources manifest is an alternative registration of the same App with these
extra read permissions. Verify the real
App query before claiming service coverage. A successful local `gh` read does not
prove App access. The core collector remains read-only and has no personal-token
fallback. A complete cycle runs hourly, in batches of twenty linked issues, with
a persisted offset; an interrupted cycle resumes after restart. The current reader
rejects GraphQL partial errors, nonadvancing cursors and unsupported field types.
Do not treat the absence of a field mirror as a known empty value.

Deployment and Dev acceptance use independent signed receipts from an explicitly
approved producer. Mount its input directory read-only. Configure only its public
Ed25519 key and permitted repository/environment scope. Do not copy a user's root
SSH key to the service. A JSON file without a valid approved signature is not proof.
The existing E2E runtime-evidence contract supplies full commits and immutable image
digests, but connecting a real capture/signing producer remains an activation gate.
Schema validation and a synthetic signature test do not prove a live deployment.

**For the approved producer — receipt payload example (synthetic values):**
```json
{
  "receiptId": "unique-immutable-id",
  "producer": "approved-dev-verifier",
  "repositoryId": "123",
  "pullNumber": 7,
  "kind": "deployment",
  "environment": "dev",
  "targetHeadSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "sourceCommit": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "imageDigest": "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  "observedAt": "2026-10-21T10:00:00.000Z",
  "ready": true,
  "evidenceLinks": ["https://evidence.dreambau.com/REPLACE_WITH_REAL_PROOF"]
}
```

For acceptance use `kind=acceptance`, `result=PASS|FAIL` and a criterion instead of
`ready`. The producer must actually compare the running digest/revision with the
intended CI build and prove which PR head that build contains. A merge alone does
not justify populating these fields. The real Dev browser run must record the same
build revision/digest and a durable evidence link. Different revision, stale proof,
unready deployment and missing matching deployment are displayed separately.

Sign the UTF-8 canonical payload (object keys sorted recursively, array order
preserved, no whitespace) with Ed25519, encode the signature as base64, then publish
`{"payload": <payload>, "signature": <base64>}` atomically as a new `.json` file,
maximum 64 KiB. Never reuse a receipt ID for different content. The consumer reads
up to fifty files per tick with persisted progress, retains immutable receipts and
polls a completed directory every thirty seconds. It never deletes producer files.
No deployment, acceptance, issue or board mutations are performed by these adapters.
The UI labels these assertions “per evidence” and exposes producer, timestamp,
source commit, digest and evidence. Revoke repository grants to hide all derived
fields as well as the original saved work.

Saved receipts retain their signature and normalized signing-key fingerprint. The
current producer/key/repository/environment policy is checked again on every read;
revocation or key rotation withholds trusted readiness while history remains.
Receipt chronology uses numeric epoch milliseconds, including fractional seconds.
Observed FAIL and its criterion stay visible independently of missing deployment,
stale proof or revision mismatch. The protected operations endpoint and source
sections expose sanitized feed coverage, last attempt/success and scan errors.
A bad input anywhere in a multi-batch scan remains flagged until a complete clean
scan succeeds. Aborting a partial scan does not publish scan completion.

Machines follow the advertised `/sections/sources` link for bounded, paginated
board/receipt provenance; source changes enter its revision fence. Schema 7/8 adds
source tables and verification provenance. Earlier receipts without retained
verification provenance remain history and cannot establish current trusted proof.
