# Testmails runs, evidence and documentation

Open [Testmails](https://dreambau.com/testmails/) and choose the project you work on. On desktop, use the flask icon to open **Test runs and evidence**. On a phone, find the same entry under **More**. Returning to test accounts preserves your account filters.

## Understand the entries

**Test-account runs** come from the real run ledger. They record the scenario, requested version, commit, initiating identity and lifecycle. **Evidence entries** come from the Evidence gateway and can exist without a run that reserved test accounts. The interface keeps these sources separate.

The result describes what was measured. **Accounts released** describes the account reservation lifecycle. Releasing accounts does not turn a failed run into a pass. A run without a measured result says so; missing check counts are never displayed as zero.

## Find a result

1. Select the project, source, environment and result filters you need.
2. Search by title/scenario, repository, commit, version, recorded PR number or an explicitly attached Issue/PR reference.
3. Select a row to open its result, files, references and recorded events.
4. Use **Load more** for older entries. The counter describes loaded entries, not the total history.
5. If a reference search is too broad, add a more specific term or narrow the filters. The page keeps the query editable.

Results are checked against the signed-in user’s current project and environment permissions. A test-account run also requires access to its account-pool environment. A saved link does not grant access.

## Use evidence and documents

Select a screenshot, video or supported text file to open its viewer. Published evidence can be opened or copied through its stable Evidence link. Private previews remain bound to the current signed-in viewer. Playwright reports open separately on the Evidence origin.

The **Documents** tab (**Dokumentation** in German) lists actual ready document artifacts. Search there by run title, filename or caption. Each entry shows its owning run title. A document explicitly attached to a run opens that document directly from the run’s references.

Archived, quarantined and rejected files do not gain an ordinary preview. A missing preview is not replaced with an invented example. If the Evidence service is unavailable, local run details and local references remain usable and the page shows the gap.

## Connect an Issue or pull request

In a selected entry, choose **Add link**, select Issue or Pull request, paste the canonical GitHub URL and save. Only the real server response updates the displayed links. Searching the associated number can find the entry afterward.

Links are explicit associations. The interface does not infer that two runs belong together because their dates or commits look alike. A recorded GitHub link alone does not claim that GitHub title, existence or review status was checked remotely. The separate **GitHub status** section shows fetched facts only when the approved integration can read the linked repository.

## Read GitHub delivery facts

For the selected entry, **GitHub status** can show the Issue or PR title, its exact state, configured board status and release assignments. Issues can be closed without all related work being merged. A merged PR is not a deployment claim. Assigned versions are labelled separately from published releases whose tags are verified to include the PR's merge commit.

Use **Refresh** to check again. The section shows when a successful check happened and labels cached or stale facts. Missing associations or partial release checks stay marked incomplete. Access denial removes private cached facts. Ordinary links and run details still work when integration is unconfigured or unavailable.

The application uses a dedicated, approved read-only GitHub App. The installation setup is a separate operator step; this guide and local screenshots do not establish that live repository access is enabled.

## Set personal workspace defaults

Open **Workspace settings** beside the project selector. Choose whether to remember source and environment filters separately for each project, and set display refresh to manual, every 15 minutes or every hour. Save, then reload to verify your choice. These settings belong to your signed-in account.

Your current project and explicit URL filters take priority. Search terms, result filters and the selected record are not saved as defaults. Periodic GitHub checks apply only to the selected record while the page is visible.

## Storage and backups

Published Evidence addresses stay independent of the underlying object storage. This delivery retains the existing primary store and configures a separate encrypted Storage Box backup path. It does not redirect links to Google Drive.

The application backup’s receipt names its included and omitted datasets. A complete operating-system image backup is a separate provider-level safeguard. The monthly chunked Drive copy is deferred. Operators should use [the backup and recovery procedure](https://github.com/Storypapst/dreambau/blob/main/docs/operations/storage-box-backup.md) and verify an accepted backup set rather than restoring an arbitrary latest component snapshot.

## Delivery verification

The run/evidence interface and operating package were delivered through [PR 214](https://github.com/Storypapst/dreambau/pull/214) and [PR 215](https://github.com/Storypapst/dreambau/pull/215). The real browser and backup acceptance record is maintained in the Evidence comment on [this guide’s delivery PR](https://github.com/Storypapst/dreambau/pull/216). It names the tested source and the actual deployed image revision. Source verification and production acceptance are separate facts.
