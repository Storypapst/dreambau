# Infisical Human Project Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Synchronize non-admin Testmails project scopes from no-access Infisical organization groups and provision Shazia's ORISO and Dreambau group memberships.

**Architecture:** A focused human-access provider uses the existing Universal Auth boundary to read recognized organization groups and their paginated members. Request-time synchronization persists effective scopes for non-admin users and fails closed when Infisical is unavailable; administrators retain their local bootstrap scopes.

**Tech Stack:** TypeScript, Express, better-sqlite3, Zod, Infisical HTTP API, Vitest, Kubernetes/K3s

## Global Constraints

- Groups are exactly `testmails-oriso`, `testmails-orimo`, and `testmails-dreambau`.
- All groups have organization role `no-access` and no project memberships.
- Only non-admin human project scopes synchronize from Infisical.
- No AI identity, project membership, secret permission, or secret value changes are in scope.
- Tokens, credentials, enrollment codes, and secret values must never appear in logs or committed files.

---

### Task 1: Infisical human-access provider

**Files:**
- Create: `src/server/infisical-human-access.ts`
- Create: `tests/infisical-human-access.test.ts`

**Interfaces:**
- Consumes: Infisical Universal Auth configuration already represented by `RuntimeConfig.infisical`.
- Produces: `HumanAccessProvider`, `createInfisicalHumanAccessProvider(options)`, and `projectsFor(email, options?)`.

- [ ] Write failing tests for recognized group mapping, unknown-group exclusion, member pagination, lowercase email normalization, 60-second caching, and upstream failure.
- [ ] Run `npm test -- --run tests/infisical-human-access.test.ts` and confirm the missing module or behavior fails.
- [ ] Implement the provider with Zod response validation, token reuse, bounded pagination, and no secret-bearing errors.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Persist and enforce synchronized scopes

**Files:**
- Modify: `src/server/passkey-store.ts`
- Modify: `src/server/passkey-auth.ts`
- Modify: `src/server/app.ts`
- Modify: `tests/passkey-store.test.ts`
- Modify: `tests/passkey-auth.test.ts`

**Interfaces:**
- Consumes: `HumanAccessProvider.projectsFor(email)` from Task 1.
- Produces: `PasskeyStore.updateUserProjects(id, projects)` and request-time member synchronization.

- [ ] Write failing tests showing that non-admin scopes update from Infisical, empty membership removes all account visibility, provider failure returns 503, and admins retain local scopes.
- [ ] Run the focused tests and confirm the new expectations fail for the missing behavior.
- [ ] Add `updateUserProjects`, inject the provider into app/auth setup, and synchronize before user listing, current-user reads, and account authorization.
- [ ] Re-run the focused tests and confirm they pass.

### Task 3: Runtime configuration and user-facing source label

**Files:**
- Modify: `src/server/app.ts`
- Modify: `src/client/components/employee-management.tsx`
- Modify: `README.md`
- Modify: `tests/config.test.ts`
- Modify: `tests/team-client.test.ts`

**Interfaces:**
- Consumes: existing `RuntimeConfig.infisical` credentials and group slug constants.
- Produces: production provider wiring and clear Team Access copy stating that Infisical supplies project scopes.

- [ ] Write failing coverage for production provider wiring and the Infisical synchronization label.
- [ ] Run the focused tests and confirm failure.
- [ ] Wire the provider only when `TEST_ACCESS_PROVIDER=infisical`, update the dialog copy, and document operational behavior.
- [ ] Re-run the focused tests and confirm they pass.

### Task 4: Live group provisioning and release

**Files:**
- Modify: `k8s/deployment.yaml` only if a new image tag is required.

**Interfaces:**
- Consumes: the tested application and the existing Infisical/Testmails runtime credentials.
- Produces: three no-access groups, Shazia membership in ORISO and Dreambau groups, and a deployed Testmails image.

- [ ] Create the three groups through the authenticated Infisical admin UI or API with role `no-access` and verify they have no project memberships.
- [ ] Add `shaziakausarwork@gmail.com` to `testmails-oriso` and `testmails-dreambau`; do not add her to `testmails-orimo`.
- [ ] Run `npm run lint`, `npm test`, and `npm run build` locally.
- [ ] Build/import a unique image tag, apply the updated deployment, and wait for rollout readiness.
- [ ] Verify live group membership and no project membership through read-only API calls.
- [ ] Verify the live Testmails session and effective project scopes without printing enrollment codes, tokens, or secrets.

