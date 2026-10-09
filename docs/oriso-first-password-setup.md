# ORISO first-password setup in Testmails

Admin-created counsellors and agency administrators can require a first password change before they can sign in. Their initial generated password is temporary. Testmails must show this as incomplete setup rather than a wrong password or an invitation to create the account again.

The account dialog offers **Complete setup & verify** for a linked incomplete account with an active setup invitation. The operator stays in Testmails. The server reads the selected mailbox, verifies the normal setup link, stores a different permanent password privately, completes the normal ORISO setup and verifies the password and second factor. Existing ready accounts do not receive another password.

## Binding and protected storage

**For developers — the existing product contract and safety checks:**

```text
Originating issue: Storypapst/dreambau#158.
Confirmed Dev UserService contract: b284b384ebfa4081e833f2d58a16b091c8bfee3f.
Human POST /testmails/api/accounts/:email/oriso-provisioning accepts
completeAccountSetup:true with the routed environment and retained role.
Existing passkey/email-code session, active-user, mailbox/project/environment
grants and per-account mutation serialization remain required.
An explicit foreign Origin is rejected. SameSite-Strict sessions remain in use.

Read only the selected mailbox's most recent counsellor-onboarding message.
Accept only the configured HTTPS Admin origin and exact onboarding path;
do not follow redirects or take arbitrary URLs/tokens from the browser.
Retain product-ID from the original create response and the exact matching
setup invite in the protected record before reporting setup-required.
Refuse setup without that original proof. A matching replacement invitation
for the same email is insufficient. Existing incomplete records require an
explicit protected operator reconciliation against original creation evidence.
Compare public GET /users/account-invites/{token} with that retained proof and
the unique current
admin invitation: id, email, tenant, COUNSELLOR/AGENCY_ADMIN, provisionedUserId,
EXISTING_ACCOUNT_SETUP and EMAIL_SENT. The product checks current identity,
username, required action and single-use state again during the setup POST.
Read protected product detail by retained product-ID before both initial setup
and staged continuation; require its ID/email/username/tenant and active state.
Compare raw username or exact canonical enc.Base32 form (padding '=' becomes '.').
Send the verified tenantId header on public invite GET and setup POST; those
endpoints do not need authentication or CSRF cookies.

Stage a different permanent password and accountSetup proof together in the
protected Infisical record, after checking expected credential/state and before
POST /users/account-invites/{token}/setup with exactly {password}.
Require phase COMPLETED. No create, admin reset or required-action clearing.
Continue existing-account-only TOTP activation and managed profile verification.
Only then persist ready. No credentials, seed, token or mail body in responses,
public metadata, audit entries, screenshots or logs.
```

## Uncertain outcomes and deployment

The server operator command completes this same Testmails workflow without entering credentials in a browser. It defaults to a read-only preflight. Execution is restricted to new Springfield Dev counsellor or Agency Admin records created in the last 24 hours; it cannot repair older or ready accounts. Already-created records require the original creation evidence, supplied explicitly rather than inferred from a current email search.

**For operators — run inside the deployed Testmails service, with its configured secrets and shared data volume:**

```text
node dist/server/oriso-setup-operator-cli.js \
  --record-id oriso/dev/<springfield-record> \
  --email <springfield-mailbox> \
  --expected-created-at <original-record-ISO-time> \
  --original-user-id <original-product-id> --invite-id <original-invitation-id>

Default: validate original record, product identity, invitation, Dev routing,
age, project metadata and deletion state. No registry, SQLite or mail-state writes.
Add --execute only under the scoped operator authorization for that new record.
Execution rereads prerequisites under the same data-volume lock as HTTP mutations.
The existing Testmails service completes normal setup and factor verification;
the command prints only record ID, email and status. No cookies, extra public
machine grants, raw reset endpoints, password arguments or credential output.
Audit actor: operator:codex-m4-oriso; metadata/links are synchronized on success.
```

A lost response can mean that ORISO already changed the password. Testmails preserves its private candidate and one-shot marker. A repeated action verifies the same credential and resumes second-factor setup; it never sends another setup request. If verification cannot establish the result, the account remains incomplete for operator review.

**For operators — persistence and rollback constraints:**

```text
accountSetup is an optional protected-record schema addition containing only
inviteId, provisionedUserId and submittedAt, with the password in secret.
submittedAt:null retains original creation proof without a password change;
a timestamp records the staged one-shot setup request.
It is not a public account field. A failed attempt retains both credential and
marker; generic password linking cannot overwrite a staged setup attempt.
The current deployment uses one Testmails instance. HTTP provisioning/deletion,
human/machine TOTP enrollment and the operator share per-environment/email
directory locks on the writable SQLite data volume, plus expected-state rereads.
These locks are not distributed CAS. Do not scale across separate data volumes.
An interrupted owner leaves a stale lock and blocks further mutations. Review
its outcome and ensure the original process is gone before operator recovery;
never expire/remove an active lock just because a request is slow.

Older strict record readers cannot parse a record carrying accountSetup.
Once setup is used, roll back only to a reader-compatible image. Preserve
Infisical credentials and attempt markers; never restore an old password or
remove the marker to make a setup POST repeatable. An image rollback is not
a credential rollback. Keep the current compatible runtime available.

Local fixture tests and screenshots do not establish real mail receipt,
browser sign-in, E2EE conversation or handover acceptance. Record these
separately using fresh Dev participants and normal public sign-in.
```
