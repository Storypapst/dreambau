# Testmails UX, Bilingual Labels, and Inline Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the protected Simpsons account registry into a bilingual, domain-oriented test-account workspace with correct unused defaults, authentic ORISO topics, compact inline editing, and safe webmail access.

**Architecture:** Keep stored metadata language-neutral and localize labels in the React client. Seed the 16 canonical multilingual ORISO counseling topics as stable topic keys, add an `unused` lifecycle state, and expose small reusable presentation helpers for sorting, domain colors, and translations. Inline controls PATCH only the changed metadata field through the existing authenticated API, while the full sheet remains available for notes and technical details.

**Tech Stack:** React 19, TypeScript, Vite, Express, SQLite/better-sqlite3, Radix/shadcn primitives, Tailwind CSS 4, Vitest, Playwright.

## Global Constraints

- UI supports German and English; stored values remain stable across locale changes.
- New or untouched accounts default to `unused`, never `active`.
- Every account has one project assignment from `NONE`, `ORI`, `ORISO`, `ORIMO`, `TRAIL.IST`, `DREAMBAU`, or `OTHER`; the default is `NONE`.
- Existing explicit metadata is preserved.
- The 16 topic names come from ORISO-ConsultingTypeService migration `0011_add_english_topic_names`.
- Passwords never appear in URLs, repository files, logs, or test snapshots.
- Webmail uses `https://mail.dreambau.com/`; optional prefill may contain only the mailbox address.
- Domain colors must be semantic CSS variables and retain readable contrast.
- Primary buttons use a black background with white text; domain colors remain navigational accents only.
- A single click edits individual metadata fields; a double click opens the full row editor.

---

### Task 1: Correct metadata defaults and seed canonical topics

**Files:**
- Create: `src/shared/catalog.ts`
- Modify: `src/server/metadata.ts`
- Modify: `src/server/db.ts`
- Modify: `src/client/types.ts`
- Test: `tests/metadata.test.ts`

**Interfaces:**
- Produces: `topicCatalog`, `topicKeys`, lifecycle value `unused`, and default metadata with `lifecycleStatus: "unused"`.
- Consumes: existing `RegistryDatabase`, `metadataPatchSchema`, and taxonomy string storage.

- [ ] **Step 1: Write failing tests**

Add assertions that a missing account returns `unused` with project `NONE`, the schemas accept the new values, and the taxonomy seed contains exactly the 16 canonical topic keys including `debt` and `pregnancy`.

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm test -- tests/metadata.test.ts`

Expected: failures showing `active` instead of `unused` and an empty topic list.

- [ ] **Step 3: Add the canonical catalog and minimal server changes**

Define `topicCatalog` as records with `key`, `de`, and `en`; derive `topicKeys`; add `unused` to `lifecycleStatuses`; add the project enum; change virtual and SQL defaults to `unused` and `NONE`; seed `topicKeys` instead of an empty list. Add a safe additive SQLite migration for existing databases.

- [ ] **Step 4: Run the metadata tests and verify GREEN**

Run: `npm test -- tests/metadata.test.ts`

Expected: all metadata tests pass.

### Task 2: Add bilingual presentation helpers and domain identity

**Files:**
- Create: `src/client/i18n.ts`
- Create: `src/client/presentation.ts`
- Create: `tests/presentation.test.ts`
- Modify: `src/client/styles.css`

**Interfaces:**
- Produces: `Locale = "de" | "en"`, `t(locale, key)`, `labelTopic(locale, key)`, `domainClass(domain)`, and `sortAccountsForWork(accounts)`.
- Consumes: `topicCatalog` and `AccountView`.

- [ ] **Step 1: Write failing helper tests**

Test German and English labels, topic translation, deterministic six-domain class mapping, and sorting `active` accounts before `unused` accounts while preserving display-name order inside each group.

- [ ] **Step 2: Run helper tests and verify RED**

Run: `npm test -- tests/presentation.test.ts`

Expected: module-not-found failure because the helpers do not exist.

- [ ] **Step 3: Implement the helpers and CSS variables**

Add typed dictionaries for page labels, status labels, fixture labels, roles, and conversation types. Add six `--domain-*` colors plus reusable domain classes for tab, row, badge, and selected-state presentation.

- [ ] **Step 4: Run helper tests and verify GREEN**

Run: `npm test -- tests/presentation.test.ts`

Expected: all presentation tests pass.

### Task 3: Implement reusable instant-save inline metadata controls

**Files:**
- Create: `src/client/components/inline-metadata-controls.tsx`
- Modify: `src/client/components/multi-select.tsx`
- Modify: `src/client/components/account-table.tsx`
- Modify: `src/client/components/account-card.tsx`
- Test: `tests/inline-metadata-controls.test.tsx`

**Interfaces:**
- Produces: `InlineMetadataControls({ account, taxonomies, locale, onSaved })` and localized `MultiSelect` labels.
- Consumes: authenticated `api`, `AccountMetadata`, and taxonomy keys.

- [ ] **Step 1: Write failing component tests**

Render one account and assert that clicking lifecycle opens a select containing `unused` and `active`, project is a single-select defaulting to `NONE`, selecting a value PATCHes only that metadata field, topic multi-select shows localized labels, and save errors leave the old value visible.

- [ ] **Step 2: Run component tests and verify RED**

Run: `npm test -- tests/inline-metadata-controls.test.tsx`

Expected: module-not-found failure.

- [ ] **Step 3: Implement minimal instant-save controls**

Use existing Select and Popover primitives. Apply an optimistic value, PATCH the changed field, replace the parent metadata on success, show a localized toast, and roll back with an error toast on failure.

- [ ] **Step 4: Integrate controls into desktop and mobile rows**

Make the identity a visible outline-style button. Add an explicit `In use` badge, compact email/password actions, translated inline fields, and double-click row editing. Remove the unexplained blue encryption rail and replace it with a localized lock badge.

- [ ] **Step 5: Run component and full unit tests**

Run: `npm test`

Expected: all tests pass.

### Task 4: Recompose the bilingual directory and safe webmail actions

**Files:**
- Modify: `src/client/components/account-directory.tsx`
- Modify: `src/client/components/account-detail-sheet.tsx`
- Modify: `src/client/components/metadata-editor.tsx`
- Modify: `src/client/components/taxonomy-settings.tsx`
- Modify: `src/client/components/version-bulk-action.tsx`
- Modify: `src/client/components/login-form.tsx`
- Modify: `src/client/app.tsx`
- Test: `tests/e2e/testmails.spec.ts`

**Interfaces:**
- Produces: persisted locale toggle, localized page, global and per-account webmail links, compact detail sheet, and sorted account display.
- Consumes: `sortAccountsForWork`, `t`, `labelTopic`, and `InlineMetadataControls`.

- [ ] **Step 1: Extend E2E expectations before UI changes**

Assert that German is default, switching to English changes the heading and persists across reload, untouched accounts show `Unused`, used accounts sort first, domain selection has the matching domain marker, Webmail links target `https://mail.dreambau.com/`, and no link contains a password.

- [ ] **Step 2: Run E2E against the unchanged UI and verify RED**

Run: `TESTMAILS_E2E_PASSWORD="$(security find-generic-password -s dreambau-testmails -a shared -w)" npm run test:e2e -- --project=desktop`

Expected: new bilingual, status, domain, and Webmail assertions fail. The secret is read at runtime and not printed.

- [ ] **Step 3: Implement locale state and translated directory chrome**

Persist `de`/`en` in localStorage. Localize headings, descriptions, filters, project selection, badges, actions, empty states, editor labels, and toast copy. Render domain-filter controls using their semantic domain identity.

- [ ] **Step 4: Add safe Webmail access and compact details**

Add `Open webmail` globally and per account with `target="_blank"` and `rel="noreferrer"`. Never include the password. Move IMAP/SMTP/JMAP/CalDAV/CardDAV into a collapsed native details section and keep access/copy actions prominent.

- [ ] **Step 5: Sort working accounts first and preserve filtering**

After applying current filters, sort active/in-use accounts first, other non-unused states second, and unused accounts last, then by display name. Keep counts based on the filtered set.

- [ ] **Step 6: Run unit, lint, build, and E2E verification**

Run: `npm run lint && npm test && npm run build`

Then run the credential-safe Playwright command from Step 2.

Expected: all commands exit 0.

### Task 5: Deploy, browser-verify, and integrate

**Files:**
- Modify only if required by the existing deployment path: `k8s/*`
- Runtime verification: `https://dreambau.com/testmails/`

**Interfaces:**
- Produces: merged GitHub change and verified live UI.
- Consumes: repository deployment workflow and operator credentials outside Git.

- [ ] **Step 1: Review the complete diff and secret scan**

Run: `git diff --check && git diff --stat`

Expected: clean diff and no newly committed secrets.

- [ ] **Step 2: Run the full verification suite fresh**

Run: `npm ci && npm run lint && npm test && npm run build`

Expected: all commands exit 0.

- [ ] **Step 3: Commit and integrate the feature branch**

Commit the reviewed files with an English conventional commit. Merge the feature branch into `main` as previously authorized and push only the intended Dreambau repository changes.

- [ ] **Step 4: Verify deployment and live browser behavior**

Confirm the live build, log in through the protected surface, switch DE/EN, filter multiple domains, edit a status and topic inline, open and close the account detail, check the Webmail target, and restore any mutated live account metadata.

- [ ] **Step 5: Record final evidence**

Report commit/PR, test counts, deployment state, and any remaining limitation. Do not include passwords, OTPs, mail bodies, or cookies.
