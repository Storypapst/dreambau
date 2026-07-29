# App-TOTP Test Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist Testmails-to-Infisical record links and provide safe TOTP enrollment, lookup, OTP and diagnostics to humans and agents.

**Architecture:** SQLite owns non-secret record references and audit history; Infisical remains the only secret store. A read provider and separately credentialed writer sit behind human-session and Machine-Identity routes that share reconciliation and enrollment services.

**Tech Stack:** Node.js 20, TypeScript, Express, SQLite/better-sqlite3, Zod, React, shadcn/ui, Vitest, Supertest, Playwright, Infisical REST API v4.

**Implementation status (2026-07-29):** Tasks 1–5 are implemented on
`feat/app-totp-test-access`. Task 6 verification is recorded in the final
handoff; the mutating live Playwright enrollment remains conditional on a
designated non-production record and runtime-only operator credentials.

**Verification (2026-07-29):**

- `npm run lint`: passed.
- `npm test`: 78 files passed; 504 tests passed and 2 expected failures.
- `npm run build`: passed.
- `npx playwright test --list`: 14 browser cases registered.
- Live Playwright execution was attempted twice. Eight authenticated cases
  cannot run because the documented `dreambau-testmails/shared` Keychain item
  is absent on this Mac. Two public-login assertions currently differ from the
  deployed `dreambau.com/testmails/` surface. The new mutating enrollment case
  is skipped without a designated non-production account and runtime-only TOTP
  seed. These are deployment/operator gates, not local test regressions.

## Global Constraints

- Never log, persist in SQLite, return in errors, or expose through list/lookup responses a password, bearer token, OTP code outside its explicit OTP response, or `totpSecret`.
- Keep `production` invalid; supported test environments remain `local`, `pre-dev`, `dev`, and `production-test`.
- Read and write Infisical identities are configured separately.
- Human access requires a strong session plus project grant.
- Agent enrollment requires `accounts:totp:write`; repair requires `accounts:sync`.
- Use TDD: every behavior is first observed failing for the intended reason.
- Preserve the existing mail-OTP fallback and existing plain-code default for `test-access otp`.

---

### Task 1: Persist and reconcile record links

**Files:**
- Modify: `src/server/schema.ts`
- Modify: `src/server/db.ts`
- Modify: `src/server/account-link.ts`
- Test: `tests/account-link-store.test.ts`

**Interfaces:**
- Produces: `RegistryDatabase.reconcileTestAccessLinks(accounts, records, seenAt)` and `RegistryDatabase.getTestAccessLinks(email)`.
- Produces: sanitized `TestAccessRecordLink` and reconciliation counts.

- [ ] **Step 1: Write failing database tests**

Cover exact case-insensitive E-Mail matching, idempotent upsert, stable
`secretNameForRecord(record.id)`, unmapped counts, and rejection when a
Record-ID is already linked to another E-Mail.

- [ ] **Step 2: Run the focused test and verify the missing methods fail**

Run: `npm test -- tests/account-link-store.test.ts`

- [ ] **Step 3: Add the table, indexes, typed methods and reconciliation logic**

Store only reference metadata. Do not copy `secret` or `totpSecret`.

- [ ] **Step 4: Run account-link and database tests**

Run: `npm test -- tests/account-link-store.test.ts tests/account-link.test.ts tests/metadata.test.ts`

- [ ] **Step 5: Commit**

Commit: `feat(test-access): persist Infisical record links`

### Task 2: Add the fail-closed Infisical TOTP writer

**Files:**
- Create: `src/server/infisical-writer.ts`
- Modify: `src/server/config.ts`
- Modify: `k8s/deployment.yaml`
- Test: `tests/infisical-writer.test.ts`
- Test: `tests/config.test.ts`
- Test: `tests/k8s-infisical-config.test.ts`

**Interfaces:**
- Produces: `RegistryWriter.enrollTotp(record, totpSecret, updatedAt)`.
- Consumes: the stable secret-name function and validated `TestAccessRecord`.

- [ ] **Step 1: Write failing writer/config tests**

Assert separate writer authentication, targeted GET, schema/scope
revalidation, PATCH of only the updated record JSON, no seed in the return
value or thrown error, missing writer configuration, and separate Kubernetes
Secret mounts.

- [ ] **Step 2: Verify focused tests fail**

Run: `npm test -- tests/infisical-writer.test.ts tests/config.test.ts tests/k8s-infisical-config.test.ts`

- [ ] **Step 3: Implement writer and optional writer configuration**

Use `GET /api/v4/secrets/:secretName` followed by
`PATCH /api/v4/secrets/:secretName`, always with `projectId`, environment,
`/records`, shared type and a 15-second timeout.

- [ ] **Step 4: Verify focused tests pass**

Run: `npm test -- tests/infisical-writer.test.ts tests/config.test.ts tests/k8s-infisical-config.test.ts`

- [ ] **Step 5: Commit**

Commit: `feat(test-access): add scoped Infisical TOTP writer`

### Task 3: Expose shared human and Machine-Identity operations

**Files:**
- Modify: `src/server/machine-access.ts`
- Modify: `src/server/test-access.ts`
- Modify: `src/server/app.ts`
- Modify: `src/server/account-link.ts`
- Modify: `src/client/types.ts`
- Test: `tests/test-access-api.test.ts`
- Test: `tests/account-otp-api.test.ts`
- Test: `tests/machine-access.test.ts`

**Interfaces:**
- Produces machine `lookup`, `doctor`, and TOTP enrollment routes.
- Produces human TOTP enrollment route.
- Consumes link reconciliation, `RegistryWriter`, human grants and Machine
  Identity scopes/actions.

- [ ] **Step 1: Write failing API permission and redaction tests**

Cover lookup, doctor/repair, human enrollment, agent enrollment, foreign scope,
missing action, missing writer, invalid Base32, sanitized errors, audit events,
and subsequent OTP generation.

- [ ] **Step 2: Verify focused tests fail**

Run: `npm test -- tests/test-access-api.test.ts tests/account-otp-api.test.ts tests/machine-access.test.ts`

- [ ] **Step 3: Implement the minimal routes and shared helpers**

Resolve records through persisted links, validate the seed by generating a
TOTP before the write, record sanitized audit events, and return no seed.

- [ ] **Step 4: Verify focused tests pass**

Run: `npm test -- tests/test-access-api.test.ts tests/account-otp-api.test.ts tests/machine-access.test.ts`

- [ ] **Step 5: Commit**

Commit: `feat(test-access): expose scoped TOTP enrollment API`

### Task 4: Complete the CLI for humans and agents

**Files:**
- Modify: `src/server/test-access-cli.ts`
- Modify: `scripts/install-test-access-cli.sh`
- Test: `tests/test-access-cli.test.ts`
- Test: `tests/test-access-install.test.ts`

**Interfaces:**
- Produces `lookup`, `enroll-totp`, `otp --json`, and `doctor`.
- Consumes the versioned Machine API and the existing Keychain token loader.

- [ ] **Step 1: Write failing CLI parsing/output tests**

Assert filter URL encoding, hidden/stdin seed input, POST body, JSON mode,
plain OTP compatibility, doctor repair flag, and response-body redaction on
errors.

- [ ] **Step 2: Verify CLI tests fail**

Run: `npm test -- tests/test-access-cli.test.ts tests/test-access-install.test.ts`

- [ ] **Step 3: Implement commands and safe input**

Never accept the seed as an argument. In an interactive TTY disable echo while
reading; otherwise consume a single stdin line. JSON mode prints only the
validated successful response.

- [ ] **Step 4: Verify CLI tests pass**

Run: `npm test -- tests/test-access-cli.test.ts tests/test-access-install.test.ts`

- [ ] **Step 5: Commit**

Commit: `feat(test-access): add lookup enrollment and doctor CLI`

### Task 5: Add the human 2FA enrollment flow

**Files:**
- Create: `src/client/components/totp-enrollment-dialog.tsx`
- Modify: `src/client/components/otp-access.tsx`
- Modify: `src/client/types.ts`
- Test: `tests/totp-enrollment-dialog.test.tsx`
- Test: `tests/otp-access.test.tsx`
- Test: `tests/e2e/testmails.spec.ts`

**Interfaces:**
- Produces a shadcn dialog for linked records with `hasTotp=false`.
- Calls human `POST /accounts/:email/totp`, then enables the existing OTP
  action without ever rendering the seed.

- [ ] **Step 1: Write failing component and Playwright contract tests**

Cover visibility only when TOTP is missing, accessible title/description,
password input, validation error, successful close/state update, no rendered
seed, and OTP retrieval after enrollment.

- [ ] **Step 2: Verify component tests fail**

Run: `npm test -- tests/totp-enrollment-dialog.test.tsx tests/otp-access.test.tsx`

- [ ] **Step 3: Implement with installed Dialog, Field, Input, Button and Sonner**

Use semantic variants, `FieldGroup`/`Field`, `type=password`,
`autocomplete=off`, accessible error state, and no localStorage.

- [ ] **Step 4: Verify UI tests pass**

Run: `npm test -- tests/totp-enrollment-dialog.test.tsx tests/otp-access.test.tsx`

- [ ] **Step 5: Commit**

Commit: `feat(testmails): add secure 2FA enrollment dialog`

### Task 6: Document, verify and hand off

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-07-29-app-totp-test-access-design.md`
- Modify: `docs/superpowers/plans/2026-07-29-app-totp-test-access.md`

- [ ] **Step 1: Document operations and least-privilege setup**

Document the writer Secret, required Infisical `/records` read/update policy,
Machine Identity actions, CLI examples without secrets, migration/doctor
procedure and rollback.

- [ ] **Step 2: Run all repository gates**

Run: `npm run lint`

Run: `npm test`

Run: `npm run build`

Run the Playwright happy path with runtime credentials only if the protected
operator Keychain prerequisites are available; otherwise run the hermetic
Playwright project and record the exact live prerequisite as open.

- [ ] **Step 3: Review diff and secret scan**

Run: `git diff --check`

Run: `git status --short`

Search changed files for credential-like literals and confirm only explicit
test fixtures remain.

- [ ] **Step 4: Commit**

Commit: `docs(test-access): document persistent TOTP access`
