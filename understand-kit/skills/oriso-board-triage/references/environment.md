# Environment, IDs and gotchas — pinned fallback

**This is a snapshot, not the source of truth.** The project owns its board fields, branch
policy and reviewer routing; resolve those through the router first (SKILL.md step 1) and use
this file only when the router does not resolve on the current machine. When you fall back
here, say so in your report — an unannounced stale board ID or reviewer list produces
confidently wrong work.

Everything below was verified on **2026-09-08**. Re-measure anything a decision rests on; repo
facts drift daily and a wrong baseline makes every downstream verdict wrong.

The gotchas sections (tooling, rulesets, known-fragile assumptions) are properties of the
tools and the org rather than of the project rules, so they stay useful even when the router
does resolve.

## Tooling preconditions

### gh needs project scope

Board reads and writes need `project` and `read:project`. The default ORISO token carries only
`gist, read:org, repo`, and `projectV2` queries then fail with `INSUFFICIENT_SCOPES` — which
looks like an empty or missing board.

```bash
gh auth status | grep -i "token scopes"
gh auth refresh -h github.com -s project,read:project
```

It prints a one-time code and needs a human at <https://github.com/login/device>. The code
expires in ~15 minutes; mint a fresh one rather than waiting on a stale one. Surface the code
immediately and keep working on whatever does not need the board.

### Java repos need JDK 21

The default Maven here runs Homebrew JDK 25. Spotless 2.43.0 then dies with
`NoSuchMethodError: Log$DeferredDiagnosticHandler.getDiagnostics()`, which presents as a
formatting failure and is not one.

```bash
JAVA_HOME=$(/usr/libexec/java_home -v 21) mvn test
```

Test wiring in ORISO-UserService: `mvn test` runs only `**/*Test.java`. Integration tests are
bound to the `integration-test` phase, so `mvn test` alone can pass while the change under
test is never exercised. Many ITs use in-memory H2 and need no Docker; Testcontainers ones
skip when Docker is down — say which happened rather than reporting a clean run.

### The `coderabbit` label does not exist

Team convention says CodeRabbit skips auto-review without a `coderabbit` label. That label
exists in no ORISO repo — `gh pr edit --add-label coderabbit` fails with `'coderabbit' not
found` — and CodeRabbit reviews unlabelled PRs anyway. Do not chase it, and do not create it
without asking.

## Board constants

ORISO Roadmap, org project #1: <https://github.com/orgs/OpenResilienceInitiative/projects/1>

| Thing | Value |
|---|---|
| Project id | `PVT_kwDODkeBP84BHH8p` |
| Status field id | `PVTSSF_lADODkeBP84BHH8pzg3-C9U` |
| `Platform release` field id | `PVTMSF_lADODkeBP84BHH8pzhahHrs` (MULTI_SELECT) |

Status options: `Backlog` `f75ad846` · `Ready` `61e4505c` · `On hold` `f8cb0ff7` ·
`In progress` `47fc9ee4` · `In review` `134427de` · **`QA internal Dev` `afccd519`** ·
`QA external Dev` `feac10ef` · `QA external Staging` `56097ac3` · `Done` `98236657`

Move a ticket:

```bash
gh project item-edit --id <ITEM_ID> --project-id PVT_kwDODkeBP84BHH8p \
  --field-id PVTSSF_lADODkeBP84BHH8pzg3-C9U --single-select-option-id afccd519
```

Verify the move by re-reading the board; do not trust the exit code alone.

### View filters

View 30 is "2.0.5" with filter `-status:Backlog -is:pr type:Feature,Task,Bug
platform-release:v2.0.5`. Views change — always re-read the filter rather than assuming.

Reproducing a view means applying **all** of: the status, `-is:pr` (issues only), the
`type:` set, and the release. Epics and untyped issues carrying the same release are In review
but sit outside a `type:Feature,Task,Bug` view — they exist and are invisible there, which is
worth telling the user.

### Mirror-field trap

`Platform release`, `Priority` and `Effort` are org-level issue fields. Read through the
project (`fieldValueByName`, or `gh project item-list`) they return empty for every item.
Read them from the issue via `issueFieldValues`, and **write** them on the issue — the project
mirror has an empty option list and rejects writes.

## Per-repo branch facts

Re-measure these; they drift daily.

```bash
git rev-list --left-right --count origin/pre-dev...origin/dev
```

As of 2026-09-08:

| Repo | dev ahead | pre-dev ahead | Note |
|---|---|---|---|
| ORISO-Frontend | 85 | 0 | `dev` ⊇ `pre-dev` |
| ORISO-UserService | 67 | 5 | the 5 are real; a `pre-dev` merge can strand |
| ORISO-Admin | 35 | 0 | |
| ORISO-TenantService | 12 | 0 | |
| ORISO-Helm | 14 | 2 | **content de-scoped on sync — see below** |
| ORISO-E2E | — | — | **no `dev` branch**; `pre-dev` is integration |
| ORISO-Docs | — | — | historically `main`; since 2026-09 PRs go to `dev` (#112) |

Consequences:

- Where `dev` is ahead of `pre-dev`, retargeting a conflicted PR from `pre-dev` to `dev` does
  **not** reduce conflicts — `dev` already contains the competing work.
- Where `pre-dev` is ahead, a merge there is stranded until a promotion PR. Precedent sync PRs
  in UserService: #1075, #1078, #1094, #1100, #1103.
- ORISO-E2E has no `dev`; "on dev" is not a meaningful question there.
- ORISO-Docs used to take PRs on `main`. Since September 2026 it follows the rest of the
  platform and PRs target `dev` (most recent: #112, merged 2026-09-08). Older `main` and
  `pre-dev` merges in its history are not a counter-example — check the date.

### The Helm de-scope trap

Helm's last `pre-dev → dev` sync carried six commits that **reverted content** while keeping
the merge commits reachable. Result: `git branch -r --contains <sha>` says delivered, and the
artefacts are absent from `dev`. Verified examples — the obsolete `acme*` Element Call ingress
is still on `dev`, LiveKit is back to a mutable tag instead of its digest pin, and
`scripts/capture-cutover-rollback.py` exists only on `pre-dev`.

Whether that de-scoping was deliberate is a question for the user. Do not re-promote the
content without an answer.

## Repo rulesets

Enforced by repo rulesets, not classic branch protection — the protection API returns a
misleading 404.

- PRs to `dev`/`main` need a CodeRabbit review; a `CHANGES_REQUESTED` blocks the merge.
  `bypass_actors` is empty, so `--admin` does not help.
- **Last-pusher rule:** `New changes require approval from someone other than the last pusher`.
  Resolving a conflict on an approved PR resets its approval — expect this and tell the user.
- Auto-merge is **disabled** repo-wide in ORISO-Frontend; `gh pr merge --auto` fails.
- `gh pr checks` renders a **cancelled** job as `fail`. Confirm the real conclusion via
  `gh api repos/<owner>/<repo>/actions/jobs/<id> --jq .conclusion` before treating a PR as broken.
- `pre-dev` is not under the ruleset.
- Stale reviews are dismissed only through `tools/pr-dismiss-stale-review.sh`, and dismissal is
  the user's click — not yours.

## PR hygiene

- 2–3 reviewers, requested when the PR is opened. Route by recent authorship, excluding the
  author: `Storypapst` (Frank), `kiodreambau` (Kio), `Shirloin` (Riccardo), `nikunjdecyb`.
  Deployment-relevant changes (deploy scripts, K8s manifests, env/config, image tags):
  `Hassan9215` is primary and the deploy impact goes in the PR body.
- Reviewer test plans are GitHub checkboxes describing **user-visible actions with an expected
  result**, left unchecked — a human ticking them is the evidence someone validated it. They
  belong in the PR, not the issue; a test plan with no PR behind it promises something that
  does not exist.
- `Closes #n` does not fire here — PRs do not merge to the default branch. Never rely on it.
- Attach before/after screenshots for anything with visible UI impact.

## Known-fragile assumptions

- Husky pre-commit hooks fail inside bare worktrees (`.husky/_/husky.sh: No such file`).
  `--no-verify` is legitimate there; say that you used it and why.
- `/private/tmp/claude-501/` is shared across sessions. Write scratch files into the
  session-scoped scratchpad instead — a stale file from another session has been picked up as
  a commit message before.
- Other sessions keep git worktrees under that path. Check the session UUID before pruning
  anything you did not create.
