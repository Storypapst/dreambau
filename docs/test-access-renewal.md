# Renew existing machine access from the CLI

An expired machine credential cannot authorize its own renewal. This command uses
an operator's existing SSH authorization instead. It changes only the existing
identity's expiry; it never replaces its key, grants new permissions, creates an
identity, or reactivates a revoked identity.

For operators — preview first, then apply the same bounded request:

```sh
test-access --identity codex-m4-oriso renew --operator-host m4dreambau --days 90 --dry-run
test-access --identity codex-m4-oriso renew --operator-host m4dreambau --days 90
test-access --identity codex-m4-oriso list --project oriso --environment dev
```

Use the SSH alias configured on the local machine. The alias must already grant
operator access; this command does not create SSH access or install sudo rules.
The default duration is 90 days, and accepted durations are integers from 1 to 90.
An identity with a later existing expiry is left unchanged. Preview and no-op
requests create no registry, backup, lock or receipt files.

The CLI reads no machine bearer for renewal. Requests are validated locally and
sent as JSON on SSH stdin to a fixed privileged command. Invalid helper replies
and arbitrary SSH errors are suppressed. Output contains only the identity,
old/new expiry, preview/change flags, and an optional audit receipt path.

## Install the reviewed operator artifacts

The application keeps its identity registry mounted read-only. The helper runs
on the Docker host and uses the current host registry; no new HTTP endpoint or
application-image deployment is required.

For the release operator — install the reviewed helper through the existing SSH connection:

```sh
scp ops/test-access-admin.py m4dreambau:/tmp/test-access-admin.py
ssh m4dreambau 'sudo -n install -D -o root -g root -m 0700 /tmp/test-access-admin.py /usr/local/lib/dreambau/test-access-admin.py'
```

Verify the transferred source hash before installation and retain any previous
helper for rollback. Do not copy an old registry/configuration during this
operation. On a machine without the necessary sudo authorization, renewal fails
without changing identity data.

For developers — fixed production locations and transaction contract:

```text
Helper: /usr/local/lib/dreambau/test-access-admin.py
Invocation: sudo -n /usr/bin/python3 /usr/local/lib/dreambau/test-access-admin.py
Registry: /srv/dreambau/k3s-exit/testmails/config/test-access/machine-identities.json
Backups and audit receipts: /var/backups/dreambau/test-access
Request: {identity: string, days: integer 1..90, dryRun: boolean}
Result: {identity, oldExpiry, newExpiry, dryRun, changed, receiptPath}
```

The helper rejects path overrides, malformed registries, duplicate identifiers,
revoked identities and unsafe filesystem paths. A real renewal locks the
registry, creates a private backup and receipt, checks for concurrent changes,
then replaces the file atomically while preserving ownership and permissions.
Every other identity and every field except the selected expiry stay unchanged.
The application rereads the registry for each request; no restart is needed.

Build the versioned CLI using the existing bundle builder. When installing a
local reviewed candidate, back up and replace only the bundle, preserving the
installed Playwright dependencies and wrapper. An unpublished candidate is not
a merged or published release. The normal release installer may replace it with
the published version. Keep the candidate manifest and rollback copy separately.

## Verification

For developers — repository checks, including the real temporary-file helper tests:

```sh
npm ci
npm run lint
npm test
npm run build
npm run cli:bundle
```

The Python transaction tests run through the normal Vitest suite. They can also
be run directly with `python3 -m unittest discover -s tests -p test_access_admin.py`.
Use preview for a production installation smoke; use isolated fixtures for
failure cases. A successful account listing proves machine access, not a full
product login or end-to-end application flow.
