# Teamwork

Teamwork is the public directory of the team's programs. Each program keeps its own login. The public repository contains an invented example, the static page, and a status checker. The real catalogue belongs only in the operator's private configuration.

The approved specification and operator runbooks are in Storypapst/dreambau-docs#23. This page can be published as a draft while legal-review markers remain. A go-live release and a link from the homepage require confirmed legal wording. An empty approved catalogue displays “Noch keine Programme eingetragen.”

## Install and preview

Use Node 20, Python 3.8 or later, Docker, and OpenSSL for the test certificates. The tests use the pinned Playwright browser and a real nginx container. Every container and browser launched by a test is closed by that test.

For developers — run these commands from this folder:

```sh
npm ci
npx playwright install chromium
npm run serve
npm run check
npm run verify
```

The preview uses the invented example. A preview with an operator-supplied file is local only; it does not establish a production catalogue or publish anything.

For operators — supply the private filename locally:

```sh
npm run serve -- --list "$PRIVATE_LIST"
```

## Status and data

The checker validates before contacting any program. It projects only approved public fields. It treats an HTTP answer below 500 as reachable, does not follow redirects or read bodies, sends no credentials or cookies, retries failures after 30 seconds, limits parallel checks to eight, and caps the whole run at five minutes. Public files are compact UTF-8 JSON, installed by atomic rename. Changed inputs are preserved in private dated history; old history is never removed.

For operators — these paths are provided by private configuration, never committed here:

```sh
python3 status/teamwork_status.py --list "$PRIVATE_LIST" --validate
python3 status/teamwork_status.py --list "$PRIVATE_LIST" --check-only
python3 status/teamwork_status.py --list "$PRIVATE_LIST" \
  --out "$PUBLIC_DATA_DIRECTORY" --history "$PRIVATE_HISTORY_DIRECTORY"
```

For developers — command results:

```text
0 = success
2 = invalid input (no probes or publication)
3 = file/history error (public output preserved)
4 = run cap reached (public output preserved)
--validate: no probes or writes
--check-only: probes, no public or history writes
service/timer: portable templates; the private operator fills @PYTHON@, @SCRIPT@, @LIST@, @OUT@, @HISTORY@
schedule: hourly; UI status older than three hours becomes unknown
```

The page requests both own-origin files without caching, has an eight-second load limit, refreshes visible data every ten minutes, and uses the server clock for status age. Missing or stale status shows all valid programs with a visible unknown marker. A failed refresh retains the last usable page. Reduced motion draws a fixed frame and disables decode and transitions.

## Publish and roll back

The private publisher installs only the four page files and preserves data and unknown files. It makes a checked release backup, installs the entry page last, and restores the previous files if public acceptance fails. Use the approved private runbook for routing, permissions, timer installation, draft publication, and rollback. Do not copy those server settings or the real catalogue into this repository.

For operators — the public acceptance callback takes an origin and returns sanitized JSON with a nonzero exit on failure:

```sh
node tests/public-acceptance.mjs "$PUBLIC_ORIGIN"
```

For developers — release contract:

```text
Page whitelist: index.html, teamwork.css, teamwork.js, datenschutz.html
Status output: data/programs.json and data/status.json
Normal draft publication: legal-review markers allowed
--go-live: private publisher rejects any [[ marker
Public acceptance: canonical route, exact CSP without duplicate directives,
security headers, field whitelist, status younger than two hours,
desktop/phone rendering, keyboard, touch targets, privacy/back navigation,
console and own-origin requests, no browser storage
Live program entries and legal confirmation: operator-owned inputs
```

Verification screenshots contain only the invented test catalogue. The report records actual check results; public acceptance and a real user's navigation through real programs remain separate deployment evidence.
