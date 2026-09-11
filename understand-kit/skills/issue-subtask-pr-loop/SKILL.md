---
name: issue-subtask-pr-loop
description: Run the team's portable GitHub delivery lifecycle from an approved feature or bug through a parent issue, native sub-issues, reviewable PRs, project-specific reviewer routing, quality gates, and status updates. Use whenever engineering work creates, repairs, opens, links, reviews, or reconciles GitHub issues or PRs, including PRs without issues and multi-repo delivery.
---

# Issue -> Sub-issue -> PR Delivery Loop

This skill owns the portable lifecycle. The active project owns its board
fields, branch policy, reviewer names, Slack channel, quality gates, and domain
documentation. Load those project rules rather than copying them here.

**Who "the user" is:** the developer running this session — resolve them from
`rules/devs/$ORISO_KIT_DEV.md` in the kit (or the file matching
`gh api user --jq .login`), and look up their Slack handle and ID in
`rules/team/team-directory.md`. Issues, PRs and Slack drafts are theirs: assign
them, exclude them from their own reviewer list, and never write as or for
someone else. Names in this skill (Frank, Björn, Christoph) are roles.

## 1. Establish the project boundary

1. Load `~/.config/agent-routing/paths.env` and the active project router.
2. Identify the real child Git repository; a multi-repo project parent may not
   itself be a Git repository.
3. Read the project's issue workflow, branch policy, team directory, review
   channel map, and quality-gate routing.
4. Fetch live GitHub state before trusting local notes: existing issues, native
   sub-issues, PR links, base branches, assignees, reviewers, and project fields.
5. If two project rules conflict, stop before external writes and present the
   exact conflict with a recommended resolution.

For ORISO, these ship with the kit (`~/.oriso-dev-kit/`) on every machine:

- `rules/team/pr-commit.md` — branch, PR, reviewer and tracker rules
- `rules/team/team-directory.md` — people, GitHub/Slack identities, reviewer routing
- `rules/team/slack-channels.md` — which channel for what
- `skills/oriso-delivery/SKILL.md` — the delivery flow (`dev` is the integration branch)
- `skills/oriso-board-triage/references/environment.md` — Roadmap board field IDs
- `skills/oriso-quality-gate/SKILL.md`

The E2E gate (`oriso-e2e-quality-gate`) lives in the server skill library
(`/srv/dreambau/agent-skills/custom/`). Where a machine also has the ORISO
parent folder's `0 - Docs/issue-task-workflow.md`, read it as background; the
kit files win where the two disagree.

## 2. Choose planning or delivery

Use `wayfinder` first when the destination is too large or uncertain for one
agent session. A Wayfinder map contains decision tickets, not build slices.
Once the route is clear, turn the approved result into a spec and then enter
this delivery loop.

Enter this loop directly when the bug, feature, spec, or accepted design is
already clear enough to divide into reviewable work packages.

## 3. Reconcile before creating

Search before opening anything. Reuse or repair the smallest relevant existing
issue when it already represents the work. Avoid duplicate parent issues,
duplicate board cards, and retroactive placeholder issues that add no context.

For a merged or open PR without an issue:

1. Identify the smallest real delivery unit it belongs to.
2. Reuse the relevant issue or create one only when none exists.
3. Link the PR with a machine-readable `Closes` or `Refs` reference.
4. Reconcile assignee and project status from the real PR/deploy state.

## 4. Create the delivery tree

For non-trivial work:

1. Create one real parent issue before implementation.
2. Give it a concise Why, What to build, Acceptance, affected repositories,
   and links to its ADR/spec/Wayfinder map when present.
3. Create one native GitHub sub-issue per independently reviewable work
   package after investigation makes the packages clear.
4. Link each child through GitHub's native sub-issue relation. A checkbox list
   may summarize the tree but never replaces the native relation.
5. Record suggested build order and true blocking dependencies.
6. Assign the real human owner even when a robot account performs the work.

If a required owner, repository, acceptance condition, or irreversible product
decision is missing, ask one concrete question before creating the affected
artifact. Do not invent it silently.

## 5. Implement and open PRs

- One sub-issue normally maps to one reviewable PR.
- Keep a fix and its regression test together when they must merge atomically.
- Use the project's current integration branch; never infer it from an old
  global convention.
- The PR body links its own sub-issue with `Closes owner/repo#N` when complete,
  otherwise `Refs owner/repo#N`.
- Update the parent with a compact sub-issue/PR matrix.
- Move issue/project status as work progresses; do not treat a green PR as a
  deployed result.

## 6. Review and quality gates

1. Resolve reviewers from the current project team directory, excluding the
   PR author, ignored identities, bots, and people without authority for that
   repository — and **request them in the same step that opens the PR**. A PR
   without requested reviewers is not open for review; move the issue to
   `In review` only once both exist.
2. Run the project's local quality gate before calling the PR ready.
3. Treat local proof, Dev deployment, and post-merge E2E as separate states when
   the project defines them. On ORISO there is no promotion step any more: a PR
   merges into `dev` and is verified on Dev — a merge into `pre-dev` reaches
   nothing on its own.
4. Draft Slack or Matrix review communication from the project channel map.
   Do not send team messages unless the user authorized sending.
5. **The agent never merges its own PR into the integration branch** (`dev` on
   ORISO) — not when checks are green, not when the user says "finish it",
   not for chores or test-only PRs. Merging is the human reviewer's act; the
   agent's job ends at "verified, PR open, reviewers requested, evidence
   attached". "Verify freely on the sandbox environment" is permission to
   deploy and test there, **not** permission to merge. Merge only on an
   explicit, per-PR instruction from the user naming the PR.
6. When verification used a shared sandbox environment (image swap on
   Pre-Dev, config change, DB mutation), **restore it before reporting done**:
   record the previous image ref / pull policy before the swap and put it
   back afterwards. Leftover branch images with `imagePullPolicy: Never`
   silently freeze the environment on stale code for everyone else. State in
   the completion report what was swapped and that it was restored.
7. Every issue, sub-issue, and PR carries a reviewer test plan ("How should I
   test this?") written as action-plus-expected-result checkboxes. When the
   change has visible UI impact, attach before/after screenshots — annotated
   where helpful — to the PR body or a comment so the reviewer sees the
   expected result before running anything. The boxes stay unchecked; they
   belong to the reviewer.

## 7. Readiness score

Every issue this loop touches carries a readiness score 1–20 — Frank's ladder,
defined in `references/readiness-score.md`. Read that file whenever you score,
re-score, or report readiness. Core rules: triage levels 1–5 gate Backlog
entry; the lane supplies the base score from 6 up, but only with evidence;
parents and epics score bottom-up as the minimum of their open children;
levels 14/16/18/19 are human gates the AI never grants itself; one maintained
score comment per issue, edited in place.

## 8. Completion report

Report the parent issue, native sub-issues, PR mapping, current branch/deploy
state, verification evidence, owners, reviewers, and the next human action.
Name missing links or unresolved conflicts plainly.

