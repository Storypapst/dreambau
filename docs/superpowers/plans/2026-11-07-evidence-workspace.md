# Testmails Evidence Workspace A Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the backend and UI slices; root integrates and verifies. Steps use checkbox syntax.

**Goal:** Let authorized Testmails users inspect actual runs, evidence, documents and explicit Issue/PR links in the approved run-list/detail design.

**Architecture:** A human-session BFF projects the existing TestRun ledger and an independently scoped Evidence gateway read client into source-discriminated DTOs. Real evidence-only records remain distinct. Stable published URLs remain independent of backing storage. StorageBox supplies network artifact capacity and consistent offhost backups; SQLite stays local.

**Tech Stack:** Existing TypeScript, Express, SQLite, React, shadcn, Vitest, Playwright; existing private S3 ObjectStore contract. Node20.

**Spec:** Frank selected prototype A in `prototype/testmails-evidence-workspace` (docs/prototypes/evidence-workspace/README.md); approved production scope is recorded below. Existing gateway design: docs/superpowers/plans/2026-07-22-pr-evidence-pipeline.md.

## Global Constraints
- Real data only. No synthetic demonstration rows or inferred associations by SHA/date.
- DE/EN; keyboard access;390px mobile,820px tablet,1440px desktop without horizontal overflow.
- Human project/environment grants checked fresh; ledger requires target and pool environments. Server-only read credential; never expose secrets or object keys.
- Released lifecycle is independent of passed/failed outcome. Missing results stay unknown.
- Only processed ready safe media/text/PDF previews. Active Playwright HTML stays on isolated gateway origin.
- Preserve existing public gateway URLs; archive means withdrawal, not storage migration.
- Configure existing purchased1TB StorageBox; no purchases, unknown deletion, remote SQLite, or MinIO on unsupported network filesystem.
- Monthly Drive chunkcopy is deferred. Copy/readback/manifest/isolatedrestore precede any source removal or backend switch.

## Review Focus
- Revoked/narrow environment grants must deny every detail and file request as well as lists.
- Gateway outage must not hide existing ledger records or fabricate empty evidence history.
- Pagination/filtering and selection must preserve real source IDs; released failures remain failures.
- Unsafe HTML, quarantined/archived files and cross-run file IDs must never become private previews.
- Storage interruption/new uploads during migration must preserve source, final delta and rollback.

### Task1: Scoped backend and explicit relationships
**Files:** Create src/shared/workspace.ts; src/server/workspace-*; modify src/evidence/{model,store}.ts, gateway router, server app/config and TestRun CLI; tests/workspace*.test.ts and tests/evidence/*.test.ts.
**Consumes:** Existing TestRunStore, fresh human grants and EvidenceStore/ObjectStore.
**Produces:** GET /testmails/api/workspace/runs(project,source,cursor,limit), GET /runs/:source/:id, GET /documents, GET /evidence/:runId/files/:fileId/content; typed summaries/details with explicit source/result/lifecycle, safe files, references and event outcomes. Gateway scoped pagination/private ready content; read-only fixed-origin bridge. Explicit audited reference attachments; document artifacts supply real documentation.
- [x] Write failing tests for revoked scope, both environments, released failure, exact legacy report provenance, cross-scope references, safe preview denial, pagination and outage.
- [x] Run focused Vitest; confirm failures correspond to missing behavior.
- [x] Implement contracts/router/read client and backward-compatible ingest.
- [x] Run focused tests and typecheck; publish exact shared DTO to UI worker.

### Task2: Production A UI and navigation
**Files:** New src/client/components/evidence-workspace*.tsx, typed client module; modify account-directory navigation; UI tests.
**Consumes:** Task1 shared DTO/API.
**Produces:** A run list/detail workspace with project/environment/result/search, source labels, measured steps/events, screenshot/media viewer, documents and exact Issue/PR links.
- [x] Write failing UI tests for list selection, filters, empty/denied/unavailable states and DE/EN.
- [x] Implement approved A using existing shadcn. No B/C switcher or fake storage controls.
- [x] Integrate normal authenticated navigation; verify scoped queries and link handling.
- [x] Run focused UI tests; actual click through at390/820/1440px.

### Task3: StorageBox and system backups
**Files:** Reviewed ops scripts/config templates and routed private operator runbook; no credentials in repo.
**Consumes:** Purchased BX11, existing server services/data, stable gateway ObjectStore abstraction.
**Produces:** Working protected storage path, scheduled consistent system/Evidence backups with isolated restore proof; backend migration only with verified source copy and rollback.
- [ ] Confirm existing resource, auth bootstrap and official protocol support; inspect current backup failure.
- [ ] Configure narrow server-only connection; keep ports/external exposure minimal.
- [ ] Run online SQLite backups plus required artifact/config manifest; stream encrypted offhost.
- [ ] Read back and restore into isolated temp paths; verify checksums/database integrity.
- [ ] Install monitored schedule; migrate artifact backend only after actual compatibility/range/checksum proof and final delta reconciliation.

### Task4: Review, delivery and live proof
**Files:** Tests, release docs, issue/PR descriptions and this plan.
- [x] Independent adversarial/security/spec review and focused refactor review; fix real findings in a test loop.
- [x] npm run lint; npm test -- --maxWorkers=1; npm run build; npm run evidence:build; npm run cli:bundle.
- [ ] Open reviewable PR(s), request valid reviewer at open; CI and review feedback resolved.
- [ ] Merge/deploy under standing explicit authorization; record prior images/CAS/rollback.
- [ ] Actual human-session live list/detail/file/docs/links checks; verify existing gateway links and health.
- [ ] Show desktop/tablet/mobile proof and precise storage/backup result.

## Resume here
Current main5de7680, branchagent/evidence-workspace. Feature implementation and independent review complete. Three P2 findings fixed and rechecked; two bounded UI refactors applied. Final local gate:140 files,1481 passed +2 expected failures,248.66s; lint/build/evidence:build/CLI bundle pass. An earlier unrelated cloud bootstrap5s timeout passed on focused rerun and unchanged final full gate. CLI metadata1.2.1.

Rendered component fixtures verified at1440/820/390 DE/EN; these are not live acceptance. Next: commit/PR/CI, deploy both gateway and Testmails, then real human-session browser proof.

Storage transport canary encrypted backup/readback/restore passed. Actual Testmails+Evidence application backup is running through the final strict systemd sandbox; no schedules enabled yet. Hetzner server image backup completed separately. Monthly Drive copy remains deferred.
