# Visible Taxonomy Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show selected metadata as localized colored pills, eliminate responsive overlap, replace raw taxonomy textareas with tag editors, and rotate the protected registry password safely.

**Architecture:** Keep existing metadata arrays and taxonomy keys unchanged. Add reusable tag presentation/editor components in the client, then use them in compact account controls, filters, and settings. Treat password rotation as a deployment-only secret operation outside Git.

**Tech Stack:** React 19, TypeScript, Radix/shadcn primitives, Tailwind CSS 4, Vitest, Playwright, Express, Kubernetes.

## Global Constraints

- Never store or print the new shared password.
- Preserve stable ORISO topic keys; localize only in the UI.
- Do not add carrier-name or generic account-tag fields.
- Multi-select changes persist immediately through the existing authenticated PATCH endpoint.
- Long controls truncate with an ellipsis and never overlap adjacent columns.

---

### Task 1: Reusable selected-tag presentation

**Files:**
- Create: `src/client/components/selected-tags.tsx`
- Modify: `src/client/components/multi-select.tsx`
- Modify: `src/client/components/inline-metadata-controls.tsx`
- Test: `tests/selected-tags.test.tsx`

**Interfaces:**
- Produces: `SelectedTags({ values, formatOption, tone, onRemove })` and `TagTone`.
- Consumes: existing taxonomy arrays and localized formatter functions.

- [ ] Write a failing server-render test asserting localized visible labels, distinct tone classes, and accessible remove buttons.
- [ ] Run `npm test -- tests/selected-tags.test.tsx`; verify failure because the component does not exist.
- [ ] Implement `SelectedTags` with wrapping pills and optional removal; change `MultiSelect` trigger copy to the category label regardless of selection count.
- [ ] Render tags below each inline taxonomy select and save removals through `saveMetadataPatch`.
- [ ] Run the focused test and `npm run lint`; expect success.

### Task 2: Responsive table without overlap

**Files:**
- Modify: `src/client/components/account-table.tsx`
- Modify: `src/client/components/account-card.tsx`
- Modify: `src/client/components/multi-select.tsx`
- Modify: `src/client/styles.css`
- Test: `tests/e2e/testmails.spec.ts`

**Interfaces:**
- Consumes: `SelectedTags` and existing account controls.
- Produces: shrinkable assignment layout and ellipsis behavior.

- [ ] Add a failing Playwright assertion at the reported intermediate desktop width that assignment controls do not intersect status controls and long labels use ellipsis.
- [ ] Run the breakpoint test against the current live UI and confirm the overlap failure.
- [ ] Replace fixed/minimum widths with `minmax(0,1fr)`, `min-w-0`, bounded column widths, and truncated trigger text.
- [ ] Verify the breakpoint, desktop, and mobile browser tests.

### Task 3: Localized taxonomy tag editor and filter pills

**Files:**
- Create: `src/client/components/tag-editor.tsx`
- Modify: `src/client/components/taxonomy-settings.tsx`
- Modify: `src/client/components/account-directory.tsx`
- Test: `tests/tag-editor.test.tsx`
- Test: `tests/e2e/testmails.spec.ts`

**Interfaces:**
- Produces: `TagEditor({ label, values, formatOption, tone, onChange })`.
- Consumes: `SelectedTags`, localized topic/role/conversation formatters, and existing taxonomy PUT API.

- [ ] Write failing tests for adding a trimmed unique value, ignoring duplicates, localized topic labels, and removing a pill.
- [ ] Run focused tests and confirm RED.
- [ ] Implement an input/Add action plus removable pills; replace all taxonomy textareas.
- [ ] Show selected role/topic/conversation filters as removable pills below the filter row.
- [ ] Extend E2E to create/remove a temporary taxonomy tag and restore the original list.
- [ ] Run focused tests, lint, and full unit tests.

### Task 4: Release, password rotation, and live verification

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`
- Modify: `k8s/deployment.yaml`
- Modify: `scripts/import-image.sh`

**Interfaces:**
- Produces: versioned deployment, rotated protected login, and evidence-backed release.
- Consumes: macOS Keychain service `dreambau-testmails-auth` and Kubernetes Secret `wcr/testmails-auth` without exposing values.

- [ ] Run `npm run lint && npm test && npm run build && git diff --check`.
- [ ] Commit and push the reviewed Dreambau changes to `main` as already authorized.
- [ ] Back up `/data/testmails.sqlite` with mode `0600`.
- [ ] Update the operator Keychain value, generate an Argon2id hash from runtime-only input, recreate the Kubernetes auth Secret from stdin, and generate a fresh random session secret.
- [ ] Build/import a unique image tag, roll out `wcr/testmails`, and verify readiness.
- [ ] Run all desktop/mobile E2E tests using the rotated password from Keychain; verify old sessions no longer authenticate.
- [ ] Confirm taxonomy counts and metadata remain intact without reading mailbox content.
