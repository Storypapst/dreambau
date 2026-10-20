# Run-owned resource ledger

The Hub durably records disposable product resource intents before dispatch.
It holds the original pool leases until every tracked resource is either
physically verified absent or cancelled before dispatch. Existing reservation
runs with no resources can still release their leases.

This is the ledger foundation only. It does not create product resources,
perform cleanup, adopt existing reusable accounts, or implement an authoritative
physical verifier. Factory and cleanup coordinators are separate work.

## Internal coordinator contract

`database.testResources` is a trusted server-internal API. It accepts strict
intent, actor and proof shapes; there is no public ownership or state mutation
route. Resources are currently restricted to ORISO Dev at
`https://dev.oriso.org`. Run/version/commit metadata comes from the existing run.
A user requires an account leased by that run. Mailboxes and Infisical records
are never disposable resource kinds.

Persist `planIntent` before dispatch. The run and operation key are idempotent
only for identical kind/account/parent intent (parents form a canonical set).
Use `transition(planned, creating)` immediately before dispatch and
`bindProduct` to attach the exact returned ID and SHA-256 fingerprint. A lost
creation result remains `create-uncertain`; it cannot be cancelled or release
its lease. Stable product IDs retain their ownership across historical cleanup.

Children require present parents at dispatch. Every recorded child must be
terminal before parent deletion starts and again before absence is confirmed.
These checks, state comparisons, changes and allowlisted audit events share
SQLite write transactions. Stale expected states fail without an audit entry.

After deletion dispatch, soft deletion remains `pending-purge` or
`delete-uncertain`. Only `confirmPhysicalAbsence` can produce `deleted`. Its
trusted coordinator must independently establish authoritative physical absence;
a normal product GET returning 404 or a hidden search result is insufficient.
Proof binds resource ID, exact external ID, target origin, evidence SHA-256 and
a verification timestamp between deletion intent and the current observation.
The ledger validates this contract; a hash alone is not a physical verifier.

## Machine reads and compatibility

`GET /testmails/api/v1/runs/:runId/resources` requires `runs:read` and the run's
project, target and pool scopes. It returns safe resource metadata and
`pendingResourceCount`. Invisible and unknown runs return the same 404.
A zero count means only that no tracked resources remain pending; it does not
claim a complete inventory of the remote product.

The existing release route returns `409 {"error":"resources_not_cleaned"}`
while any resource is nonterminal, without changing leases, status or audit.
Legacy `cleaned_at` remains a lease-release timestamp and is never promoted to
physical product cleanup evidence. Migration is additive and repeatable.
