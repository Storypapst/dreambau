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
Compare public GET /users/account-invites/{token} with the unique current
admin invitation: id, email, tenant, COUNSELLOR/AGENCY_ADMIN, provisionedUserId,
EXISTING_ACCOUNT_SETUP and EMAIL_SENT. The product checks current identity,
username, required action and single-use state again during the setup POST.

Stage a different permanent password and accountSetup proof together in the
protected Infisical record, after checking expected credential/state and before
POST /users/account-invites/{token}/setup with exactly {password}.
Require phase COMPLETED. No create, admin reset or required-action clearing.
Continue existing-account-only TOTP activation and managed profile verification.
Only then persist ready. No credentials, seed, token or mail body in responses,
public metadata, audit entries, screenshots or logs.
```

## Uncertain outcomes and deployment

A lost response can mean that ORISO already changed the password. Testmails preserves its private candidate and one-shot marker. A repeated action verifies the same credential and resumes second-factor setup; it never sends another setup request. If verification cannot establish the result, the account remains incomplete for operator review.

**For operators — persistence and rollback constraints:**

```text
accountSetup is an optional protected-record schema addition containing only
inviteId, provisionedUserId and submittedAt, with the password in secret.
It is not a public account field. A failed attempt retains both credential and
marker; generic password linking cannot overwrite a staged setup attempt.
The current deployment uses one Testmails instance. In-process serialization
and expected-state rereads protect this boundary; this is not distributed CAS.
Do not scale the mutation service to multiple writers without a shared lock.

Older strict record readers cannot parse a record carrying accountSetup.
Once setup is used, roll back only to a reader-compatible image. Preserve
Infisical credentials and attempt markers; never restore an old password or
remove the marker to make a setup POST repeatable. An image rollback is not
a credential rollback. Keep the current compatible runtime available.

Local fixture tests and screenshots do not establish real mail receipt,
browser sign-in, E2EE conversation or handover acceptance. Record these
separately using fresh Dev participants and normal public sign-in.
```
