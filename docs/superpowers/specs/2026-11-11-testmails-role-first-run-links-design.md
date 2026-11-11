# Testmails: role-first account summary and E2E account links

Date: 2026-11-11. Status: proposed; awaiting Frank's approval.

## Intent

Frank chooses synthetic ORISO users by their application role and test context. In the collapsed Testmails row, role, counselling centre, carrier and postcode must be findable before the mailbox domain. A tester must also be able to open the exact account used in an E2E run and see which runs used an expanded account. Session relationships for clients and counsellors should be recordable without inventing a relationship from coincident timestamps.

## Current state

- `AccountRowSummary` puts role in small secondary text and postcode beside it; email and domain still take prominent row space. Agencies and topics appear as compact previews. Carrier appears only after expansion.
- `AccountMetadata` already stores roles, topics, agencies, carrier, postalCode and notes. `linkedAccess` supplies verified application roles when a Test Access record exists. These are documentation fields, not ORISO assignments.
- `TestRunStore` stores exact account IDs and email addresses for reserved runs. The workspace run detail currently omits them. Evidence-only runs have no account association. The 2026-11-11 browser E2E run could not reserve a Test Access run (HTTP 409), so its five fixtures are only in the run report and Dreambau catalog.

## Approaches

1. **Role-first row plus reserved-run links only.** Uses existing metadata and `TestRunStore`; small change. Free browser runs like 2026-11-11 remain undiscoverable from accounts. Rejected for the requested use case.
2. **Role-first row plus explicit associations for reserved and free runs.** Auto-read exact account IDs from reserved runs; allow a scoped human to attach catalog accounts to an evidence run or manually registered browser run. Show the same association from both sides. Recommended because it covers the current E2E workflow without guessing identities.
3. **Automatic matching by email, time or screenshots.** Appears convenient but can falsely attribute a test to another user or environment. Rejected.

## Proposed behaviour

### Account directory

- Collapsed desktop row: name, a strong role badge, then counselling centre, carrier, postcode and platform topic when recorded. Prefer counselling centre over topic when space is tight. Label the topic as platform/test context, never “Themen in Testmails.” Keep compact copy actions; show email and domain after these fields or on expansion.
- Collapsed mobile row: name and role first; next line counselling centre and postcode; carrier/topic when space permits. Missing values are omitted, never inferred.
- The role badge uses active linked application roles where available and documented roles otherwise, with source visible on expansion. This requires explicit precedence; the current helper unions both and could present stale documentation as verified. Preserve search for all displayed fields.
- Expanded account: show the full context with clear labels, existing notes editor, and a new “Used in E2E runs” section with each run's date, scenario, environment, result and open action.

### Run detail

- Add a “Test users” section listing exact associated accounts. Each row shows role, name/email, counselling centre and an action that opens that account in the directory. A missing, unlinked or deleted account remains visibly unresolved; it is never silently matched by name.
- Reserved `test-run` entries read `test_run_accounts` by exact Test Access account ID and catalog email. Their Test Access account belongs to the run's pool environment; the test result belongs to the target environment. Existing grants for both must hold. Evidence runs require an explicit association using the exact normalized catalog email plus project and environment scope. The server validates that the viewer may see both the run and account and rejects mismatched links.
- A free browser run becomes a draft Evidence run through the existing gateway before accounts are attached. A Drive report alone does not appear in the workspace. The 2026-11-11 run has no Evidence ID yet; its report and screenshots can be imported as a draft, then its five identities attached from the recorded ledger. This avoids inventing a third workspace source type.
- Catalog emails are normalized case-insensitively and unique within the directory. They identify the mailbox in a free-run association even when no Test Access product record exists. If a mailbox is absent later, retain the association as unresolved rather than reassigning it. A Test Access ID, when present, is stored alongside the email and never inferred from a display name.
- Run detail returns a dedicated safe account projection (identifier, display name, email, role/context, resolution state) rather than serializing `AccountView`, which includes the mailbox password. Link events likewise contain identifiers, not account objects or secrets.
- Navigation encodes source and run ID or a scoped account identity in the route. The destination loads the exact record independently of current pagination and filters, opens its detail, and supports reload/back. A user without access receives a generic missing/denied state, not a leaked account summary.
- Record attribution and time for manual links. Allow removal/correction with the same scope check. Treat external Evidence entries separately from Test Access runs; an Evidence entry alone never claims a test account was used.
- The 2026-11-11 run is backfilled only from its recorded ledger after the association feature exists. No password, OTP or session secret is stored in the link.

### Sessions

- Existing notes can hold confirmed client/counsellor session IDs and the relationship, with a short template and links to the relevant run/account. Today's run has a confirmed client session 56 and no confirmed counsellor session; show that distinction. No automatic session pairing in this change.

## Constraints and acceptance

- Do not mutate ORISO assignments, users, or shared mailboxes. Metadata changes remain in Dreambau.
- Do not expose mailbox passwords, OTPs, access tokens or private notes in run summaries, URLs or public evidence.
- Respect the existing human project/environment grants for both directions of navigation. An unknown account or unauthorized run returns no account detail.
- Verify desktop and mobile collapsed layouts; role and centre are visible without expansion. Verify search, keyboard expansion, long labels, missing fields and no domain-first regression.
- Verify bidirectional links for a reserved run (including a pool/target environment split) and an explicitly associated Evidence draft; verify reload/back and items outside the current filter/page, unauthorized and mismatched links, safe API projection, missing mailboxes, and corrected associations disappearing from both views.

## Open decision

Frank has been asked whether free browser E2E runs should be linkable. This draft recommends yes because the 2026-11-11 run otherwise cannot appear in Testmails. This choice is still awaiting his answer. No product code is changed before approval.
