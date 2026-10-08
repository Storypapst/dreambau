# Protected programme guides

A programme guide uses the existing human sign-in and opens at
`/testmails/teamwork/guide/<id>`. The page keeps this path during email-code or
passkey sign-in. It does not load mailbox accounts or taxonomies. Password
bootstrap and recovery sessions still require passkey enrollment.

The guide explains practical uses, official app downloads and setup steps.
Introduction/video links open externally after a click. No player, preview,
thumbnail, third-party script or third-party request is embedded.
Signing in to this guide does not grant membership in another service. Do not
put private keys, invitation tokens, passwords or credentials in its content.

## Operator configuration

`TEAMWORK_GUIDES_PATH` optionally selects an operator-owned UTF-8 JSON file.
Without an override, the file is `teamwork-guides.json` beside the configured
`TESTMAILS_DATABASE_PATH`. Keep it outside the repository and container image.
Use an existing persistent data volume, restrict write access to the operator,
and permit the application user to read it. Do not expose the directory through
a static web server. There is no write endpoint or membership provisioning.

The [synthetic example](guides.example.json) shows the accepted format; replace
all example content on the server. Every object accepts only the documented
fields. IDs are lowercase slugs, at most 48 characters. The whole file is limited
to 256 KiB and 60 guides. Each guide permits up to three practical examples, six
introduction links and five device choices; each choice permits six downloads
and eight setup steps. Text is plain, length limited and cannot contain markup
or control characters. Every external link must use credential-free HTTPS.
A video link is an ordinary `learnMore` link; its label may state language and
verified duration. Do not infer installed capabilities from upstream documentation.

Replace the file atomically after validation. It is read on each request, so a
content change needs no application restart. Missing files/IDs return 404;
unreadable or invalid configuration returns 503 without paths or source content.
All guide API responses, including auth failures, set `Cache-Control: no-store`.

The API is `GET /testmails/api/teamwork/guides/<id>`. It uses the existing
active-human middleware: only active email-OTP/passkey users whose grant
verification succeeds may read. Anonymous, expired, revoked, disabled,
bootstrap or recovery sessions cannot read it. Guide access is general guidance,
not access to a downstream service. There are no return-URL redirects and the
existing session-cookie scope is unchanged.

## Verification

```bash
npm ci
npm run lint
npm test
npm run build
```

The guide tests use synthetic programmes and sessions. Browser checks should
cover a cold signed-out deep link, both existing sign-in methods, device choices,
logout/session expiry, unavailable configuration and unavailable mailbox data.
Check 390×844 and desktop widths for visible focus, 44-pixel controls and no
horizontal scrolling. Real app onboarding and real mailbox delivery remain
separate acceptance checks.
