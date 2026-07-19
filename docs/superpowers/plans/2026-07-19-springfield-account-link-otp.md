# Springfield Account Link, Usage and OTP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every AI-created ORISO test user reuse a visible Springfield mailbox identity, keep that row synchronized with project/version/role/status and last-use data, and let authorized humans retrieve the linked mail OTP or App-TOTP directly from the account UI.

**Architecture:** Use the synthetic Simpson email as the stable join key across the 180-mailbox directory, Infisical Test Access records and product identities. Extend the existing SQLite audit layer with secret-free account access events, expose a least-privilege machine sync endpoint, and add a human-session OTP endpoint that selects only a linked record and never persists the generated code. The React UI shows linked login data and ephemeral OTP controls while keeping passwords, TOTP seeds and machine tokens outside SQLite and reports.

**Tech Stack:** TypeScript, Zod 4, Express 5, better-sqlite3, React 19, shadcn/Radix components, Vitest, Supertest, Playwright, Infisical Test Access provider, Stalwart JMAP.

## Execution status — 2026-07-19

- Implemented and deployed as `dreambau-testmails:0.6.0-springfield-20260719`.
- Local gate: 53 test files / 195 tests, TypeScript, production build and live smoke all pass.
- Abe Simpson is linked under stable ID `oriso/pre-dev/e2e-platform-admin-predev`; Keycloak UUID, tenant `0`, four admin roles and the existing OTP credential were preserved.
- Password plus App-TOTP authentication against ORISO PreDev returned HTTP 200.
- M4 and Kio can list, synchronize and request OTP for the linked record; both actions appear in the secret-free account history.
- Remaining human-only proof: Frank signs back into Testmails after the rollout-created session reset and clicks **OTP abrufen** once. Touch ID/passkey confirmation cannot be performed headlessly.
- Source is pushed on `feat/springfield-account-sync` at `0402095`; merge into the repository default branch remains a separate review decision.

## Global Constraints

- Only established Simpson mailboxes on the six approved test domains may be linked; never create or use a real personal email.
- One Springfield mailbox may link to multiple environment-specific records, but a project/environment/kind tuple must be unambiguous.
- Machine catalog synchronization requires the explicit `accounts:sync` action and existing project/environment scope.
- No password, OTP value, TOTP seed, machine token, storage state, message body or Infisical credential may be written to SQLite, Markdown, Git, logs or test snapshots.
- OTP responses set `Cache-Control: no-store`; the browser keeps a code only in component state and clears it at expiry or dialog close.
- App-TOTP is preferred when a linked app-user has a TOTP seed; mail OTP is the fallback for a linked mailbox.
- Technical Test Access IDs remain stable during the Abe migration so seed profiles and E2E references do not break.
- Live mutation order is backup -> Keycloak/UserService inspection -> password streamed from Keychain -> Infisical update -> dashboard sync -> login/OTP proof -> rollout verification.

---

### Task 1: Secret-free account-link and usage domain

**Files:**
- Create: `src/server/account-link.ts`
- Modify: `src/server/schema.ts`
- Modify: `src/server/db.ts`
- Test: `tests/account-link.test.ts`
- Test: `tests/metadata.test.ts`

**Interfaces:**
- Consumes: `TestAccessRecord`, the 180 `AccountRecord` values and the existing `RegistryDatabase`.
- Produces: `LinkedTestAccount`, `AccountAccessEvent`, `linkedRecordsForEmail()`, `derivedCatalogPatch()`, `RegistryDatabase.recordAccountAccess()` and `RegistryDatabase.getAccountAccess()`.

- [ ] **Step 1: Write failing link-selection and role-mapping tests**

Cover exact-email matching, rejection of non-Simpson email, stable technical ID retention, `agency-admin|tenant-admin|user-admin|topic-admin -> Admin`, `consultant -> Berater`, `user|asker -> Ratsuchender`, and project mapping `oriso -> ORISO`.

- [ ] **Step 2: Confirm RED**

Run: `npm test -- --run tests/account-link.test.ts`  
Expected: FAIL because `account-link.ts` does not exist.

- [ ] **Step 3: Implement the pure link helpers**

`linkedRecordsForEmail(email, records)` returns only exact normalized email matches and sorts App-TOTP records before mailbox records. `derivedCatalogPatch(record, input)` returns a validated metadata patch with mapped project, merged dashboard roles, explicit version/status/topics and a sanitized note.

- [ ] **Step 4: Add the append-only usage table**

Create `account_access_events(id,account_id,email,actor_id,action,created_at,context)` plus indexes on `(email,created_at)` and `(account_id,created_at)`. Store only allow-listed non-secret context fields such as run ID, application version and environment.

- [ ] **Step 5: Implement database read/write and verify GREEN**

`recordAccountAccess()` appends an event. `getAccountAccess(email, limit=10)` returns newest-first events and a latest summary. Run:

```bash
npm test -- --run tests/account-link.test.ts tests/metadata.test.ts
```

Expected: PASS, including a negative assertion that serialized rows contain no password/code/seed/token fields.

### Task 2: Scoped machine sync and human OTP APIs

**Files:**
- Modify: `src/server/machine-access.ts`
- Modify: `src/server/test-access.ts`
- Modify: `src/server/test-access-cli.ts`
- Modify: `src/server/app.ts`
- Test: `tests/machine-access.test.ts`
- Test: `tests/test-access-api.test.ts`
- Test: `tests/test-access-cli.test.ts`
- Create: `tests/account-otp-api.test.ts`

**Interfaces:**
- Produces: machine action `accounts:sync`, `POST /testmails/api/v1/accounts/:id/catalog`, CLI `test-access sync`, and human `GET /testmails/api/accounts/:email/otp?accountId=...&query=...`.
- Consumes: link helpers, `RegistryProvider`, `TestMailReader`, `generateTotp()` and project-scoped human sessions.

- [ ] **Step 1: Write failing least-privilege sync tests**

Prove legacy/read-only identities receive `403 action_denied`; an identity with `accounts:sync` can update only a record inside its project/environment scope and only when the record email matches one of the 180 mailboxes.

- [ ] **Step 2: Implement `accounts:sync` and catalog endpoint**

Validate body `{ applicationVersion, lifecycleStatus?, topics?, notes? }`. Derive project and dashboard roles from the linked Infisical record, update the matching SQLite row, append `catalog_sync`, and return only public record ID plus metadata.

- [ ] **Step 3: Add CLI sync command**

Accept `test-access sync <account-id> --version <version> [--status active] [--note <text>]`, read the bearer token only from Keychain, send JSON without secret fields and print only the returned public metadata.

- [ ] **Step 4: Write failing human OTP tests**

Cover App-TOTP preference, mailbox fallback, explicit account-ID selection, cross-project denial, unlinked account `404`, `Cache-Control: no-store`, and absence of the TOTP seed in response/log data.

- [ ] **Step 5: Implement human OTP endpoint**

Resolve the visible mailbox through the current human project scope, match Infisical records by exact email, select the requested/default linked record, generate App-TOTP or fetch bounded JMAP OTP, append `otp_requested`, and return `{ code, source, accountId, generatedAt?, receivedAt?, expiresAt? }` with `no-store`.

- [ ] **Step 6: Record normal machine account use**

Append `secret_requested`, `mail_requested`, `otp_requested` and `environment_requested` only after a successful scoped operation. Never record returned values or message content.

- [ ] **Step 7: Verify focused API/CLI tests**

```bash
npm test -- --run tests/machine-access.test.ts tests/test-access-api.test.ts tests/test-access-cli.test.ts tests/account-otp-api.test.ts
```

Expected: PASS with no secret values in snapshots or error output.

### Task 3: Springfield linked-login, last-use and OTP UI

**Files:**
- Modify: `src/client/types.ts`
- Create: `src/client/components/account-otp-control.tsx`
- Modify: `src/client/components/account-table.tsx`
- Modify: `src/client/components/account-card.tsx`
- Modify: `src/client/components/account-detail-sheet.tsx`
- Modify: `src/client/components/account-directory.tsx`
- Modify: `src/client/i18n.ts`
- Test: `tests/account-otp-control.test.tsx`
- Test: `tests/app.test.tsx`
- Modify: `tests/e2e/testmails.spec.ts`

**Interfaces:**
- Consumes: account views extended with `linkedAccounts` and `accessSummary`.
- Produces: `AccountOtpControl` and visible linked account ID/environment/username/last-use evidence.

- [ ] **Step 1: Write failing component tests**

Assert the control names the linked Simpson login, fetches only on explicit click, offers copy, shows source and expiry, clears automatically and never places the code in localStorage/sessionStorage/URL.

- [ ] **Step 2: Extend the human account read model**

Make `GET /accounts` asynchronously join public Infisical metadata and secret-free usage events by exact synthetic email. Expose `hasTotp` only as a boolean, never the seed.

- [ ] **Step 3: Implement the OTP control**

Use existing shadcn Button/Card/Badge/Alert composition. Render `OTP abrufen`, then a short-lived code with copy action, source (`App-TOTP` or `E-Mail`) and countdown. Clear state at expiry, close and unmount.

- [ ] **Step 4: Show linked login and last use**

Desktop, mobile and detail sheet display role, environment, linked username/account ID, last action and localized timestamp. Accounts without links show a clear `Noch kein App-Login verknüpft` state.

- [ ] **Step 5: Verify component, responsive and E2E behavior**

```bash
npm test -- --run tests/account-otp-control.test.tsx tests/app.test.tsx
npm run lint
```

Then run the protected Playwright test with credentials sourced from Keychain; verify no OTP appears in trace names, screenshots or URL.

### Task 4: Abe Simpson live migration and release proof

**Files:**
- Modify: `README.md`
- Modify: `k8s/deployment.yaml`
- Modify: `~/.agents/skills/dreambau-testmail-api/SKILL.md` outside Git only after code verification
- Modify: `~/ORISO/skills/oriso-e2e-quality-gate/SKILL.md` outside Dreambau Git only after live proof

**Interfaces:**
- Preserves Test Access ID `oriso/pre-dev/e2e-platform-admin-predev` and profile reference `oriso/pre-dev/platform-admin-e2e`.
- Produces one visible identity: `Abe Simpson <abe.simpson@dreambau.de>` as the ORISO PreDev platform administrator.

- [ ] **Step 1: Back up live SQLite and inspect Keycloak/UserService references**

Create a mode-0600 server backup without exporting mailbox or Infisical secrets. Record only user IDs, usernames, email, tenant and roles.

- [ ] **Step 2: Stream the Simpson mailbox password from M4 Keychain**

Read service `dreambau-test-mailbox`, account `abe.simpson@dreambau.de`, and stream it directly into the Keycloak password update and Infisical record update. Never echo it, place it in argv, or persist plaintext.

- [ ] **Step 3: Rename/link the existing Keycloak identity**

Keep the Keycloak user UUID and existing TOTP credential. Set username/email/display name to Abe Simpson and update any UserService display/login fields that are keyed by username rather than UUID. Verify tenant `0` and the four admin roles remain.

- [ ] **Step 4: Update the stable Infisical app-user record**

Preserve ID and profile references; set display name `Abe Simpson — ORISO PreDev Platform Admin`, username/email to `abe.simpson@dreambau.de`, secret to the same streamed synthetic password, and preserve the existing TOTP seed.

- [ ] **Step 5: Synchronize the Springfield row**

Use the new scoped CLI to set version `2.02`, project `ORISO`, status `active`, role `Admin`, topics `[]`, and a note explaining the stable account ID, PreDev-only use, OTP button and automatic usage history.

- [ ] **Step 6: Run the complete quality gate**

```bash
npm run lint
npm test
npm run build
git diff --check
```

Expected: all checks pass with no secret output.

- [ ] **Step 7: Build, deploy and live-verify**

Build a unique amd64-compatible image tag, import it to the Dreambau K3s node, update only the testmails deployment, and verify rollout, liveness, readiness, existing Matrix well-known routing and authenticated desktop/mobile behavior.

- [ ] **Step 8: Prove the complete Abe flow**

Open Abe in Springfield, copy the visible login, request an App-TOTP, authenticate to ORISO PreDev, then reload the row and verify `last used`, linked account ID, role, version and status changed as expected. Screenshots must not contain password or OTP.

- [ ] **Step 9: Update reusable agent rules**

Require all future AI-created product identities to allocate an existing Simpson mailbox first, set that email in Keycloak and Infisical, call `test-access sync`, and cite the selected username/email beside E2E screenshots. Direct mailbox JMAP remains a debugging fallback; the Hub OTP action is preferred.

## Self-Review

- Spec coverage: visible Simpson identity, AI sync, account-level last use, human OTP retrieval, Abe migration and reusable routing are each assigned to a task.
- Secret boundary: every write path stores only IDs, metadata and timestamps; OTP/password/seed values remain runtime-only.
- Type consistency: `LinkedTestAccount`, `AccountAccessEvent`, `accounts:sync`, human OTP response and UI inputs are introduced before consumers.
- Rollback: stable IDs are preserved, SQLite is backed up before migration, and only the testmails deployment is changed.
