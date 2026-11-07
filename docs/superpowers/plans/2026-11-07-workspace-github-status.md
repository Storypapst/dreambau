# Workspace GitHub Status Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development with the ownership below. Follow the existing component/API TDD seams and keep other agents' edits.

**Goal:** Show fetched delivery facts for explicit GitHub links and offer small per-user workspace settings.

**Architecture:** Add a lazy selected-record GitHub endpoint, a bounded App-authenticated read/cache module, and a separate UI section that never blocks run details. Reuse existing human preferences and the proven work-state transport seam without merging its unfinished stack.

**Tech Stack:** Existing Node20/TypeScript/Express/SQLite, React/shadcn, Vitest/Supertest and real-browser QA. No new dependency required.

**Spec:** `docs/superpowers/specs/2026-11-07-workspace-github-status.md`.

## Global constraints

- Main/deployed baseline55a8049; isolated branch `agent/workspace-github-status`.
- Current task intake independently reviewed by `/root/intake`; repository metadata authorization is additional to run authorization.
- Existing explicit links and account credentials are preserved. No App access expansion until concrete operator approval.
- GitHub is a read source. Keep state, merge, planned release, verified release inclusion and deployment meanings separate.
- Public evidence and GitHub prose follow the existing privacy, attribution and body-section rules.

## Review focus

1. Cross-project URL/cache reuse after a human grant is revoked must reveal no repository metadata.
2. Issue closure and partial multi-PR merges must not become a delivered-version assertion.
3. Timeouts, missing App config and rate limits must leave run details usable and label old facts stale.
4. Fast project/record changes and saved defaults after scope loss must not render a previous project's data.
5. Manual/periodic refresh must retain the selected record and avoid request storms or hidden-tab polling.

## Ownership and sequence

### 1. Backend and shared contract — catalog_visibility

Own new shared GitHub/preferences DTOs, server reader/cache/config/token modules and tests, SQLite cache schema, workspace route integration, passkey preference validation, server startup wiring and operator configuration docs. Do not edit client files.

- [x] Define the transport contract first and send its path/types to the UI owner.
- [x] Red/green at the HTTP and reader boundaries: authenticated selected-run access plus trusted repository scope, cached-scope revocation, unconfigured state, manual refresh deduplication and bounded upstream failures.
- [x] Port only the useful App/transport primitives from PR190 with provenance; test App-token renewal, ETags and retry behavior through public boundaries.
- [x] Add real Issue/PR facts, explicit closing-PR associations and configured board fields; test partial merge and missing fields. Preserve multiple neutral release assignments.
- [x] Prove merge-commit inclusion before emitting a published-release association. Test a later unrelated release and incomplete associations.
- [x] Add validated per-user preference key using the existing store and routes; no new preference table.
- [x] Run focused backend tests and type checks; 64 tests passed. The actual App configuration remains an operator dependency.

### 2. UI and personal settings — adversarial_review

Own workspace client API functions, components, copy/CSS, account-directory navigation glue only if needed, and corresponding UI tests. Consume backend-owned shared types. Do not edit server/shared files.

- [x] Red/green at the existing rendered workspace seam: lazily loaded title/state, partial merge, assigned vs included version, checked/stale/unconfigured/denied states.
- [x] Add compact metadata and refresh controls using existing shadcn components; preserve ordinary external links and run/file selection.
- [x] Add personal settings (remember filters and manual/15/60-minute display refresh) through existing user preferences; current URL/project context wins over stale saved scope.
- [x] Test scope switches, stale responses, reload persistence, hidden-page/cleanup polling, disabled refresh, German/English accessible labels and error recovery. 36 focused tests passed, with additional exact review regressions.
- [x] Capture fixtures at required widths only as local development proof; actual release acceptance remains root-owned. All six DE/EN layouts fit; intercepted API is explicitly labelled.

### 3. Integration, review and publication — root

- [x] Preserve the completed Vault proof and remove only owned temporary master-password files.
- [x] Reuse issue212 and update only its changed requirements/current sections; do not create a duplicate feature ticket.
- [x] Independently review Standards/Spec and security boundaries; all verified findings fixed with regression tests. Earlier full gate after PR review: 145 files, 1531 passed and 2 expected failures. Final exact-URL observer source: 78 focused backend tests passed; full local run had 1538 passes, 2 expected failures and 2 legacy browser timeouts; the two browser files passed unchanged in isolation (34 tests). Require a full green final-head CI before merge. Lint, application/Evidence builds and CLI bundle passed.
- [ ] Prepare exact read-only GitHub App installation/repository configuration; ask the required concrete access decision when the setup is ready, then verify through the service's own identity.
- [x] Open PR218 against main with shazia-k requested at creation and six uniquely captioned local fixture artifacts published through the Evidence gateway.
- [ ] Complete the authorized merge/deploy workflow after the final reviewed head passes CI; inspect current live images before rollout.
- [ ] Verify actual saved links and preferences in the published app, with DE/EN desktop/mobile/iPad screenshots; refresh status descriptions and the local scope ledger.

## Resume here

The Vault setup is completed: existing Storage Box password saved in Production, temporary master-password staging removed, key-based SFTP and backup health verified.

Product source is frozen. Independent backend and UI adversarial reviews passed after exact regressions for case-normalized cooldowns, in-flight grant revocation, denial-cache resurrection, App-token backoff, fast project autosave and denied-snapshot retry. Refactoring preserved all authorization checkpoints. Local application/Evidence/CLI builds passed. The first full run hit short multi-step test deadlines; the affected 30 tests passed unchanged in isolation. Only named integration case budgets/observable test waits were corrected; assertions, child-process ceilings and global test settings are unchanged. Initial final gate passed: 145 files, 1526 tests passed and 2 expected failures; lint also passed. PR review then reproduced four additional cases where a missing reference or auxiliary failure denied valid sibling references. The fix passed 69 focused backend tests and independent security review; that repeated full gate passed: 145 files, 1531 tests passed and 2 expected failures. A second review then found that the coarse cache-set intersection dropped healthy new siblings. Bounded whole-read exact-URL observers replaced it; 78 focused tests, independent security review and refactoring review passed. On final source, the full local run had 1538 passes, 2 expected failures and two existing browser-test timeouts. Both browser files passed unchanged in isolation (34 tests); do not relax their timeouts. Final-head full CI is required before merge.

GitHub App registration is still behind the owner's normal GitHub sudo-mode reauthentication. No App or new rights were created. A concrete read-only installation proposal is prepared; its required action-time access approval and actual service-identity verification remain separate from local source/fixture proof. PR218 is open with reviewer and local fixture proof. Finish the final source gate and CI, then follow the existing delivery/evidence workflow. Do not label fixture data as live GitHub acceptance.
