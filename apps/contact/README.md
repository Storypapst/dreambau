# Contact form handler (`/kontakt/`)

A small Node 20 program that serves the contact form of dreambau.com and turns one valid post into one plain-text e-mail
to the company mailbox. It stores nothing, logs no message, address or client IP, sets no cookie and loads no third-party
code. It is the second quick contact path the Impressum needs, next to the e-mail address.

The specification lives in the private docs repository (`specs/contact-form.md`); deployment steps, the route and the
credentials are in the private runbook. Nothing in this folder holds a credential or a server address.

## What it answers

| Request | Answer |
|---|---|
| `GET /kontakt/` | the form with a fresh signed token |
| `POST /kontakt/` | 303 to `/kontakt/danke/?r=<receipt>` after the mail server accepted the message; otherwise the form again (422, 429, 503) or an error page (400, 403, 413, 415) |
| `GET /kontakt/danke/` | the confirmation for a valid receipt (15 minutes), otherwise "nothing to confirm" |
| `GET /kontakt/kontakt.css` | the stylesheet |
| `/kontakt`, `/kontakt/danke` | 308 to the path with `/` |

Every answer carries `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none';
form-action 'self'; frame-ancestors 'none'`, `Cache-Control: no-store`, `nosniff` and a strict referrer policy.

Spam protection without CAPTCHA or third parties: a hidden honeypot field, a signed single-use token that must be at
least 4 s and at most 2 h old, 5 posts per 10 minutes per client (the IP only as a keyed hash in memory, gone 11 minutes
after the last post), 60 sent messages per hour overall, and an `Origin` check.

## Configuration

Names only; values are created by the operator and never committed.

| Variable | Meaning | Default |
|---|---|---|
| `CONTACT_SIGNING_SECRET` or `CONTACT_SIGNING_SECRET_FILE` | base64 of at least 32 random bytes | required |
| `CONTACT_MAIL_TO`, `CONTACT_MAIL_FROM` | recipient and the address allowed to send | none (without them a post answers 503) |
| `CONTACT_SMTP_HOST`, `CONTACT_SMTP_PORT`, `CONTACT_SMTP_SECURITY` | submission server; `starttls`, `tls` or `none` (loopback only) | none, 587, `starttls` |
| `CONTACT_SMTP_USER`, `CONTACT_SMTP_PASSWORD` or `CONTACT_SMTP_PASSWORD_FILE` | login of the sending account | none |
| `CONTACT_SMTP_SERVERNAME`, `CONTACT_SMTP_TIMEOUT_MS` | TLS name if it differs from the host; timeout | none, 15000 |
| `CONTACT_PORT`, `CONTACT_LISTEN_HOST` | where it listens | 8080, 0.0.0.0 |
| `CONTACT_TRUSTED_PROXIES` | proxies in front (the client IP is that entry from the right of `X-Forwarded-For`) | 1 |
| `CONTACT_MIN_AGE_S`, `CONTACT_MAX_AGE_S` | token age window | 4, 7200 |
| `CONTACT_RATE_KEY_MAX`, `CONTACT_RATE_WINDOW_S`, `CONTACT_RATE_GLOBAL_PER_HOUR`, `CONTACT_MAX_ENTRIES` | limits | 5, 600, 60, 50000 |
| `CONTACT_LINK_IMPRINT`, `CONTACT_LINK_PRIVACY` | footer links (same-origin paths) | `/homepage-assets/impressum.html`, `/homepage-assets/datenschutz.html` |
| `CONTACT_I18N` | `on` loads the start page's language scripts | `off` |

A wrong setting stops the start with one line naming the variable (never its value).

## Checks

```bash
npm ci
npm run check                                   # unit and HTTP tests, fake mail server, no network
npx playwright install chromium && npm run e2e  # browser checks; ENGINES=chromium,firefox,webkit for all three
```

## Image

```bash
docker build --platform linux/amd64 -t dreambau-contact:<tag> apps/contact
```

`compose.example.yaml` shows the container shape (read-only root, one loopback port, no capabilities, 128 MB) with
placeholders only.
