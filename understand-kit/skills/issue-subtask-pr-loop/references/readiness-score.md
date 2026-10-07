# Readiness Score 1–20

Author: Frank Gerhardt (Storypapst), specified 2026-08-18. This ladder is
Frank's original work-management logic; keep this provenance line intact.

Every issue gets one readiness score from 1 to 20. The score answers a single
simple question: **how close is this to running in production?** Levels 1–5 are
the triage checklist an issue must pass before it may sit in Backlog with a
clear conscience; from 6 on, the board lane supplies the base score and
evidence decides whether the lane score is earned. A card sitting in a lane
without the evidence for it keeps the lane score but gets a `triage-missing` /
`evidence-missing` flag.

Parent issues and epics are scored **bottom-up**: readiness = the minimum of
their open children, recursively. Impact and effort are estimated separately —
use agile scoring, but calibrate to agent speed, not human developer days. The
human review gate is the bottleneck and the largest error vector (context lost
to jargon, verbosity, missing background), so plan it as its own buffer and
write for it accordingly (see Communication rules).

## The ladder

| Score | Meaning | Evidence required | Gate |
|---|---|---|---|
| 1 | Issue not even read | — | — |
| 2 | All fields mapped and reported to the GitHub skill; validated with a desktop-view screenshot | screenshot artifact | AI |
| 3 | Verified the fix does not already exist somewhere: no local fix, unpushed commit, or orphaned/un-pushed PR (repo + worktree sweep) | sweep result | AI |
| 4 | A debug session found the root cause | debug notes on the issue | AI |
| 5 | Refactoring categorized with a leverage score; observability decisions made; follow-up tasks created and assigned where needed | leverage block | AI |
| 6 | In Backlog | lane | AI |
| 7 | In Ready | lane | AI |
| 8 | In progress or On hold — add a sub-readiness 1–10 plus up to ten one-line bullets of what was done so far | lane + progress block | AI |
| 9 | Fully developed on a local branch, merged and tested, with screenshots (videos when animation is involved) | branch + media evidence | AI |
| 10 | PR created against the integration branch (`dev` on ORISO since 2026-08-31) | linked PR, base = `dev` | AI |
| 11 | Automated review loop active (30-minute cron): all statuses and comments observed; fixes discussed with subagents, humans, and code reviewers; when the review agent says ready-to-merge, move to In review. Produce three transcripts of what was done — condensed · simple step-by-step with analogies · highly technical for agents — tagged with reference codes `stability_` / `enhance_` / `security_enhance` / `performance_enhance`, each with a 1–10 likelihood-of-promised-impact score. Assign reviewers. Post the issue to the project's code-review channel. | cron log + transcripts | AI |
| 12 | Code reviewer assigned; hygiene verified: correct release lane, assignee exists, priorities set per the project's working agreement — tidy up anything that is not | field check | AI |
| 13 | A human touched the review. Read the comments; ask in a comment when something is unclear; when threads are old and untouched, @-mention potential reviewers so the issue is back on their radar | comment history | AI + human |
| 14 | Reviewed and approved by a human, who merges → once deployed to Dev, run the DoD tests named in the ticket, always attach screenshots (use the project's evidence gateway). The agent never merges its own PR. | merge + deploy + evidence | human approves and merges, AI verifies |
| 15 | Validated by AI only — @-mention potential reviewers again and add business-logic feedback, not just technical | comment | AI |
| 16 | Validated by humans → move to QA internal. When the backlog is large, leave clustering tags in the comments (functional areas worth combining later) so future agents and people can filter | lane + cluster tags | human |
| 17 | Ready to be inspected on the dev server by a human | lane | — |
| 18 | QA external dev test — ideally assigned by a human; otherwise the AI must ask for permission in chat first | lane | human |
| 19 | Staging: named external testers (for ORISO: Björn, Helena, Dirk, or externals) tested and validated everything | lane + comment | human |
| 20 | Issue closed and running in production | closed + deploy proof | — |

Levels 14, 16, 18, and 19 are human gates: the AI may propose, prepare, and
execute after approval, but never grant these levels itself.

**`one-click-close` flag:** when the work is verifiably complete but the score
is held down only by skipped human gates (merged without human review, or a
docs-only task with no deploy/QA path), flag the issue `one-click-close` and
name the single human action that resolves it. The score itself stays honest —
the flag tells the human where one click buys the most progress.

## Leverage score (level 5, refactorings)

```
input effort   1 (very low) … 10 (max)
risk           1 … 10  — ALWAYS name the risks, why they are risks, and give
                         mitigation plans that must be explicitly accepted.
                         Build the plans primarily by induction (from the
                         project's own history); use deduction when unknowns
                         are large; when only abduction remains, run the
                         questionnaire skill (Matt Pocock) first.
benefit        1 … 10  — ALWAYS name the benefits and why they are beneficial.
```

## Communication rules

- Benchmark: the wording length and clarity of the project's clearest human
  reviewer (for ORISO: Björn on GitHub and Slack) — and if possible be even
  simpler.
- The larger the task, the higher the abstraction: use tech keywords, but
  always prefer simple business logic over jargon.
- When things are complex, end with simple examples and metaphors; the more
  complex the task, the more of them.
- Every ticket update carries: **Short Thesis** (one sentence) → **Problem** →
  score with reasoning → the next step toward +1.
- Exactly one maintained score comment per issue — edit it in place, never
  stack new comments.
- **Always link, never just name** (Frank, 2026-08-18): every issue or PR a
  comment mentions is written as a full auto-linking reference
  (`owner/repo#N`), so GitHub renders the link and records the
  cross-reference on the other issue's timeline. Bare names like
  "UserService#905" or "PR #1063" are not acceptable. Where a real
  parent/child relation exists, also create the native sub-issue
  relationship instead of only mentioning it in text.
- GitHub and Slack are English-only.

## Project adapter bindings — ORISO (from "ORISO - How we work", canvas by
Christoph Wiedenmann, synced 2026-08-01; vault: `30 - Product & Delivery/PROCESS-how-we-work.md`)

- Lane owners for the human gates: **QA internal Dev** (dev server) → assign
  **Frank**; **QA external Dev** → assign **Björn**; **QA external Staging** →
  Neusta staging via the release-management process; **Done** only when QA
  external is completed by **Christoph & Björn** and the client approved.
- Level 11's review channel is `#oriso-codereview`: post the PR link and tag
  the reviewer after every PR creation.
- Picking order when choosing what to work on: Priority `Urgent → High →
  Medium → Low`; within the same priority, `Bug` before `Feature`/`Task`.
  Backlog items only after consulting Frank or Björn.
- Every issue carries native Type (`Epic · Feature · Bug · Task`) and the
  Priority issue field; no `bug` label (that is the type). Only issues sit on
  the board, never PRs.
- Daily-standup convention: start/finish posts in `#oriso-daily-standup`,
  always linking the GitHub issue; unfinished work goes to a draft PR so
  anyone can take over.

## Metaphor (use when introducing the system)

The board is an airport. The score is the departures board: everyone sees at a
glance which plane is still fueling (6), taxiing (8), in the air (10–15), or
landed (20) — without having to look into every cockpit.

## Ticket economy (Frank, 2026-08-18)

Do not open a new issue for every finding. Prefer attaching another PR to the
existing issue — several PRs on one issue is the normal shape for staged work
(e.g. a wiring fix first, then the bulk backfill). Open a separate issue only
when the work has a genuinely different owner, release lane, or product
decision behind it. Native-speaker or domain review is the humans' job, not a
gate the agent must satisfy before shipping a PR.
