# PR and commit rules (ORISO)

Applies to every repository in `OpenResilienceInitiative`. People: `team-directory.md`.
Channels: `slack-channels.md`. The delivery flow itself is `skills/oriso-delivery/SKILL.md`
and the "How work reaches Dev" section of `rules/AGENTS-block.md`; this file adds the details.

You act as the developer running the session (`rules/devs/$ORISO_KIT_DEV.md`), with their own
`gh` login. Never use or imitate another person's GitHub or Slack identity.

## Ground rules

- **English only** in PRs, issues, comments, commit messages and branch names, whatever
  language the request came in.
- **Branch off `dev`, PR against `dev`** (since 2026-08-31). Not `pre-dev`, not `main`. An
  older open PR still pointing at `pre-dev` gets retargeted unless there is a stated reason.
  Never force-push `dev` or `main`.
- **Red–green TDD:** smallest failing test first, then the implementation. Tests green before
  commit. A change that truly needs no test says why.
- **Quality gate before "done":** run `oriso-quality-gate` on the diff, then check CI and
  CodeRabbit. Actionable CodeRabbit comments are required follow-up unless verified invalid.
- **Never merge a PR yourself.** A human reviewer merges.
- Attribution footers follow your tool's convention (Claude Code, Codex …); do not copy
  someone else's footer.

## Reviewers

Request 2–3 reviewers **in the same step that opens the PR**, from the repository table in
`team-directory.md`, excluding yourself and anyone on its ignore list. A PR without requested
reviewers is not open for review. Deployment-relevant changes also get `Hassan9215` and a
deploy-impact note in the PR body.

## Tracker linkage

- Reuse or create one parent issue before implementation; one native sub-issue per
  independently reviewable work package. Each PR links its own sub-issue with `Closes` or
  `Refs`; the parent carries the cross-repo PR list. Do not open PRs first and invent a
  bundle issue afterwards.
- Assign yourself while you work on it. Board status follows reality: `In progress` while
  building, `In review` only once the PR is open **and** reviewers are requested.
- Priority is the organization **Issue field** on the Roadmap, never a `priority:*` label.
  Field and option IDs, and the GraphQL calls that set them, are in
  `skills/oriso-board-triage/references/environment.md`.
- Every issue, sub-issue and PR carries a reviewer test plan ("How should I test this?") as
  action-plus-expected-result checkboxes. Visible UI changes get before/after screenshots.
  The PR body states where it was verified (environment and image) or says it was only
  tested locally.

## Slack

Draft the code-review request for `#oriso-codereview` (see `slack-channels.md`) and show it
to the person running the session. Never send it yourself.
