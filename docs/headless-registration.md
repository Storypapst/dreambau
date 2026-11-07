# Dev headless registration journal

One approved run can claim the first browser-free ORISO registration. Test
Access binds the claim to the machine that owns the run, the two reserved
Springfield mailboxes and the existing ready counsellor. It records the
attempt before the runner sends the registration request. A complete fresh
identity observation must show that the proposed asker name and email are
available.

## Operator approval

Use the dedicated Dev fixture in an existing agency. Confirm the two leases,
the exact counsellor access record, the topic and the product's active
device-signing policy. Use the `headless-counselling` scenario, the full commit
SHA and the exact machine owner. Supply the separately approved binding through a
server-managed JSON file.

The file path comes from `TEST_ACCESS_HEADLESS_DEV_APPROVALS_FILE`. Store one
entry per approved run. Replace the file atomically when adding or revoking
an approval. The example contains synthetic identifiers and an example
expiry.

```json
[
  {
    "runId": "59c238e5-6115-4aef-bfb4-2f19091017cf",
    "machineId": "dev-runner",
    "approvedBy": "operator",
    "commitSha": "9e670b92d23ab00bd56782488ca83f86020e0347",
    "expiresAt": "2026-11-07T20:15:00.000Z",
    "askerMailboxId": "mailbox:bart.simpson@oriso.org",
    "counsellorMailboxId": "mailbox:lisa.simpson@oriso.org",
    "counsellorAccountId": "oriso/dev/lisa.simpson",
    "fixture": {
      "agencyId": 7,
      "topicId": 9,
      "consultingType": 13,
      "postcode": "10115"
    },
    "onlySignedDevices": false
  }
]
```

Grant `fixtures:headless-register` explicitly to the run owner. The machine
also needs both environments in its scope, including the pool environment.
Omitting the approval file keeps new registration claims unavailable.

## Runner contract

Use the existing machine-authenticated Test Access API. The path below is
relative to `/testmails/api/v1`.

```text
GET  /runs/:runId/headless-registration
     Read the exact binding and its earliest approval, lease or account expiry.
POST /runs/:runId/headless-registration
     Send { "bindingHash": "..." } to claim the registration before dispatch.
     A 201 response returns resourceId, bindingHash and state "creating".
POST /runs/:runId/headless-registration/:resourceId/outcome
     Send { "result": "created" } after the product returns 201.
     Send { "result": "uncertain" } for an ambiguous product response.
```

The Test Access CLI exposes the same operations through its normal private
credential provider.

```text
test-access run headless-prepare RUN_ID
test-access run headless-claim RUN_ID --binding-hash BINDING_HASH
test-access run headless-report RUN_ID --resource-id RESOURCE_ID --result uncertain
```

The second request consumes the single claim. Concurrent calls, replays
and broker restarts preserve the same resource fence. Dispatch the product
request only after receiving and validating the claim response. If that
response is lost, retain the lease and use operator reconciliation.

The outcome call accepts an exact replay. It remains available to the owner
after the approval expires or is revoked. Both outcomes keep the resource in
`create-uncertain`. The product's bodyless 201 records that it answered.
An authoritative native receipt is required to bind the exact user ID
and confirm ownership. A lost claim or product response holds the leases
until trusted reconciliation and cleanup. The existing agency and
counsellor are references outside the run's cleanup inventory.

The local contract test exercises both routes against the Hub and a real
SQLite database using simulated registry and ORISO observation responses.
Dev acceptance includes the reviewed runner and App-TOTP path, a native
ownership receipt, the stored SigNoz trace and the approved cleanup proof.
