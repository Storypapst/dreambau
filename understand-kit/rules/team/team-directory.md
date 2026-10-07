# ORISO team directory

Use this when the user refers to people by first name, Slack handle or GitHub username, when
you pick reviewers, and when you write a Slack draft. It ships with the kit and is read by
everyone's agents — no private data here (no emails, no phone numbers, no tokens).

**You are not Frank.** The person running your session is the developer named in
`rules/devs/$ORISO_KIT_DEV.md` (or the file matching `gh api user --jq .login`). Look them up
in the table below for their Slack handle and ID. Frank appears in these rules as a role —
project owner, owner of Pre-Dev, QA internal — never as a default identity.

## Roster

As of 2026-07-31 the ORISO team is exactly: Shazia (`shazia-k`), Riccardo (`Shirloin`),
Hassan (`Hassan9215`), Shanzae (`shanzaeimran`), Nikunj (`nikunjdecyb`), plus Frank
(`Storypapst`) as owner. Everyone else has left, including people still active in the Slack
workspace — never assign, review-request or route work to them.

| Person | GitHub | Slack | Slack ID | Role |
| --- | --- | --- | --- | --- |
| Frank Gerhardt | `Storypapst` | `@frank.gerhardt` | `U080CJF5Q67` | Owner of the ORISO setup; Admin, Frontend, architecture, product. Owns Pre-Dev. |
| Shazia Kausar | `shazia-k` | `@shaziakausarwork` | `U0ABCMECSCR` | UserService lead; Frontend, Admin. Reviews Helm and Docs. |
| Shanzae Imran | `shanzaeimran` | `@shanzaeimran2` | `U0B23PJR5B3` | Admin, Frontend lead reviewer |
| Hassan Saeed | `Hassan9215` | `@hassan.saeed3635` | `U0B1BGJAYSW` | Backend, Admin; **primary deployment contact** |
| Riccardo | `Shirloin` | `@riccardo8902` | `U0B8W1ZLY3T` | Admin, Frontend, Agency, Tenant, ConsultingType |
| Nikunj | `nikunjdecyb` | `@nikunj` | `U09N9UBTRJQ` | Admin, Frontend, Kubernetes, ConsultingType |
| Björn Ludwig | `BjoernLudwig` | — | — | Caritas product manager; QA external Dev. Not a default code or deployment reviewer. |
| Christoph Wiedenmann | `kennstenicht` (likely) | `@christoph` | `U0AAFRP7MT6` | Release and process ("How we work") |
| Jonas Rogg | `joro4b` (git: `jor4ob`, `jrogg`) | — | — | Neusta / Kubernetes deployment owner — **suggest only; no agent push, deploy or action on his behalf** |

Service identity: **Kio** — GitHub `kiodreambau`, an automation and PR-review worker. Never
count it as a human approval; assign delivery ownership to the responsible person.

## Reviewer routing (per repository)

Request **2–3 reviewers** per PR in the same step that opens it, **excluding the PR author**
(that is usually you). If the pool minus you has fewer than two people, add from the core list:
`shanzaeimran`, `Hassan9215`, `Shirloin`, `shazia-k`, `nikunjdecyb`.

| Repository | Primary reviewers |
| --- | --- |
| ORISO-UserService | `shazia-k` (lead) · `Shirloin` — *Shanzae is deliberately not in this pool* |
| ORISO-Admin | `shanzaeimran` · `Shirloin` · `nikunjdecyb` |
| ORISO-Frontend | `shanzaeimran` · `Shirloin` · `nikunjdecyb` |
| ORISO-AgencyService | `Hassan9215` · `Shirloin` |
| ORISO-TenantService | `Hassan9215` · `Shirloin` |
| ORISO-ConsultingTypeService | `Hassan9215` · `Shirloin` |
| ORISO-Kubernetes | `Hassan9215` · `nikunjdecyb` |
| ORISO-Helm | `Hassan9215` (lead) · `shazia-k` · `Shirloin` |
| ORISO-Docs | `nikunjdecyb` · `Hassan9215` · `shazia-k` · `Shirloin` |
| ORISO-HealthDashboard | `Hassan9215` · `shanzaeimran` · `Shirloin` |
| ORISO-Matrix | `Hassan9215` · `nikunjdecyb` |

`gh pr edit <N> --repo <owner/repo> --add-reviewer a,b,c`

Never use for reviewers, assignees or deployment routing, even when git history shows many
commits: `ALI-RUBASS`, `softwaredevzestgeek`, `Dharya12`, Atta-ul-Mustafa, Bobi Gunardi,
Markus Jeni. Git history is context; this roster is the routing authority.

## Deployment routing

| Situation | Who | What the agent does |
| --- | --- | --- |
| PR touches deploy scripts, K8s manifests, env/config, image tags | `Hassan9215` | Add as reviewer, describe the deploy impact in the PR body |
| Neusta-side Kubernetes affected | Jonas Rogg | Only a note in the PR — "loop in Jonas" — nothing on his behalf |
| Pre-Dev | Frank | Not part of the developer process. Only on Frank's explicit, per-task instruction. |
