# Dreambau Testmails Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Do not use subagents unless Frank explicitly requests delegation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy a password-protected test-account registry at `https://dreambau.com/testmails/` that lists all 180 Simpsons mail accounts, supports safe credential copying, exposes mail/calendar/address-book/encryption details, and persists editable testing metadata.

**Architecture:** Build a single-replica Node.js application with an Express API and a Vite/React frontend composed from shadcn/ui components. Store account credentials in a Kubernetes Secret, store editable metadata in SQLite on a persistent volume, store only an Argon2id login hash on the server, and publish the app through a dedicated Traefik `/testmails` route that takes precedence over the existing root redirect.

**Tech Stack:** Node.js 20, TypeScript, Express, Vite, React, shadcn/ui, Tailwind CSS, SQLite, Drizzle ORM, Argon2id, signed secure cookies, Vitest, Supertest, Playwright, Docker, K3s/Kubernetes, Traefik.

## Global Constraints

- Use the official shadcn skill installed at `~/.agents/skills/shadcn/SKILL.md` and follow its component, form, icon, composition, and semantic-color rules.
- The application source lives on the Dreambau server at `/root/testmails-app`.
- The Kubernetes namespace is `wcr`.
- The public path is exactly `https://dreambau.com/testmails/`.
- Preserve `/.well-known/matrix/server`, `/.well-known/matrix/client`, and the existing redirect from other `dreambau.com` paths to `https://www.dreambau.com/`.
- Never place the shared login password, mailbox passwords, API tokens, private S/MIME keys, or PKCS#12 content in Git, Markdown, HTML, Docker images, ConfigMaps, logs, or shell history.
- Store only an Argon2id hash of the shared login password in Kubernetes Secret `testmails-auth`.
- Store the random session-signing secret only in Kubernetes Secret `testmails-auth`.
- Store the 180 test mailbox records only in Kubernetes Secret `testmails-accounts`; mount it read-only.
- Keep S/MIME private identities on the operator Mac in Keychain service `dreambau-test-smime`; do not copy private keys to this application.
- Read mailbox passwords on the operator Mac from Keychain service `dreambau-test-mailbox` only during the explicit secret-import operation.
- Treat `oriso.org` accounts as intentionally unencrypted. The other five domains use S/MIME with AES-256, `encryptOnAppend=true`, and `allowSpamTraining=false`.
- Do not expose an endpoint that deletes Stalwart accounts. Version-based cleanup is filter plus `delete_candidate` marking only.
- Run exactly one application replica while SQLite is the metadata store.
- The app must work on mobile, support keyboard navigation, show visible focus, and respect reduced motion.
- The protected Markdown export must be available at `https://dreambau.com/testmails/testmails.md` and must require the same authenticated session as the HTML application.

## Verified Environment Baseline

Verified 2026-07-11:

- Server SSH alias from Frank's Mac: `m4dreambau`
- K3s: `v1.33.5+k3s1`
- Default StorageClass: `local-path`
- Docker: `29.6.1`
- Node.js: `v20.20.2`
- npm: `10.8.2`
- Traefik: `v3.5.3`
- Stalwart pod: `wcr/dreambau-mail-0`, image `stalwartlabs/stalwart:v0.16.4`
- Roundcube deployment: `wcr/dreambau-webmail`, image `roundcube/roundcubemail:1.6.11-apache`
- Stalwart CLI: `/usr/local/bin/stalwart-cli`, version `1.0.10`
- Existing root ingress: `matrix/matrix-well-known-root`
- Existing root behavior: Matrix well-known responses; all other paths redirect to `https://www.dreambau.com$request_uri`
- Existing TLS secret: `matrix/dreambau-com-tls`; verify whether cross-namespace certificate reuse needs a copied Secret in `wcr` before applying the new Ingress.
- Expected domains: `dreambau.com`, `dreambau.de`, `getme.global`, `openresilience.cc`, `oriso.org`, `trail.ist`
- Expected test fleet: 30 Simpsons accounts per domain, 180 total

## Product Decisions

### Authentication

- Password-only login form; no username.
- Server verifies an Argon2id password hash.
- Session cookie name: `dreambau_testmails_session`.
- Cookie flags: `HttpOnly`, `Secure`, `SameSite=Strict`, path `/testmails`, maximum age 12 hours.
- Login rate limit: five failed attempts per source IP in 15 minutes, followed by HTTP 429.
- Successful login rotates the session identifier.
- Logout invalidates the server-side session and clears the cookie.
- Do not place account data in the initial HTML document. Fetch it only from authenticated API routes.

### Account directory

- Show all 180 accounts grouped or filtered by domain.
- Desktop uses a shadcn `Table`; mobile uses full `Card` composition.
- Search across display name, email address, domain, version, role, topic, conversation type, notes, and status.
- Provide domain tabs or a shadcn `ToggleGroup`: All plus one entry per domain.
- Passwords are masked by default and can be revealed per account.
- Copy actions:
  - Display name
  - Full email address
  - Password
  - Complete row as tab-separated text
  - IMAP endpoint
  - SMTP endpoint
  - JMAP endpoint
  - CalDAV URL
  - CardDAV URL
- Use shadcn `Button` variants and the project's icon library. Use `sonner` for copy success/failure messages.

### Connection and encryption information

Each account row or detail sheet shows:

- Display name
- Full email address
- Domain
- IMAP: `mail.dreambau.com:993`, implicit TLS
- SMTP submission: `mail.dreambau.com:465`, implicit TLS
- JMAP discovery: `https://box.dreambau.com/.well-known/jmap`
- CalDAV account URL: `https://box.dreambau.com/dav/cal/{urlEncodedEmail}/`
- CardDAV account URL: `https://box.dreambau.com/dav/card/{urlEncodedEmail}/`
- Encryption state: `encrypted` or `disabled`
- Encryption format: `S/MIME` for encrypted accounts
- Symmetric mode: `AES-256` for encrypted accounts
- `encryptOnAppend`: true for encrypted accounts
- `allowSpamTraining`: false for encrypted accounts
- Private-key location statement: matching PKCS#12 identity is held externally in the operator Mac Keychain
- `oriso.org` explanation: deliberately unencrypted for comparison testing

### Editable metadata

Persist these fields per account:

```ts
type LifecycleStatus =
  | "active"
  | "needs_review"
  | "delete_candidate"
  | "archived";

type FixtureQuality =
  | "empty"
  | "synthetic"
  | "realistic"
  | "gold";

interface AccountMetadata {
  email: string;
  shippedVersion: string;
  lifecycleStatus: LifecycleStatus;
  roles: string[];
  topics: string[];
  conversationTypes: string[];
  fixtureQuality: FixtureQuality;
  sampleFileCount: number;
  notes: string;
  updatedAt: string;
}
```

- `shippedVersion` accepts semantic versions such as `3`, `3.1`, or `3.1.0`; normalize comparisons numerically rather than lexicographically.
- Bulk action: filter `shippedVersion > X`, select matching rows, and mark them `delete_candidate` after a confirmation dialog.
- No Stalwart delete call exists in this release.
- Roles, topics, and conversation types use shadcn multi-select/command-popover composition.
- Taxonomy values are editable by authenticated users through a small Settings sheet, so actual ORISO admin roles and Caritas topics can be maintained without redeployment.
- Seed role options: `Träger`, `Berater`, `Ratsuchender`, `Admin`.
- Seed conversation types: `Chat`, `E-Mail`, `Video`, `Termin`, `Dateiaustausch`, `Langzeitdialog`.
- Seed topic options as an empty list and enter/import the authoritative Caritas topic names through Settings; do not invent production topic names.
- Fixture quality labels:
  - `empty`: no representative data
  - `synthetic`: generated basic examples
  - `realistic`: representative counseling history or files
  - `gold`: curated reusable showcase account

### Markdown export

- Generate `/data/export/testmails.md` after startup and after every metadata/taxonomy update.
- Serve it through authenticated route `/testmails/testmails.md`.
- Include a generated-at timestamp, global connection settings, encryption explanation, and one table per domain.
- Include the same credential and metadata fields as the HTML view.
- Escape Markdown pipe characters and line breaks in values.
- Never place the generated file in Git or a ConfigMap.

## File Map

Create this structure on the server:

```text
/root/testmails-app/
├── PLAN.md
├── README.md
├── package.json
├── package-lock.json
├── tsconfig.json
├── vite.config.ts
├── components.json
├── Dockerfile
├── .dockerignore
├── .gitignore
├── src/
│   ├── client/
│   │   ├── main.tsx
│   │   ├── app.tsx
│   │   ├── styles.css
│   │   ├── api.ts
│   │   ├── types.ts
│   │   ├── components/
│   │   │   ├── login-form.tsx
│   │   │   ├── account-directory.tsx
│   │   │   ├── account-table.tsx
│   │   │   ├── account-card.tsx
│   │   │   ├── account-detail-sheet.tsx
│   │   │   ├── metadata-editor.tsx
│   │   │   ├── taxonomy-settings.tsx
│   │   │   ├── version-bulk-action.tsx
│   │   │   └── copy-button.tsx
│   │   └── components/ui/
│   └── server/
│       ├── index.ts
│       ├── app.ts
│       ├── config.ts
│       ├── auth.ts
│       ├── sessions.ts
│       ├── accounts.ts
│       ├── metadata.ts
│       ├── taxonomies.ts
│       ├── markdown.ts
│       ├── db.ts
│       └── schema.ts
├── scripts/
│   ├── build-account-secret.mjs
│   ├── hash-login-password.mjs
│   └── import-image.sh
├── tests/
│   ├── auth.test.ts
│   ├── accounts.test.ts
│   ├── metadata.test.ts
│   ├── version-filter.test.ts
│   ├── markdown.test.ts
│   └── e2e/testmails.spec.ts
└── k8s/
    ├── pvc.yaml
    ├── deployment.yaml
    ├── service.yaml
    ├── ingress.yaml
    └── network-policy.yaml
```

## API Contract

All routes are below `/testmails/api`.

```text
POST   /auth/login             body { password }
POST   /auth/logout            no body
GET    /auth/session           returns { authenticated }
GET    /accounts               returns AccountView[]
PATCH  /accounts/:email        body Partial<AccountMetadata>
POST   /accounts/bulk-status   body { emails: string[], status: LifecycleStatus }
GET    /taxonomies             returns all option lists
PUT    /taxonomies/:kind       body { values: string[] }
GET    /export/markdown        returns text/markdown
```

Unauthenticated responses return HTTP 401 JSON except the login route. Validation failures return HTTP 400 with a stable `{ error, fieldErrors }` shape. Missing accounts return 404. Rate-limited login returns 429.

## Task 1: Bootstrap the repository and shadcn project

**Files:** Create `/root/testmails-app/package.json`, TypeScript/Vite configuration, `components.json`, client entry files, server entry files, `.gitignore`, and `README.md`.

**Interfaces:** Produces npm scripts `dev`, `build`, `start`, `test`, `test:e2e`, and `lint` used by all later tasks.

- [ ] Initialize `/root/testmails-app` as a Git repository and copy this plan to `/root/testmails-app/PLAN.md`.
- [ ] Set `packageManager` to npm and initialize the Vite React TypeScript project with base path `/testmails/`.
- [ ] Run `npx shadcn@latest info --json`; save no generated secrets.
- [ ] Initialize shadcn with an explicit official preset and existing-project mode.
- [ ] Run `npx shadcn@latest search @shadcn -q "login table command sheet badge alert dialog toast"`.
- [ ] Run `npx shadcn@latest docs button card input field table badge tabs toggle-group command popover sheet alert-dialog sonner` and read the returned official documentation before adding components.
- [ ] Add only the selected official components with `npx shadcn@latest add ...`.
- [ ] Verify `npm run build` creates `dist/client/index.html` with `/testmails/` asset URLs.
- [ ] Commit as `chore(testmails): bootstrap protected registry app`.

## Task 2: Implement authentication with tests

**Files:** Create `src/server/auth.ts`, `src/server/sessions.ts`, `src/server/config.ts`, `src/client/components/login-form.tsx`, and `tests/auth.test.ts`.

**Interfaces:** Produces `requireSession`, `login`, `logout`, and `GET /auth/session` for every protected route.

- [ ] Write Supertest cases proving unauthenticated `/accounts` returns 401, wrong password returns 401, five failures trigger 429, correct password sets the required cookie flags, and logout invalidates the session.
- [ ] Run `npm test -- tests/auth.test.ts` and confirm the tests fail before implementation.
- [ ] Implement Argon2id verification, in-memory server-side sessions, IP rate limiting, session rotation, and secure cookie handling.
- [ ] Build the shadcn login form using `FieldGroup`, `Field`, `FieldLabel`, `Input`, `Button`, and `Alert` for errors.
- [ ] Run the auth test and the full test suite.
- [ ] Commit as `feat(testmails): add password-only session authentication`.

## Task 3: Import and expose the 180 account records safely

**Files:** Create `scripts/build-account-secret.mjs`, `src/server/accounts.ts`, `src/client/types.ts`, and `tests/accounts.test.ts`.

**Interfaces:** `loadAccounts(path): AccountRecord[]` validates the mounted JSON file. `GET /accounts` returns `AccountView[]` only after authentication.

- [ ] Define `AccountRecord` with display name, email, password, domain, endpoints, and encryption properties.
- [ ] Write tests for exactly six domains, duplicate-email rejection, missing-password rejection, ORISO disabled encryption, and AES-256 settings on the other five domains.
- [ ] Implement a local-only export script that receives the authoritative email manifest, retrieves each password with `security find-generic-password -s dreambau-test-mailbox -a <email> -w`, and writes JSON to stdout only.
- [ ] Pipe the JSON directly over SSH into Kubernetes Secret `wcr/testmails-accounts`; never create the plaintext JSON in the shared Drive or server filesystem.
- [ ] Mount the Secret read-only at `/run/secrets/testmails/accounts.json`.
- [ ] Run account tests and confirm the authenticated endpoint returns 180 unique records.
- [ ] Commit as `feat(testmails): load protected account directory`.

## Task 4: Add SQLite metadata and editable taxonomies

**Files:** Create `src/server/db.ts`, `schema.ts`, `metadata.ts`, `taxonomies.ts`, migrations, and `tests/metadata.test.ts`.

**Interfaces:** Produces metadata CRUD, bulk lifecycle updates, taxonomy CRUD, and `regenerateMarkdown()` callback after mutations.

- [ ] Write migration tests for the `account_metadata` and `taxonomy_values` tables.
- [ ] Use email as the stable metadata key; do not duplicate passwords in SQLite.
- [ ] Validate lifecycle and fixture-quality enums server-side.
- [ ] Implement numeric semantic-version comparison for `1`, `1.2`, and `1.2.3`.
- [ ] Implement authenticated PATCH, bulk-status, taxonomy GET, and taxonomy PUT routes.
- [ ] Seed the role and conversation-type options defined in this plan; seed topics empty.
- [ ] Run metadata, taxonomy, and version comparison tests.
- [ ] Commit as `feat(testmails): persist testing metadata and taxonomies`.

## Task 5: Build the shadcn account directory

**Files:** Create the client components listed in the File Map and update `src/client/app.tsx` and `styles.css`.

**Interfaces:** Consumes `AccountView[]`, metadata, and taxonomies. Produces search/filter/edit/copy interactions and API mutations.

- [ ] Create a restrained registry aesthetic: dense but calm data workspace, semantic status colors, strong typography, and one signature element showing a compact encryption rail per account.
- [ ] Compose desktop `Table` and mobile `Card` views from official shadcn components.
- [ ] Add search, domain `ToggleGroup`, lifecycle filter, version filter, role/topic/conversation filters, and fixture-quality filter.
- [ ] Add password reveal per row; default masked.
- [ ] Add copy buttons for every field specified in Product Decisions and use `sonner` feedback.
- [ ] Add an account detail `Sheet` with endpoints and encryption explanation.
- [ ] Add metadata editing with `FieldGroup`, `Field`, shadcn controls, and accessible validation.
- [ ] Add taxonomy Settings `Sheet` with explicit add/remove controls.
- [ ] Add version bulk-marking flow with `AlertDialog`; only `delete_candidate` is allowed.
- [ ] Add loading `Skeleton`, empty-state `Empty`, and failure `Alert` components.
- [ ] Run unit tests, keyboard checks, and mobile viewport checks.
- [ ] Commit as `feat(testmails): add searchable editable registry interface`.

## Task 6: Generate and protect the Markdown document

**Files:** Create `src/server/markdown.ts`, `tests/markdown.test.ts`, and ensure `/data/export` is on the PVC.

**Interfaces:** `generateMarkdown(accounts, metadata, taxonomies): string` and `writeMarkdownAtomically(path, contents): Promise<void>`.

- [ ] Write tests proving all six domain headings appear, all 180 emails appear once, Markdown is escaped, encryption information is correct, and unauthenticated requests return 401.
- [ ] Implement atomic write through a temporary file plus rename.
- [ ] Regenerate at startup and after every metadata/taxonomy update.
- [ ] Serve `/testmails/testmails.md` with `Content-Type: text/markdown; charset=utf-8` only after session validation.
- [ ] Run Markdown and full test suites.
- [ ] Commit as `feat(testmails): add protected live Markdown export`.

## Task 7: Containerize and deploy to K3s

**Files:** Create `Dockerfile`, `.dockerignore`, `k8s/pvc.yaml`, `deployment.yaml`, `service.yaml`, `ingress.yaml`, and `network-policy.yaml`.

**Interfaces:** Publishes container port 3000 through service `wcr/testmails` and Ingress path `/testmails`.

- [ ] Build a multi-stage image with dev dependencies excluded from the runtime layer.
- [ ] Confirm the image contains no mailbox JSON, login password, private key, API token, `.env`, SQLite file, or generated Markdown file.
- [ ] Create PVC `testmails-data`, size 1Gi, StorageClass `local-path`.
- [ ] Create Secrets `testmails-auth` and `testmails-accounts` through stdin-driven commands, not checked-in YAML.
- [ ] If required, copy the existing `dreambau-com-tls` Secret from namespace `matrix` to namespace `wcr` without printing certificate or key material.
- [ ] Configure one replica, read-only root filesystem where compatible, non-root user, resource requests/limits, liveness `/testmails/health/live`, and readiness `/testmails/health/ready`.
- [ ] Create Traefik Ingress host `dreambau.com`, path `/testmails`, `Prefix`, TLS enabled.
- [ ] Add a NetworkPolicy permitting Traefik ingress and DNS only; the application must not need outbound internet access.
- [ ] Build `dreambau-testmails:0.1.0`, import it into K3s containerd, and apply manifests.
- [ ] Confirm rollout readiness before public testing.
- [ ] Commit as `feat(testmails): deploy registry to dreambau k3s`.

## Task 8: End-to-end and security verification

**Files:** Create `tests/e2e/testmails.spec.ts`; update `README.md` with operations and rollback.

**Interfaces:** Produces the final evidence bundle and operational runbook.

- [ ] Prove `https://dreambau.com/.well-known/matrix/client` still returns the Matrix JSON.
- [ ] Prove `https://dreambau.com/anything-else` still redirects to `https://www.dreambau.com/anything-else`.
- [ ] Prove unauthenticated `/testmails/`, `/testmails/api/accounts`, and `/testmails/testmails.md` do not expose credentials.
- [ ] Prove wrong password fails and correct password succeeds without a username.
- [ ] Prove 180 unique accounts and 30 accounts per domain.
- [ ] Prove search, domain filter, copy actions, reveal/mask, metadata save, taxonomy edit, version filter, bulk mark, and logout.
- [ ] Prove `oriso.org` rows show disabled encryption and the other 150 show S/MIME/AES-256.
- [ ] Prove Markdown remains protected and reflects a metadata change.
- [ ] Inspect image layers, ConfigMaps, manifests, and logs for the shared login password and mailbox passwords; expected matches: zero.
- [ ] Verify the app uses a Secure/HttpOnly/SameSite=Strict session cookie and rate limiting.
- [ ] Capture `kubectl get pods,svc,ingress,pvc -n wcr` and public `curl` results in the final report without secrets.
- [ ] Document backup of `/data/testmails.sqlite`, rollback to the previous image, and Secret rotation.
- [ ] Commit as `test(testmails): verify protected registry end to end`.

## Implementation Commands

Use these read-only baseline commands before implementation:

```bash
ssh m4dreambau 'kubectl get pods,svc,ingress,pvc -n wcr'
ssh m4dreambau '/usr/local/bin/stalwart-cli --version'
curl -fsS https://dreambau.com/.well-known/matrix/client
curl -sSI https://dreambau.com/testmails/
```

Use these verification commands after deployment:

```bash
ssh m4dreambau 'kubectl rollout status deployment/testmails -n wcr --timeout=180s'
curl -sS -o /dev/null -w '%{http_code}\n' https://dreambau.com/testmails/
curl -sS -o /dev/null -w '%{http_code}\n' https://dreambau.com/testmails/api/accounts
curl -sS -o /dev/null -w '%{http_code}\n' https://dreambau.com/testmails/testmails.md
curl -fsS https://dreambau.com/.well-known/matrix/client
```

Before login, the three `/testmails` checks must not return protected account data. After authenticated browser login, the HTML directory and Markdown export must be usable.

## Rollback

1. Keep the previous image tag available in K3s containerd.
2. Back up `/data/testmails.sqlite` before schema changes.
3. Use `kubectl rollout undo deployment/testmails -n wcr` for an application rollback.
4. Delete only the dedicated `testmails` Ingress if the route must be removed; do not modify or delete `matrix-well-known-root`.
5. Preserve the PVC and Secrets during rollback unless Frank explicitly requests their deletion.

## Self-Review Record

- Scope covers the password-only login, 180 credentials, copy actions, connection details, encryption details, editable release/status/role/topic/conversation/fixture metadata, Markdown export, deployment, and security verification.
- Direct mailbox deletion is intentionally excluded; version cleanup produces `delete_candidate` metadata only.
- Authoritative Caritas topics are not invented. The UI supports maintaining/importing them through authenticated taxonomy settings.
- Secret-bearing values are referenced only by Secret/Keychain names and runtime placeholders.
- Component and type names are consistent across the file map, API contract, and tasks.
- The current 404 is explained by the absence of a deployed `/testmails` workload and route; Task 7 creates both.

