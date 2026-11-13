# Testmails Role-First Accounts and E2E Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ORISO test identities findable by role and assignment, and navigate exactly between accounts and E2E runs.

**Architecture:** Existing account metadata supplies the compact context. Reserved runs project their recorded account IDs; Evidence runs receive explicit mailbox associations in a small local table. The workspace API returns safe account summaries and the client uses scoped deep links for both directions.

**Tech Stack:** React, TypeScript, Express, SQLite, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-11-testmails-role-first-run-links-design.md`

## Global Constraints

- Never return `AccountView.password`, OTP, tokens or private notes in workspace run payloads.
- Linked application roles outrank documented roles; absent context remains absent rather than inferred.
- Both pool and target environment grants apply to reserved runs.
- Manual Evidence associations require an actual Evidence run, exact normalized mailbox email, project/environment scope and actor attribution.
- Do not mutate ORISO product users or assignments.

## Review Focus

- A linked role conflicts with a stale documented role: show only the linked role as verified.
- Long centre names and missing carrier/postcode: preserve role and centre without inventing placeholders in collapsed rows.
- A reserved run uses different pool and target environments: show the pool account only with both grants.
- An Evidence run references a missing mailbox or a viewer loses scope: keep an unresolved link without leaking account details.
- A linked account or run is outside current filters/page: deep link must still open it and survive reload/back.

---

### Task 1: Role-first compact account context

**Files:** Modify `src/client/components/account-row-summary.tsx`, `account-context-display.tsx`, `favorite-account-view.tsx`, `account-card.tsx`; test `tests/account-row-summary.test.tsx`.

**Interfaces:** `accountPrimaryRoles(account: AccountView, locale: Locale): { labels: string[]; source: "linked" | "documented" | "none" }`.

- [ ] Add failing tests for role precedence, order of role/centre/carrier/postcode/topic, long labels, missing fields and domain moving behind context.
- [ ] Run `npx vitest run tests/account-row-summary.test.tsx` and confirm the new assertions fail.
- [ ] Implement the helper and responsive collapsed row. Label topics as ORISO/platform context. Keep full metadata, source and notes visible on expansion.
- [ ] Run the targeted tests, `npm run lint`, and commit this task.

### Task 2: Safe run-account read model and explicit Evidence associations

**Files:** Modify `src/server/db.ts`, `test-run-store.ts`, `workspace-router.ts`, `src/shared/workspace.d.ts`; create `src/server/workspace-account-links.ts`; test `tests/workspace-account-links.test.ts`, `tests/workspace-router.test.ts`.

**Interfaces:** `WorkspaceAccountSummary` contains accountId, normalized email, displayName, role labels, centre/carrier/postcode, resolution state and no password. `GET /workspace/runs/:source/:id` adds `accounts`; `POST/DELETE /workspace/runs/evidence-run/:id/accounts` attach/remove explicit email association after scope checks. `GET /workspace/accounts/:email/runs` returns scoped run summaries.

- [ ] Add failing tests for reserved pool/target scope, Evidence link create/delete, duplicate normalized email, missing mailbox, cross-scope denial and secret-free response.
- [ ] Run the targeted tests and confirm failures.
- [ ] Add the association table and store, safe projection and scoped routes; use existing catalog records only.
- [ ] Run targeted tests, `npm run lint`, and commit this task.

### Task 3: Bidirectional workspace navigation

**Files:** Modify `src/client/components/evidence-workspace.tsx`, `account-directory.tsx`, `favorite-account-view.tsx`, `src/client/workspace-client.ts`, `directory-route.ts`; create `src/client/components/account-run-links.tsx`; test `tests/evidence-workspace.test.tsx`, `tests/account-directory-filters.test.tsx`.

**Interfaces:** A scoped URL identifies run source+ID or account email. Account section loads its runs; run section lists exact accounts and offers explicit Evidence association. Selection survives reload/back independent of current page/filter.

- [ ] Add failing tests for run→account, account→run, search/filter independence, reload/back and unresolved/denied states.
- [ ] Run targeted tests and confirm failures.
- [ ] Implement the two sections and navigation using Task 2 endpoints.
- [ ] Run targeted tests, full `npm test`, `npm run lint`, `npm run build`, and commit.

### Task 4: Browser proof and today's run association

**Files:** Add sanitized browser evidence in task artifacts; update the run documentation only after observing successful association.

- [ ] Verify mobile, tablet and desktop collapsed/expanded layouts with roles, centres, carrier, postcode and topic; keyboard expansion and long labels.
- [ ] Create a draft Evidence record for the 2026-11-11 ORISO Dev run from sanitized existing report/screenshots, then explicitly attach the five recorded fixture emails. Do not invent a counselor session; note client session 56 only.
- [ ] Check navigation in both directions and scope-denied behaviour in a real browser, with evidence screenshots.
- [ ] Verify that no mailboxes or ORISO users were mutated by this feature and report the exact result.
