---
name: oriso-board-triage
description: Audit ORISO Roadmap board tickets against what is actually on the branches, resolve merge conflicts, and advance tickets that are genuinely delivered. Use this whenever the user asks to review, audit, triage or "clear" tickets in a board column (In review, In progress, QA internal Dev), asks "what is missing on these tickets", asks whether PRs are merged or conflicted, asks to move tickets to a QA state, or pastes an ORISO project board URL. Also use it for questions like "what is required to finish this ticket", "which PRs need approval", or "are there merge conflicts" anywhere in the OpenResilienceInitiative org — even when the user does not say the words board, triage, or audit.
---

# ORISO board triage

> Written by Shazia Kausar (`shazia-k`). Distributed with the ORISO dev kit; the
> authoring copy lives in the shared skill library at `/srv/dreambau/agent-skills/custom/`.

Board columns lie. A ticket sits in "In review" with nothing under review; a ticket looks
undelivered because the PR never referenced its number; a merge commit is an ancestor of `dev`
while the code it carried was reverted on the way in. This skill exists to replace *what the
board claims* with *what is actually on the branch*, and to move only what survives that check.

The output is a ticket-by-ticket verdict backed by evidence, plus board moves and conflict
fixes for the cases that are unambiguous. Everything else gets handed back with a named next
step. Getting a ticket wrong in the optimistic direction is much worse than leaving it in
place — a ticket wrongly marked ready hides real work from QA and from the client.

Read `references/verdicts.md` before spawning auditors — it holds the verdict taxonomy and the
auditor prompt template. `references/environment.md` holds the fallback snapshot of board IDs,
branch facts and tooling gotchas; step 1 explains when to trust it.

## 1. Establish the project boundary

The project owns its board fields, branch policy, reviewer names and quality gates — this
skill owns the audit method. Resolve the project's own rules first so the two do not drift:

```bash
source ~/.config/agent-routing/paths.env   # gives $PROJECT_DREAMBAU_ROOT and friends
```

Then read the project router's canonical extensions. For ORISO those are
`0 - Docs/issue-task-workflow.md`, `.oriso/agent/team-directory.md`, `.oriso/agent/pr-commit.md`,
`.oriso/agent/slack-channels.md`. This is the same boundary `issue-subtask-pr-loop` establishes;
that skill runs the lifecycle *forward* (issue → sub-issues → PRs) while this one runs it
*backward* (board claim → branch reality). Where they overlap, its rules win — it owns
creation and routing, this owns verification.

**When the router does not resolve** — no `paths.env`, or the rule files are missing from the
checkout — fall back to `references/environment.md`, and say plainly in your report that you
used a pinned snapshot rather than live project rules. Those constants drift; an unannounced
stale reviewer list or board ID produces confidently wrong work.

If two rules conflict, stop before any external write and present the conflict with a
recommended resolution rather than picking one silently.

## 2. Preflight

Three things silently break this work, and each presents as an unrelated failure. Check them
first rather than debugging them later; `references/environment.md` has the fixes (or the project rules, if the router resolved).

- `gh auth status` must list `project` and `read:project`. Without them every board query
  returns `INSUFFICIENT_SCOPES`, which reads like the board is empty.
- Java repos need JDK 21. The default Maven here runs JDK 25 and spotless dies with a
  `NoSuchMethodError`, which reads like a formatting failure.
- Note which repos are dirty or on unexpected branches before you touch anything, so you can
  restore them and so you never assume a working tree is clean.

## 3. Read the board the user is actually looking at

A project-wide status count is almost never the number on the user's screen. Views carry
filters, and the count they see comes from the filtered set.

Fetch the view's filter and reproduce it exactly:

```bash
gh api graphql -f query='
{ organization(login:"OpenResilienceInitiative"){ projectV2(number:1){
  views(first:40){ nodes{ number name filter } } } } }'
```

Then two traps, both of which produce a confidently wrong ticket list:

**Pagination.** The project holds thousands of items. `gh project item-list --limit 800`
silently truncates. Get the real total from `gh project view 1 --owner ... --format json`
and page past it, or use `gh api graphql --paginate` with a `$endCursor` variable — the
variable must be named `endCursor` or `--paginate` does nothing and the query hangs.

**The mirror-field trap.** `Platform release`, `Priority` and `Effort` are org-level *issue*
fields. Read through the project they come back empty for every item, which makes a filtered
view look unfiltered. The real values live on the issue:

```graphql
issueFieldValues(first:20){ nodes{
  ... on IssueFieldSingleSelectValue { name field{ ... on IssueFieldSingleSelect { name } } }
  ... on IssueFieldMultiSelectValue { options{ name } field{ ... on IssueFieldMultiSelect { name } } } } }
```

Batch these with GraphQL aliases (~20 issues per request) rather than one call per issue.

Before going further, state the population you derived and its count. If it does not match
what the user sees, stop and reconcile — auditing the wrong tickets wastes the whole run.

## 4. Fan out one auditor per group of tickets

Group by repo (a group of 4–8 tickets is right) and spawn the auditors **in a single message**
so they run concurrently. Each auditor is read-only: no pushes, no PR edits, no board writes,
and every repo left on its original branch with a clean tree.

Give each auditor the per-repo branch facts — from the project rules if the router resolved,
otherwise the snapshot in `references/environment.md`, re-measured. Without them
auditors invent their own baseline and reach opposite conclusions. Include known PR states as
things to *verify, not assume* — auditors that treat your briefing as fact stop looking, and
they are frequently the ones who catch your errors.

`references/verdicts.md` has the full auditor prompt template.

## 5. The evidence standard

This is the part that matters most, and the part that is easy to get wrong.

**A merge commit reachable from `dev` does not prove delivery.** A sync branch can carry
de-scope commits that revert content while keeping the merge commits. This is not
hypothetical: three Urgent Helm tickets passed the ancestry check while the artefacts they
delivered — an ingress removal, an image digest pin, a rollback script — were absent from
`dev`. Any check built on `git branch -r --contains` alone will report those as done.

So for every ticket claimed as delivered, verify the *artefact*: the file exists, the symbol
is present, the bad line is gone. `git ls-tree`, `git grep`, and reading the file beat
ancestry every time.

Two more failure modes worth expecting:

- **Work delivered under a PR that never referenced the ticket.** Search by keyword and by
  code archaeology (`git log -S`), not only by issue number. Several tickets audited as
  "no merged PR" by earlier passes were delivered weeks earlier.
- **Merged only to `pre-dev`.** Where `dev` is ahead of `pre-dev`, a `pre-dev` merge does not
  reach `dev` on its own. Call this out distinctly — it is a promotion task, not a code task.

## 6. Move only what is genuinely complete

Move a ticket to the QA column only for a clean delivered verdict where the artefact is
verified present. Hold anything partial, blocked on a decision, or blocked on non-code work
such as artwork or a live browser proof — a partial ticket in QA reads as ready and wastes a
tester's time. When you hold one, say why in one line and name the next step.

**Do not close issues.** For this client the board column is the acceptance view; closing is
their call. A ticket that is delivered but not closed is a normal state here, so when
reporting status, separate "genuinely open" from "done, not closed".

Comment on the ticket when you move it: the merge commit, the artefact you verified, and
anything QA should know that is not obvious from the diff. Then move it. English only —
German product terms (Träger, Beratungsstelle) stay as quoted terms inside English prose.

## 7. Conflicts: merge, never rebase

Merge the base into the PR branch and push non-force. Rebasing replays every conflict once per
commit and needs a force-push, which is the one operation here that is not cheaply revertible.
Record the pre-merge head SHA in your report so any change can be undone.

Resolve hunk by hunk. Blanket `--ours`/`--theirs` on a file both sides changed silently
discards work — check whether the base touched the file elsewhere before taking a side. When
a conflict turns on a question the code cannot answer (the two sides assert opposite
behaviour), stop and ask rather than guessing; that is a product decision wearing a merge
conflict's clothes.

Verify before pushing: run the tests that cover the conflicted files, and say plainly what you
ran. If dependencies will not install, report that instead of implying verification happened.

Two consequences worth planning for. Fixing a conflict makes you **the last pusher**, and the
repo ruleset then requires an approval from someone else — so resolving conflicts on an
approved PR resets its approval. And merging one PR can re-conflict its siblings, so after a
batch merge, re-check the rest.

## 8. Send critical fixes to an adversarial reviewer

Anything that removes an API surface, changes persistence or ORM semantics, touches auth or
permissions, alters a CI security gate, or promotes commits to a shared branch goes to a
subagent briefed to **break it**, not to confirm it. Ask for a ranked list with file, line,
and a concrete failure scenario, and an explicit verdict.

This pays for itself. On this codebase adversarial review found that a "removed" endpoint
returned 403 rather than the 404 everyone assumed, and that moving a Trivy scan into a
composite action had quietly made image scanning opt-in — one deleted line from publishing
unscanned images with every test still green.

When the review returns conditions, address them and record what you did in the PR body. A
condition acknowledged but not fixed is worse than not asking.

## 9. Never manufacture review evidence

You may hold credentials that can approve or dismiss reviews. Do not use them to clear a gate.
The gate exists so a human validated the change, and the ticked test plan is that evidence;
approving as the user fabricates it. Report which PRs need an approval and from whom, and let
a person click.

The same applies to merging a PR with unresolved security threads, and to overriding a
`CHANGES_REQUESTED` you did not resolve.

## 10. Report

Lead with the board delta and the moves, then the holds with reasons, then what needs a human.
Separate cleanly:

- **Moved** — ticket, verdict, the evidence
- **Held** — ticket, the single blocker, the next step
- **Needs a human** — approvals, product decisions, ops work, with the specific ask
- **Corrections** — where the board, a comment, or your own earlier claim was wrong

Report failures faithfully. If a test failed, show it; if you skipped verification, say so.
Where an earlier audit comment on a ticket is factually wrong, say that plainly and give the
evidence — stale audit comments cause the same work to be redone.

## Stop conditions

Delivery ends at: verified → conflicts resolved and pushed → PR open with evidence and a
reviewer test plan → reviewers requested → ticket moved or held with a reason → report.

Merging happens only on an explicit, per-PR instruction from the user. Closing issues never
happens. Re-promoting content that was deliberately de-scoped, force-pushing, and overriding a
security review are all decisions to hand back, not to take.
