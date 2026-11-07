# Workspace GitHub facts and personal defaults

Frank wants the existing Evidence workspace to show what happened to its linked GitHub work, including status and version, without agents maintaining those labels by hand. He also wants a few basic settings. The existing live workspace and its records stay in place.

The initial settings remember each user's project context and, when enabled, source/environment filters per project. Project permissions remain authoritative. Display refresh offers manual, 15 minutes (default) and 60 minutes. This is selected-record polling while the page is visible, not a new global scheduler. Search phrases and selected record IDs are not saved as workspace defaults.

GitHub facts load separately from run details. Each Issue/PR reference shows its fetched title, state, last successful check, and stale/unavailable state. An Issue is open/closed; PRs can be open, closed or merged. Explicit closing PR associations can show partial progress. Issue closure or one merged PR never proves the whole Issue delivered. Configured release assignments/milestones and verified published-release inclusion are separate facts; neither claims the code is deployed. Preserve every selected version: the actual ORISO “Platform release” field can have several values and arrives through a ProjectV2ItemIssueFieldValue/IssueFieldMultiSelectValue wrapper. Label these as assignments, not necessarily future targets or shipped versions. A PR belongs to a published release only when its merge commit is verified as included. Unknown version data stays unknown.

Use a server-controlled 15-minute cache with bounded requests, ETags, rate-limit backoff and manual refresh with a shared minimum retry interval. Reuse the GitHub App token/transport seam from the unmerged work-state stack (PR190 head 6e6500d7); do not merge or modify that stack. Persist small snapshots through the existing SQLite application store. Do not copy the full work-state scheduler or collectors.

Before any network request or cache projection, refresh the human's grants, authorize the selected run, and authorize the reference repository through an operator-maintained repository-to-project registry. A pasted URL is not authority. For example, an ORISO-only viewer cannot read private Dreambau repository metadata even if an ORISO Evidence record links it. Unmapped references remain ordinary external links. App installation/repository permissions are a further ceiling. No personal gh/PAT, Evidence bearer or mailbox credential fallback.

The live server currently has no configured GitHub App reader. Prepare and test the integration/configuration, then obtain the concrete required App installation/read-access approval before creating or expanding access. An unconfigured integration must work as an honest, readable UI state; it is not live metadata acceptance.

No GitHub writes, new test accounts, webhook installation, primary storage move, Drive copying, work-state stack merge, or unrelated product-account changes belong to this slice.

Acceptance: real saved links get correct independently fetched facts after App setup; partial/stale/unconfigured/denied states remain truthful; personal settings survive reload and are clamped after scope changes; existing run/file navigation works; German/English at 390, 820 and 1440px fit without horizontal overflow.
