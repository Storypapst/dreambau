---
name: oriso-delivery
description: The ORISO delivery flow — branch off dev, PR against dev, reviewers requested at open, never merge your own PR, test on Dev after the merge, keep the ticket and board honest. Use whenever work in an OpenResilienceInitiative repository is about to become a commit, a branch, a pull request, a review request, a merge, a deployment, or a board move; when asked which branch to target or whether something may go on Pre-Dev; or when a rule from an older document says PRs go to pre-dev.
---

# ORISO delivery

This is the flow the team agreed on 2026-08-31 and has run since. Older documents in the
repositories, in `0 - Docs/` and on docs.oriso.org may still describe the previous one, where
PRs went to `pre-dev`. They are out of date. When a document and this skill disagree about
the branch target, this skill is right — and say so rather than following the stale text
silently.

## The flow

1. **Branch off `dev`.** Never implement on `dev` itself.
2. **The PR targets `dev`.** Not `pre-dev`, not `main`. `main` is the release branch. An
   older open PR still pointing at `pre-dev` should be retargeted unless there is a stated
   reason to keep it.
3. **Request reviewers in the same step that opens the PR** — 2–3 from the repository's
   reviewer routing, excluding the author. A PR without requested reviewers is not open for
   review.
   ```bash
   gh pr edit <N> --repo OpenResilienceInitiative/<repo> --add-reviewer a,b,c
   ```
4. **Never merge.** Not when CI is green, not when the user says "finish it", not for chores
   or test-only changes. The developers decide which PRs land and when. Merge only on an
   explicit, per-PR instruction naming that PR.
5. **After the merge is deployed to Dev, test it there** and comment on the ticket saying you
   did. If it broke something, the team decides between rollback and quick fix.
6. **Release discipline.** Work the issues planned for the current release; nothing else gets
   merged. Do not move an issue into a release yourself — Björn, Frank or Christoph decide.
   On a Stage release the tickets move to "QA external / Stage", moved by whoever released.

Delivery ends at: verified → PR open with evidence and a reviewer test plan → reviewers
requested → ticket updated. Not at "merged".

## Reviewer routing

| Repo | Reviewers |
|---|---|
| ORISO-UserService | `shazia-k` (lead) · `Shirloin` — *not* `shanzaeimran` |
| ORISO-Admin | `shanzaeimran` · `Shirloin` · `nikunjdecyb` |
| ORISO-Frontend | `shanzaeimran` · `Shirloin` · `nikunjdecyb` |
| ORISO-AgencyService · TenantService · ConsultingTypeService | `Hassan9215` · `Shirloin` |
| ORISO-Kubernetes | `Hassan9215` · `nikunjdecyb` |
| ORISO-Helm | `Hassan9215` (lead) · `shazia-k` · `Shirloin` |
| ORISO-Docs | `nikunjdecyb` · `Hassan9215` · `shazia-k` · `Shirloin` |
| ORISO-HealthDashboard | `Hassan9215` · `shanzaeimran` · `Shirloin` |

The active roster is exactly Shazia, Riccardo, Hassan, Shanzae and Nikunj for ORISO. Everyone
else who appears in git history has left — never route work to them, however many commits
they have. Deployment-relevant changes always list `Hassan9215`. Jonas Rogg (`joro4b`, neusta)
is informed, never assigned and never acted for.

## Environments

| Where | What | Who deploys |
|---|---|---|
| local | where you develop and test first | you |
| **Dev** `dev.oriso.org` | integration, built from `dev`; where a merged change is verified | the deploy process / Hassan |
| Stage | the stable environment for demos and external QA | whoever cuts the release |
| **Pre-Dev** `predev.oriso.org` | **Frank's environment**, outside the developer process | Frank |

Do not deploy to Pre-Dev, swap an image there, or mutate its config or data on your own
initiative. That needs an explicit per-task instruction from Frank naming Pre-Dev. If you do
get it: record the previous image reference and its `imagePullPolicy` first, restore both
before reporting done, and say what you swapped and restored. A leftover
`imagePullPolicy: Never` freezes the cluster on stale code for everybody.

Every PR body states where the change was verified — environment and image — or says plainly
that it was only tested locally.

## Keeping the ticket honest

Assign the issue to yourself while you work. Comment when the review is done and the PR is
merged. Comment again after you tested it on Dev. Keep the board status current. The board is
how everyone else sees the state of the work.

To check what a board column actually corresponds to on the branches, use the
`oriso-board-triage` skill — a merge commit reachable from `dev` is not proof that the
artefact is on `dev`.

## Writing and asking

Everything for the team is English: issues, PRs, comments, commits, branch names, Slack.
German product terms (Träger, Beratungsstelle) stay as quoted terms inside English prose.

Review requests go to `#oriso-codereview`, bugs with screenshots to `#oriso-bugfix`,
deployment to `#oriso-deployement`, architecture to `#oriso-architecture`. Never post
automatically — draft the message, show it, let a person send it.

## Never manufacture review evidence

You may hold credentials that can approve a PR or dismiss a review. Do not use them to clear
a gate: the gate exists so a *person* validated the change. Report which PRs need an approval
and from whom, and let a human click.
